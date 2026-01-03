import { Side, StrategyLeg } from '../types';
import { HistoryPoint } from '../services/api';
import { calculateLegPayoff } from './strategyMath';

const DEFAULT_CONTRACT_SIZE = 100;
const WEEKLY_PERIODS_PER_MONTH = 4.33;

export interface PayoffCurve {
  basePrice: number;
  variations: number[];
  returns: number[];
}

export type BacktestFrequency = 'WEEKLY' | 'MONTHLY';

export interface BacktestRow {
  time: Date;
  assetReturn: number;
  strategyReturn: number;
  profit: number;
  withdrawal: number;
  investment: number;
  capital: number;
  lossEvent: boolean;
}

export interface BacktestMetrics {
  initialCapital: number;
  finalCapitalNoWithdrawal: number;
  finalCapitalWithWithdrawal: number;
  totalProfitPct: number;
  avgMonthlyProfit: number;
  monthlyEquivalentRate: number;
  profitWithWithdrawalPct: number;
  monthlyRateWithWithdrawal: number;
  monthlyIrr: number;
  wins: number;
  losses: number;
}

export interface BacktestResult {
  rows: BacktestRow[];
  chart: {
    points: Array<{
      time: number;
      assetReturn: number;
      strategyReturn: number;
      size: number;
    }>;
    equity: Array<{
      time: number;
      capitalWith: number;
      capitalWithout: number;
    }>;
  };
  metrics: BacktestMetrics;
}

export const calculateStrategyCost = (legs: StrategyLeg[]) => {
  return legs.reduce((acc, leg) => {
    const multiplier = leg.contractSize || DEFAULT_CONTRACT_SIZE;
    const legPremium = leg.premium * leg.quantity * multiplier;
    return acc + (leg.side === Side.SELL ? legPremium : -legPremium);
  }, 0);
};

export const buildPayoffCurve = (
  legs: StrategyLeg[],
  basePrice: number,
  rangePct: number = 0.3,
  points: number = 250
): PayoffCurve => {
  if (!legs.length || !Number.isFinite(basePrice) || basePrice <= 0) {
    return { basePrice, variations: [], returns: [] };
  }

  const variations: number[] = [];
  const returns: number[] = [];
  const step = (rangePct * 2) / Math.max(1, points - 1);

  for (let i = 0; i < points; i += 1) {
    const variation = -rangePct + step * i;
    const price = basePrice * (1 + variation);
    let profit = 0;
    for (const leg of legs) {
      profit += calculateLegPayoff(leg, price);
    }
    variations.push(Number(variation.toFixed(6)));
    returns.push(Number(profit.toFixed(4)));
  }

  return { basePrice, variations, returns };
};

export const deriveBaseCapital = (strategyCost: number, payoffReturns: number[]) => {
  const costAbs = Math.abs(strategyCost);
  if (!payoffReturns.length) return costAbs;

  const minPayoff = Math.min(...payoffReturns);
  if (strategyCost > 0) {
    const risk = Math.abs(Math.min(0, minPayoff));
    return risk > 0 ? risk : costAbs;
  }

  if (costAbs > 0) return costAbs;
  return Math.abs(minPayoff);
};

const linearInterpolate = (x: number, xs: number[], ys: number[]) => {
  if (!xs.length || xs.length !== ys.length) return 0;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];

  let left = 0;
  let right = xs.length - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (xs[mid] === x) return ys[mid];
    if (xs[mid] < x) left = mid + 1;
    else right = mid - 1;
  }

  const idx = Math.max(0, right);
  const x0 = xs[idx];
  const x1 = xs[idx + 1];
  const y0 = ys[idx];
  const y1 = ys[idx + 1];

  if (x1 === x0) return y0;
  const t = (x - x0) / (x1 - x0);
  return y0 + t * (y1 - y0);
};

const calculateIrr = (cashFlows: number[]) => {
  if (cashFlows.length < 2) return null;

  const npv = (rate: number) => {
    if (rate <= -0.999999) return Number.POSITIVE_INFINITY;
    return cashFlows.reduce((acc, cf, idx) => acc + cf / Math.pow(1 + rate, idx), 0);
  };

  let rate = 0.1;
  for (let i = 0; i < 60; i += 1) {
    let npvVal = 0;
    let dNpv = 0;
    for (let t = 0; t < cashFlows.length; t += 1) {
      const denom = Math.pow(1 + rate, t);
      npvVal += cashFlows[t] / denom;
      if (t > 0) {
        dNpv -= (t * cashFlows[t]) / (denom * (1 + rate));
      }
    }

    if (Math.abs(npvVal) < 1e-7) return rate;
    if (!Number.isFinite(dNpv) || dNpv === 0) break;

    const next = rate - npvVal / dNpv;
    if (!Number.isFinite(next) || next <= -0.999) break;
    rate = next;
  }

  let low = -0.999;
  let high = 10;
  let npvLow = npv(low);
  let npvHigh = npv(high);

  if (!Number.isFinite(npvLow) || !Number.isFinite(npvHigh) || npvLow * npvHigh > 0) {
    return null;
  }

  for (let i = 0; i < 120; i += 1) {
    const mid = (low + high) / 2;
    const npvMid = npv(mid);
    if (Math.abs(npvMid) < 1e-7) return mid;
    if (npvLow * npvMid < 0) {
      high = mid;
      npvHigh = npvMid;
    } else {
      low = mid;
      npvLow = npvMid;
    }
  }

  return (low + high) / 2;
};

