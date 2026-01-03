import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { LegInstrument, MarketAsset, OptionType, Side, StrategyLeg, StrikePair } from '../types';
import { calculateStrategyStats, generatePayoffData } from '../utils/strategyMath';
import PayoffChart from './PayoffChart';
import { HistoryFrequency, fetchYahooHistory, formatCurrency, formatNumber } from '../services/api';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  BacktestFrequency,
  BacktestResult,
  buildPayoffCurve,
  calculateStrategyCost,
  deriveBaseCapital,
  runBacktest
} from '../utils/backtest';

interface Props {
  legs: StrategyLeg[];
  currentPrice: number;
  daysToMaturity: number;
  strikePairs: StrikePair[];
  theme: 'dark' | 'light';
  assetSymbol: string;
  assetBid: number;
  assetAsk: number;
  marketAssets: MarketAsset[];
  onAddUnderlying: (side: Side) => void;
  onRemoveLeg: (id: string) => void;
  onUpdateLeg: (id: string, updates: Partial<StrategyLeg>) => void;
  onClearLegs: () => void;
}

// Backtest Helpers
const toMonthInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const shiftMonthValue = (value: string, delta: number) => {
  const parts = value.split('-').map(Number);
  if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return value;
  const date = new Date(parts[0], parts[1] - 1 + delta, 1);
  return toMonthInputValue(date);
};

const buildMonthRange = (startValue: string, endValue: string) => {
  const startParts = startValue.split('-').map(Number);
  const endParts = endValue.split('-').map(Number);
  if (startParts.length !== 2 || endParts.length !== 2) return null;
  const [startYear, startMonth] = startParts;
  const [endYear, endMonth] = endParts;
  if (!startYear || !startMonth || !endYear || !endMonth) return null;

  const startDate = new Date(Date.UTC(startYear, startMonth - 1, 1, 0, 0, 0));
  const endDate = new Date(Date.UTC(endYear, endMonth, 0, 23, 59, 59));
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  if (startDate > endDate) return null;

  return {
    from: Math.floor(startDate.getTime() / 1000),
    to: Math.floor(endDate.getTime() / 1000),
    startDate,
    endDate
  };
};

const formatMonthLabel = (value: number) => {
  const date = new Date(value);
  return date.toLocaleDateString('pt-BR', { month: '2-digit', year: '2-digit' });
};

