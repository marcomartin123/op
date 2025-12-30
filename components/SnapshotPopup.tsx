import React, { useMemo } from 'react';
import { StoredSnapshotRecord } from '../utils/snapshotStorage';

interface Props {
  records: StoredSnapshotRecord[];
  selectedId: string;
  onSelect: (id: string) => void;
  onLoadSelected: () => void;
  onClose: () => void;
  onSaveSnapshot: () => void;
  onDeleteSnapshot: (id: string) => void;
  onClearSnapshots: () => void;
  intervalMinutes: number;
  onIntervalChange: (minutes: number) => void;
  isSnapshotRunning: boolean;
  snapshotProgress: { completed: number; total: number };
}

const scheduleOptions = [
  { value: 0, label: 'Desligado' },
  { value: 30, label: '30m' },
  { value: 60, label: '1h' },
  { value: 120, label: '2h' },
  { value: 240, label: '4h' }
];

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const SnapshotPopup: React.FC<Props> = ({
  records,
  selectedId,
  onSelect,
  onLoadSelected,
  onClose,
  onSaveSnapshot,
  onDeleteSnapshot,
  onClearSnapshots,
  intervalMinutes,
  onIntervalChange,
  isSnapshotRunning,
  snapshotProgress
}) => {
  const formatted = useMemo(() => {
    return records.map((record) => {
      const date = new Date(record.savedAt);
      const dateLabel = Number.isNaN(date.getTime()) ? record.savedAt : date.toLocaleString('pt-BR');
      const sourceLabel = record.source === 'auto' ? 'AUTO' : record.source === 'imported' ? 'IMPRT' : 'MANUAL';
      const assetLabel = record.asset || '--';
      const sizeLabel = formatBytes(record.sizeBytes || 0);
      return {
        id: record.id,
        dateLabel,
        sourceLabel,
        assetLabel,
        sizeLabel
      };
    });
  }, [records]);

  const hasSelection = selectedId !== '' && records.some((record) => record.id === selectedId);
  const isBusy = isSnapshotRunning;
  const progressLabel = snapshotProgress.total > 0
    ? `${snapshotProgress.completed}/${snapshotProgress.total}`
    : '';

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white dark:bg-[#0c0c0e] w-full max-w-3xl max-h-[85vh] rounded-[28px] border border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden ring-1 ring-white/5" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-zinc-900 dark:text-white uppercase tracking-tight">Snapshots Salvos</h2>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500 mt-1">Escolha um snapshot para carregar</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Auto snapshot</span>
              <select
                value={intervalMinutes}
                onChange={(e) => onIntervalChange(Number(e.target.value))}
                className="px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[9px] font-black uppercase tracking-widest text-zinc-600 dark:text-zinc-200"
              >
                {scheduleOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              {isBusy && (
                <span className="text-[9px] font-black uppercase tracking-widest text-blue-500">
                  Rodando {progressLabel}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-2 custom-scrollbar">
          {formatted.length === 0 ? (
            <div className="border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 text-center text-zinc-400 text-[11px]">
              Nenhum snapshot salvo. Use Salvar Agora para criar.
            </div>
          ) : (
            formatted.map((record) => {
              const isSelected = record.id === selectedId;
              return (
                <button
                  key={record.id}
                  onClick={() => onSelect(record.id)}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-left transition-all ${isSelected ? 'bg-blue-600/10 border-blue-500/40 text-blue-600 dark:text-blue-400' : 'bg-zinc-50 dark:bg-black/40 border-zinc-200 dark:border-zinc-800/60 text-zinc-600 dark:text-zinc-300 hover:border-blue-400/50'}`}
                  title={`${record.dateLabel} - ${record.assetLabel} (${record.sourceLabel})`}
                >
                  <div className="flex flex-col items-start">
                    <span className="text-[11px] font-black mono text-zinc-700 dark:text-zinc-100">{record.dateLabel}</span>
                    <span className="text-[8px] font-black uppercase tracking-widest text-zinc-400">
                      {record.assetLabel} {record.sourceLabel} ? {record.sizeLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isSelected && (
                      <span className="text-[8px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">SEL</span>
                    )}
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteSnapshot(record.id);
                      }}
                      className="w-7 h-7 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:text-rose-500 hover:border-rose-500/40 transition-all"
                      title="Excluir snapshot"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-1 0v12a1 1 0 01-1 1H9a1 1 0 01-1-1V7m3 4v6m4-6v6" /></svg>
                    </button>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">{records.length} snapshots</span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onSaveSnapshot}
              disabled={isBusy}
              className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${isBusy ? 'bg-zinc-100 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 text-zinc-400 cursor-not-allowed' : 'border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500 hover:text-white'}`}
            >
              {isBusy ? 'Rodando...' : 'Salvar Agora'}
            </button>
            <button
              onClick={onClearSnapshots}
              disabled={records.length === 0 || isBusy}
              className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${records.length === 0 || isBusy ? 'bg-zinc-100 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 text-zinc-400 cursor-not-allowed' : 'border-rose-500/30 text-rose-500 bg-rose-500/10 hover:bg-rose-500 hover:text-white'}`}
            >
              Limpar Tudo
            </button>
            <button
              onClick={onLoadSelected}
              disabled={!hasSelection}
              className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${hasSelection ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500 hover:text-white' : 'bg-zinc-100 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 text-zinc-400 cursor-not-allowed'}`}
            >
              Carregar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SnapshotPopup;
