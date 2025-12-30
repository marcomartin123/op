import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MarketAsset, OplabData, EarningItem } from '../types';
import { fetchOptionsData, formatNumber, getCalendarDays, addOneDay, getAllCachedData } from '../services/api';
import { MaturityRate } from '../App';

interface UnifiedResult {
  symbol: string;
  assetPrice: number | null;
  maturities: Record<string, { box?: MaturityRate; call?: MaturityRate; put?: MaturityRate }>;
  status: 'loading' | 'done' | 'error';
  maxRate: number;
}

interface Props {
  marketAssets: MarketAsset[];
  earnings: EarningItem[];
  onRefreshEarnings: () => Promise<void>;
  onClose: () => void;
  onNavigate: (symbol: string, maturityDate: string) => void;
  onSelectAssetOnly: (symbol: string) => void;
  onAiClick: (symbol: string) => void;
  referenceTime?: string;
}

// Componente de Linha Memoizado para evitar re-renderizações desnecessárias
const MatrixRow = React.memo(({ 
  result, 
  allMaturities, 
  earnings, 
  marketToday, 
  onSelectAssetOnly, 
  onRefreshSingle, 
  onNavigate, 
  onClose,
  filterBox,
  filterCall,
  filterPut,
  minRate,
  borderColor 
}: { 
  result: UnifiedResult, 
  allMaturities: string[], 
  earnings: EarningItem[], 
  marketToday: Date,
  onSelectAssetOnly: (s: string) => void,
  onRefreshSingle: (s: string) => void,
  onNavigate: (s: string, d: string) => void,
  onClose: () => void,
  filterBox: boolean,
  filterCall: boolean,
  filterPut: boolean,
  minRate: number,
  borderColor: string
}) => {
  const earningsFound = useMemo(() => earnings.find(e => {
    if (e.code?.trim().toUpperCase() !== result.symbol?.trim().toUpperCase()) return false;
    const parts = e.dateCom.split('/');
    if (parts.length === 3) {
      const [d, m, y] = parts.map(Number);
      const dCom = new Date(y, m - 1, d);
      return dCom >= marketToday;
    }
    return false;
  }), [earnings, result.symbol, marketToday]);

  return (
    <tr className="hover:bg-zinc-100/50 dark:hover:bg-zinc-800/20 transition-colors">
      <td className={`sticky left-0 z-10 p-0.5 bg-white dark:bg-[#0c0c0e] border-b border-r ${borderColor}`}>
        <div className="flex items-center justify-between min-h-[54px] px-3">
          <div className="cursor-pointer group flex flex-col" onClick={() => onSelectAssetOnly(result.symbol)}>
            <div className="flex items-center gap-1.5">
              <div className="text-[12px] font-black mono text-zinc-900 dark:text-white leading-none group-hover:text-blue-500 transition-colors">{result.symbol}</div>
              {earningsFound && <span className="text-amber-500 font-black text-[9px]">$</span>}
            </div>
            <div className="text-[9px] font-black mono text-zinc-400 mt-1 leading-none">R$ {formatNumber(result.assetPrice || 0)}</div>
          </div>
          <button onClick={() => onRefreshSingle(result.symbol)} className="w-5 h-5 rounded-lg flex items-center justify-center text-zinc-400 hover:text-blue-500 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 ${result.status === 'loading' ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
        </div>
      </td>
      {allMaturities.map(date => {
        const cell = result.maturities[date];
        const showBox = filterBox && !!cell?.box && cell.box!.monthlyRate >= minRate;
        const showCall = filterCall && !!cell?.call && cell.call!.monthlyRate >= minRate;
        const showPut = filterPut && !!cell?.put && cell.put!.monthlyRate >= minRate;
        
        return (
          <td key={date} className={`border-b border-r ${borderColor} p-0`}>
            <div className="flex flex-col gap-0.5 min-h-[54px] justify-center items-start px-3 whitespace-nowrap">
              {showBox && (
                <div onClick={() => { onNavigate(result.symbol, date); onClose(); }} className="flex items-center gap-1.5 cursor-pointer group/cell leading-tight">
                  <span className="text-[11px] font-black mono text-emerald-500">{formatNumber(cell.box!.monthlyRate, 2)}%</span>
                  <span className="text-[9px] font-black mono text-zinc-400 opacity-60">{formatNumber(cell.box!.protection || 0, 0)}%</span>
                </div>
              )}
              {showCall && (
                <div onClick={() => { onNavigate(result.symbol, date); onClose(); }} className="flex items-center gap-1.5 cursor-pointer group/cell leading-tight">
                  <span className="text-[11px] font-black mono text-amber-500">{formatNumber(cell.call!.monthlyRate, 2)}%</span>
                  <span className="text-[9px] font-black mono text-zinc-400 opacity-60">{formatNumber(cell.call!.protection || 0, 0)}%</span>
                </div>
              )}
              {showPut && (
                <div onClick={() => { onNavigate(result.symbol, date); onClose(); }} className="flex items-center gap-1.5 cursor-pointer group/cell leading-tight">
                  <span className="text-[11px] font-black mono text-purple-500">{formatNumber(cell.put!.monthlyRate, 2)}%</span>
                  <span className="text-[9px] font-black mono text-zinc-400 opacity-60">{formatNumber(cell.put!.protection || 0, 0)}%</span>
                </div>
              )}
            </div>
          </td>
        );
      })}
    </tr>
  );
});

