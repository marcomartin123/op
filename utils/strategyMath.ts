import { LegInstrument, OptionType, PayoffData, Side, StrategyLeg, StrategyStats } from '../types';

const DEFAULT_CONTRACT_SIZE = 100;
const PAYOFF_RANGE_PCT = 40;
const PAYOFF_POINTS = 320;

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
  if (legs.length === 0 || !Number.isFinite(currentPrice) || currentPrice <= 0) return [];

  const startPct = -PAYOFF_RANGE_PCT;
  const endPct = PAYOFF_RANGE_PCT;
  const span = endPct - startPct;
  const step = span / PAYOFF_POINTS;

  const data: PayoffData[] = [];
  for (let i = 0; i <= PAYOFF_POINTS; i++) {
    const movePct = startPct + step * i;
    const price = currentPrice * (1 + movePct / 100);
    let totalProfit = 0;
    for (const leg of legs) {
      totalProfit += calculateLegPayoff(leg, price);
    }
    data.push({ movePct: Number(movePct.toFixed(4)), profit: Number(totalProfit.toFixed(4)) });
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
  const breakEvenKeys = new Set<string>();
  for (let i = 0; i < payoffData.length - 1; i++) {
    const left = payoffData[i];
    const right = payoffData[i + 1];
    if ((left.profit <= 0 && right.profit > 0) || (left.profit >= 0 && right.profit < 0)) {
      const delta = right.profit - left.profit;
      const t = delta !== 0 ? (0 - left.profit) / delta : 0;
      const movePct = left.movePct + t * (right.movePct - left.movePct);
      const rounded = Number(movePct.toFixed(4));
      const key = rounded.toFixed(4);
      if (!breakEvenKeys.has(key)) {
        breakEvenKeys.add(key);
        breakEvens.push(rounded);
      }
    }
  }
  breakEvens.sort((a, b) => a - b);

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
