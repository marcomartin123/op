import React, { useMemo } from 'react';
import { LegInstrument, OptionType, Side, StrategyLeg, StrikePair } from '../types';
import { calculateStrategyStats, generatePayoffData } from '../utils/strategyMath';
import PayoffChart from './PayoffChart';
import { formatCurrency, formatNumber } from '../services/api';

interface Props {
  legs: StrategyLeg[];
  currentPrice: number;
  daysToMaturity: number;
  strikePairs: StrikePair[];
  theme: 'dark' | 'light';
  assetSymbol: string;
  assetBid: number;
  assetAsk: number;
  onAddUnderlying: (side: Side) => void;
  onRemoveLeg: (id: string) => void;
  onUpdateLeg: (id: string, updates: Partial<StrategyLeg>) => void;
  onClearLegs: () => void;
  onOpenBacktest: () => void;
}

const StrategySimulator: React.FC<Props> = ({
  legs,
  currentPrice,
  daysToMaturity,
  strikePairs,
  theme,
  assetSymbol,
  assetBid,
  assetAsk,
  onAddUnderlying,
  onRemoveLeg,
  onUpdateLeg,
  onClearLegs,
  onOpenBacktest
}) => {
  const payoffData = useMemo(() => generatePayoffData(legs, currentPrice), [legs, currentPrice]);
  const stats = useMemo(
    () => calculateStrategyStats(legs, payoffData, currentPrice),
    [legs, payoffData, currentPrice]
  );

  const strikePairMap = useMemo(() => {
    const map = new Map<number, StrikePair>();
    strikePairs.forEach((pair) => {
      map.set(pair.strike, pair);
    });
    return map;
  }, [strikePairs]);

  const percentBase =
    stats.capitalAtRisk && stats.capitalAtRisk > 0
      ? stats.capitalAtRisk
      : Math.abs(stats.netPremium) > 0
      ? Math.abs(stats.netPremium)
      : 1;

  const formatSignedCurrency = (val: number) => `${val >= 0 ? '+' : ''}${formatCurrency(val)}`;
  const formatSignedPercent = (val: number) => `${val >= 0 ? '+' : ''}${formatNumber(val, 2)}%`;

  const netIsCredit = stats.netPremium >= 0;
  const netLabel = netIsCredit ? 'Credito Liquido' : 'Debito Liquido';
  const netValue = formatCurrency(Math.abs(stats.netPremium));

  const maxProfitValue = stats.maxProfit === 'Unlimited' ? 'Ilimitado' : formatCurrency(stats.maxProfit);
  const maxLossValue = stats.maxLoss === 'Unlimited' ? 'Ilimitado' : formatCurrency(stats.maxLoss);

  const profitPctValue = stats.maxProfitPct !== null ? formatSignedPercent(stats.maxProfitPct) : '--';
  const lossPctValue = stats.maxLossPct !== null ? formatSignedPercent(stats.maxLossPct) : '--';
  const spotValue = formatSignedCurrency(stats.spotPnl);


  const canBuyAsset = assetAsk > 0;
  const canSellAsset = assetBid > 0;

  const assetButtonClass = (isBuy: boolean, disabled: boolean) => {
    const base = "w-4 h-4 rounded text-[8px] font-black uppercase border transition-all flex items-center justify-center";
    const tone = isBuy
      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white"
      : "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500 hover:text-white";
    const disabledClass = disabled ? "opacity-40 cursor-not-allowed pointer-events-none" : "";
    return `${base} ${tone} ${disabledClass}`;
  };

  return (
    <section className="w-full bg-white dark:bg-[#121214]/40 border border-zinc-200 dark:border-zinc-800/40 rounded-2xl shadow-2xl backdrop-blur-md p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-black uppercase tracking-widest text-zinc-800 dark:text-zinc-100">
            Simulador Profissional
          </h2>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-500 font-black uppercase tracking-widest">
            Clique em C/V na grade para montar a estrategia
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800/60 bg-zinc-50/70 dark:bg-black/30">
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Ativo</span>
            <span className="text-[10px] font-black mono text-zinc-700 dark:text-zinc-100">{assetSymbol}</span>
            <span className="text-[9px] mono text-zinc-400">BID {formatNumber(assetBid, 2)} / ASK {formatNumber(assetAsk, 2)}</span>
            <button
              onClick={() => onAddUnderlying(Side.BUY)}
              className={assetButtonClass(true, !canBuyAsset)}
              disabled={!canBuyAsset}
              title="Comprar Ativo"
            >
              C
            </button>
            <button
              onClick={() => onAddUnderlying(Side.SELL)}
              className={assetButtonClass(false, !canSellAsset)}
              disabled={!canSellAsset}
              title="Vender Ativo"
            >
              V
            </button>
          </div>
          <button
            onClick={onClearLegs}
            className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border border-rose-500/30 text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500 hover:text-white transition-all"
          >
            Limpar
          </button>
          <button
            onClick={onOpenBacktest}
            disabled={legs.length === 0}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${legs.length === 0
              ? 'border-zinc-200 dark:border-zinc-800 text-zinc-400 cursor-not-allowed'
              : 'border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500 hover:text-white'}`}
          >
            Backtest
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800/50 bg-zinc-50/60 dark:bg-black/30">
          <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Custo (Premio Liquido)</div>
          <div className={`mt-1 text-sm font-black mono ${netIsCredit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {netLabel}: {netValue}
          </div>
        </div>

        <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800/50 bg-zinc-50/60 dark:bg-black/30">
          <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Ganho Maximo</div>
          <div className="mt-1 text-sm font-black mono text-emerald-600 dark:text-emerald-400">
            {maxProfitValue}
          </div>
        </div>

        <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800/50 bg-zinc-50/60 dark:bg-black/30">
          <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Perda Maxima</div>
          <div className="mt-1 text-sm font-black mono text-rose-600 dark:text-rose-400">
            {maxLossValue}
          </div>
        </div>

        <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800/50 bg-zinc-50/60 dark:bg-black/30">
          <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Break-even (%)</div>
          <div className="mt-2 flex flex-wrap gap-1">
            {stats.breakEvens.length > 0 ? (
              stats.breakEvens.map(be => (
                <span key={be} className="px-2 py-0.5 rounded-full text-[10px] mono border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 bg-white/80 dark:bg-zinc-900/40">
                  {formatSignedPercent(be)}
                </span>
              ))
            ) : (
              <span className="text-xs text-zinc-400">--</span>
            )}
          </div>
        </div>

        <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800/50 bg-zinc-50/60 dark:bg-black/30">
          <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Lucro Max (%)</div>
          <div className={`mt-1 text-sm font-black mono ${stats.maxProfitPct !== null && stats.maxProfitPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}`}>
            {profitPctValue}
          </div>
        </div>

        <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800/50 bg-zinc-50/60 dark:bg-black/30">
          <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Prejuizo Max (%)</div>
          <div className={`mt-1 text-sm font-black mono ${stats.maxLossPct !== null && stats.maxLossPct < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-400'}`}>
            {lossPctValue}
          </div>
        </div>

        <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800/50 bg-zinc-50/60 dark:bg-black/30">
          <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Tempo ate Vencimento</div>
          <div className="mt-1 text-sm font-black mono text-indigo-600 dark:text-indigo-400">
            {daysToMaturity > 0 ? `${daysToMaturity} dias` : '--'}
          </div>
        </div>

        <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800/50 bg-zinc-50/60 dark:bg-black/30">
          <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400">P/L no Spot</div>
          <div className={`mt-1 text-sm font-black mono ${stats.spotPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {spotValue}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
        <div className="lg:col-span-4">
          <div className="bg-white dark:bg-[#0c0c0e]/60 border border-zinc-200 dark:border-zinc-800/60 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Legs</span>
              <span className="text-[9px] font-black uppercase text-zinc-500">{legs.length} itens</span>
            </div>

            {legs.length === 0 ? (
              <div className="border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl p-6 text-center text-zinc-400 text-[11px]">
                Nenhuma perna adicionada ainda.
              </div>
            ) : (
              <div className="space-y-3">
                {legs.map(leg => {
                  const isUnderlying = leg.instrument === LegInstrument.UNDERLYING;
                  const optionType = leg.type ?? OptionType.CALL;
                  const selectedStrike = typeof leg.strike === 'number' ? leg.strike : null;
                  const hasStrike = selectedStrike !== null && strikePairMap.has(selectedStrike);
                  const sideLabel = leg.side === Side.BUY ? 'Compra' : 'Venda';
                  const typeLabel = isUnderlying
                    ? 'Ativo'
                    : optionType === OptionType.CALL
                    ? 'Call'
                    : 'Put';
                  const detailLabel = isUnderlying
                    ? `Entrada ${formatNumber(leg.premium, 2)}`
                    : `Strike ${formatNumber(leg.strike ?? 0, 2)}`;
                  const priceLabel = isUnderlying ? 'Entrada' : 'Premio';
                  const sideClass = leg.side === Side.BUY ? 'text-emerald-500' : 'text-rose-500';
                  const stripeClass = leg.side === Side.BUY ? 'bg-emerald-500' : 'bg-rose-500';
                  const cashFlow = (leg.side === Side.SELL ? 1 : -1) * leg.premium * leg.quantity * leg.contractSize;

                  return (
                    <div key={leg.id} className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800/60 bg-zinc-50/60 dark:bg-black/30">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className={`w-1.5 h-10 rounded-full ${stripeClass}`} />
                          <div>
                            <div className={`text-[11px] font-black uppercase tracking-widest ${sideClass}`}>
                              {sideLabel} {typeLabel}
                            </div>
                            <div className="text-[10px] mono text-zinc-500">
                              {leg.symbol} - {detailLabel}
                            </div>
                            <div className={`text-[10px] mono mt-1 ${cashFlow >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              Fluxo: {formatSignedCurrency(cashFlow)}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => onRemoveLeg(leg.id)}
                          className="w-7 h-7 rounded-full border border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:text-rose-500 hover:border-rose-500/50 transition-all"
                          title="Remover"
                        >
                          X
                        </button>
                      </div>

                      <div className={`mt-3 grid ${isUnderlying ? 'grid-cols-2' : 'grid-cols-3'} gap-2`}>
                        {!isUnderlying && (
                          <label className="flex flex-col gap-1 text-[9px] font-black uppercase tracking-widest text-zinc-400">
                            Strike
                            <select
                              value={selectedStrike ?? ''}
                              onChange={(e) => {
                                const nextStrike = parseFloat(e.target.value);
                                if (!Number.isFinite(nextStrike)) return;
                                const pair = strikePairMap.get(nextStrike);
                                if (!pair) return;
                                const option = optionType === OptionType.CALL ? pair.call : pair.put;
                                const basePremium = leg.side === Side.BUY ? option.ask : option.bid;
                                const premium = basePremium || option.close || option.bs?.premium || 0;
                                const contractSize = option.contract_size && option.contract_size > 0 ? option.contract_size : leg.contractSize;
                                onUpdateLeg(leg.id, {
                                  strike: option.strike,
                                  symbol: option.symbol,
                                  premium,
                                  contractSize
                                });
                              }}
                              className="w-full bg-white dark:bg-black/40 border border-zinc-200 dark:border-zinc-800/60 rounded-lg px-2 py-1 text-[11px] mono text-zinc-800 dark:text-zinc-100 outline-none"
                            >
                              {!hasStrike && selectedStrike !== null && (
                                <option value={selectedStrike}>Atual (fora do filtro)</option>
                              )}
                              {strikePairs.map((pair) => {
                                const option = optionType === OptionType.CALL ? pair.call : pair.put;
                                const canTrade = leg.side === Side.BUY ? option.ask > 0 : option.bid > 0;
                                const isCurrent = selectedStrike !== null && pair.strike === selectedStrike;
                                return (
                                  <option key={pair.strike} value={pair.strike} disabled={!canTrade && !isCurrent}>
                                    {formatNumber(pair.strike, 2)}
                                  </option>
                                );
                              })}
                            </select>
                          </label>
                        )}
                        <label className="flex flex-col gap-1 text-[9px] font-black uppercase tracking-widest text-zinc-400">
                          {priceLabel}
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={leg.premium}
                            onChange={(e) => {
                              const next = parseFloat(e.target.value);
                              onUpdateLeg(leg.id, { premium: Number.isFinite(next) ? next : 0 });
                            }}
                            className="w-full bg-white dark:bg-black/40 border border-zinc-200 dark:border-zinc-800/60 rounded-lg px-2 py-1 text-[11px] mono text-zinc-800 dark:text-zinc-100 outline-none"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-[9px] font-black uppercase tracking-widest text-zinc-400">
                          Qtd
                          <input
                            type="number"
                            min="1"
                            value={leg.quantity}
                            onChange={(e) => {
                              const next = parseInt(e.target.value, 10);
                              onUpdateLeg(leg.id, { quantity: Number.isFinite(next) && next > 0 ? next : 1 });
                            }}
                            className="w-full bg-white dark:bg-black/40 border border-zinc-200 dark:border-zinc-800/60 rounded-lg px-2 py-1 text-[11px] mono text-zinc-800 dark:text-zinc-100 outline-none"
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-8">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-[12px] font-black uppercase tracking-widest text-zinc-500">Payoff</h3>
              <p className="text-[10px] text-zinc-500">Visualizacao no vencimento</p>
            </div>
          </div>

          {legs.length > 0 && payoffData.length > 0 ? (
            <PayoffChart
              data={payoffData}
              currentPrice={currentPrice}
              theme={theme}
              percentBase={percentBase}
              breakEvens={stats.breakEvens}
            />
          ) : (
            <div className="h-[360px] flex flex-col items-center justify-center text-zinc-400 gap-2 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
              <span className="text-[12px] font-black uppercase tracking-widest">Adicione pernas para visualizar o payoff</span>
              <span className="text-[10px] text-zinc-500">Use os botoes C e V na grade</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default StrategySimulator;
