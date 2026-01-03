import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { DashboardSnapshot, SnapshotCache, OplabData, EarningItem, NPositionData, MarketAsset, LegInstrument, Side, SimulateLegPayload, StrategyLeg } from './types';
import { fetchOptionsData, fetchEarningsData, getCalendarDays, addOneDay, formatNumber, fetchPositions, fetchMarketAssets, getAllCachedData, replaceDataCache } from './services/api';
import { listSnapshotRecords, saveSnapshotRecord, deleteSnapshotRecord, clearSnapshotRecords, SnapshotSource, StoredSnapshotRecord } from './utils/snapshotStorage';
import DashboardHeader from './components/DashboardHeader';
import SnapshotPopup from './components/SnapshotPopup';
import SnapshotTimeline from './components/SnapshotTimeline';
import MaturitySelector from './components/MaturitySelector';
import OptionsGrid from './components/OptionsGrid';
import StrategySimulator from './components/StrategySimulator';
import UnifiedScannerPopup from './components/UnifiedScannerPopup';
import AiAdvisorPopup from './components/AiAdvisorPopup';
import PositionPopup from './components/PositionPopup';

import PollingControl from './components/PollingControl';
import { GoogleGenAI } from "@google/genai";

const MemoizedDashboardHeader = React.memo(DashboardHeader);
const MemoizedMaturitySelector = React.memo(MaturitySelector);

export interface MaturityRate {
  dueDate: string;
  daysToMaturity: number;
  bestRate: number;
  monthlyRate: number;
  strike: number;
  isMonthly: boolean;
  isPutITM: boolean;
  protection?: number;
  efficiencyScore?: number;
}

export interface ScannerResult {
  symbol: string;
  assetPrice: number | null;
  maturities: MaturityRate[];
  maxMonthlyRate: number | null;
  maxEfficiencyScore?: number | null;
  maxDaysToMaturity?: number | null;
  status: 'loading' | 'done' | 'error';
}


const SNAPSHOT_SCAN_CONCURRENCY = 5;
const SNAPSHOT_INTERVAL_STORAGE_KEY = 'trader-snapshot-interval-minutes';