const UnifiedScannerPopup: React.FC<Props> = ({ 
  marketAssets, earnings, onClose, onNavigate, onSelectAssetOnly, referenceTime 
}) => {
  const [results, setResults] = useState<UnifiedResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [isHydrating, setIsHydrating] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [concurrencyLimit, setConcurrencyLimit] = useState<number>(5);
  const [visibleCount, setVisibleCount] = useState(40);
  
  // Estados para o filtro Pescador (Rascunho)
  const [draftOperator, setDraftOperator] = useState<'<' | '>'>('<');
  const [draftValue, setDraftValue] = useState<string>(''); 

  // Estados aplicados que realmente disparam o processamento
  const [appliedOperator, setAppliedOperator] = useState<'<' | '>'>('<');
  const [appliedValue, setAppliedValue] = useState<string>('');

  const [filterCall, setFilterCall] = useState(true);
  const [filterBox, setFilterBox] = useState(true);
  const [filterPut, setFilterPut] = useState(true);
  
  const [minRateFilter, setMinRateFilter] = useState('');
  
  const isComponentMounted = useRef(true);
  const activeScanId = useRef(0);
  const nextAssetIndexRef = useRef(0);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const marketToday = useMemo(() => {
    const d = referenceTime ? new Date(referenceTime) : new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, [referenceTime]);

  const minRateValue = useMemo(() => {
    const parsed = parseFloat(minRateFilter);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [minRateFilter]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp'].includes(event.key)) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      const container = scrollRef.current;
      if (!container) return;
      event.preventDefault();

      const isPage = event.key === 'PageDown' || event.key === 'PageUp';
      const step = isPage ? Math.max(container.clientHeight * 0.85, 200) : 64;
      const delta = event.key === 'ArrowDown' || event.key === 'PageDown' ? step : -step;
      container.scrollBy({ top: delta, behavior: 'auto' });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const processAsFisherman = useCallback((data: OplabData, operator: '<' | '>', threshold: string) => {
    const asset = data.pageProps.asset;
    const spotPrice = asset.close || asset.bid || asset.ask || 0;
    const assetAsk = asset.ask || asset.close || 0;
    const refTime = data.pageProps.time;
    const filterValue = threshold === '' ? null : parseFloat(threshold);
    
    const maturitiesMap: Record<string, { box?: MaturityRate; call?: MaturityRate; put?: MaturityRate }> = {};
    let maxRateObserved = 0;

    data.pageProps.series.forEach(series => {
      const days = getCalendarDays(addOneDay(series.due_date), refTime);
      if (days <= 0) return;

      let bestBox: MaturityRate | undefined;
      let bestCall: MaturityRate | undefined;
      let bestPut: MaturityRate | undefined;

      series.strikes.forEach(s => {
        const dist = ((s.strike / spotPrice) - 1) * 100;
        if (filterValue !== null) {
          const satisfies = operator === '<' ? dist < filterValue : dist > filterValue;
          if (!satisfies) return;
        }

        if (assetAsk > 0 && s.call.bid > 0 && s.put.ask > 0) {
          const netCost = -assetAsk + s.call.bid - s.put.ask;
          const profit = netCost + s.strike;
          const rate = Math.abs(netCost) !== 0 ? (profit / Math.abs(netCost)) : 0;
          const monthlyBox = (Math.pow(1 + rate, 30 / days) - 1) * 100;
          if (monthlyBox > 0 && (!bestBox || monthlyBox > bestBox.monthlyRate)) {
            bestBox = { dueDate: series.due_date, daysToMaturity: days, bestRate: rate * 100, monthlyRate: monthlyBox, strike: s.strike, isMonthly: true, isPutITM: s.strike > spotPrice, protection: dist, efficiencyScore: dist };
          }
        }

        if (s.strike < spotPrice && s.call.bid > 0 && assetAsk > 0) {
          const netCostCall = assetAsk - s.call.bid;
          if (netCostCall > 0) {
            const rateCall = (s.strike / netCostCall) - 1;
            const monthlyCall = (Math.pow(1 + rateCall, 30 / days) - 1) * 100;
            if (monthlyCall > 0 && (!bestCall || monthlyCall > bestCall.monthlyRate)) {
              bestCall = { dueDate: series.due_date, daysToMaturity: days, bestRate: rateCall * 100, monthlyRate: monthlyCall, strike: s.strike, isMonthly: true, isPutITM: false, protection: dist, efficiencyScore: dist };
            }
          }
        }

        if (s.strike > spotPrice && s.put.ask > 0 && assetAsk > 0) {
          const costPut = -assetAsk - s.put.ask;
          const gainPut = costPut + s.strike;
          if (Math.abs(costPut) !== 0) {
            const ratePut = (gainPut / Math.abs(costPut)); 
            const monthlyPut = (Math.pow(1 + ratePut, 30 / days) - 1) * 100;
            if (monthlyPut > 0 && (!bestPut || monthlyPut > bestPut.monthlyRate)) {
              bestPut = { dueDate: series.due_date, daysToMaturity: days, bestRate: ratePut * 100, monthlyRate: monthlyPut, strike: s.strike, isMonthly: true, isPutITM: true, protection: dist, efficiencyScore: dist };
            }
          }
        }
      });

      if (bestBox || bestCall || bestPut) {
        maturitiesMap[series.due_date] = { box: bestBox, call: bestCall, put: bestPut };
        const rates = [bestBox?.monthlyRate || 0, bestCall?.monthlyRate || 0, bestPut?.monthlyRate || 0];
        const localMax = Math.max(...rates);
        if (localMax > maxRateObserved) maxRateObserved = localMax;
      }
    });

    return { maturities: maturitiesMap, assetPrice: spotPrice, maxRate: maxRateObserved };
  }, []);

  const handleApplyFilter = () => {
    setAppliedOperator(draftOperator);
    setAppliedValue(draftValue);
  };

  useEffect(() => {
    isComponentMounted.current = true;
    const hydrate = async () => {
      const cache = getAllCachedData();
      const symbols = Object.keys(cache);
      
      const initialShell: UnifiedResult[] = symbols.map(s => ({ symbol: s, assetPrice: null, maturities: {}, status: 'loading', maxRate: 0 }));
      setResults(initialShell);
      setIsHydrating(false);

      const updatedResults = [...initialShell];
      for (let i = 0; i < symbols.length; i++) {
        if (!isComponentMounted.current) return;
        
        const symbol = symbols[i];
        const entry = cache[symbol];
        if (entry && entry.data) {
          const processed = processAsFisherman(entry.data, appliedOperator, appliedValue);
          updatedResults[i] = {
            symbol,
            assetPrice: processed.assetPrice,
            maturities: processed.maturities,
            maxRate: processed.maxRate,
            status: 'done'
          };
        }

        if (i % 25 === 0 || i === symbols.length - 1) {
          setResults([...updatedResults]);
          await new Promise(r => setTimeout(r, 16)); 
        }
      }
    };

    hydrate();

    return () => { 
      isComponentMounted.current = false; 
      activeScanId.current++; 
    };
  }, [processAsFisherman, appliedOperator, appliedValue]);

  const runWorker = async (scanId: number) => {
    while (isComponentMounted.current && scanId === activeScanId.current) {
      const idx = nextAssetIndexRef.current;
      if (idx >= marketAssets.length) break;
      nextAssetIndexRef.current++;
      setCurrentIndex(idx);
      const asset = marketAssets[idx];
      
      setResults(prev => {
        const exists = prev.find(r => r.symbol === asset.symbol);
        if (exists && exists.status === 'done') return prev;
        return [...prev, { symbol: asset.symbol, assetPrice: null, maturities: {}, status: 'loading', maxRate: 0 }];
      });
      
      try {
        const { data } = await fetchOptionsData(asset.symbol, true);
        if (scanId !== activeScanId.current) return;
        const processed = processAsFisherman(data, appliedOperator, appliedValue);
        
        setResults(prev => prev.map(r => r.symbol === asset.symbol ? {
          ...r, assetPrice: processed.assetPrice, maturities: processed.maturities, maxRate: processed.maxRate, status: 'done'
        } : r));
      } catch (e) {
        setResults(prev => prev.map(r => r.symbol === asset.symbol ? { ...r, status: 'error', maxRate: 0 } : r));
      }
      await new Promise(r => setTimeout(r, 50));
    }
    if (nextAssetIndexRef.current >= marketAssets.length && scanId === activeScanId.current) setIsScanning(false);
  };

  const startScan = () => {
    const id = ++activeScanId.current;
    setIsScanning(true);
    nextAssetIndexRef.current = 0;
    setVisibleCount(40);
    for (let i = 0; i < concurrencyLimit; i++) runWorker(id);
  };

  const handleRefreshSingle = useCallback(async (symbol: string) => {
    setResults(prev => prev.map(r => r.symbol === symbol ? { ...r, status: 'loading' } : r));
    try {
      const { data } = await fetchOptionsData(symbol, true);
      const processed = processAsFisherman(data, appliedOperator, appliedValue);
      setResults(prev => prev.map(r => r.symbol === symbol ? {
        ...r, assetPrice: processed.assetPrice, maturities: processed.maturities, maxRate: processed.maxRate, status: 'done'
      } : r));
    } catch (e) {
      setResults(prev => prev.map(r => r.symbol === symbol ? { ...r, status: 'error', maxRate: 0 } : r));
    }
  }, [processAsFisherman, appliedOperator, appliedValue]);

  const filteredResults = useMemo(() => {
    let list = results.filter(r => r.status === 'done');
    list = list.filter(r => {
      if (searchQuery && !r.symbol.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      const mats = Object.values(r.maturities);
      const hasSatisfyingBox = filterBox && mats.some(m => !!m.box && m.box.monthlyRate >= minRateValue);
      const hasSatisfyingCall = filterCall && mats.some(m => !!m.call && m.call.monthlyRate >= minRateValue);
      const hasSatisfyingPut = filterPut && mats.some(m => !!m.put && m.put.monthlyRate >= minRateValue);
      return hasSatisfyingBox || hasSatisfyingCall || hasSatisfyingPut;
    });
    return list.sort((a, b) => b.maxRate - a.maxRate);
  }, [results, searchQuery, filterCall, filterBox, filterPut, minRateValue]);

  const allMaturities = useMemo(() => {
    const dates = new Set<string>();
    filteredResults.forEach(r => {
      Object.entries(r.maturities).forEach(([d, m]) => {
        if ((filterBox && !!m.box && m.box.monthlyRate >= minRateValue) || (filterCall && !!m.call && m.call.monthlyRate >= minRateValue) || (filterPut && !!m.put && m.put.monthlyRate >= minRateValue)) {
          dates.add(d);
        }
      });
    });
    return Array.from(dates).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  }, [filteredResults, filterBox, filterCall, filterPut, minRateValue]);

  const visibleResults = useMemo(() => filteredResults.slice(0, visibleCount), [filteredResults, visibleCount]);

  const progress = results.length > 0 ? (results.filter(r => r.status !== 'loading').length / results.length) * 100 : 0;
  const scanProgress = marketAssets.length > 0 ? ((currentIndex + 1) / marketAssets.length) * 100 : 0;
  const currentProgressPercent = isScanning ? scanProgress : progress;

  const loadedCount = results.filter(r => r.status !== 'loading').length;
  const doneCount = results.filter(r => r.status === 'done').length;
  const totalCount = results.length;
  const scanCount = marketAssets.length > 0 ? Math.min(currentIndex + 1, marketAssets.length) : 0;

  const formatDateLabel = (dateStr: string) => {
    const d = new Date(addOneDay(dateStr));
    const day = d.getDate().toString().padStart(2, '0');
    const month = d.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase().replace('.', '');
    return `${day}.${month}`;
  };

  const borderColor = "border-black/[0.04] dark:border-white/[0.04]";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 bg-black/90 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white dark:bg-[#0c0c0e] w-full max-w-[98vw] max-h-[96vh] rounded-[24px] border border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden ring-1 ring-white/5 relative">
        
        {/* Header */}
        <div className="px-6 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/40">
          <div className="flex items-center gap-6">
            <h2 className="text-[11px] font-black text-zinc-900 dark:text-white uppercase tracking-[0.2em] flex items-center gap-2 leading-none">
              MATRIX SCANNER
              {(isScanning || isHydrating) && <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>}
            </h2>
            
            <div className="flex items-center gap-4 border-l border-zinc-200 dark:border-zinc-800 pl-6">
               <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"></span><span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Box</span></div>
               <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500"></span><span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Call</span></div>
               <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-600"></span><span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Put</span></div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Seletor de Threads (Restaurado) */}
            <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800/50 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800">
              <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest leading-none">Threads</span>
              <input 
                type="number" 
                min="1" 
                max="20" 
                value={concurrencyLimit} 
                onChange={(e) => setConcurrencyLimit(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-8 bg-transparent text-[11px] font-black mono text-zinc-900 dark:text-zinc-100 outline-none border-b border-zinc-300 dark:border-zinc-700 text-center" 
              />
            </div>

            <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800/50 p-1 rounded-lg border border-zinc-200 dark:border-zinc-800">
              <button onClick={() => setFilterCall(!filterCall)} className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-black transition-all ${filterCall ? 'bg-amber-500 text-white' : 'text-zinc-500'}`}>C</button>
              <button onClick={() => setFilterBox(!filterBox)} className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-black transition-all ${filterBox ? 'bg-emerald-500 text-white' : 'text-zinc-500'}`}>B</button>
              <button onClick={() => setFilterPut(!filterPut)} className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-black transition-all ${filterPut ? 'bg-purple-600 text-white' : 'text-zinc-500'}`}>P</button>
            </div>

            <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800/50 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800">
              <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest leading-none">Min %</span>
              <input
                type="number"
                min="0"
                step="0.1"
                placeholder="0.0"
                value={minRateFilter}
                onChange={(e) => setMinRateFilter(e.target.value)}
                className="w-12 bg-transparent text-[11px] font-black mono text-zinc-900 dark:text-zinc-100 outline-none border-b border-zinc-300 dark:border-zinc-700 text-right"
              />
            </div>

            <div className="flex items-center gap-3 bg-zinc-100 dark:bg-zinc-800/50 px-4 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800">
              <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Pescador</span>
              <div className="flex bg-white dark:bg-zinc-900 rounded border border-zinc-200 dark:border-zinc-700 p-0.5">
                <button onClick={() => setDraftOperator('<')} className={`px-2 h-5 flex items-center justify-center rounded text-[11px] font-black transition-all ${draftOperator === '<' ? 'bg-blue-600 text-white' : 'text-zinc-500'}`}>&lt;</button>
                <button onClick={() => setDraftOperator('>')} className={`px-2 h-5 flex items-center justify-center rounded text-[11px] font-black transition-all ${draftOperator === '>' ? 'bg-blue-600 text-white' : 'text-zinc-500'}`}>&gt;</button>
              </div>
              <div className="flex items-center gap-1">
                <input type="number" placeholder="0.0" value={draftValue} onChange={e => setDraftValue(e.target.value)} className="w-10 bg-transparent text-[11px] font-black mono text-zinc-900 dark:text-zinc-100 outline-none text-right border-b border-zinc-300 dark:border-zinc-700" />
                <span className="text-[9px] font-black text-zinc-400">%</span>
              </div>
              <button 
                onClick={handleApplyFilter}
                className="ml-1 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-[9px] font-black uppercase tracking-tight shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
              >
                Aplicar
              </button>
            </div>

            <input type="text" placeholder="BUSCAR..." value={searchQuery} onChange={e => setSearchQuery(e.target.value.toUpperCase())} className="px-3 py-1.5 w-28 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-lg text-[10px] font-black mono outline-none" />
            
            <div className="flex items-center gap-2">
              {!isScanning ? (
                <button 
                  onClick={startScan} 
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
                >
                  Start Scan
                </button>
              ) : (
                <button 
                  onClick={() => { activeScanId.current++; setIsScanning(false); }} 
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg shadow-rose-500/20 transition-all active:scale-95"
                >
                  Stop
                </button>
              )}
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-rose-500 hover:text-white transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
        </div>

        {/* Matrix Table */}
        <div ref={scrollRef} className="flex-1 overflow-auto bg-zinc-50/20 dark:bg-[#08080a] custom-scrollbar">
          <table className="w-full border-separate border-spacing-0">
            <thead className="sticky top-0 z-20">
              <tr className="bg-zinc-100 dark:bg-zinc-900">
                <th className={`sticky left-0 z-30 p-3 bg-zinc-100 dark:bg-zinc-900 border-b border-r ${borderColor} text-left min-w-[120px]`}>
                  <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Ticker / Ref</span>
                </th>
                {allMaturities.map(date => {
                   const representativeCell = filteredResults.find(r => !!r.maturities[date])?.maturities[date];
                   const days = representativeCell?.box?.daysToMaturity || representativeCell?.call?.daysToMaturity || representativeCell?.put?.daysToMaturity || 0;
                   return (
                    <th key={date} className={`p-2 border-b border-r ${borderColor} text-center min-w-[95px] bg-zinc-100 dark:bg-zinc-900`}>
                      <div className="text-[11px] font-black text-zinc-900 dark:text-white leading-none">{formatDateLabel(date)}</div>
                      <div className="text-[8px] font-bold text-zinc-400 mt-1 uppercase tracking-tighter">{days} dc</div>
                    </th>
                   );
                })}
              </tr>
            </thead>
            <tbody>
              {visibleResults.length === 0 ? (
                <tr>
                   <td colSpan={allMaturities.length + 1} className="py-20 text-center opacity-40">
                      <span className="text-[10px] font-black uppercase tracking-widest">Aguardando dados ou scan...</span>
                   </td>
                </tr>
              ) : (
                <>
                  {visibleResults.map(r => (
                    <MatrixRow 
                      key={r.symbol}
                      result={r}
                      allMaturities={allMaturities}
                      earnings={earnings}
                      marketToday={marketToday}
                      onSelectAssetOnly={onSelectAssetOnly}
                      onRefreshSingle={handleRefreshSingle}
                      onNavigate={onNavigate}
                      onClose={onClose}
                      filterBox={filterBox}
                      filterCall={filterCall}
                      filterPut={filterPut}
                      minRate={minRateValue}
                      borderColor={borderColor}
                    />
                  ))}
                  {filteredResults.length > visibleCount && (
                    <tr>
                      <td colSpan={allMaturities.length + 1} className="p-4 text-center">
                        <button 
                          onClick={() => setVisibleCount(prev => prev + 50)}
                          className="px-6 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-500 transition-all"
                        >
                          Carregar Mais ({filteredResults.length - visibleCount} restantes)
                        </button>
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-2.5 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
           <div className="flex gap-6 items-center">
              <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest leading-none">
                {totalCount > 0 ? `${isHydrating ? 'Cache' : 'Carregados'} ${loadedCount}/${totalCount}` : 'Sem dados no cache'}
              </span>
              {totalCount > 0 && (
                <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest leading-none">
                  Matrix {doneCount}/{totalCount}
                </span>
              )}
              {isScanning && marketAssets.length > 0 && (
                <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest leading-none">
                  Scan {scanCount}/{marketAssets.length}
                </span>
              )}
              
              {(isScanning || isHydrating || (currentProgressPercent > 0 && currentProgressPercent < 100)) && (
                <div className="flex items-center gap-3 bg-zinc-200/50 dark:bg-black/20 px-2 py-1 rounded-full border border-zinc-200 dark:border-white/5">
                   <div className="w-20 h-1 bg-zinc-300 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 transition-all duration-300 shadow-[0_0_8px_rgba(59,130,246,0.4)]" 
                        style={{ width: `${currentProgressPercent}%` }}
                      ></div>
                   </div>
                   <span className="text-[9px] font-black mono text-blue-600 dark:text-blue-400">
                     {Math.round(currentProgressPercent)}%
                   </span>
                </div>
              )}
           </div>
           
           <div className="text-[8px] font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-6">
              <span className="opacity-50">Matrix v7.9.1 • Matrix Edition</span>
              <span className="px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded border border-blue-500/20 uppercase tracking-tighter">Controlled Engine</span>
           </div>
        </div>
      </div>
    </div>
  );
};

export default UnifiedScannerPopup;