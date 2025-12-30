
import React, { useState, useEffect } from 'react';

interface Props {
  isActive: boolean;
  onToggle: () => void;
  onTriggerUpdate: () => void;
  lastUpdateTime: string;
  marketTime: string;
  selectedAsset: string;
}

const PollingControl: React.FC<Props> = ({ isActive, onToggle, onTriggerUpdate, lastUpdateTime, marketTime, selectedAsset }) => {
  const [countdown, setCountdown] = useState(60);

  useEffect(() => {
    setCountdown(60);
  }, [selectedAsset, isActive]);

  useEffect(() => {
    if (!isActive) return;

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          onTriggerUpdate();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isActive, onTriggerUpdate]);

  return (
    <div className="flex flex-col items-center border-r border-zinc-200 dark:border-zinc-800/50 pr-4 h-[60px] justify-center gap-1 min-w-[120px]">
      <div className="flex flex-col items-center leading-none">
        <div className="flex items-center gap-2 mb-0.5">
          {/* Removido animate-pulse para economizar CPU */}
          <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
          <span className={`text-[8px] uppercase font-black tracking-[0.2em] ${isActive ? 'text-emerald-600 dark:text-emerald-500' : 'text-rose-600 dark:text-rose-500'}`}>
            Live Polling {isActive && <span className="ml-1 opacity-60 mono">({countdown}s)</span>}
          </span>
        </div>
        <span className="text-[11px] font-black mono text-zinc-500 dark:text-zinc-400" title="Última atualização">{lastUpdateTime}</span>
      </div>
      
      <button 
        onClick={onToggle}
        className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none ring-1 ring-black/5 dark:ring-white/10 ${isActive ? 'bg-emerald-500/20' : 'bg-rose-500/20'}`}
      >
        <span
          className={`inline-block h-3 w-3 transform rounded-full transition-transform duration-200 ${isActive ? 'translate-x-[18px] bg-emerald-500' : 'translate-x-0.5 bg-rose-500'}`}
        />
      </button>

      <span className="text-[10px] font-black mono text-zinc-600 dark:text-zinc-300 leading-none">
        {marketTime}
      </span>
    </div>
  );
};

// Memoização estrita para garantir que o componente só re-renderize se as referências das props mudarem
export default React.memo(PollingControl);