const App: React.FC = () => {
  const [selectedAsset, setSelectedAsset] = useState("PETR4");
  const [data, setData] = useState<OplabData | null>(null);
  const [marketAssets, setMarketAssets] = useState<MarketAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [isFromCache, setIsFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMaturityIdx, setSelectedMaturityIdx] = useState(0);

  const [showUnifiedScanner, setShowUnifiedScanner] = useState(false);
  const [showPositionPopup, setShowPositionPopup] = useState(false);

  const [showSnapshotPopup, setShowSnapshotPopup] = useState(false);
  const [positionData, setPositionData] = useState<NPositionData | null>(null);

  const [earnings, setEarnings] = useState<EarningItem[]>([]);
  const [showAiAdvisor, setShowAiAdvisor] = useState(false);
  const [aiCurrentSymbol, setAiCurrentSymbol] = useState("");
  const [aiInfo, setAiInfo] = useState('');
  const [aiSources, setAiSources] = useState<{ title: string, uri: string }[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  const [isPollingActive, setIsPollingActive] = useState(false);

  const pendingMaturityDate = useRef<string | null>(null);
  const dataRef = useRef<OplabData | null>(null);
  const currentMaturityIdxRef = useRef(0);
  const marketAssetsRef = useRef<MarketAsset[]>([]);
  const snapshotRunRef = useRef(false);

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('trader-theme');
    return (saved as 'dark' | 'light') || 'dark';
  });

  const [filterCallPositive, setFilterCallPositive] = useState(false);
  const [filterBoxPositive, setFilterBoxPositive] = useState(false);
  const [filterPutPositive, setFilterPutPositive] = useState(false);
  const [filterAtmOnly, setFilterAtmOnly] = useState(false);
  const [strategyLegs, setStrategyLegs] = useState<StrategyLeg[]>([]);
  const [isOptionsGridCollapsed, setIsOptionsGridCollapsed] = useState(false);
  const [snapshotRecords, setSnapshotRecords] = useState<StoredSnapshotRecord[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState('');
  const [snapshotIntervalMinutes, setSnapshotIntervalMinutes] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    const saved = localStorage.getItem(SNAPSHOT_INTERVAL_STORAGE_KEY);
    const parsed = Number(saved);
    return Number.isFinite(parsed) ? parsed : 0;
  });
  const [isSnapshotRunning, setIsSnapshotRunning] = useState(false);
  const [snapshotProgress, setSnapshotProgress] = useState({ completed: 0, total: 0 });

  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('trader-theme', theme);
  }, [theme]);

  useEffect(() => {
    marketAssetsRef.current = marketAssets;
  }, [marketAssets]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(SNAPSHOT_INTERVAL_STORAGE_KEY, String(snapshotIntervalMinutes));
  }, [snapshotIntervalMinutes]);

  const loadEarnings = useCallback(async () => {
    try {
      const items = await fetchEarningsData();
      setEarnings(items);
    } catch (e) {
      console.error("Erro ao carregar proventos", e);
    }
  }, []);

  const loadMarket = useCallback(async () => {
    try {
      const assets = await fetchMarketAssets();
      if (assets.length > 0) setMarketAssets(assets);
    } catch (e) {
      console.warn("Falha ao carregar ativos do mercado", e);
    }
  }, []);

  const loadPositionData = useCallback(async () => {
    const pos = await fetchPositions();
    if (pos) setPositionData(pos);
  }, []);

  useEffect(() => {
    loadEarnings();
    loadMarket();
    loadPositionData();
  }, [loadEarnings, loadMarket, loadPositionData]);

  const loadAssetData = useCallback(async (symbol: string, isSilent: boolean = false, forceRefresh: boolean = false) => {
    try {
      setError(null);

      if (!isSilent) {
        if (!dataRef.current) setLoading(true);
        else setRefreshing(true);
      }

      const { data: result, fromCache } = await fetchOptionsData(symbol, forceRefresh);

      if (result && result.pageProps) {
        dataRef.current = result;
        setData(result);
        setLastUpdate(new Date());
        setIsFromCache(fromCache);

        if (pendingMaturityDate.current) {
          const idx = result.pageProps.series.findIndex(s => s.due_date === pendingMaturityDate.current);
          if (idx !== -1) {
            setSelectedMaturityIdx(idx);
            currentMaturityIdxRef.current = idx;
          }
          pendingMaturityDate.current = null;
        } else if (currentMaturityIdxRef.current >= result.pageProps.series.length) {
          setSelectedMaturityIdx(0);
          currentMaturityIdxRef.current = 0;
        }
      }
    } catch (err: any) {
      console.error("Erro na atualização:", err);
      setError(err.message || "Erro de conexão.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAssetData(selectedAsset, false, false);
  }, [selectedAsset, loadAssetData]);

  const handleMaturityChange = useCallback((idx: number) => {
    setSelectedMaturityIdx(idx);
    currentMaturityIdxRef.current = idx;
  }, []);

  const handleMaturityFilterSelect = useCallback((idx: number, filter: 'call' | 'put' | 'box') => {
    handleMaturityChange(idx);
    setFilterCallPositive(filter === 'call');
    setFilterPutPositive(filter === 'put');
    setFilterBoxPositive(filter === 'box');
  }, [handleMaturityChange]);

  useEffect(() => {
    setStrategyLegs([]);
  }, [selectedAsset, selectedMaturityIdx]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  const fetchAiInsights = useCallback(async (symbol: string) => {
    setAiCurrentSymbol(symbol);
    setShowAiAdvisor(true);
    setAiLoading(true);
    setAiInfo('');
    setAiSources([]);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Analise o ativo ${symbol} da B3. Procure dividendos e fatos relevantes recentes. Responda em HTML.`;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] }
      });

      let cleanHtml = response.text || "Sem informações.";
      cleanHtml = cleanHtml.replace(/```html/g, '').replace(/```/g, '').trim();
      setAiInfo(cleanHtml);

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (chunks) {
        setAiSources(chunks.filter(c => c.web).map(c => ({ title: c.web!.title || 'Fonte', uri: c.web!.uri })));
      }
    } catch (err: any) {
      setAiInfo(`<div class="text-rose-500 font-bold">Erro: ${err.message}</div>`);
    } finally {
      setAiLoading(false);
    }
  }, []);

  const handleScannerNavigate = useCallback((symbol: string, maturityDate: string) => {
    pendingMaturityDate.current = maturityDate;
    setSelectedAsset(symbol);
  }, []);

  const clearFilters = useCallback(() => {
    setFilterCallPositive(false);
    setFilterBoxPositive(false);
    setFilterPutPositive(false);
    setFilterAtmOnly(false);
  }, []);

  const handleTogglePolling = useCallback(() => {
    setIsPollingActive(prev => !prev);
  }, []);

  const handleToggleOptionsGrid = useCallback(() => {
    setIsOptionsGridCollapsed(prev => !prev);
  }, []);

  const handleTriggerUpdate = useCallback(() => {
    loadAssetData(selectedAsset, true, true);
  }, [loadAssetData, selectedAsset]);

  const handleSimulateLeg = useCallback((payload: SimulateLegPayload) => {
    const premium = payload.premium || payload.option.close || payload.option.bs?.premium || 0;
    if (premium <= 0) return;

    setStrategyLegs(prev => [
      ...prev,
      {
        id: Math.random().toString(36).slice(2, 9),
        instrument: LegInstrument.OPTION,
        type: payload.optionType,
        side: payload.side,
        strike: payload.option.strike,
        premium,
        quantity: 1,
        symbol: payload.option.symbol,
        contractSize: payload.option.contract_size || 100
      }
    ]);
  }, []);

  const handleRemoveLeg = useCallback((id: string) => {
    setStrategyLegs(prev => prev.filter(leg => leg.id !== id));
  }, []);

  const handleUpdateLeg = useCallback((id: string, updates: Partial<StrategyLeg>) => {
    setStrategyLegs(prev => prev.map(leg => (leg.id === id ? { ...leg, ...updates } : leg)));
  }, []);

  const handleClearLegs = useCallback(() => {
    setStrategyLegs([]);
  }, []);

  const refreshSnapshotRecords = useCallback(() => {
    listSnapshotRecords()
      .then((records) => {
        setSnapshotRecords(records);
        setSelectedSnapshotId((prev) => {
          if (prev && records.some((record) => record.id === prev)) return prev;
          return records[0]?.id || '';
        });
      })
      .catch((error) => {
        console.warn('Falha ao listar snapshots.', error);
        setSnapshotRecords([]);
        setSelectedSnapshotId('');
      });
  }, []);

  useEffect(() => {
    refreshSnapshotRecords();
  }, [refreshSnapshotRecords]);


  const buildSnapshot = useCallback((): DashboardSnapshot => {
    let cacheClone: SnapshotCache = {};
    try {
      cacheClone = JSON.parse(JSON.stringify(getAllCachedData())) as SnapshotCache;
    } catch {
      cacheClone = {};
    }

    const cacheEntry = cacheClone[selectedAsset];
    const currentData = cacheEntry?.data || data;

    return {
      version: 1,
      savedAt: new Date().toISOString(),
      currentData,
      dataCache: cacheClone,
      selectedAsset,
      selectedMaturityIdx,
      filterCallPositive,
      filterBoxPositive,
      filterPutPositive,
      filterAtmOnly,
      strategyLegs,
      theme,
      isPollingActive: false,
      isOptionsGridCollapsed,
      marketAssets,
      earnings,
      positionData,
      lastUpdate: lastUpdate.toISOString()
    };
  }, [data, selectedAsset, selectedMaturityIdx, filterCallPositive, filterBoxPositive, filterPutPositive, strategyLegs, theme, isOptionsGridCollapsed, marketAssets, earnings, positionData, lastUpdate]);

  const snapshotBuilderRef = useRef<() => DashboardSnapshot>(() => buildSnapshot());

  useEffect(() => {
    snapshotBuilderRef.current = buildSnapshot;
  }, [buildSnapshot]);

  const runSnapshotScan = useCallback(async (source: SnapshotSource) => {
    if (snapshotRunRef.current) return;
    snapshotRunRef.current = true;
    setIsSnapshotRunning(true);

    try {
      let assets = marketAssetsRef.current;
      if (!assets || assets.length === 0) {
        const cachedAssets = dataRef.current?.pageProps?.assets || [];
        assets = cachedAssets.length > 0 ? cachedAssets : await fetchMarketAssets();
        if (assets.length > 0 && marketAssetsRef.current.length === 0) {
          setMarketAssets(assets);
        }
      }

      const symbols = assets.map((asset) => asset.symbol).filter(Boolean);
      const total = symbols.length;
      setSnapshotProgress({ completed: 0, total });

      if (total === 0) {
        const snapshot = snapshotBuilderRef.current();
        await saveSnapshotRecord(snapshot, source);
        refreshSnapshotRecords();
        return;
      }

      const queue = [...symbols];
      let completed = 0;

      const worker = async () => {
        while (queue.length > 0) {
          const symbol = queue.shift();
          if (!symbol) continue;
          try {
            await fetchOptionsData(symbol, true);
          } catch (error) {
            console.warn('Falha ao baixar dados para snapshot.', symbol, error);
          } finally {
            completed += 1;
            if (completed === total || completed % 5 === 0) {
              setSnapshotProgress({ completed, total });
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      };

      const workerCount = Math.min(SNAPSHOT_SCAN_CONCURRENCY, queue.length);
      await Promise.all(Array.from({ length: workerCount }, () => worker()));

      setSnapshotProgress({ completed: total, total });

      const snapshot = snapshotBuilderRef.current();
      await saveSnapshotRecord(snapshot, source);
      refreshSnapshotRecords();
    } catch (error) {
      console.warn('Falha ao executar snapshot.', error);
    } finally {
      setIsSnapshotRunning(false);
      snapshotRunRef.current = false;
    }
  }, [refreshSnapshotRecords, setMarketAssets]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (snapshotIntervalMinutes <= 0) return;
    runSnapshotScan('auto');
    const intervalId = window.setInterval(() => {
      runSnapshotScan('auto');
    }, snapshotIntervalMinutes * 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, [snapshotIntervalMinutes, runSnapshotScan]);


  const applySnapshot = useCallback((snapshot: DashboardSnapshot) => {
    if (!snapshot || typeof snapshot !== 'object') return;

    replaceDataCache(snapshot.dataCache || {});

    if (snapshot.marketAssets) setMarketAssets(snapshot.marketAssets);
    if (snapshot.earnings) setEarnings(snapshot.earnings);
    if ('positionData' in snapshot) setPositionData(snapshot.positionData);
    if (snapshot.theme) setTheme(snapshot.theme);
    setIsPollingActive(false);
    if (typeof snapshot.isOptionsGridCollapsed === 'boolean') setIsOptionsGridCollapsed(snapshot.isOptionsGridCollapsed);
    if (typeof snapshot.filterCallPositive === 'boolean') setFilterCallPositive(snapshot.filterCallPositive);
    if (typeof snapshot.filterBoxPositive === 'boolean') setFilterBoxPositive(snapshot.filterBoxPositive);
    if (typeof snapshot.filterPutPositive === 'boolean') setFilterPutPositive(snapshot.filterPutPositive);
    if (typeof snapshot.filterAtmOnly === 'boolean') setFilterAtmOnly(snapshot.filterAtmOnly);
    if (snapshot.strategyLegs) setStrategyLegs(snapshot.strategyLegs);
    if (snapshot.lastUpdate) setLastUpdate(new Date(snapshot.lastUpdate));
    if (snapshot.selectedAsset) setSelectedAsset(snapshot.selectedAsset);

    const cacheEntry = snapshot.dataCache?.[snapshot.selectedAsset];
    const nextData = snapshot.currentData || (cacheEntry ? cacheEntry.data : null);
    if (nextData) {
      setData(nextData);
      dataRef.current = nextData;
      setIsFromCache(true);
    }

    const seriesCount = nextData?.pageProps?.series?.length ?? 0;
    const rawIdx = Number.isFinite(snapshot.selectedMaturityIdx) ? snapshot.selectedMaturityIdx : 0;
    const nextIdx = Math.max(0, Math.min(rawIdx, Math.max(0, seriesCount - 1)));
    setSelectedMaturityIdx(nextIdx);
    currentMaturityIdxRef.current = nextIdx;
    pendingMaturityDate.current = null;

    setError(null);
    setLoading(false);
    setRefreshing(false);
  }, [replaceDataCache, setMarketAssets, setEarnings, setPositionData, setTheme, setIsPollingActive, setIsOptionsGridCollapsed, setFilterCallPositive, setFilterBoxPositive, setFilterPutPositive, setStrategyLegs, setLastUpdate, setSelectedAsset, setData, setIsFromCache]);

  const handleSaveSnapshot = useCallback(() => {
    if (typeof window === 'undefined') return;
    runSnapshotScan('manual');
  }, [runSnapshotScan]);

  const handleLoadSnapshot = useCallback(() => {
    setShowSnapshotPopup(true);
    refreshSnapshotRecords();
  }, [refreshSnapshotRecords]);

  const handleSnapshotIntervalChange = useCallback((minutes: number) => {
    setSnapshotIntervalMinutes(minutes);
  }, []);

  const handleDeleteSnapshot = useCallback((id: string) => {
    deleteSnapshotRecord(id)
      .then(() => refreshSnapshotRecords())
      .catch((error) => {
        console.warn('Falha ao excluir snapshot.', error);
      });
  }, [refreshSnapshotRecords]);

  const handleClearSnapshots = useCallback(() => {
    clearSnapshotRecords()
      .then(() => refreshSnapshotRecords())
      .catch((error) => {
        console.warn('Falha ao limpar snapshots.', error);
      });
  }, [refreshSnapshotRecords]);

  const handleTimelineSelect = useCallback((id: string) => {
    const record = snapshotRecords.find((item) => item.id === id);
    if (!record) return;
    setSelectedSnapshotId(id);
    applySnapshot(record.snapshot);
  }, [snapshotRecords, applySnapshot]);

  const handleLoadSelectedSnapshot = useCallback(() => {
    if (!selectedSnapshotId) return;
    const record = snapshotRecords.find((item) => item.id === selectedSnapshotId);
    if (!record) return;
    applySnapshot(record.snapshot);
    setShowSnapshotPopup(false);
  }, [applySnapshot, snapshotRecords, selectedSnapshotId]);


  const hasActiveFilters = filterCallPositive || filterBoxPositive || filterPutPositive || filterAtmOnly;

  const currentSeries = data?.pageProps?.series?.[selectedMaturityIdx];
  const referenceTime = data?.pageProps?.time;
  const assetAsk = data?.pageProps?.asset.ask || 0;
  const assetBid = data?.pageProps?.asset.bid || 0;
  const assetSymbol = data?.pageProps?.asset.symbol || selectedAsset;
  const assetContractSize = data?.pageProps?.asset.contract_size || 1;
  const spotPrice = data?.pageProps?.asset.close || 0;

  const simCurrentPrice = spotPrice || assetAsk || 0;

  const handleSimulateUnderlying = useCallback((side: Side) => {
    const price = side === Side.BUY ? assetAsk : assetBid;
    if (price <= 0) return;

    setStrategyLegs(prev => [
      ...prev,
      {
        id: Math.random().toString(36).slice(2, 9),
        instrument: LegInstrument.UNDERLYING,
        side,
        premium: price,
        quantity: 1,
        symbol: assetSymbol,
        contractSize: assetContractSize
      }
    ]);
  }, [assetAsk, assetBid, assetSymbol, assetContractSize]);

  const calendarDays = useMemo(() => {
    if (!currentSeries) return 1;
    return getCalendarDays(addOneDay(currentSeries.due_date), referenceTime);
  }, [currentSeries, referenceTime]);

  const marketTimeGmt3 = useMemo(() => {
    const lastTrade = data?.pageProps?.asset?.last_trade_at;
    if (!lastTrade) return "--:--:--";
    try {
      const d = new Date(lastTrade);
      return d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    } catch { return "--:--:--"; }
  }, [data]);

  const filteredStrikes = useMemo(() => {
    if (!currentSeries?.strikes) return [];

    return currentSeries.strikes.filter(s => {

      if (filterAtmOnly) {
        const closest = currentSeries.strikes.reduce((prev, curr) => {
          return (Math.abs(curr.strike - spotPrice) < Math.abs(prev.strike - spotPrice) ? curr : prev);
        });
        if (s.strike !== closest.strike) return false;
      }

      const callBid = s.call.bid || 0;
      const putAsk = s.put.ask || 0;

      const isCallOTM = s.strike > spotPrice;
      const netInvestmentCall = assetAsk - callBid;
      const callProfit = s.strike - netInvestmentCall;
      const showCallTaxa = callBid > 0 && assetAsk > 0 && !isCallOTM;
      const callTaxaExerc = showCallTaxa ? (callProfit / netInvestmentCall) * 100 : -Infinity;

      if (filterCallPositive && (!showCallTaxa || callTaxaExerc <= 0)) return false;

      const hasFullBoxData = assetAsk > 0 && callBid > 0 && putAsk > 0;
      const netCostBox = hasFullBoxData ? (-assetAsk + callBid - putAsk) : 0;
      const profitBox = hasFullBoxData ? (netCostBox + s.strike) : -Infinity;
      const totalRatePercentBox = (hasFullBoxData && Math.abs(netCostBox) !== 0) ? (profitBox / Math.abs(netCostBox)) * 100 : -Infinity;

      if (filterBoxPositive && (!hasFullBoxData || totalRatePercentBox <= 0)) return false;

      const isPutITM = s.strike > spotPrice;
      const costPut = -assetAsk - putAsk;
      const gainPut = costPut + s.strike;
      const showPutTaxa = putAsk > 0 && assetAsk > 0 && isPutITM;
      // Corrigido: (gainPut / Math.abs(costPut)) representa a taxa
      const putTaxaBruta = (showPutTaxa && Math.abs(costPut) !== 0) ? (gainPut / Math.abs(costPut)) * 100 : -Infinity;

      if (filterPutPositive && (!showPutTaxa || putTaxaBruta <= 0)) return false;

      return true;
    });
  }, [currentSeries, filterCallPositive, filterBoxPositive, filterPutPositive, filterAtmOnly, assetAsk, spotPrice]);

  const activeOptionSymbols = useMemo(() => {
    return strategyLegs
      .filter((leg) => leg.instrument === LegInstrument.OPTION && leg.symbol)
      .map((leg) => leg.symbol);
  }, [strategyLegs]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-50 dark:bg-[#08080a] text-zinc-400">
        <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Iniciando Terminal Trader Pro...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#08080a] text-zinc-900 dark:text-zinc-300 antialiased font-medium pb-12 transition-colors">

      {showAiAdvisor && (
        <AiAdvisorPopup symbol={aiCurrentSymbol || selectedAsset} info={aiInfo} sources={aiSources} loading={aiLoading} onClose={() => setShowAiAdvisor(false)} />
      )}

      {showUnifiedScanner && (
        <UnifiedScannerPopup
          marketAssets={marketAssets.length > 0 ? marketAssets : (data?.pageProps?.assets || [])}
          earnings={earnings}
          onRefreshEarnings={loadEarnings}
          onClose={() => setShowUnifiedScanner(false)}
          onNavigate={handleScannerNavigate}
          onSelectAssetOnly={setSelectedAsset}
          onAiClick={fetchAiInsights}
          referenceTime={data?.pageProps?.time}
        />
      )}

      {showSnapshotPopup && (
        <SnapshotPopup
          records={snapshotRecords}
          selectedId={selectedSnapshotId}
          onSelect={setSelectedSnapshotId}
          onLoadSelected={handleLoadSelectedSnapshot}
          onClose={() => setShowSnapshotPopup(false)}
          onSaveSnapshot={handleSaveSnapshot}
          onDeleteSnapshot={handleDeleteSnapshot}
          onClearSnapshots={handleClearSnapshots}
          intervalMinutes={snapshotIntervalMinutes}
          onIntervalChange={handleSnapshotIntervalChange}
          isSnapshotRunning={isSnapshotRunning}
          snapshotProgress={snapshotProgress}
        />
      )}


      {showPositionPopup && positionData && (
        <PositionPopup
          data={positionData}
          marketData={data}
          onClose={() => setShowPositionPopup(false)}
        />
      )}




      <div className={`max-w-[1920px] mx-auto flex flex-col gap-6 px-6 py-6 transition-all duration-300 ${refreshing ? 'opacity-40 blur-[2px]' : 'opacity-100'}`}>

        {data && (
          <MemoizedDashboardHeader
            asset={data.pageProps.asset} marketAssets={marketAssets.length > 0 ? marketAssets : (data.pageProps.assets || [])}
            theme={theme} onThemeToggle={toggleTheme} onAiClick={() => fetchAiInsights(selectedAsset)}
            onAssetClick={setSelectedAsset}
            onScannerClick={() => setShowUnifiedScanner(true)}
            onSnapshotOpen={handleLoadSnapshot}
          />
        )}

        <main className="w-full space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            {data && (
              <MemoizedMaturitySelector
                series={data.pageProps.series}
                selectedIdx={selectedMaturityIdx}
                onSelect={handleMaturityChange}
                onSelectWithFilter={handleMaturityFilterSelect}
                assetAsk={assetAsk}
                spotPrice={spotPrice}
                referenceTime={referenceTime}
              />
            )}


            {/* Bolinhas de Filtro - Padronizadas com o Scanner */}
            <div className="flex items-center gap-3 px-4 py-1.5 bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800/50 rounded-2xl shadow-xl h-[60px]">
              <div className="flex flex-col items-start mr-1">
                <span className="text-[9px] text-zinc-400 dark:text-zinc-600 font-black uppercase tracking-wider leading-none mb-1">Positivas</span>
                <span className="text-[7px] font-black uppercase text-zinc-400/50 leading-none">C/B/P Only</span>
              </div>

              <div className="flex items-center gap-2.5 bg-zinc-50/50 dark:bg-zinc-900/50 p-1 rounded-lg border border-zinc-100 dark:border-zinc-800/40">
                <button
                  onClick={() => setFilterCallPositive(!filterCallPositive)}
                  className={`w-6 h-6 rounded-full border-2 transition-all flex items-center justify-center ${filterCallPositive ? 'bg-amber-500 border-amber-500 text-white' : 'bg-transparent border-amber-500/30 text-zinc-400'}`}
                >
                  <span className="text-[8px] font-black uppercase">C</span>
                </button>

                <button
                  onClick={() => setFilterBoxPositive(!filterBoxPositive)}
                  className={`w-6 h-6 rounded-full border-2 transition-all flex items-center justify-center ${filterBoxPositive ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-transparent border-emerald-500/30 text-zinc-400'}`}
                >
                  <span className="text-[8px] font-black uppercase">B</span>
                </button>

                <button
                  onClick={() => setFilterPutPositive(!filterPutPositive)}
                  className={`w-6 h-6 rounded-full border-2 transition-all flex items-center justify-center ${filterPutPositive ? 'bg-purple-600 border-purple-600 text-white' : 'bg-transparent border-purple-600/30 text-zinc-400'}`}
                >
                  <span className="text-[8px] font-black uppercase">P</span>
                </button>

                <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1"></div>

                <button
                  onClick={() => setFilterAtmOnly(!filterAtmOnly)}
                  className={`w-8 h-6 rounded-full border-2 transition-all flex items-center justify-center ${filterAtmOnly ? 'bg-zinc-600 border-zinc-600 text-white' : 'bg-transparent border-zinc-500/30 text-zinc-400'}`}
                >
                  <span className="text-[8px] font-black uppercase">ATM</span>
                </button>
              </div>
            </div>

            <button
              onClick={() => { loadPositionData(); setShowPositionPopup(true); }}
              className="flex flex-col items-center justify-center px-4 h-[60px] bg-indigo-500/10 border border-indigo-500/30 text-indigo-600 rounded-2xl shadow-xl hover:bg-indigo-500 hover:text-white transition-all group"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2-2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-[8px] font-black uppercase tracking-widest">Ver Posição</span>
            </button>

            <div className="flex-1 min-w-[260px] max-w-[720px]">
              <SnapshotTimeline
                records={snapshotRecords}
                selectedId={selectedSnapshotId}
                onSelect={handleTimelineSelect}
              />
            </div>

            {hasActiveFilters && (
              <button onClick={clearFilters} className="flex flex-col items-center justify-center w-[60px] h-[60px] bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/50 rounded-2xl hover:bg-rose-500/5 group transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-zinc-400 group-hover:text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                <span className="text-[8px] font-black uppercase text-zinc-400 group-hover:text-rose-600">Limpar</span>
              </button>
            )}

            <div className="ml-auto flex items-center gap-6">
              <PollingControl
                isActive={isPollingActive}
                onToggle={handleTogglePolling}
                onTriggerUpdate={handleTriggerUpdate}
                lastUpdateTime={lastUpdate.toLocaleTimeString('pt-BR')}
                marketTime={marketTimeGmt3}
                selectedAsset={selectedAsset}
              />

              <div className="flex flex-col items-center justify-center min-w-[100px]">
                <span className="text-[9px] uppercase font-black text-zinc-400">Data Source</span>
                <div className="flex flex-col items-center leading-none">
                  <span className="text-base font-black mono text-blue-600">{filteredStrikes.length} <span className="text-[8px] opacity-40">Strikes</span></span>
                  {isFromCache ? (
                    <span className="px-1.5 py-0.5 bg-zinc-500/10 text-zinc-500 text-[6px] font-black rounded border border-zinc-500/20 mt-1 uppercase tracking-widest">Cached</span>
                  ) : (
                    <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-500 text-[6px] font-black rounded border border-emerald-500/20 mt-1 uppercase tracking-widest animate-pulse">Live Feed</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {data && (
            <>
              <OptionsGrid
                strikes={filteredStrikes}
                spotPrice={spotPrice}
                assetAsk={assetAsk}
                daysToMaturity={calendarDays}
                isBoxFilterActive={filterBoxPositive}
                isCallFilterActive={filterCallPositive}
                isCollapsed={isOptionsGridCollapsed}
                onToggleCollapse={handleToggleOptionsGrid}
                onSimulateLeg={handleSimulateLeg}
                activeOptionSymbols={activeOptionSymbols}
              />
              <StrategySimulator
                legs={strategyLegs}
                currentPrice={simCurrentPrice}
                daysToMaturity={calendarDays}
                strikePairs={filteredStrikes}
                theme={theme}
                assetSymbol={assetSymbol}
                assetBid={assetBid}
                assetAsk={assetAsk}
                onAddUnderlying={handleSimulateUnderlying}
                onRemoveLeg={handleRemoveLeg}
                onUpdateLeg={handleUpdateLeg}
                onClearLegs={handleClearLegs}
                marketAssets={marketAssets.length > 0 ? marketAssets : (data?.pageProps?.assets || [])}
              />
            </>
          )}
        </main>
      </div>

    </div>
  );
};

export default App;





























