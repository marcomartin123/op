
import { OplabData, EarningItem, NPositionData, MarketAsset } from '../types';

type CacheEntry = { data: OplabData; timestamp: number };

export type HistoryFrequency = 'WEEKLY' | 'MONTHLY';

export interface HistoryPoint {
  time: Date;
  close: number;
  returnPct: number | null;
}


const CACHE_STORAGE_KEY = 'trader-options-cache-v1';

// Cache global em memoria com persistencia local
const dataCache: Record<string, CacheEntry> = {};

const loadCacheFromStorage = () => {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
    if (!parsed || typeof parsed !== 'object') return;
    Object.entries(parsed).forEach(([symbol, entry]) => {
      if (!entry || typeof entry !== 'object' || !('data' in entry)) return;
      dataCache[symbol] = entry as CacheEntry;
    });
  } catch (error) {
    console.warn('Falha ao carregar cache local.', error);
  }
};

const persistCacheToStorage = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(dataCache));
  } catch (error) {
    console.warn('Falha ao salvar cache local.', error);
  }
};

loadCacheFromStorage();

/**
 * Retorna todos os dados atualmente no cache para hidratação de componentes.
 */
export const getAllCachedData = () => {
  return dataCache;
};

/**
 * Busca a lista de ativos do mercado a partir da URL específica solicitada pelo usuário.
 */
export const fetchMarketAssets = async (): Promise<MarketAsset[]> => {
  const buildId = "loLM98Djd5YFLbdz4rkSY";
  const MARKET_URL = `/api-oplab/mercado/_next/data/${buildId}/p.json`;

  try {
    const response = await fetch(MARKET_URL, {
      headers: {
        'x-nextjs-data': '1',
        'Cache-Control': 'no-cache'
      }
    });
    if (!response.ok) throw new Error("Erro ao carregar lista de mercado.");
    const json = await response.json();
    
    // Na estrutura do Oplab, os ativos costumam estar em pageProps.assets
    if (json && json.pageProps && json.pageProps.assets) {
      return json.pageProps.assets;
    }
    return [];
  } catch (error) {
    console.error("Falha ao buscar ativos do mercado:", error);
    return [];
  }
};

/**
 * Busca dados do Oplab, verificando primeiro o cache local.
 * @param ignoreCache Se true, ignora o cache e faz um novo fetch.
 */
