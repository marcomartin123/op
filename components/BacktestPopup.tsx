import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { MarketAsset, StrategyLeg } from '../types';
import { HistoryFrequency, fetchYahooHistory, formatCurrency, formatNumber } from '../services/api';
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
  assetSymbol: string;
  marketAssets: MarketAsset[];
  theme: 'dark' | 'light';
  onClose: () => void;
}

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

const formatSignedPercent = (value: number) => {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${formatNumber(value, 2)}%`;
};

const formatSignedCurrency = (value: number) => {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${formatCurrency(value)}`;
};

const formatCompactNumber = (value: number) => {
  if (!Number.isFinite(value)) return '--';
  const abs = Math.abs(value);
  if (abs >= 1000000) return `${(value / 1000000).toFixed(1)}m`;
  if (abs >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return formatNumber(value, 0);
};

const BacktestPopup: React.FC<Props> = ({
  legs,
  currentPrice,
  assetSymbol,
  marketAssets,
  theme,
  onClose
}) => {
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
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#0c0c0e] w-full max-w-[1400px] max-h-[92vh] rounded-[32px] border border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden ring-1 ring-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-2 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-black leading-none text-zinc-900 dark:text-white uppercase tracking-tight">
              Backtest Estrategia
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
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

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left text-[10px] mono">
                    <thead className="sticky top-0 bg-white dark:bg-[#0c0c0e]">
                      <tr className="text-zinc-400 font-black uppercase tracking-widest border-b border-zinc-100 dark:border-zinc-800/50">
                        <th className="py-2">Data</th>
                        <th className="py-2 text-right">Var%</th>
                        <th className="py-2 text-right">Ret%</th>
                        <th className="py-2 text-right">Lucro</th>
                        <th className="py-2 text-right">Retirada</th>
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
        </div>
      </div>
    </div>
  );
};

export default BacktestPopup;
