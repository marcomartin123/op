import React, { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { PayoffData } from '../types';
import { formatCurrency, formatNumber } from '../services/api';

interface Props {
  data: PayoffData[];
  currentPrice: number;
  theme: 'dark' | 'light';
  percentBase?: number | null;
  breakEvens?: number[];
}

const PAYOFF_RANGE_PCT = 40;

const formatPercent = (value: number, decimals: number = 2) => {
  if (!Number.isFinite(value)) return '--';
  return `${formatNumber(value, decimals)}%`;
};

const formatSignedPercent = (value: number, decimals: number = 2) => {
  if (!Number.isFinite(value)) return '--';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${formatNumber(value, decimals)}%`;
};

const PayoffChart: React.FC<Props> = ({ data, currentPrice, theme, percentBase, breakEvens }) => {
  if (data.length === 0) return null;

  const palette = theme === 'dark'
    ? {
        grid: '#27272a',
        axis: '#a1a1aa',
        profit: '#22c55e',
        loss: '#f43f5e',
        current: '#6366f1',
        tooltipBg: '#0f172a',
        tooltipBorder: '#1e293b',
        tooltipText: '#e2e8f0'
      }
    : {
        grid: '#e4e4e7',
        axis: '#52525b',
        profit: '#16a34a',
        loss: '#e11d48',
        current: '#4f46e5',
        tooltipBg: '#ffffff',
        tooltipBorder: '#e5e7eb',
        tooltipText: '#111827'
      };

  const base = percentBase && percentBase > 0 ? percentBase : 1;

  const chartData = useMemo(
    () => data.map((point) => {
      const profitPct = base > 0 ? (point.profit / base) * 100 : 0;
      return {
        movePct: point.movePct,
        profit: point.profit,
        profitPct: Number(profitPct.toFixed(4))
      };
    }),
    [data, base]
  );

  const { yDomain, maxProfitPct, maxLossPct } = useMemo(() => {
    const values = chartData.map((point) => point.profitPct);
    if (!values.length) {
      return { yDomain: [-1, 1] as [number, number], maxProfitPct: 0, maxLossPct: 0 };
    }
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const min = Math.min(rawMin, 0);
    const max = Math.max(rawMax, 0);
    const range = max - min;
    const pad = range === 0 ? 1 : range * 0.08;
    return {
      yDomain: [min - pad, max + pad] as [number, number],
      maxProfitPct: rawMax > 0 ? rawMax : 0,
      maxLossPct: rawMin < 0 ? rawMin : 0
    };
  }, [chartData]);

  const breakEvenMarks = useMemo(() => {
    if (!breakEvens || breakEvens.length === 0) return [];
    const seen = new Set<string>();
    const marks: number[] = [];
    breakEvens.forEach((value) => {
      if (!Number.isFinite(value)) return;
      const clamped = Math.max(-PAYOFF_RANGE_PCT, Math.min(PAYOFF_RANGE_PCT, value));
      const rounded = Number(clamped.toFixed(2));
      const key = rounded.toFixed(2);
      if (seen.has(key)) return;
      seen.add(key);
      marks.push(rounded);
    });
    return marks.sort((a, b) => a - b);
  }, [breakEvens]);

  const formatSignedCurrency = (val: number) => `${val >= 0 ? '+' : ''}${formatCurrency(val)}`;

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const point = payload[0].payload as { movePct: number; profitPct: number; profit: number };
      const isProfit = point.profitPct >= 0;
      const moveLabel = formatSignedPercent(point.movePct, 2);
      const profitPctLabel = formatSignedPercent(point.profitPct, 2);
      const pricePoint = currentPrice > 0 ? currentPrice * (1 + point.movePct / 100) : 0;
      const priceLabel = currentPrice > 0 ? `R$ ${formatNumber(pricePoint, 2)}` : '--';

      return (
        <div
          style={{ background: palette.tooltipBg, borderColor: palette.tooltipBorder, color: palette.tooltipText }}
          className="border px-3 py-2 rounded-lg shadow-2xl"
        >
          <p className="text-[10px] uppercase tracking-widest text-zinc-400">Movimento do ativo</p>
          <p className="text-sm font-black mono">{moveLabel}</p>
          <p className="text-[10px] uppercase tracking-widest text-zinc-400 mt-2">Preco do ativo</p>
          <p className="text-xs font-black mono">{priceLabel}</p>
          <p className="text-[10px] uppercase tracking-widest text-zinc-400 mt-2">P/L %</p>
          <p className={`text-base font-black mono ${isProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
            {profitPctLabel}
          </p>
          <p className="text-[10px] uppercase tracking-widest text-zinc-400 mt-2">P/L</p>
          <p className={`text-xs font-black mono ${isProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
            {formatSignedCurrency(point.profit)}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-[360px] bg-zinc-50/60 dark:bg-[#0c0c0e]/60 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800/60">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 16, right: 24, left: 12, bottom: 6 }}>
          <defs>
            <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={palette.profit} stopOpacity={0.35} />
              <stop offset="95%" stopColor={palette.profit} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
          <XAxis
            dataKey="movePct"
            stroke={palette.axis}
            tick={{ fontSize: 11 }}
            tickFormatter={(val) => formatPercent(val as number, 0)}
            domain={[-PAYOFF_RANGE_PCT, PAYOFF_RANGE_PCT]}
            type="number"
          />
          <YAxis
            dataKey="profitPct"
            stroke={palette.axis}
            tick={{ fontSize: 11 }}
            tickFormatter={(val) => formatPercent(val as number, 1)}
            domain={yDomain}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="profitPct"
            stroke={palette.profit}
            fillOpacity={1}
            fill="url(#colorProfit)"
            strokeWidth={2.5}
            connectNulls
            baseValue={0}
          />
          <ReferenceLine y={0} stroke={palette.axis} strokeWidth={2} />
          <ReferenceLine
            x={0}
            stroke={palette.current}
            label={{ value: 'Spot 0%', fill: palette.current, position: 'top', fontSize: 10 }}
            strokeDasharray="5 5"
          />
          {breakEvenMarks.map((value) => (
            <ReferenceLine
              key={`be-${value}`}
              x={value}
              stroke={palette.axis}
              strokeDasharray="4 4"
              label={{ value: formatSignedPercent(value, 2), position: 'insideTop', fill: palette.axis, fontSize: 9 }}
            />
          ))}
          <ReferenceLine
            y={maxProfitPct}
            stroke={palette.profit}
            strokeDasharray="3 3"
            label={{ value: `Ganho Maximo ${formatSignedPercent(maxProfitPct, 1)}`, position: 'insideTopRight', fill: palette.profit, fontSize: 9 }}
          />
          <ReferenceLine
            y={maxLossPct}
            stroke={palette.loss}
            strokeDasharray="3 3"
            label={{ value: `Perda Maxima ${formatSignedPercent(maxLossPct, 1)}`, position: 'insideBottomRight', fill: palette.loss, fontSize: 9 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PayoffChart;
