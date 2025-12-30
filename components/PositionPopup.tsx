
import React, { useMemo } from 'react';
import { NPositionData, OplabData, PositionItem, OptionData } from '../types';
import { formatNumber, formatCurrency, getCalendarDays, addOneDay } from '../services/api';

interface Props {
  data: NPositionData;
  marketData: OplabData | null;
  onClose: () => void;
}

interface CalculatedPosition {
  ticker: string;
  qty: number;
  bid: number;
  ask: number;
  strike: number;
  reversalValue: number;
  isOption: boolean;
}

const PositionPopup: React.FC<Props> = ({ data, marketData, onClose }) => {
  const renderPersonPosition = (person: string, items: PositionItem[]) => {
    const rows: CalculatedPosition[] = items.map(item => {
      let bid = 0;
      let ask = 0;
      let strike = 0;
      let isOption = false;

      // Handle Asset (Spot)
      if (item.ticker.includes("PETROBRAS PN") || item.ticker === "PETR4") {
        bid = marketData?.pageProps.asset.bid || 0;
        ask = marketData?.pageProps.asset.ask || 0;
      } else {
        // Handle Options
        isOption = true;
        marketData?.pageProps.series.forEach(s => {
          s.strikes.forEach(stk => {
            if (stk.call.symbol === item.ticker) {
              bid = stk.call.bid;
              ask = stk.call.ask;
              strike = stk.strike;
            } else if (stk.put.symbol === item.ticker) {
              bid = stk.put.bid;
              ask = stk.put.ask;
              strike = stk.strike;
            }
          });
        });
      }

      const reversalValue = item.quantidade > 0 ? (item.quantidade * bid) : (item.quantidade * ask);

      return {
        ticker: item.ticker,
        qty: item.quantidade,
        bid,
        ask,
        strike,
        reversalValue,
        isOption
      };
    });

    const totalReversal = rows.reduce((acc, curr) => acc + curr.reversalValue, 0);
    const firstOption = rows.find(r => r.isOption);
    const maturityValue = firstOption ? Math.abs(firstOption.qty) * firstOption.strike : 0;
    
    // Taxa Box logic: (Maturity Value / Reversal Cost) - 1
    // Note: Reversal cost is what we GET to close, but usually box cost is negative (debit) or positive (credit).
    // If Reversal Value is positive, it means we receive money to close.
    const boxRateTotal = totalReversal !== 0 ? (maturityValue / Math.abs(totalReversal)) - 1 : 0;
    
    const series = marketData?.pageProps.series[0]; // Assuming first series for days
    const days = series ? getCalendarDays(addOneDay(series.due_date), marketData?.pageProps.time) : 30;
    const monthlyRate = days > 0 ? (Math.pow(1 + boxRateTotal, 30 / days) - 1) * 100 : 0;

    return (
      <div className="bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
          <h3 className="text-xl font-black text-zinc-900 dark:text-white uppercase tracking-tighter">Posição: {person}</h3>
          <div className="flex flex-col items-end">
             <span className="text-[10px] font-black uppercase text-zinc-400">Taxa Box Estimada</span>
             <span className="text-lg font-black mono text-emerald-500">{formatNumber(monthlyRate)}% a.m.</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px] mono">
            <thead>
              <tr className="text-zinc-400 font-black uppercase tracking-widest border-b border-zinc-100 dark:border-zinc-800/50">
                <th className="py-2">Ticker</th>
                <th className="py-2 text-right">Qtd</th>
                <th className="py-2 text-right">Strike</th>
                <th className="py-2 text-right">BID</th>
                <th className="py-2 text-right">ASK</th>
                <th className="py-2 text-right text-emerald-500">Reversão R$</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/20">
              {rows.map((r, i) => (
                <tr key={i} className="group">
                  <td className="py-2.5 font-bold text-zinc-700 dark:text-zinc-300">{r.ticker}</td>
                  <td className={`py-2.5 text-right font-black ${r.qty >= 0 ? 'text-zinc-900 dark:text-zinc-100' : 'text-rose-500'}`}>{r.qty.toLocaleString()}</td>
                  <td className="py-2.5 text-right text-zinc-500">{r.strike > 0 ? formatNumber(r.strike) : '-'}</td>
                  <td className="py-2.5 text-right text-emerald-600 dark:text-emerald-500">{formatNumber(r.bid)}</td>
                  <td className="py-2.5 text-right text-rose-600 dark:text-rose-500">{formatNumber(r.ask)}</td>
                  <td className="py-2.5 text-right font-black text-zinc-900 dark:text-white">{formatCurrency(r.reversalValue)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-zinc-200 dark:border-zinc-800">
                <td colSpan={5} className="py-4 font-black uppercase text-zinc-400 text-[10px]">Total Recebimento Reversão</td>
                <td className="py-4 text-right text-lg font-black text-blue-600 dark:text-blue-400">{formatCurrency(totalReversal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white dark:bg-[#0c0c0e] w-full max-w-4xl max-h-[90vh] rounded-[32px] border border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden ring-1 ring-white/5" onClick={e => e.stopPropagation()}>
        <div className="px-8 py-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black text-zinc-900 dark:text-white uppercase tracking-tight">Consolidador de Carteira</h2>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mt-1">Análise de Desmontagem e Taxa Implícita</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
          {renderPersonPosition("M", data.M)}
          {renderPersonPosition("R", data.R)}
        </div>

        <div className="px-8 py-4 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Baseado em n_position.json • Cálculos em Tempo Real</span>
          <button onClick={onClose} className="px-8 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-80 transition-all">Fechar Dashboard</button>
        </div>
      </div>
    </div>
  );
};

export default PositionPopup;
