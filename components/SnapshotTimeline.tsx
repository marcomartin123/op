import React, { useMemo } from 'react';
import { StoredSnapshotRecord } from '../utils/snapshotStorage';

interface Props {
  records: StoredSnapshotRecord[];
  selectedId: string;
  onSelect: (id: string) => void;
}

const SnapshotTimeline: React.FC<Props> = ({ records, selectedId, onSelect }) => {
  const ordered = useMemo(() => {
    return [...records].sort((a, b) => {
      const aTime = Date.parse(a.savedAt);
      const bTime = Date.parse(b.savedAt);
      if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
        return a.savedAt.localeCompare(b.savedAt);
      }
      return aTime - bTime;
    });
  }, [records]);

  if (ordered.length === 0) {
    return (
      <div className="flex items-center gap-3 px-4 h-[60px] bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800/50 rounded-2xl shadow-xl">
        <div className="flex flex-col items-start">
          <span className="text-[9px] text-zinc-400 dark:text-zinc-600 font-black uppercase tracking-wider leading-none">Snapshots</span>
          <span className="text-[7px] font-black uppercase text-zinc-400/50 leading-none mt-1">Sem registros</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 h-[60px] bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800/50 rounded-2xl shadow-xl">
      <div className="flex flex-col items-start mr-1">
        <span className="text-[9px] text-zinc-400 dark:text-zinc-600 font-black uppercase tracking-wider leading-none">Snapshots</span>
        <span className="text-[7px] font-black uppercase text-zinc-400/50 leading-none mt-1">{ordered.length} pontos</span>
      </div>
      <div className="flex-1 overflow-x-auto custom-scrollbar">
        <div className="relative min-w-max flex items-center gap-3 px-2 py-1">
          <div className="absolute left-0 right-0 top-1/2 h-px bg-zinc-200 dark:bg-zinc-800"></div>
          {ordered.map((record) => {
            const date = new Date(record.savedAt);
            const timeLabel = Number.isNaN(date.getTime())
              ? record.savedAt
              : date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const title = Number.isNaN(date.getTime()) ? record.savedAt : date.toLocaleString('pt-BR');
            const isSelected = record.id === selectedId;

            return (
              <button
                key={record.id}
                onClick={() => onSelect(record.id)}
                title={title}
                className="relative z-10 flex flex-col items-center gap-1 focus:outline-none"
              >
                <span className={`w-2.5 h-2.5 rounded-full border ${isSelected ? 'bg-blue-500 border-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-zinc-300 dark:bg-zinc-700 border-zinc-400/50'}`}></span>
                <span className={`text-[7px] font-black mono ${isSelected ? 'text-blue-500' : 'text-zinc-400'}`}>{timeLabel}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SnapshotTimeline;
