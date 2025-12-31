
export interface BlackScholesData {
  type: 'CALL' | 'PUT';
  strike: number;
  premium: number;
  daysToMaturity: number;
  bid: number;
  ask: number;
  vi: number;
  ve: number;
  'cost-if-exercised': number;
  'protection-rate': number;
  'profit-rate': number;
  liquid: boolean;
  'liquidity-level': number;
  'liquidity-text': string;
  'protection-rate-over-cost': number;
  'profit-rate-if-exercised'?: number;
  've-over-strike': number;
  moneyness: 'ITM' | 'OTM' | 'ATM';
  price: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
  volatility: number;
  poe: number;
}

export interface OptionData {
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  bid: number;
  ask: number;
  volume: number;
  financial_volume: number;
  variation: number;
  maturity_type: string;
  contract_size: number;
  market_maker: boolean;
  time: string;
  category: 'CALL' | 'PUT';
  strike: number;
  liquidity: number;
  days_to_maturity: number;
  bs: BlackScholesData;
}

export interface StrikePair {
  strike: number;
  call: OptionData;
  put: OptionData;
}

export interface OptionSeries {
  due_date: string;
  days_to_maturity: number;
  call: string;
  put: string;
  strikes: StrikePair[];
}

export interface AssetInfo {
  ask: number;
  ask_volume: number;
  beta_ibov: number;
  bid: number;
  bid_volume: number;
  close: number;
  contract_size: number;
  ewma_current: number;
  financial_volume: number;
  high: number;
  iv_current: number;
  last_trade_at: string;
  low: number;
  middle_term_trend: number;
  name: string;
  open: number;
  short_term_trend: number;
  stdv_1y: number;
  symbol: string;
  time: string;
  variation: number;
  volume: number;
}

export interface MarketAsset {
  symbol: string;
  variation: number;
  close: number;
}

export interface OplabData {
  pageProps: {
    asset: AssetInfo;
    series: OptionSeries[];
    assets: MarketAsset[];
    time: string;
  };
}

export interface EarningItem {
  code: string;
  companyName: string;
  resultAbsoluteValue: string;
  dateCom: string;
  paymentDividend: string;
  earningType: string;
  dy: string;
}

export interface StatusInvestEarnings {
  dateCom: EarningItem[];
}

export interface PositionItem {
  ticker: string;
  quantidade: number;
  preco_medio_compra: number;
  preco_medio_venda: number;
  custo_total: number;
}

export interface NPositionData {
  M: PositionItem[];
  R: PositionItem[];
}

export enum OptionType {
  CALL = 'CALL',
  PUT = 'PUT'
}

export enum Side {
  BUY = 'BUY',
  SELL = 'SELL'
}

export enum LegInstrument {
  OPTION = 'OPTION',
  UNDERLYING = 'UNDERLYING'
}

export interface StrategyLeg {
  id: string;
  instrument: LegInstrument;
  side: Side;
  type?: OptionType;
  strike?: number;
  premium: number;
  quantity: number;
  symbol: string;
  contractSize: number;
}

export interface PayoffData {
  movePct: number;
  profit: number;
}

export interface StrategyStats {
  maxProfit: number | 'Unlimited';
  maxLoss: number | 'Unlimited';
  breakEvens: number[];
  netPremium: number;
  capitalAtRisk: number | null;
  maxProfitPct: number | null;
  maxLossPct: number | null;
  spotPnl: number;
}

export interface SimulateLegPayload {
  option: OptionData;
  optionType: OptionType;
  side: Side;
  premium: number;
}

export type SnapshotCache = Record<string, { data: OplabData; timestamp: number }>;

export interface DashboardSnapshot {
  version: number;
  savedAt: string;
  currentData: OplabData | null;
  dataCache: SnapshotCache;
  selectedAsset: string;
  selectedMaturityIdx: number;
  filterCallPositive: boolean;
  filterBoxPositive: boolean;
  filterPutPositive: boolean;
  strategyLegs: StrategyLeg[];
  theme: 'dark' | 'light';
  isPollingActive: boolean;
  isOptionsGridCollapsed: boolean;
  marketAssets: MarketAsset[];
  earnings: EarningItem[];
  positionData: NPositionData | null;
  lastUpdate: string;
}