export const fetchOptionsData = async (symbol: string = "PETR4", ignoreCache: boolean = false): Promise<{data: OplabData, fromCache: boolean}> => {
  const buildId = "loLM98Djd5YFLbdz4rkSY"; 
  const OPTIONS_URL = `/api-oplab/mercado/_next/data/${buildId}/pt-br/acoes/opcoes/${symbol}/janeiro/2027.json?asset=${symbol}`;
  
  // Verifica se temos no cache local
  const cached = dataCache[symbol];
  if (!ignoreCache && cached) {
    console.debug(`[Cache] Usando dados salvos para ${symbol}`);
    return { data: cached.data, fromCache: true };
  }

  try {
    const response = await fetch(OPTIONS_URL, {
      headers: {
        'x-nextjs-data': '1',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Servidor Oplab respondeu com erro ${response.status}.`);
    }
    const data = await response.json();
    if (!data || !data.pageProps) {
      throw new Error("Dados de mercado corrompidos ou incompletos.");
    }

    // Salva no cache
    dataCache[symbol] = { data, timestamp: Date.now() };
    persistCacheToStorage();
    
    return { data, fromCache: false };
  } catch (error) {
    console.warn(`Falha na requisição automática para ${symbol}.`, error);
    throw error;
  }
};

/**
 * Permite que componentes externos (como o Scanner) alimentem o cache manualmente
 */
export const updateDataCache = (symbol: string, data: OplabData) => {
  dataCache[symbol] = { data, timestamp: Date.now() };
  persistCacheToStorage();
};

export const replaceDataCache = (nextCache: Record<string, CacheEntry>) => {
  Object.keys(dataCache).forEach((key) => {
    delete dataCache[key];
  });
  if (nextCache && typeof nextCache === 'object') {
    Object.entries(nextCache).forEach(([symbol, entry]) => {
      if (!entry || typeof entry !== 'object' || !('data' in entry)) return;
      dataCache[symbol] = entry as CacheEntry;
    });
  }
  persistCacheToStorage();
};

export const fetchEarningsData = async (): Promise<EarningItem[]> => {
  const now = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(now.getDate() - 30);
  
  const nextYear = new Date();
  nextYear.setFullYear(now.getFullYear() + 1);

  const formatDate = (date: Date) => date.toISOString().split('T')[0];
  
  const START = formatDate(thirtyDaysAgo);
  const END = formatDate(nextYear);
  
  const EARNINGS_URL = `/api-statusinvest/acao/getearnings?IndiceCode=ibovespa&Filter=&Start=${START}&End=${END}`;

  try {
    const response = await fetch(EARNINGS_URL);
    if (!response.ok) throw new Error("Erro ao buscar proventos.");
    const data = await response.json();
    
    if (data && data.dateCom && Array.isArray(data.dateCom)) {
      return data.dateCom;
    }
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Falha ao buscar proventos do StatusInvest:", error);
    return [];
  }
};

export const fetchPositions = async (): Promise<NPositionData | null> => {
  try {
    const response = await fetch('/n_position.json');
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    console.warn("Could not fetch n_position.json", e);
    return null;
  }
};

const cleanDateInput = (value: string) => {
  return value.replace(/\\n/g, '').replace(/[\r\n]/g, '').trim();
};

export const addOneDay = (dateStr: string): string => {
  const cleaned = cleanDateInput(dateStr);
  const date = new Date(cleaned);
  if (Number.isNaN(date.getTime())) {
    return cleaned;
  }
  date.setDate(date.getDate() + 1);
  return date.toISOString();
};

export const getCalendarDays = (targetDate: string, referenceDate?: string): number => {
  const cleanedTarget = cleanDateInput(targetDate);
  const start = referenceDate ? new Date(cleanDateInput(referenceDate)) : new Date();
  const end = new Date(cleanedTarget);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }
  
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return Math.max(0, diffDays);
};

export const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
};

export const formatPercent = (val: number) => {
  return `${val > 0 ? '+' : ''}${val.toFixed(2)}%`;
};

export const formatNumber = (val: number, decimals: number = 2) => {
  if (val === undefined || val === null) return "0,00";
  return val.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};


interface YahooChartResult {
  timestamp?: number[];
  indicators?: {
    quote?: Array<{
      close?: Array<number | null>;
    }>;
    adjclose?: Array<{
      adjclose?: Array<number | null>;
    }>;
  };
}

interface YahooChartResponse {
  chart?: {
    result?: YahooChartResult[];
    error?: { description?: string } | null;
  };
}

const YAHOO_BASE_URL = process.env.YAHOO_BASE_URL || '/api-yahoo';

const normalizeYahooSymbol = (symbol: string) => {
  if (!symbol) return '';
  if (symbol.includes('.') || symbol.includes('^')) return symbol;
  return `${symbol}.SA`;
};

const joinUrl = (base: string, path: string) => {
  const safeBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${safeBase}${path}`;
};

const parseYahooHistory = (data: YahooChartResponse): HistoryPoint[] => {
  const chart = data?.chart;
  if (chart?.error) {
    const message = chart.error?.description || 'Erro Yahoo.';
    throw new Error(message);
  }

  const result = chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0];
  const closes = quote?.close || [];

  const points: Array<{ time: Date; close: number }> = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const ts = timestamps[i];
    const close = closes[i];
    if (!Number.isFinite(ts)) continue;
    if (close === null || close === undefined || !Number.isFinite(close)) continue;
    points.push({ time: new Date(ts * 1000), close });
  }

  points.sort((a, b) => a.time.getTime() - b.time.getTime());

  let lastClose: number | null = null;
  return points.map((point) => {
    const returnPct = lastClose === null ? null : point.close / lastClose - 1;
    lastClose = point.close;
    return {
      time: point.time,
      close: point.close,
      returnPct
    };
  });
};

export const fetchYahooHistory = async (
  symbol: string,
  frequency: HistoryFrequency,
  from: number,
  to: number
): Promise<HistoryPoint[]> => {
  const yahooSymbol = normalizeYahooSymbol(symbol);
  if (!yahooSymbol) return [];

  const interval = frequency === 'WEEKLY' ? '1wk' : '1mo';
  const endpoint = `/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?formatted=false&includeAdjustedClose=false&interval=${interval}&period1=${from}&period2=${to}&symbol=${encodeURIComponent(yahooSymbol)}&lang=en-US&region=US`;

  const response = await fetch(joinUrl(YAHOO_BASE_URL, endpoint), {
    headers: {
      'Accept': 'application/json',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    }
  });

  if (!response.ok) {
    throw new Error(`Erro ao buscar historico (${response.status}).`);
  }

  const json = (await response.json()) as YahooChartResponse;
  const points = parseYahooHistory(json);
  if (!points.length) {
    throw new Error('Historico Yahoo vazio ou invalido.');
  }

  return points;
};