const periodsPerMonth = (frequency: BacktestFrequency) => {
  return frequency === 'WEEKLY' ? WEEKLY_PERIODS_PER_MONTH : 1;
};

export interface BacktestInput {
  history: HistoryPoint[];
  payoff: PayoffCurve;
  baseCapital: number;
  monthlyWithdrawal: number;
  monthlyInvestment?: number;
  applyLosses: boolean;
  frequency: BacktestFrequency;
}

export const runBacktest = ({
  history,
  payoff,
  baseCapital,
  monthlyWithdrawal,
  monthlyInvestment = 0,
  applyLosses,
  frequency
}: BacktestInput): BacktestResult => {
  const safeCapital = baseCapital > 0 ? baseCapital : 0;

  const emptyMetrics: BacktestMetrics = {
    initialCapital: safeCapital,
    finalCapitalNoWithdrawal: safeCapital,
    finalCapitalWithWithdrawal: safeCapital,
    totalProfitPct: 0,
    avgMonthlyProfit: 0,
    monthlyEquivalentRate: 0,
    profitWithWithdrawalPct: 0,
    monthlyRateWithWithdrawal: 0,
    monthlyIrr: 0,
    wins: 0,
    losses: 0
  };

  if (!history.length || !payoff.variations.length || safeCapital <= 0) {
    return {
      rows: [],
      chart: { points: [], equity: [] },
      metrics: emptyMetrics
    };
  }

  const rows: BacktestRow[] = [];
  const chartPoints: BacktestResult['chart']['points'] = [];
  const equityPoints: BacktestResult['chart']['equity'] = [];

  let capitalWith = safeCapital;
  let capitalWithout = safeCapital;
  let firstPeriod = true;

  let lossBaseYear: number | null = null;
  let lossBaseMonth: number | null = null;
  const lossMonths = new Set<number>();

  const periodWithdrawal = frequency === 'WEEKLY'
    ? monthlyWithdrawal / WEEKLY_PERIODS_PER_MONTH
    : monthlyWithdrawal;

  const periodInvestment = frequency === 'WEEKLY'
    ? monthlyInvestment / WEEKLY_PERIODS_PER_MONTH
    : monthlyInvestment;

  let wins = 0;
  let losses = 0;

  history.forEach((point) => {
    const date = point.time;
    const assetReturn = point.returnPct;

    if (applyLosses && lossBaseYear === null) {
      lossBaseYear = date.getFullYear();
      lossBaseMonth = date.getMonth() + 1;
    }

    if (assetReturn === null || !Number.isFinite(assetReturn)) {
      if (firstPeriod) {
        rows.push({
          time: date,
          assetReturn: 0,
          strategyReturn: 0,
          profit: 0,
          withdrawal: 0,
          investment: 0,
          capital: capitalWith,
          lossEvent: false
        });
        chartPoints.push({
          time: date.getTime(),
          assetReturn: 0,
          strategyReturn: 0,
          size: 4
        });
        equityPoints.push({
          time: date.getTime(),
          capitalWith,
          capitalWithout
        });
        firstPeriod = false;
      }
      return;
    }

    const strategyReturnBrl = linearInterpolate(assetReturn, payoff.variations, payoff.returns);
    const strategyReturnPct = safeCapital > 0 ? strategyReturnBrl / safeCapital : 0;

    const prevWithout = capitalWithout;
    const prevWith = capitalWith;

    capitalWithout = prevWithout * (1 + strategyReturnPct);
    capitalWith = prevWith * (1 + strategyReturnPct);

    let lossPct = 0;
    let lossEvent = false;
    if (applyLosses && lossBaseYear !== null && lossBaseMonth !== null) {
      const monthsElapsed = (date.getFullYear() - lossBaseYear) * 12 + (date.getMonth() + 1 - lossBaseMonth) + 1;
      if (monthsElapsed > 0 && !lossMonths.has(monthsElapsed)) {
        if (monthsElapsed % 6 === 0) lossPct += 0.02;
        if (monthsElapsed % 10 === 0) lossPct += 0.09;
        if (lossPct > 0) {
          lossPct = Math.min(lossPct, 0.99);
          lossMonths.add(monthsElapsed);
          lossEvent = true;
        }
      }
    }

    if (lossPct > 0) {
      capitalWithout *= 1 - lossPct;
      capitalWith *= 1 - lossPct;
    }

    const profitWithout = capitalWithout - prevWithout;
    const profitWith = capitalWith - prevWith;

    capitalWith = capitalWith - periodWithdrawal + periodInvestment;

    const effectiveReturn = prevWithout !== 0 ? profitWithout / prevWithout : 0;

    if (effectiveReturn > 0) wins += 1;
    if (effectiveReturn < 0) losses += 1;

    rows.push({
      time: date,
      assetReturn,
      strategyReturn: effectiveReturn,
      profit: profitWithout,
      withdrawal: periodWithdrawal,
      investment: periodInvestment,
      capital: capitalWith,
      lossEvent
    });

    const bubbleSize = Math.min(16, 4 + Math.abs(effectiveReturn * 100) * 0.6);
    chartPoints.push({
      time: date.getTime(),
      assetReturn,
      strategyReturn: effectiveReturn,
      size: bubbleSize
    });

    equityPoints.push({
      time: date.getTime(),
      capitalWith,
      capitalWithout
    });

    firstPeriod = false;
  });

  const finalCapitalNoWithdrawal = equityPoints.length
    ? equityPoints[equityPoints.length - 1].capitalWithout
    : safeCapital;
  const finalCapitalWithWithdrawal = equityPoints.length
    ? equityPoints[equityPoints.length - 1].capitalWith
    : safeCapital;

  const totalProfit = finalCapitalNoWithdrawal - safeCapital;
  const totalProfitPct = safeCapital > 0 ? (totalProfit / safeCapital) * 100 : 0;

  const numPeriods = Math.max(0, rows.length - 1);
  let numMonths = 0;
  if (rows.length > 1) {
    const start = rows[0].time.getTime();
    const end = rows[rows.length - 1].time.getTime();
    const daysDiff = (end - start) / (1000 * 60 * 60 * 24);
    numMonths = daysDiff / 30.44;
  }

  const avgMonthlyProfit = numMonths > 0 ? totalProfit / numMonths : 0;

  let monthlyEquivalentRate = 0;
  if (numPeriods > 0 && safeCapital > 0 && finalCapitalNoWithdrawal > 0) {
    const ratePerPeriod = Math.pow(finalCapitalNoWithdrawal / safeCapital, 1 / numPeriods) - 1;
    if (frequency === 'MONTHLY') {
      monthlyEquivalentRate = ratePerPeriod * 100;
    } else {
      monthlyEquivalentRate = (Math.pow(1 + ratePerPeriod, periodsPerMonth(frequency)) - 1) * 100;
    }
  }

  const profitWithWithdrawal = finalCapitalWithWithdrawal - safeCapital;
  const profitWithWithdrawalPct = safeCapital > 0 ? (profitWithWithdrawal / safeCapital) * 100 : 0;

  let monthlyRateWithWithdrawal = 0;
  if (numPeriods > 0 && safeCapital > 0 && finalCapitalWithWithdrawal > 0) {
    const ratePerPeriod = Math.pow(finalCapitalWithWithdrawal / safeCapital, 1 / numPeriods) - 1;
    if (frequency === 'MONTHLY') {
      monthlyRateWithWithdrawal = ratePerPeriod * 100;
    } else {
      monthlyRateWithWithdrawal = (Math.pow(1 + ratePerPeriod, periodsPerMonth(frequency)) - 1) * 100;
    }
  }

  let monthlyIrr = 0;
  if (numPeriods > 0 && safeCapital > 0) {
    const netMonthlyFlow = monthlyWithdrawal - monthlyInvestment;

    if (frequency === 'MONTHLY') {
      const cashFlows = [-safeCapital, ...Array(numPeriods).fill(netMonthlyFlow)];
      cashFlows[cashFlows.length - 1] += finalCapitalWithWithdrawal;
      const irr = calculateIrr(cashFlows);
      monthlyIrr = irr === null ? 0 : irr * 100;
    } else {
      const perMonth = periodsPerMonth(frequency);
      const cashFlows = [-safeCapital];
      for (let i = 0; i < numPeriods; i += 1) {
        const shouldExchange = ((i + 1) % perMonth) < 1;
        cashFlows.push(shouldExchange ? netMonthlyFlow : 0);
      }
      cashFlows[cashFlows.length - 1] += finalCapitalWithWithdrawal;
      const irr = calculateIrr(cashFlows);
      monthlyIrr = irr === null ? 0 : (Math.pow(1 + irr, perMonth) - 1) * 100;
    }
  }

  return {
    rows,
    chart: {
      points: chartPoints,
      equity: equityPoints
    },
    metrics: {
      initialCapital: safeCapital,
      finalCapitalNoWithdrawal,
      finalCapitalWithWithdrawal,
      totalProfitPct,
      avgMonthlyProfit,
      monthlyEquivalentRate,
      profitWithWithdrawalPct,
      monthlyRateWithWithdrawal,
      monthlyIrr,
      wins,
      losses
    }
  };
};
