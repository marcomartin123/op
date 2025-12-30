
import React, { useMemo, useState } from 'react';
import { AssetInfo, MarketAsset } from '../types';
import { formatPercent, formatNumber } from '../services/api';

interface Props {
  asset: AssetInfo;
  marketAssets: MarketAsset[];
  theme: 'dark' | 'light';
  onThemeToggle: () => void;
  onAiClick: () => void;
  onAssetClick: (symbol: string) => void;
  onScannerClick: () => void;
  onSnapshotOpen: () => void;
}

const DashboardHeader: React.FC<Props> = ({ asset, marketAssets, theme, onThemeToggle, onAiClick, onAssetClick, onScannerClick, onSnapshotOpen }) => {
  const [searchTicker, setSearchTicker] = useState('');
  const isUp = asset.variation >= 0;

  const filteredAssets = useMemo(() => {
    let list = [...marketAssets].sort((a, b) => a.symbol.localeCompare(b.symbol));
    if (searchTicker) {
      list = list.filter(m => m.symbol.toLowerCase().includes(searchTicker.toLowerCase()));
    }
    return list;
  }, [marketAssets, searchTicker]);

  const gridBtnClass = "h-[24px] px-2 rounded-lg border transition-all hover:scale-[1.02] active:scale-95 text-[8px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 min-w-[58px]";

  return (
    <div className="bg-white dark:bg-[#121214]/80 border border-zinc-200 dark:border-zinc-800/60 px-6 py-1.5 flex items-center justify-between gap-2 sticky top-6 z-50 shadow-xl dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-2xl h-[78px] rounded-2xl ring-1 ring-black/5 dark:ring-white/5 transition-colors">
      
      {/* Left Section: Asset Info */}
      <div className="flex items-center gap-6 h-[56px] pr-6 border-r border-zinc-200 dark:border-zinc-800/40 min-w-fit">
        <div className="flex flex-col justify-center border-r border-zinc-200 dark:border-zinc-800/30 pr-6 h-full">
           <span className="text-[9px] text-zinc-400 dark:text-zinc-600 font-black uppercase tracking-[0.2em] mb-1 leading-none">Asset</span>
           <h1 className="text-2xl font-black text-zinc-900 dark:text-white uppercase mono leading-none tracking-tight mb-1">{asset.symbol}</h1>
           <div className="flex items-center gap-2 opacity-70">
              <span className="text-[8px] uppercase font-black text-zinc-400 dark:text-zinc-500 tracking-wider">L/H</span>
              <span className="text-[10px] font-black mono text-zinc-400 dark:text-zinc-400 leading-none">{formatNumber(asset.low)}/{formatNumber(asset.high)}</span>
           </div>
        </div>
        <div className="flex items-center gap-6 h-full">
          <div className="flex flex-col justify-center">
            <span className="text-[9px] text-zinc-400 dark:text-zinc-600 font-black uppercase tracking-[0.2em] mb-1 leading-none">Price</span>
            <span className="text-2xl font-black mono text-zinc-900 dark:text-zinc-100 leading-none mb-1 tracking-tighter">{formatNumber(asset.close)}</span>
            <div className="flex items-center gap-2">
                <span className="text-[8px] uppercase font-black text-blue-500/70 tracking-wider">IV</span>
                <span className="text-[10px] font-black mono text-blue-600 dark:text-blue-500 leading-none">{formatNumber(asset.iv_current, 1)}%</span>
            </div>
          </div>
          <div className={`flex items-center gap-3 px-3 py-1 rounded-xl border transition-all ${isUp ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'}`}>
            <span className="text-2xl leading-none font-black">{isUp ? '▲' : '▼'}</span>
            <div className="flex flex-col leading-none">
              <span className="text-lg font-black mono tracking-tighter">{formatPercent(asset.variation)}</span>
              <span className="text-[7px] font-black uppercase tracking-widest opacity-60 mt-0.5">Variação Dia</span>
            </div>
          </div>
        </div>
      </div>

      {/* Middle Section: Search & Market Tickers */}
      <div className="flex-1 flex items-center gap-3 px-3 h-full overflow-hidden">
        <div className="flex flex-col justify-center shrink-0 w-28 border-r border-zinc-200 dark:border-zinc-800/40 pr-3 h-[54px]">
           <span className="text-[8px] text-zinc-400 dark:text-zinc-600 font-black uppercase tracking-widest mb-1 leading-none">Busca Ticker</span>
           <input type="text" value={searchTicker} onChange={(e) => setSearchTicker(e.target.value)} placeholder="Ex: VALE..." className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1 text-[10px] font-black mono outline-none" />
        </div>
        <div className="flex-1 overflow-hidden h-full flex items-center">
          <div className="grid grid-rows-2 grid-flow-col gap-x-1.5 gap-y-1.5 overflow-x-auto h-full items-center py-1 no-scrollbar">
            {filteredAssets.map((m) => {
              const isSelected = m.symbol === asset.symbol;
              return (
                <button key={m.symbol} onClick={() => onAssetClick(m.symbol)} className={`flex-shrink-0 flex items-center justify-center px-3 py-1 rounded-lg border transition-all min-w-[70px] h-[24px] text-[10px] font-black uppercase ${isSelected ? 'bg-blue-600/20 border-blue-500 text-blue-600' : 'bg-zinc-50 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800/40 text-zinc-400'}`}>{m.symbol}</button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right Section: Compact Button Grid */}
      <div className="pl-4 border-l border-zinc-200 dark:border-zinc-800/40 flex items-center gap-2 min-w-fit">
        <button
          onClick={onScannerClick}
          className={`${gridBtnClass} bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-500 shadow-lg shadow-amber-500/5`}
          title="Scanner de Matriz"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          SCAN
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onThemeToggle}
            className={`${gridBtnClass} bg-zinc-500/10 border-zinc-500/30 text-zinc-600 dark:text-zinc-400`}
            title="Alternar Tema"
          >
            {theme === 'dark' ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" /></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
            )}
            TEMA
          </button>
          <button
            onClick={onSnapshotOpen}
            className={`${gridBtnClass} bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-500 shadow-lg shadow-purple-500/5`}
            title="Abrir Snapshots"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            SNAP
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(DashboardHeader);