const formatCompactNumber = (value: number) => {
  if (!Number.isFinite(value)) return '--';
  const abs = Math.abs(value);
  if (abs >= 1000000) return `${(value / 1000000).toFixed(1)}m`;
  if (abs >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return formatNumber(value, 0);
};

const StrategySimulator: React.FC<Props> = ({
  legs,
  currentPrice,
  daysToMaturity,
  strikePairs,
  theme,
  assetSymbol,
  assetBid,
  assetAsk,
  marketAssets,
  onAddUnderlying,
  onRemoveLeg,
  onUpdateLeg,
  onClearLegs
}) => {
  const payoffData = useMemo(() => generatePayoffData(legs, currentPrice), [legs, currentPrice]);
  const stats = useMemo(
    () => calculateStrategyStats(legs, payoffData, currentPrice),
    [legs, payoffData, currentPrice]
  );

  const strikePairMap = useMemo(() => {
    const map = new Map<number, StrikePair>();
    strikePairs.forEach((pair) => {
      map.set(pair.strike, pair);
    });
    return map;
  }, [strikePairs]);

  const percentBase =
    stats.capitalAtRisk && stats.capitalAtRisk > 0
      ? stats.capitalAtRisk
      : Math.abs(stats.netPremium) > 0
        ? Math.abs(stats.netPremium)
        : 1;

  const formatSignedCurrency = (val: number) => `${val >= 0 ? '+' : ''}${formatCurrency(val)}`;
  const formatSignedPercent = (val: number) => `${val >= 0 ? '+' : ''}${formatNumber(val, 2)}%`;

  const netIsCredit = stats.netPremium >= 0;
  const netLabel = netIsCredit ? 'Credito Liquido' : 'Debito Liquido';
  const netValue = formatCurrency(Math.abs(stats.netPremium));

  const maxProfitValue = stats.maxProfit === 'Unlimited' ? 'Ilimitado' : formatCurrency(stats.maxProfit);
  const maxLossValue = stats.maxLoss === 'Unlimited' ? 'Ilimitado' : formatCurrency(stats.maxLoss);

  const profitPctValue = stats.maxProfitPct !== null ? formatSignedPercent(stats.maxProfitPct) : '--';
  const lossPctValue = stats.maxLossPct !== null ? formatSignedPercent(stats.maxLossPct) : '--';
  const spotValue = formatSignedCurrency(stats.spotPnl);

  const canBuyAsset = assetAsk > 0;
  const canSellAsset = assetBid > 0;

  const assetButtonClass = (isBuy: boolean, disabled: boolean) => {
    const base = "w-4 h-4 rounded text-[8px] font-black uppercase border transition-all flex items-center justify-center";
    const tone = isBuy
      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white"
      : "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500 hover:text-white";
    const disabledClass = disabled ? "opacity-40 cursor-not-allowed pointer-events-none" : "";
    return `${base} ${tone} ${disabledClass}`;
  };

  // --- Backtest State & Logic ---
  const defaultEndMonth = useMemo(() => {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    return toMonthInputValue(lastMonth);
  }, []);

  const [frequency, setFrequency] = useState<BacktestFrequency>('MONTHLY');
  const [periodMonths, setPeriodMonths] = useState(60);
  const endMonth = defaultEndMonth;
  const startMonth = useMemo(
    () => shiftMonthValue(endMonth, -(periodMonths - 1)),
    [endMonth, periodMonths]
  );
  const [monthlyWithdrawal, setMonthlyWithdrawal] = useState(0);
  const [monthlyInvestment, setMonthlyInvestment] = useState(0);
  const [applyLosses, setApplyLosses] = useState(false);
  const [showProfitChart, setShowProfitChart] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState(assetSymbol);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);

  useEffect(() => {
    setSelectedSymbol(assetSymbol);
  }, [assetSymbol]);

  const assetOptions = useMemo(() => {
    const unique = new Set<string>();
    if (assetSymbol) unique.add(assetSymbol);
    if (selectedSymbol) unique.add(selectedSymbol);
    marketAssets.forEach((asset) => unique.add(asset.symbol));
    return Array.from(unique).filter(Boolean).sort();
  }, [assetSymbol, marketAssets, selectedSymbol]);

  const payoffCurve = useMemo(() => buildPayoffCurve(legs, currentPrice), [legs, currentPrice]);

  const strategyCost = useMemo(() => calculateStrategyCost(legs), [legs]);
  const baseCapital = useMemo(
    () => deriveBaseCapital(strategyCost, payoffCurve.returns),
    [strategyCost, payoffCurve.returns]
  );

  const runSimulation = useCallback(async () => {
    if (!legs.length) {
      setResult(null);
      setError('Adicione pernas para rodar o backtest.');
      return;
    }

    if (currentPrice <= 0) {
      setResult(null);
      setError('Preco do ativo indisponivel para calcular o payoff.');
      return;
    }

    const range = buildMonthRange(startMonth, endMonth);
    if (!range) {
      setResult(null);
      setError('Periodo invalido.');
      return;
    }

    if (!payoffCurve.variations.length || baseCapital <= 0) {
      setResult(null);
      setError('Nao foi possivel montar a curva de payoff.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const history = await fetchYahooHistory(
        selectedSymbol,
        frequency as HistoryFrequency,
        range.from,
        range.to
      );

      if (!history.length) {
        setResult(null);
        setError('Sem dados historicos no periodo.');
        return;
      }

      const nextResult = runBacktest({
        history,
        payoff: payoffCurve,
        baseCapital,
        monthlyWithdrawal,
        monthlyInvestment,
        applyLosses,
        frequency
      });

      setResult(nextResult);
    } catch (err: any) {
      setResult(null);
      setError(err?.message || 'Erro ao buscar historico.');
    } finally {
      setLoading(false);
    }
  }, [
    legs,
    currentPrice,
    startMonth,
    endMonth,
    payoffCurve,
    baseCapital,
    selectedSymbol,
    frequency,
    monthlyWithdrawal,
    monthlyInvestment,
    applyLosses
  ]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      runSimulation();
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [runSimulation]);

  const chartPoints = result?.chart.points ?? [];
  const equityPoints = result?.chart.equity ?? [];
  const rows = result?.rows ?? [];
  const metrics = result?.metrics;

  const rowLookup = useMemo(() => {
    const map = new Map<number, BacktestResult['rows'][number]>();
    rows.forEach((row) => map.set(row.time.getTime(), row));
    return map;
  }, [rows]);

  const palette = theme === 'dark'
    ? {
      grid: '#27272a',
      axis: '#a1a1aa',
      profit: '#22c55e',
      loss: '#f43f5e',
      primary: '#60a5fa',
      accent: '#34d399'
    }
    : {
      grid: '#e4e4e7',
      axis: '#52525b',
      profit: '#16a34a',
      loss: '#e11d48',
      primary: '#2563eb',
      accent: '#059669'
    };

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const point = payload[0].payload as { time: number; assetReturn: number; strategyReturn: number };
    const row = rowLookup.get(point.time);
    const dateLabel = new Date(point.time).toLocaleDateString('pt-BR');

    return (
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] px-3 py-2 shadow-xl">
        <div className="text-[10px] uppercase tracking-widest text-zinc-400">{dateLabel}</div>
        <div className="mt-1 text-xs font-black text-zinc-700 dark:text-zinc-200">
          Retorno ativo: {formatSignedPercent(point.assetReturn * 100)}
        </div>
        <div className="text-xs font-black text-zinc-700 dark:text-zinc-200">
          Retorno estrategia: {formatSignedPercent(point.strategyReturn * 100)}
        </div>
        {row && (
          <div className="mt-1 text-[11px] text-zinc-500">
            Lucro: <span className="font-black">{formatSignedCurrency(row.profit)}</span>
          </div>
        )}
      </div>
    );
  };

  const getRowTone = (row: typeof rows[number]) => {
    if (row.lossEvent) return 'bg-rose-500/70 text-white';
    const pct = row.strategyReturn * 100;
    if (pct < -5) return 'bg-rose-100 dark:bg-rose-900/50';
    if (pct < -2) return 'bg-rose-50 dark:bg-rose-900/30';
    if (pct < 0) return 'bg-rose-50/60 dark:bg-rose-900/20';
    if (pct === 0) return 'bg-white dark:bg-transparent';
    if (pct <= 2) return 'bg-emerald-50 dark:bg-emerald-900/20';
    if (pct <= 5) return 'bg-emerald-100/70 dark:bg-emerald-900/30';
    return 'bg-emerald-200/60 dark:bg-emerald-900/50';
  };

  return (
    <section className="w-full bg-white dark:bg-[#121214]/40 border border-zinc-200 dark:border-zinc-800/40 rounded-2xl shadow-2xl backdrop-blur-md p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-black uppercase tracking-widest text-zinc-800 dark:text-zinc-100">
            Simulador Profissional
          </h2>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-500 font-black uppercase tracking-widest">
            Clique em C/V na grade para montar a estrategia
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800/60 bg-zinc-50/70 dark:bg-black/30">
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Ativo</span>
            <span className="text-[10px] font-black mono text-zinc-700 dark:text-zinc-100">{assetSymbol}</span>
            <span className="text-[9px] mono text-zinc-400">BID {formatNumber(assetBid, 2)} / ASK {formatNumber(assetAsk, 2)}</span>
            <button
              onClick={() => onAddUnderlying(Side.BUY)}
              className={assetButtonClass(true, !canBuyAsset)}
              disabled={!canBuyAsset}
              title="Comprar Ativo"
            >
              C
            </button>
            <button
              onClick={() => onAddUnderlying(Side.SELL)}
              className={assetButtonClass(false, !canSellAsset)}
              disabled={!canSellAsset}
              title="Vender Ativo"
            >
              V
            </button>
          </div>
          <button
            onClick={onClearLegs}
            className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border border-rose-500/30 text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500 hover:text-white transition-all"
          >
            Limpar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800/50 bg-zinc-50/60 dark:bg-black/30">
          <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Custo (Premio Liquido)</div>
          <div className={`mt-1 text-sm font-black mono ${netIsCredit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {netLabel}: {netValue}
          </div>
        </div>

        <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800/50 bg-zinc-50/60 dark:bg-black/30">
          <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Ganho Maximo</div>
          <div className="mt-1 text-sm font-black mono text-emerald-600 dark:text-emerald-400">
            {maxProfitValue}
          </div>
        </div>

        <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800/50 bg-zinc-50/60 dark:bg-black/30">
          <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Perda Maxima</div>
          <div className="mt-1 text-sm font-black mono text-rose-600 dark:text-rose-400">
            {maxLossValue}
          </div>
        </div>

        <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800/50 bg-zinc-50/60 dark:bg-black/30">
          <div className="flex items-center justify-between">
            <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Break-even (%)</div>
            {stats.breakEvens.length > 0 && (
              <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                Abs: <span className="mono text-zinc-700 dark:text-zinc-300">{formatSignedPercent(stats.breakEvens.reduce((a, b) => a + Math.abs(b), 0))}</span>
              </div>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {stats.breakEvens.length > 0 ? (
              stats.breakEvens.map(be => (
                <span key={be} className="px-2 py-0.5 rounded-full text-[10px] mono border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 bg-white/80 dark:bg-zinc-900/40">
                  {formatSignedPercent(be)}
                </span>
              ))
            ) : (
              <span className="text-xs text-zinc-400">--</span>
            )}
          </div>
        </div>

        <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800/50 bg-zinc-50/60 dark:bg-black/30">
          <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Lucro Max (%)</div>
          <div className={`mt-1 text-sm font-black mono ${stats.maxProfitPct !== null && stats.maxProfitPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}`}>
            {profitPctValue}
          </div>
        </div>

        <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800/50 bg-zinc-50/60 dark:bg-black/30">
          <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Prejuizo Max (%)</div>
          <div className={`mt-1 text-sm font-black mono ${stats.maxLossPct !== null && stats.maxLossPct < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-400'}`}>
            {lossPctValue}
          </div>
        </div>

        <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800/50 bg-zinc-50/60 dark:bg-black/30">
          <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Tempo ate Vencimento</div>
          <div className="mt-1 text-sm font-black mono text-indigo-600 dark:text-indigo-400">
            {daysToMaturity > 0 ? `${daysToMaturity} dias` : '--'}
          </div>
        </div>

        <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800/50 bg-zinc-50/60 dark:bg-black/30">
          <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400">P/L no Spot</div>
          <div className={`mt-1 text-sm font-black mono ${stats.spotPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {spotValue}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
        <div className="lg:col-span-4">
          <div className="bg-white dark:bg-[#0c0c0e]/60 border border-zinc-200 dark:border-zinc-800/60 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Legs</span>
              <span className="text-[9px] font-black uppercase text-zinc-500">{legs.length} itens</span>
            </div>

            {legs.length === 0 ? (
              <div className="border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl p-6 text-center text-zinc-400 text-[11px]">
                Nenhuma perna adicionada ainda.
              </div>
            ) : (
              <div className="space-y-3">
                {legs.map(leg => {
                  const isUnderlying = leg.instrument === LegInstrument.UNDERLYING;
                  const optionType = leg.type ?? OptionType.CALL;
                  const selectedStrike = typeof leg.strike === 'number' ? leg.strike : null;
                  const hasStrike = selectedStrike !== null && strikePairMap.has(selectedStrike);
                  const sideLabel = leg.side === Side.BUY ? 'Compra' : 'Venda';
                  const typeLabel = isUnderlying
                    ? 'Ativo'
                    : optionType === OptionType.CALL
                      ? 'Call'
                      : 'Put';
                  const detailLabel = isUnderlying
                    ? `Entrada ${formatNumber(leg.premium, 2)}`
                    : `Strike ${formatNumber(leg.strike ?? 0, 2)}`;
                  const priceLabel = isUnderlying ? 'Entrada' : 'Premio';
                  const sideClass = leg.side === Side.BUY ? 'text-emerald-500' : 'text-rose-500';
                  const stripeClass = leg.side === Side.BUY ? 'bg-emerald-500' : 'bg-rose-500';
                  const cashFlow = (leg.side === Side.SELL ? 1 : -1) * leg.premium * leg.quantity * leg.contractSize;

                  return (
                    <div key={leg.id} className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800/60 bg-zinc-50/60 dark:bg-black/30">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className={`w-1.5 h-10 rounded-full ${stripeClass}`} />
                          <div>
                            <div className={`text-[11px] font-black uppercase tracking-widest ${sideClass}`}>
                              {sideLabel} {typeLabel}
                            </div>
                            <div className="text-[10px] mono text-zinc-500">
                              {leg.symbol} - {detailLabel}
                            </div>
                            <div className={`text-[10px] mono mt-1 ${cashFlow >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              Fluxo: {formatSignedCurrency(cashFlow)}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => onRemoveLeg(leg.id)}
                          className="w-7 h-7 rounded-full border border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:text-rose-500 hover:border-rose-500/50 transition-all"
                          title="Remover"
                        >
                          X
                        </button>
                      </div>

                      <div className={`mt-3 grid ${isUnderlying ? 'grid-cols-2' : 'grid-cols-3'} gap-2`}>
                        {!isUnderlying && (
                          <label className="flex flex-col gap-1 text-[9px] font-black uppercase tracking-widest text-zinc-400">
                            Strike
                            <select
                              value={selectedStrike ?? ''}
                              onChange={(e) => {
                                const nextStrike = parseFloat(e.target.value);
                                if (!Number.isFinite(nextStrike)) return;
                                const pair = strikePairMap.get(nextStrike);
                                if (!pair) return;
                                const option = optionType === OptionType.CALL ? pair.call : pair.put;
                                const basePremium = leg.side === Side.BUY ? option.ask : option.bid;
                                const premium = basePremium || option.close || option.bs?.premium || 0;
                                const contractSize = option.contract_size && option.contract_size > 0 ? option.contract_size : leg.contractSize;
                                onUpdateLeg(leg.id, {
                                  strike: option.strike,
                                  symbol: option.symbol,
                                  premium,
                                  contractSize
                                });
                              }}
                              className="w-full bg-white dark:bg-black/40 border border-zinc-200 dark:border-zinc-800/60 rounded-lg px-2 py-1 text-[11px] mono text-zinc-800 dark:text-zinc-100 outline-none"
                            >
                              {!hasStrike && selectedStrike !== null && (
                                <option value={selectedStrike}>Atual (fora do filtro)</option>
                              )}
                              {strikePairs.map((pair) => {
                                const option = optionType === OptionType.CALL ? pair.call : pair.put;
                                const canTrade = leg.side === Side.BUY ? option.ask > 0 : option.bid > 0;
                                const isCurrent = selectedStrike !== null && pair.strike === selectedStrike;
                                return (
                                  <option key={pair.strike} value={pair.strike} disabled={!canTrade && !isCurrent}>
                                    {formatNumber(pair.strike, 2)}
                                  </option>
                                );
                              })}
                            </select>
                          </label>
                        )}
                        <label className="flex flex-col gap-1 text-[9px] font-black uppercase tracking-widest text-zinc-400">
                          {priceLabel}
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={leg.premium}
                            onChange={(e) => {
                              const next = parseFloat(e.target.value);
                              onUpdateLeg(leg.id, { premium: Number.isFinite(next) ? next : 0 });
                            }}
                            className="w-full bg-white dark:bg-black/40 border border-zinc-200 dark:border-zinc-800/60 rounded-lg px-2 py-1 text-[11px] mono text-zinc-800 dark:text-zinc-100 outline-none"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-[9px] font-black uppercase tracking-widest text-zinc-400">
                          Qtd
                          <input
                            type="number"
                            min="1"
                            value={leg.quantity}
                            onChange={(e) => {
                              const next = parseInt(e.target.value, 10);
                              onUpdateLeg(leg.id, { quantity: Number.isFinite(next) && next > 0 ? next : 1 });
                            }}
                            className="w-full bg-white dark:bg-black/40 border border-zinc-200 dark:border-zinc-800/60 rounded-lg px-2 py-1 text-[11px] mono text-zinc-800 dark:text-zinc-100 outline-none"
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-8">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-[12px] font-black uppercase tracking-widest text-zinc-500">Payoff</h3>
              <p className="text-[10px] text-zinc-500">Visualizacao no vencimento</p>
            </div>
          </div>

          {legs.length > 0 && payoffData.length > 0 ? (
            <PayoffChart
              data={payoffData}
              currentPrice={currentPrice}
              theme={theme}
              percentBase={percentBase}
              breakEvens={stats.breakEvens}
            />
          ) : (
            <div className="h-[360px] flex flex-col items-center justify-center text-zinc-400 gap-2 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
              <span className="text-[12px] font-black uppercase tracking-widest">Adicione pernas para visualizar o payoff</span>
              <span className="text-[10px] text-zinc-500">Use os botoes C e V na grade</span>
            </div>
          )}
        </div>
      </div>

      <div className="w-full h-px bg-zinc-200 dark:bg-zinc-800/60 my-6" />

      {/* --- BACKTEST SECTION (Embedded) --- */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[15px] font-black leading-none text-zinc-900 dark:text-white uppercase tracking-tight">
            Backtest Estrategia
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-3 space-y-5">
          <div className="bg-zinc-50 dark:bg-[#121214]/60 border border-zinc-200 dark:border-zinc-800/60 rounded-2xl p-4 space-y-3">

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-[9px] font-black uppercase tracking-widest text-zinc-400">
                Ativo
                <select
                  value={selectedSymbol}
                  onChange={(e) => setSelectedSymbol(e.target.value)}
                  className="w-full bg-white dark:bg-black/40 border border-zinc-200 dark:border-zinc-800/60 rounded-lg px-2 py-1 text-[11px] mono text-zinc-800 dark:text-zinc-100 outline-none"
                >
                  {assetOptions.map((symbol) => (
                    <option key={symbol} value={symbol}>{symbol}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-[9px] font-black uppercase tracking-widest text-zinc-400">
                Periodo (meses)
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={periodMonths}
                  onChange={(e) => setPeriodMonths(Number(e.target.value) || 1)}
                  className="w-full bg-white dark:bg-black/40 border border-zinc-200 dark:border-zinc-800/60 rounded-lg px-2 py-1 text-[11px] mono text-zinc-800 dark:text-zinc-100 outline-none"
                />
              </label>

              <label className="flex flex-col gap-1 text-[9px] font-black uppercase tracking-widest text-zinc-400">
                Retirada mensal
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={monthlyWithdrawal}
                  onChange={(e) => setMonthlyWithdrawal(Number(e.target.value) || 0)}
                  className="w-full bg-white dark:bg-black/40 border border-zinc-200 dark:border-zinc-800/60 rounded-lg px-2 py-1 text-[11px] mono text-zinc-800 dark:text-zinc-100 outline-none"
                />
              </label>

              <label className="flex flex-col gap-1 text-[9px] font-black uppercase tracking-widest text-zinc-400">
                Aporte mensal
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={monthlyInvestment}
                  onChange={(e) => setMonthlyInvestment(Number(e.target.value) || 0)}
                  className="w-full bg-white dark:bg-black/40 border border-zinc-200 dark:border-zinc-800/60 rounded-lg px-2 py-1 text-[11px] mono text-zinc-800 dark:text-zinc-100 outline-none"
                />
              </label>

              <div className="flex flex-col gap-1 text-[9px] font-black uppercase tracking-widest text-zinc-400">
                Frequencia
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFrequency('WEEKLY')}
                    className={`flex-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${frequency === 'WEEKLY'
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-white dark:bg-black/30 text-zinc-500 border-zinc-200 dark:border-zinc-800'} transition-all`}
                  >
                    Semanal
                  </button>
                  <button
                    onClick={() => setFrequency('MONTHLY')}
                    className={`flex-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${frequency === 'MONTHLY'
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-white dark:bg-black/30 text-zinc-500 border-zinc-200 dark:border-zinc-800'} transition-all`}
                  >
                    Mensal
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-400 mt-2">
                <input
                  type="checkbox"
                  checked={applyLosses}
                  onChange={(e) => setApplyLosses(e.target.checked)}
                  className="accent-rose-500"
                />
                Perdas recorrentes
              </label>
            </div>
          </div>
          <div className="bg-white dark:bg-[#0c0c0e]/60 border border-zinc-200 dark:border-zinc-800/60 rounded-2xl p-4 space-y-3">

            <div className="grid grid-cols-2 gap-3 text-[10px]">
              <div>
                <div className="text-zinc-400 uppercase tracking-widest">Capital Inicial</div>
                <div className="text-sm font-black mono text-zinc-800 dark:text-zinc-100">
                  {formatCurrency(baseCapital || 0)}
                </div>
              </div>
              <div>
                <div className="text-zinc-400 uppercase tracking-widest">Final s/ Ret.</div>
                <div className={`text-sm font-black mono ${metrics && metrics.finalCapitalNoWithdrawal >= baseCapital ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {metrics ? formatCurrency(metrics.finalCapitalNoWithdrawal) : '--'}
                </div>
              </div>
              <div>
                <div className="text-zinc-400 uppercase tracking-widest">Total %</div>
                <div className={`text-sm font-black mono ${metrics && metrics.totalProfitPct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {metrics ? formatSignedPercent(metrics.totalProfitPct) : '--'}
                </div>
              </div>
              <div>
                <div className="text-zinc-400 uppercase tracking-widest">Lucro m/m</div>
                <div className="text-sm font-black mono text-zinc-800 dark:text-zinc-100">
                  {metrics ? formatCurrency(metrics.avgMonthlyProfit) : '--'}
                </div>
              </div>
              <div>
                <div className="text-zinc-400 uppercase tracking-widest">Tx Equiv.</div>
                <div className={`text-sm font-black mono ${metrics && metrics.monthlyEquivalentRate >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {metrics ? formatSignedPercent(metrics.monthlyEquivalentRate) : '--'}
                </div>
              </div>
              <div>
                <div className="text-zinc-400 uppercase tracking-widest">Final c/ Ret.</div>
                <div className={`text-sm font-black mono ${metrics && metrics.finalCapitalWithWithdrawal >= baseCapital ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {metrics ? formatCurrency(metrics.finalCapitalWithWithdrawal) : '--'}
                </div>
              </div>
              <div>
                <div className="text-zinc-400 uppercase tracking-widest">Lucro c/ Ret.</div>
                <div className={`text-sm font-black mono ${metrics && metrics.profitWithWithdrawalPct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {metrics ? formatSignedPercent(metrics.profitWithWithdrawalPct) : '--'}
                </div>
              </div>
              <div>
                <div className="text-zinc-400 uppercase tracking-widest">Tx c/ Ret.</div>
                <div className={`text-sm font-black mono ${metrics && metrics.monthlyRateWithWithdrawal >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {metrics ? formatSignedPercent(metrics.monthlyRateWithWithdrawal) : '--'}
                </div>
              </div>
              <div>
                <div className="text-zinc-400 uppercase tracking-widest">TIR</div>
                <div className={`text-sm font-black mono ${metrics && metrics.monthlyIrr >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {metrics ? formatSignedPercent(metrics.monthlyIrr) : '--'}
                </div>
              </div>
              <div>
                <div className="text-zinc-400 uppercase tracking-widest">Razao</div>
                <div className="text-sm font-black mono text-zinc-800 dark:text-zinc-100">
                  {metrics ? `${metrics.wins} | ${metrics.losses}` : '--'}
                </div>
              </div>
            </div>
          </div>

        </div>

        <div className="xl:col-span-5 space-y-5">
          <div className="bg-zinc-50 dark:bg-[#121214]/60 border border-zinc-200 dark:border-zinc-800/60 rounded-2xl p-2">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Retornos</div>
                <div className="text-[9px] text-zinc-500">Bolhas por desempenho da estrategia</div>
              </div>
              <label className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-zinc-400">
                <input
                  type="checkbox"
                  checked={showProfitChart}
                  onChange={(e) => setShowProfitChart(e.target.checked)}
                  className="accent-emerald-500"
                />
                Exibir lucro %
              </label>
            </div>

            <div className="h-[210px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
                  <XAxis
                    dataKey="time"
                    type="number"
                    scale="time"
                    stroke={palette.axis}
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={formatMonthLabel}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    dataKey={showProfitChart ? 'strategyReturn' : 'assetReturn'}
                    stroke={palette.axis}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(val) => formatSignedPercent(val * 100)}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={0} stroke={palette.axis} strokeWidth={1.5} />
                  <Scatter
                    data={chartPoints}
                    shape={(props: any) => {
                      const { cx, cy, payload } = props;
                      if (cx === null || cy === null) return null;
                      const color = payload.strategyReturn >= 0 ? palette.profit : palette.loss;
                      return (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={payload.size}
                          fill={color}
                          stroke={theme === 'dark' ? '#0f172a' : '#ffffff'}
                          strokeWidth={0.5}
                          opacity={0.7}
                        />
                      );
                    }}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-zinc-50 dark:bg-[#121214]/60 border border-zinc-200 dark:border-zinc-800/60 rounded-2xl p-2">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Evolucao do capital</div>
                <div className="text-[9px] text-zinc-500">Com retirada vs. sem retirada</div>
              </div>
            </div>

            <div className="h-[170px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={equityPoints} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
                  <XAxis
                    dataKey="time"
                    type="number"
                    scale="time"
                    stroke={palette.axis}
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={formatMonthLabel}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    stroke={palette.axis}
                    tick={{ fontSize: 10 }}
                    tickFormatter={formatCompactNumber}
                  />
                  <Tooltip
                    formatter={(value: any) => formatCurrency(Number(value))}
                    labelFormatter={(label) => new Date(label).toLocaleDateString('pt-BR')}
                  />
                  <Line type="monotone" dataKey="capitalWith" stroke={palette.primary} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="capitalWithout" stroke={palette.accent} strokeWidth={2} dot={false} strokeDasharray="5 4" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        <div className="xl:col-span-4">
          <div className="bg-white dark:bg-[#0c0c0e]/60 border border-zinc-200 dark:border-zinc-800/60 rounded-2xl p-4 h-full flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Detalhes</div>
                <div className="text-[9px] text-zinc-500">Periodo a periodo</div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar max-h-[400px]">
              <table className="w-full text-left text-[10px] mono">
                <thead className="sticky top-0 bg-white dark:bg-[#0c0c0e]">
                  <tr className="text-zinc-400 font-black uppercase tracking-widest border-b border-zinc-100 dark:border-zinc-800/50">
                    <th className="py-2">Data</th>
                    <th className="py-2 text-right">Var%</th>
                    <th className="py-2 text-right">Ret%</th>
                    <th className="py-2 text-right">Lucro</th>
                    <th className="py-2 text-right">Retirada</th>
                    <th className="py-2 text-right">Aporte</th>
                    <th className="py-2 text-right">Capital</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/20">
                  {rows.map((row) => {
                    const isPlaceholder = !row.lossEvent && row.assetReturn === 0 && row.strategyReturn === 0 && row.profit === 0;
                    return (
                      <tr key={row.time.toISOString()} className={`${getRowTone(row)} transition-colors`}>
                        <td className="py-2.5 font-bold text-zinc-700 dark:text-zinc-200">
                          {row.time.toLocaleDateString('pt-BR')}
                        </td>
                        <td className="py-2.5 text-right">
                          {isPlaceholder ? '--' : formatSignedPercent(row.assetReturn * 100)}
                        </td>
                        <td className="py-2.5 text-right">
                          {isPlaceholder ? '--' : formatSignedPercent(row.strategyReturn * 100)}
                        </td>
                        <td className="py-2.5 text-right">
                          {isPlaceholder ? '--' : formatCompactNumber(row.profit)}
                        </td>
                        <td className="py-2.5 text-right">
                          {isPlaceholder ? '--' : formatCompactNumber(row.withdrawal)}
                        </td>
                        <td className="py-2.5 text-right text-emerald-500">
                          {isPlaceholder ? '--' : formatCompactNumber(row.investment)}
                        </td>
                        <td className="py-2.5 text-right font-black">
                          {formatCompactNumber(row.capital)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default StrategySimulator;
