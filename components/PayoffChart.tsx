import React from 'react';
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
}

const PayoffChart: React.FC<Props> = ({ data, currentPrice, theme, percentBase }) => {
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

  const formatSignedCurrency = (val: number) => `${val >= 0 ? '+' : ''}${formatCurrency(val)}`;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const profit = payload[0].value as number;
      const isProfit = profit >= 0;
      const pricePoint = Number(label);
      const spotDistance = pricePoint - currentPrice;
      const spotDistancePct = currentPrice > 0 ? (spotDistance / currentPrice) * 100 : 0;
      const spotDistanceLabel = `${spotDistancePct >= 0 ? '+' : ''}${formatNumber(Math.abs(spotDistancePct), 2)}%`;
      const base = percentBase && percentBase > 0 ? percentBase : null;
      const profitPct = base ? (profit / base) * 100 : null;
      const profitPctLabel = profitPct === null
        ? '--'
        : `${profitPct >= 0 ? '+' : ''}${formatNumber(Math.abs(profitPct), 2)}%`;

      return (
        <div
          style={{ background: palette.tooltipBg, borderColor: palette.tooltipBorder, color: palette.tooltipText }}
          className="border px-3 py-2 rounded-lg shadow-2xl"
        >
          <p className="text-[10px] uppercase tracking-widest text-zinc-400">Preco do ativo</p>
          <p className="text-sm font-black mono">R$ {formatNumber(pricePoint, 2)}</p>
          <p className="text-[10px] uppercase tracking-widest text-zinc-400 mt-2">Dist. do Spot</p>
          <p className="text-xs font-black mono text-zinc-500">{spotDistanceLabel}</p>
          <p className="text-[10px] uppercase tracking-widest text-zinc-400 mt-2">P/L no vencimento</p>
          <p className={`text-base font-black mono ${isProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
            {formatSignedCurrency(profit)}
          </p>
          <p className="text-[10px] uppercase tracking-widest text-zinc-400 mt-2">P/L %</p>
          <p className={`text-xs font-black mono ${isProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
            {profitPctLabel}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-[360px] bg-zinc-50/60 dark:bg-[#0c0c0e]/60 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800/60">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={palette.profit} stopOpacity={0.35} />
              <stop offset="95%" stopColor={palette.profit} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
          <XAxis
            dataKey="price"
            stroke={palette.axis}
            tick={{ fontSize: 11 }}
            tickFormatter={(val) => `R$ ${formatNumber(val as number, 2)}`}
            domain={['dataMin', 'dataMax']}
            type="number"
          />
          <YAxis
            stroke={palette.axis}
            tick={{ fontSize: 11 }}
            tickFormatter={(val) => `${val >= 0 ? '+' : ''}${formatNumber(val as number, 0)}`}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke={palette.axis} strokeWidth={2} />
          <ReferenceLine
            x={currentPrice}
            stroke={palette.current}
            label={{ value: 'Spot', fill: palette.current, position: 'top', fontSize: 10 }}
            strokeDasharray="5 5"
          />
          <Area
            type="monotone"
            dataKey="profit"
            stroke={palette.profit}
            fillOpacity={1}
            fill="url(#colorProfit)"
            strokeWidth={2.5}
            connectNulls
            baseValue={0}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PayoffChart;
