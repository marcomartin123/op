import React, { useMemo, useId, useEffect, useRef } from 'react';
import { OptionData, OptionType, Side, SimulateLegPayload, StrikePair } from '../types';
import { formatNumber } from '../services/api';

interface Props {
  strikes: StrikePair[];
  spotPrice: number;
  assetAsk: number;
  daysToMaturity: number;
  isBoxFilterActive?: boolean;
  isCallFilterActive?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onSimulateLeg: (payload: SimulateLegPayload) => void;
  activeOptionSymbols?: string[];
}

const OptionsGrid: React.FC<Props> = ({ 
  strikes, 
  spotPrice, 
  assetAsk, 
  daysToMaturity,
  onSimulateLeg,
  activeOptionSymbols,
  isBoxFilterActive = false,
  isCallFilterActive = false,
  isCollapsed: isCollapsedProp = false,
  onToggleCollapse
}) => {
  const panelId = useId();
  const canToggle = typeof onToggleCollapse === 'function';
  const isCollapsed = canToggle ? isCollapsedProp : false;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const isActiveRef = useRef(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isActiveRef.current || isCollapsed) return;
      if (!['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp'].includes(event.key)) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      event.preventDefault();

      const isPage = event.key === 'PageDown' || event.key === 'PageUp';
      const step = isPage ? Math.max(window.innerHeight * 0.85, 200) : 64;
      const delta = event.key === 'ArrowDown' || event.key === 'PageDown' ? step : -step;
      window.scrollBy({ top: delta, behavior: 'auto' });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCollapsed]);

  const atmStrikeValue = useMemo(() => {
    if (strikes.length === 0) return null;
    return strikes.reduce((prev, curr) => {
      return Math.abs(curr.strike - spotPrice) < Math.abs(prev.strike - spotPrice) ? curr : prev;
    }).strike;
  }, [strikes, spotPrice]);

  const activeSymbolSet = useMemo(() => new Set(activeOptionSymbols || []), [activeOptionSymbols]);

  /**
   * Helper to format values specifically for the grid cells.
   * Replaces 0, null, or undefined with a simple dash.
   */
  const displayVal = (val: number | undefined | null, decimals: number = 2, suffix: string = "") => {
    if (val === undefined || val === null || val === 0) return "-";
    return `${formatNumber(val, decimals)}${suffix}`;
  };
  const resolvePremium = (option: OptionData, side: Side) => {
    if (side === Side.BUY) {
      return option.ask || 0;
    }
    return option.bid || 0;
  };

  const actionButtonClass = (isBuy: boolean, disabled: boolean) => {
    const base = "w-4 h-4 rounded text-[8px] font-black uppercase border transition-all flex items-center justify-center";
    const tone = isBuy
      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white"
      : "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500 hover:text-white";
    const disabledClass = disabled ? "opacity-40 cursor-not-allowed pointer-events-none" : "";
    return `${base} ${tone} ${disabledClass}`;
  };


  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onMouseEnter={() => { isActiveRef.current = true; }}
      onMouseLeave={() => { isActiveRef.current = false; }}
      onFocus={() => { isActiveRef.current = true; }}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget as Node | null;
        if (!nextTarget || !containerRef.current?.contains(nextTarget)) {
          isActiveRef.current = false;
        }
      }}
      className="w-full bg-white dark:bg-[#121214]/40 border border-zinc-200 dark:border-zinc-800/40 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md transition-colors"
    >
      {canToggle && (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!isCollapsed}
          aria-controls={isCollapsed ? undefined : panelId}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-zinc-50/80 dark:bg-zinc-900/40 border-b border-zinc-100 dark:border-zinc-800/50 text-left"
          title={isCollapsed ? 'Expandir grade de opcoes' : 'Recolher grade de opcoes'}
        >
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <span className="text-[11px] font-black uppercase tracking-widest text-zinc-500">Grade de Opcoes</span>
              <span className="text-[9px] text-zinc-400">{strikes.length} strikes</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">
            <span>{isCollapsed ? 'Expandir' : 'Recolher'}</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`w-4 h-4 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        </button>
      )}
      <div id={panelId} className={isCollapsed ? 'hidden' : 'block'}>
        {!isCollapsed && (
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse select-none table-fixed">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-900/60 text-zinc-400 dark:text-zinc-500 text-[11px] uppercase font-black tracking-widest border-b border-zinc-100 dark:border-zinc-800/50">
              <th className="px-4 py-2 w-24 text-center whitespace-nowrap">Strike</th>
              <th className="px-4 py-2 border-l border-zinc-100 dark:border-zinc-800/30 text-blue-600 dark:text-blue-400 w-[30%]">Componente Call</th>
              <th className="px-4 py-2 border-l border-zinc-100 dark:border-zinc-800/30 text-amber-600 dark:text-amber-500 w-[30%]">Componente Put</th>
              <th className="px-4 py-2 border-l border-zinc-100 dark:border-zinc-800/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 text-left">Métricas de Conversão</th>
            </tr>
            <tr className="bg-zinc-50/50 dark:bg-zinc-900/20 text-zinc-400 dark:text-zinc-600 text-[10px] uppercase font-black border-b border-zinc-100 dark:border-zinc-800/50">
              <th className="px-4 py-1 text-center">Valor</th>
              
              <th className="px-4 py-1 border-l border-zinc-100 dark:border-zinc-800/30">
                <div className="flex justify-between items-center">
                  <span className="w-20">Código</span>
                  <div className="flex gap-4 items-center pr-2">
                    <span className="w-14 text-right">Último</span>
                    <span className="w-20 text-right">BID/ASK</span>
                    <span className="w-10 text-right">IV%</span>
                  </div>
                </div>
              </th>

              <th className="px-4 py-1 border-l border-zinc-100 dark:border-zinc-800/30">
                <div className="flex justify-between items-center">
                  <span className="w-20">Código</span>
                  <div className="flex gap-4 items-center pr-2">
                    <span className="w-14 text-right">Último</span>
                    <span className="w-20 text-right">BID/ASK</span>
                    <span className="w-10 text-right">IV%</span>
                  </div>
                </div>
              </th>

              <th className="px-4 py-1 border-l border-zinc-100 dark:border-zinc-800/30 bg-emerald-500/5">
                <div className="flex gap-4 justify-start items-center">
                  <span className={`w-24 text-left transition-all ${isCallFilterActive ? 'text-zinc-900 dark:text-white font-black scale-105' : ''}`}>Taxa Call</span>
                  <span className={`w-24 text-left transition-all ${isBoxFilterActive ? 'text-zinc-900 dark:text-white font-black scale-105' : ''}`}>Taxa Box</span>
                  <span className="w-24 text-left">Taxa Put</span>
                  <span className="w-24 text-left">Dist.%</span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/10">
            {strikes.map((s, idx) => {
              const isATM = s.strike === atmStrikeValue;
              const isCallOTM = s.strike > spotPrice && !isATM;
              const isPutITM = s.strike > spotPrice;
              
              const callLabel = isATM ? "ATM" : (s.strike < spotPrice ? "ITM" : "OTM");
              const putLabel = isATM ? "ATM" : (s.strike > spotPrice ? "ITM" : "OTM");

              const callBid = s.call.bid || 0;
              const putAsk = s.put.ask || 0;
              
              const callBuyPremium = resolvePremium(s.call, Side.BUY);
              const callSellPremium = resolvePremium(s.call, Side.SELL);
              const putBuyPremium = resolvePremium(s.put, Side.BUY);
              const putSellPremium = resolvePremium(s.put, Side.SELL);

              const canCallBuy = callBuyPremium > 0;
              const canCallSell = callSellPremium > 0;
              const canPutBuy = putBuyPremium > 0;
              const canPutSell = putSellPremium > 0;

              const isCallActive = activeSymbolSet.has(s.call.symbol);
              const isPutActive = activeSymbolSet.has(s.put.symbol);

              // Lógica Taxa Call (Lançamento Coberto) - Somente ITM/ATM
              const netInvestmentCall = assetAsk - callBid;
              const callProfit = s.strike - netInvestmentCall;
              const showCallTaxa = callBid > 0 && assetAsk > 0 && !isCallOTM;
              const callTaxaExerc = showCallTaxa ? (callProfit / netInvestmentCall) * 100 : 0;
              const callMonthlyRate = (showCallTaxa && daysToMaturity > 0)
                ? (Math.pow(1 + (callTaxaExerc / 100), 30 / daysToMaturity) - 1) * 100 
                : 0;

              // Lógica Taxa Box (Conversão)
              const hasFullData = assetAsk > 0 && callBid > 0 && putAsk > 0;
              const netCostBox = hasFullData ? (-assetAsk + callBid - putAsk) : 0;
              const profitBox = hasFullData ? (netCostBox + s.strike) : 0;
              const investmentBox = Math.abs(netCostBox);
              const totalRatePercentBox = (hasFullData && investmentBox !== 0) ? (profitBox / investmentBox) * 100 : 0;
              const boxMonthlyRate = (hasFullData && daysToMaturity > 0)
                ? (Math.pow(1 + (totalRatePercentBox / 100), 30 / daysToMaturity) - 1) * 100 
                : 0;

              // Lógica Taxa Put (Somente ITM)
              const costPut = -assetAsk - putAsk;
              const gainPut = costPut + s.strike;
              const showPutTaxa = putAsk > 0 && assetAsk > 0 && isPutITM;
              const putTaxaBruta = (showPutTaxa && Math.abs(costPut) !== 0) ? (gainPut / Math.abs(costPut)) * 100 : 0;
              const putMonthlyRate = (showPutTaxa && daysToMaturity > 0)
                ? (Math.pow(1 + (putTaxaBruta / 100), 30 / daysToMaturity) - 1) * 100
                : 0;

              const distancePercent = ((s.strike / spotPrice) - 1) * 100;

              return (
                <tr 
                  key={idx} 
                  className={`
                    transition-all group 
                    hover:bg-blue-500/5 dark:hover:bg-blue-500/[0.08] 
                    even:bg-zinc-50/30 dark:even:bg-white/[0.015] 
                    ${isATM ? 'bg-blue-50 dark:bg-zinc-800/20 border-y border-blue-500/20' : ''}
                  `}
                >
                  <td className="px-4 py-2.5 text-center border-r border-zinc-100 dark:border-zinc-800/10">
                    <span className={`text-base font-black mono ${isATM ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
                      {formatNumber(s.strike)}
                    </span>
                  </td>

                  <td className={`px-4 py-2.5 border-l border-zinc-100 dark:border-zinc-800/10 ${isPutActive ? 'bg-amber-500/5' : ''}`}>
                    <div className="flex justify-between items-center">
                      <div className="flex flex-col w-32">
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-bold mono text-zinc-400 dark:text-zinc-500 whitespace-nowrap">{s.call.symbol}</span>
                            {isCallActive && (
                              <span className="inline-flex w-2 h-2 rounded-full bg-blue-500" title="Perna em uso" />
                            )}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={() => onSimulateLeg({ option: s.call, optionType: OptionType.CALL, side: Side.BUY, premium: callBuyPremium })}
                              className={actionButtonClass(true, !canCallBuy)}
                              disabled={!canCallBuy}
                              title="Comprar Call"
                            >
                              C
                            </button>
                            <button
                              onClick={() => onSimulateLeg({ option: s.call, optionType: OptionType.CALL, side: Side.SELL, premium: callSellPremium })}
                              className={actionButtonClass(false, !canCallSell)}
                              disabled={!canCallSell}
                              title="Vender Call"
                            >
                              V
                            </button>
                          </div>
                        </div>
                        <span className={`text-[8px] font-black uppercase ${isATM || s.strike < spotPrice ? 'text-blue-500' : 'text-zinc-300 dark:text-zinc-700'}`}>{callLabel}</span>
                      </div>
                      <div className="flex gap-4 items-center mono text-[13px] pr-2">
                        <div className="w-14 text-right flex flex-col items-end leading-none">
                          <span className="font-black text-zinc-700 dark:text-zinc-200">{displayVal(s.call.close)}</span>
                        </div>
                        <div className="w-20 text-right text-[10px] font-bold leading-tight">
                          <div className="text-emerald-600 dark:text-emerald-500/80">{displayVal(s.call.bid)}</div>
                          <div className="text-rose-600 dark:text-rose-500/80">{displayVal(s.call.ask)}</div>
                        </div>
                        <span className="w-10 text-right text-zinc-400 text-[10px]">{displayVal(s.call.bs.volatility, 0, "%")}</span>
                      </div>
                    </div>
                  </td>

                  <td className={`px-4 py-2.5 border-l border-zinc-100 dark:border-zinc-800/10 ${isCallActive ? 'bg-blue-500/5' : ''}`}>
                    <div className="flex justify-between items-center">
                      <div className="flex flex-col w-32">
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-bold mono text-zinc-400 dark:text-zinc-500 whitespace-nowrap">{s.put.symbol}</span>
                            {isPutActive && (
                              <span className="inline-flex w-2 h-2 rounded-full bg-amber-500" title="Perna em uso" />
                            )}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={() => onSimulateLeg({ option: s.put, optionType: OptionType.PUT, side: Side.BUY, premium: putBuyPremium })}
                              className={actionButtonClass(true, !canPutBuy)}
                              disabled={!canPutBuy}
                              title="Comprar Put"
                            >
                              C
                            </button>
                            <button
                              onClick={() => onSimulateLeg({ option: s.put, optionType: OptionType.PUT, side: Side.SELL, premium: putSellPremium })}
                              className={actionButtonClass(false, !canPutSell)}
                              disabled={!canPutSell}
                              title="Vender Put"
                            >
                              V
                            </button>
                          </div>
                        </div>
                        <span className={`text-[8px] font-black uppercase ${isATM || s.strike > spotPrice ? 'text-red-500' : 'text-zinc-300 dark:text-zinc-700'}`}>{putLabel}</span>
                      </div>
                      <div className="flex gap-4 items-center mono text-[13px] pr-2">
                        <div className="w-14 text-right flex flex-col items-end leading-none">
                          <span className="font-black text-zinc-700 dark:text-zinc-200">{displayVal(s.put.close)}</span>
                        </div>
                        <div className="w-20 text-right text-[10px] font-bold leading-tight">
                          <div className="text-emerald-600 dark:text-emerald-500/80">{displayVal(s.put.bid)}</div>
                          <div className="text-rose-600 dark:text-rose-500/80">{displayVal(s.put.ask)}</div>
                        </div>
                        <span className="w-10 text-right text-zinc-400 text-[10px]">{displayVal(s.put.bs.volatility, 0, "%")}</span>
                      </div>
                    </div>
                  </td>

                  <td className={`px-4 py-2.5 border-l border-zinc-100 dark:border-zinc-800/10 ${hasFullData || showCallTaxa || showPutTaxa ? 'bg-emerald-500/5 dark:bg-emerald-500/[0.02]' : 'bg-zinc-50 dark:bg-zinc-900/20'}`}>
                    <div className="flex gap-4 justify-start mono font-black items-center">
                      
                      {/* Taxa Call (Mensal em destaque) */}
                      <div className="w-24 flex flex-col items-start leading-none gap-0.5 text-left">
                        <span className={`text-[12px] ${showCallTaxa ? (callMonthlyRate >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400') : 'opacity-10'}`}>
                          {showCallTaxa ? `${formatNumber(callMonthlyRate)}%` : "-"}
                        </span>
                        {showCallTaxa && (
                          <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500">
                            {formatNumber(callTaxaExerc)}%
                          </span>
                        )}
                      </div>

                      {/* Taxa Box (Mensal em destaque) */}
                      <div className="w-24 flex flex-col items-start leading-none gap-0.5 text-left">
                        <span className={`text-[12px] ${hasFullData ? (boxMonthlyRate >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400') : "opacity-10"}`}>
                          {hasFullData ? `${formatNumber(boxMonthlyRate)}%` : "-"}
                        </span>
                        {hasFullData && (
                          <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500">
                            {formatNumber(totalRatePercentBox)}%
                          </span>
                        )}
                      </div>

                      {/* Taxa Put (Mensal em destaque) */}
                      <div className="w-24 flex flex-col items-start leading-none gap-0.5 text-left">
                        <span className={`text-[12px] ${showPutTaxa ? (putMonthlyRate >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400') : 'opacity-10'}`}>
                          {showPutTaxa ? `${formatNumber(putMonthlyRate)}%` : "-"}
                        </span>
                        {showPutTaxa && (
                          <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500">
                            {formatNumber(putTaxaBruta)}%
                          </span>
                        )}
                      </div>

                      {/* Dist.% */}
                      <div className="w-24 text-left text-[12px] opacity-30">
                        {hasFullData || showCallTaxa || showPutTaxa ? `${formatNumber(distancePercent, 1)}%` : "-"}
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(OptionsGrid);