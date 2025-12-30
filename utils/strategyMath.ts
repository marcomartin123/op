import { LegInstrument, OptionType, PayoffData, Side, StrategyLeg, StrategyStats } from '../types';

const DEFAULT_CONTRACT_SIZE = 100;

export const calculateLegPayoff = (leg: StrategyLeg, underlyingPrice: number): number => {
  const { instrument, type, side, strike, premium, quantity, contractSize } = leg;
  const multiplier = contractSize || DEFAULT_CONTRACT_SIZE;

  if (instrument === LegInstrument.UNDERLYING) {
    const move = underlyingPrice - premium;
    const pnl = side === Side.BUY ? move : -move;
    return pnl * quantity * multiplier;
  }

  if (!type || strike === undefined) return 0;

  let pnl = 0;
  if (type === OptionType.CALL) {
    pnl = Math.max(0, underlyingPrice - strike) - premium;
  } else {
    pnl = Math.max(0, strike - underlyingPrice) - premium;
  }

  if (side === Side.SELL) {
    pnl = -pnl;
  }

  return pnl * quantity * multiplier;
};

export const generatePayoffData = (legs: StrategyLeg[], currentPrice: number): PayoffData[] => {
  if (legs.length === 0) return [];

  const optionStrikes = legs
    .filter(leg => leg.instrument === LegInstrument.OPTION)
    .map(leg => leg.strike)
    .filter((val): val is number => typeof val === 'number' && Number.isFinite(val));

  const underlyingEntries = legs
    .filter(leg => leg.instrument === LegInstrument.UNDERLYING)
    .map(leg => leg.premium)
    .filter(val => Number.isFinite(val));

  const referencePoints = [currentPrice, ...optionStrikes, ...underlyingEntries]
    .filter(val => Number.isFinite(val) && val > 0);

  if (referencePoints.length === 0) return [];

  const minStrike = Math.min(...referencePoints);
  const maxStrike = Math.max(...referencePoints);

  const range = maxStrike - minStrike;
  const buffer = range * 0.5 || maxStrike * 0.2 || 1;
  const start = Math.max(0, minStrike - buffer);
  const end = maxStrike + buffer;
  const points = 320;
  const span = end - start;
  const step = span / points;

  const data: PayoffData[] = [];
  for (let i = 0; i <= points; i++) {
    const p = start + step * i;
    let totalProfit = 0;
    for (const leg of legs) {
      totalProfit += calculateLegPayoff(leg, p);
    }
    data.push({ price: Number(p.toFixed(4)), profit: Number(totalProfit.toFixed(4)) });
  }

  return data;
};

export const calculateStrategyStats = (
  legs: StrategyLeg[],
  payoffData: PayoffData[],
  currentPrice: number
): StrategyStats => {
  if (payoffData.length === 0) {
    return {
      maxProfit: 0,
      maxLoss: 0,
      breakEvens: [],
      netPremium: 0,
      capitalAtRisk: null,
      maxProfitPct: null,
      maxLossPct: null,
      spotPnl: 0
    };
  }

  const profits = payoffData.map(d => d.profit);
  const minProfit = Math.min(...profits);
  const maxProfitVal = Math.max(...profits);
  const last = profits[profits.length - 1];
  const prev = profits[profits.length - 2] ?? last;
  const first = profits[0];
  const second = profits[1] ?? first;

  const leftSlope = second - first;
  const rightSlope = last - prev;

  const isMaxProfitUnlimited = rightSlope > 0 && last > 10000;
  const isMaxLossUnlimited = (leftSlope > 0 && first < -10000) || (rightSlope < 0 && last < -10000);

  const breakEvens: number[] = [];
  for (let i = 0; i < payoffData.length - 1; i++) {
    const a = payoffData[i].profit;
    const b = payoffData[i + 1].profit;
    if ((a <= 0 && b > 0) || (a >= 0 && b < 0)) {
      breakEvens.push(payoffData[i].price);
    }
  }

  const netPremium = legs.reduce((acc, leg) => {
    const multiplier = leg.contractSize || DEFAULT_CONTRACT_SIZE;
    const legPremium = leg.premium * leg.quantity * multiplier;
    return acc + (leg.side === Side.SELL ? legPremium : -legPremium);
  }, 0);

  const spotPnl = legs.reduce((acc, leg) => acc + calculateLegPayoff(leg, currentPrice), 0);

  const maxProfit = isMaxProfitUnlimited ? 'Unlimited' : maxProfitVal;
  const maxLoss = isMaxLossUnlimited ? 'Unlimited' : Math.abs(minProfit);

  const capitalAtRisk =
    netPremium < 0
      ? Math.abs(netPremium)
      : typeof maxLoss === 'number'
      ? maxLoss
      : null;

  const maxProfitPct =
    typeof maxProfit === 'number' && capitalAtRisk && capitalAtRisk > 0
      ? (maxProfit / capitalAtRisk) * 100
      : null;

  const maxLossPct =
    typeof maxLoss === 'number' && capitalAtRisk && capitalAtRisk > 0
      ? (-maxLoss / capitalAtRisk) * 100
      : null;

  return {
    maxProfit,
    maxLoss,
    breakEvens,
    netPremium,
    capitalAtRisk,
    maxProfitPct,
    maxLossPct,
    spotPnl
  };
};
