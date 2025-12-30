
import React from 'react';

interface Props {
  symbol: string;
  info: string;
  sources?: {title: string, uri: string}[];
  loading: boolean;
  onClose: () => void;
}

const AiAdvisorPopup: React.FC<Props> = ({ symbol, info, sources = [], loading, onClose }) => {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div 
        className="bg-white dark:bg-[#0c0c0e] w-full max-w-2xl max-h-[85vh] rounded-[24px] border border-zinc-200 dark:border-zinc-800 shadow-[0_0_100px_rgba(59,130,246,0.3)] flex flex-col overflow-hidden ring-1 ring-blue-500/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-blue-500/[0.03] dark:bg-blue-500/[0.05]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-black text-zinc-900 dark:text-white uppercase tracking-tight leading-none">AI Market Advisor</h3>
              <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mt-1">Grounding em tempo real via Google Search • {symbol}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-rose-500/10 hover:text-rose-500 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-6">
              <div className="relative">
                <div className="w-12 h-12 border-2 border-blue-500/20 rounded-full"></div>
                <div className="absolute inset-0 w-12 h-12 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-500 animate-pulse">Sintonizando Satélites & Web...</p>
                <p className="text-zinc-500 text-[10px] mt-2 max-w-[200px]">Extraindo os fatos mais recentes e dividendos anunciados.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Renderização do HTML gerado pela IA */}
              <div 
                className="ai-rendered-content text-zinc-700 dark:text-zinc-300"
                dangerouslySetInnerHTML={{ __html: info }}
              />

              {/* Fontes */}
              {sources.length > 0 && (
                <div className="pt-8 border-t border-zinc-100 dark:border-zinc-800">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.172 13.828a4 4 0 015.656 0l4-4a4 4 0 10-5.656-5.656l-1.101 1.101" />
                    </svg>
                    Fontes de Verificação da Web
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {sources.map((src, i) => (
                      <a 
                        key={i} 
                        href={src.uri} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-lg hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group max-w-full"
                      >
                        <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 group-hover:text-blue-500 truncate max-w-[200px]">
                          {src.title}
                        </span>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-zinc-300 group-hover:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-900/40 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[8px] font-black uppercase tracking-widest text-zinc-400">Inteligência Grounded Ativa</span>
            <span className="text-[7px] font-mono text-zinc-500">Google Gemini 3 Flash • Real-time Web Extraction</span>
          </div>
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-zinc-900 dark:bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/10 active:scale-95"
          >
            Fechar Insights
          </button>
        </div>
      </div>
    </div>
  );
};

export default AiAdvisorPopup;
