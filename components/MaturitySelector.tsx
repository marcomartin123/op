
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { OptionSeries } from '../types';
import { getCalendarDays, addOneDay } from '../services/api';

interface Props {
  series: OptionSeries[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
  onSelectWithFilter?: (idx: number, filter: 'call' | 'put' | 'box') => void;
  assetAsk: number;
  spotPrice: number;
  referenceTime?: string;
}

const MaturitySelector: React.FC<Props> = ({ series, selectedIdx, onSelect, onSelectWithFilter, assetAsk, spotPrice, referenceTime }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedSeries = series[selectedIdx];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatDate = (dateStr: string) => {
    const adjustedDate = new Date(addOneDay(dateStr));
    return adjustedDate.toLocaleDateString('pt-BR', { month: 'short', day: '2-digit', year: '2-digit' });
  };

  const isWeekly = (s: OptionSeries) => {
    const weeklyPattern = /W[1-5]$/i;
    if (weeklyPattern.test(s.call) || weeklyPattern.test(s.put)) return true;
    if (s.strikes && s.strikes.length > 0) {
      const firstPair = s.strikes[0];
      if (
        (firstPair.call?.symbol && weeklyPattern.test(firstPair.call.symbol)) || 
        (firstPair.put?.symbol && weeklyPattern.test(firstPair.put.symbol))
      ) {
        return true;
      }
    }
    return false;
  };

  const handleRowSelect = (idx: number) => {
    onSelect(idx);
    setIsOpen(false);
  };

  const handleFilterSelect = (idx: number, filter: 'call' | 'put' | 'box') => {
    if (onSelectWithFilter) {
      onSelectWithFilter(idx, filter);
    } else {
      onSelect(idx);
    }
    setIsOpen(false);
  };

  const positiveCounts = useMemo(() => {
    if (!series || series.length === 0) return [];
    return series.map((s) => {
      let call = 0;
      let put = 0;
      let box = 0;
      const strikes = s.strikes || [];
      strikes.forEach((pair) => {
        const strike = pair.strike;
        const callBid = pair.call?.bid || 0;
        const putAsk = pair.put?.ask || 0;
        const isCallOTM = strike > spotPrice;
        const netInvestmentCall = assetAsk - callBid;
        const callProfit = strike - netInvestmentCall;
        const showCallTaxa = callBid > 0 && assetAsk > 0 && !isCallOTM;
        const callTaxaExerc = showCallTaxa ? (callProfit / netInvestmentCall) * 100 : -Infinity;
        if (showCallTaxa && callTaxaExerc > 0) call += 1;
        const hasFullBoxData = assetAsk > 0 && callBid > 0 && putAsk > 0;
        const netCostBox = hasFullBoxData ? (-assetAsk + callBid - putAsk) : 0;
        const profitBox = hasFullBoxData ? (netCostBox + strike) : -Infinity;
        const totalRatePercentBox = (hasFullBoxData && Math.abs(netCostBox) !== 0) ? (profitBox / Math.abs(netCostBox)) * 100 : -Infinity;
        if (hasFullBoxData && totalRatePercentBox > 0) box += 1;
        const isPutITM = strike > spotPrice;
        const costPut = -assetAsk - putAsk;
        const gainPut = costPut + strike;
        const showPutTaxa = putAsk > 0 && assetAsk > 0 && isPutITM;
        const putTaxaBruta = (showPutTaxa && Math.abs(costPut) !== 0) ? (gainPut / Math.abs(costPut)) * 100 : -Infinity;
        if (showPutTaxa && putTaxaBruta > 0) put += 1;
      });
      return { call, put, box };
    });
  }, [series, assetAsk, spotPrice]);

  if (!selectedSeries) return null;

  const adjustedDueDate = addOneDay(selectedSeries.due_date);
  const currentCalendarDays = getCalendarDays(adjustedDueDate, referenceTime);
  const isSelectedWeekly = isWeekly(selectedSeries);

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-5 px-5 py-2 bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800/50 rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-all shadow-xl min-w-[240px] h-[60px] group"
      >
        <div className="flex flex-col items-start">
          <span className="text-[10px] text-zinc-400 dark:text-zinc-600 font-black uppercase tracking-[0.2em] mb-1">Maturity Timeline</span>
          <div className="flex items-center gap-2">
            <span className="text-base font-black text-zinc-900 dark:text-zinc-100 uppercase mono leading-tight">
              {formatDate(selectedSeries.due_date)} 
            </span>
            <span className="text-blue-600 dark:text-blue-500 font-black px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded-lg text-[11px] mono">
              {currentCalendarDays}dc
            </span>
            {isSelectedWeekly && (
              <span className="bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-orange-500 border border-orange-500/40 px-1.5 py-0.5 rounded-md text-[10px] font-black flex items-center justify-center min-w-[18px]" title="Série Semanal">
                S
              </span>
            )}
          </div>
        </div>
        <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ml-auto text-zinc-400 dark:text-zinc-600 transition-transform duration-300 ${isOpen ? 'rotate-180 text-blue-500' : 'group-hover:text-zinc-600 dark:group-hover:text-zinc-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-3 w-[320px] bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl shadow-2xl z-[60] p-4 backdrop-blur-2xl ring-1 ring-black/5 dark:ring-white/5 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="grid grid-cols-1 gap-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {series.map((s, idx) => {
              const weekly = isWeekly(s);
              const counts = positiveCounts[idx] || { call: 0, put: 0, box: 0 };
              return (
                <div
                  key={s.due_date}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleRowSelect(idx)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleRowSelect(idx);
                    }
                  }}
                  className={`flex items-center justify-between p-4 rounded-xl border transition-all outline-none cursor-pointer ${
                    selectedIdx === idx 
                      ? 'bg-blue-600/5 dark:bg-blue-600/10 border-blue-500/50 text-blue-600 dark:text-blue-400 shadow-inner' 
                      : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800/50 text-zinc-400 dark:text-zinc-500 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-white dark:hover:bg-zinc-800'
                  }`}
                >
                  <div className="flex flex-col items-start">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black uppercase">{formatDate(s.due_date)}</span>
                      {weekly && (
                        <span className="bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-orange-500 px-1 rounded text-[8px] font-black border border-orange-500/30">S</span>
                      )}
                    </div>
                    <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-600 uppercase">Vencimento (+1d)</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-black mono">{getCalendarDays(addOneDay(s.due_date), referenceTime)}</span>
                    <span className="block text-[9px] uppercase font-black opacity-40">D. Corridos</span>
                    <div className="mt-1 flex items-center justify-end gap-1 text-[9px] font-black uppercase">
                      <button
                        type="button"
                        disabled={counts.call === 0}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handleFilterSelect(idx, 'call');
                        }}
                        className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        C {counts.call}
                      </button>
                      <button
                        type="button"
                        disabled={counts.put === 0}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handleFilterSelect(idx, 'put');
                        }}
                        className="px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        P {counts.put}
                      </button>
                      <button
                        type="button"
                        disabled={counts.box === 0}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handleFilterSelect(idx, 'box');
                        }}
                        className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        B {counts.box}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default MaturitySelector;
