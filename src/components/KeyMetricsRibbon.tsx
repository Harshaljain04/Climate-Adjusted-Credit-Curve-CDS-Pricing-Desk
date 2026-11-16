import React from 'react';
import { TrendingUp, ShieldAlert, DollarSign, Flame, HelpCircle, AlertOctagon } from 'lucide-react';
import { IssuerProfile } from '../data/issuers';
import {
  MertonResult,
  ClimateOutput,
  HazardCurve,
  MonteCarloResult,
  computeCdsLegs,
  computeCs01,
} from '../lib/creditEngine';

interface KeyMetricsRibbonProps {
  issuer: IssuerProfile;
  merton: MertonResult;
  climate: ClimateOutput;
  baseCurve: HazardCurve;
  mcResult?: MonteCarloResult;
}

export const KeyMetricsRibbon: React.FC<KeyMetricsRibbonProps> = ({
  issuer,
  merton,
  climate,
  baseCurve,
  mcResult,
}) => {
  const base5yBp = issuer.proxySpreadsBp[2];
  const adj5yBp = climate.adjustedSpreadsBp[2];
  const delta5yBp = climate.scaledDeltaSpreadBp;

  const isInsolvent = climate.status === 'insolvent_in_scenario';
  const isUninformative = climate.status === 'uninformative_at_current_leverage';
  const isSevere = climate.status === 'severe';

  // Real RPV01 (years) from computeCdsLegs and real CS01 in EUR per bp (Section 4.3)
  const baseLegs5y = computeCdsLegs(baseCurve, 5.0);
  const cs01EurPerBp = computeCs01(baseCurve, 5.0, 10_000_000);

  const formatMoneyEur = (val: number) => {
    const absVal = Math.abs(val);
    const sign = val > 1e-6 ? '+' : val < -1e-6 ? '-' : '';
    if (absVal >= 1_000_000) return `${sign}€${(absVal / 1_000_000).toFixed(2)}M`;
    if (absVal >= 1_000) return `${sign}€${(absVal / 1_000).toFixed(1)}k`;
    return `${sign}€${absVal.toFixed(0)}`;
  };

  const formatAdaptiveBp = (val: number, withPlus = false) => {
    const sign = withPlus && val >= 0 ? '+' : '';
    if (Math.abs(val) > 0 && Math.abs(val) < 0.05) {
      return `${sign}${val.toFixed(4)}`;
    }
    if (Math.abs(val) > 0 && Math.abs(val) < 1.0) {
      return `${sign}${val.toFixed(2)}`;
    }
    return `${sign}${val.toFixed(1)}`;
  };

  // True sign and colour for MTM (Section 4.3): green for gain (>0), red for loss (<0), grey for zero
  const mtmVal = climate.mtmProtectionImpactEur;
  const mtmColorClass = isInsolvent
    ? 'text-rose-400'
    : mtmVal > 1e-6
    ? 'text-emerald-400'
    : mtmVal < -1e-6
    ? 'text-rose-400'
    : 'text-slate-400';

  return (
    <div className="space-y-3 mb-6">
      {/* Status Banner when insolvent, severe, uninformative, or exceeding empirical range */}
      {(isInsolvent || isSevere || isUninformative || climate.exceedsEmpiricalRange) && (
        <div
          className={`px-4 py-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
            isInsolvent
              ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
              : isSevere
              ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
              : 'bg-slate-900/90 border-amber-500/30 text-slate-200'
          }`}
        >
          <div className="flex items-start gap-2.5 text-xs">
            <AlertOctagon
              className={`w-4 h-4 shrink-0 mt-0.5 ${
                isInsolvent ? 'text-rose-400' : 'text-amber-400'
              }`}
            />
            <div>
              <span className="font-bold uppercase tracking-wider mr-2">
                [{climate.status.replace(/_/g, ' ')}]
              </span>
              <span>{climate.statusExplanation}</span>
              {climate.exceedsEmpiricalRange && (
                <span className="block mt-1 text-amber-300 font-medium">
                  Empirical Plausibility Warning: Simulated 5Y spread shift exceeds the 5–150 bp transition effect range documented in European corporate CDS (Vozian &amp; Costola, Energy Economics 2025). Treat as an extreme tail stress test, not a tradeable quote.
                </span>
              )}
            </div>
          </div>
          <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-slate-950/70 border border-slate-800 shrink-0">
            Haircut: {climate.haircutPctV.toFixed(1)}% of V
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: 5Y Climate-Adjusted Spread & P5-P95 Range (Section 4.5) */}
        <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-4 shadow-lg relative overflow-hidden group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              5Y Climate-Adj Spread
              <span
                title="Point estimate + seeded Monte Carlo P5–P95 range using CreditGrades (2002) first-passage barrier model and logistic tenor weight g(T)"
                className="cursor-help text-slate-500 hover:text-slate-300"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </span>
            </span>
            <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2.5">
            {isInsolvent ? (
              <span className="text-lg font-bold font-mono text-rose-400 tracking-tight">
                n/a (insolvent in scenario)
              </span>
            ) : (
              <>
                <span className="text-2xl font-bold font-mono text-white tracking-tight">
                  {adj5yBp.toFixed(Math.abs(delta5yBp) > 0 && Math.abs(delta5yBp) < 0.05 ? 4 : 1)}{' '}
                  <span className="text-sm font-normal text-slate-400">bp</span>
                </span>
                <span
                  className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded ${
                    delta5yBp > 15
                      ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                      : delta5yBp > 0
                      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                      : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  }`}
                >
                  {formatAdaptiveBp(delta5yBp, true)} bp
                </span>
              </>
            )}
          </div>
          <div className="mt-2 space-y-1 text-[11px] text-slate-400">
            <div className="flex items-center justify-between">
              <span>Rating Proxy 5Y: {base5yBp.toFixed(1)} bp</span>
              <span className="font-mono text-slate-300">
                {isInsolvent
                  ? 'V - Haircut <= D'
                  : `Δ ${base5yBp > 0 ? ((delta5yBp / base5yBp) * 100).toFixed(1) : '0.0'}%`}
              </span>
            </div>
            {mcResult && !isInsolvent && (
              <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[10px] font-mono text-amber-300/90">
                <span>MC P5–P95 Shift:</span>
                <span>
                  [{formatAdaptiveBp(mcResult.p5, true)}, {formatAdaptiveBp(mcResult.p95, true)}] bp
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Metric 2: 5Y Default Probability / Distance to Default */}
        <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-4 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              5Y Implied Default Prob
              <span
                title="Cumulative 5-Year Risk-Neutral Default Probability 1 - Q(5) from bootstrapped hazard curve"
                className="cursor-help text-slate-500 hover:text-slate-300"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </span>
            </span>
            <div className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2.5">
            {isInsolvent ? (
              <span className="text-lg font-bold font-mono text-rose-400 tracking-tight">
                100.0% (Insolvent)
              </span>
            ) : (
              <>
                <span className="text-2xl font-bold font-mono text-white tracking-tight">
                  {((1 - climate.adj5ySurvivalProb) * 100).toFixed(2)}%
                </span>
                <span className="text-xs font-mono text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">
                  +{((climate.base5ySurvivalProb - climate.adj5ySurvivalProb) * 100).toFixed(2)}% PD
                </span>
              </>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
            <span>Merton DD: {merton.distanceToDefault.toFixed(2)} σ</span>
            <span className="font-mono text-slate-300">
              Base PD: {((1 - climate.base5ySurvivalProb) * 100).toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Metric 3: 5Y Protection MTM Impact, Real RPV01 & Real CS01 (Section 4.3) */}
        <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-4 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              5Y Protection MTM (EUR 10m)
              <span
                title="Mark-to-Market gain/loss on a EUR 10,000,000 5Y long-protection CDS position. Real RPV01 (years) and CS01 (EUR/bp) reported separately."
                className="cursor-help text-slate-500 hover:text-slate-300"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </span>
            </span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2.5">
            {isInsolvent ? (
              <span className="text-lg font-bold font-mono text-rose-400 tracking-tight">
                n/a (insolvent in scenario)
              </span>
            ) : (
              <>
                <span className={`text-2xl font-bold font-mono tracking-tight ${mtmColorClass}`}>
                  {formatMoneyEur(mtmVal)}
                </span>
                <span className="text-xs text-slate-400 font-mono">Notional: EUR 10m</span>
              </>
            )}
          </div>
          <div className="mt-2 space-y-1 text-[11px] text-slate-400 font-mono">
            <div className="flex items-center justify-between">
              <span>5Y RPV01 (Risky Annuity):</span>
              <span className="text-slate-200">{baseLegs5y.rpv01.toFixed(4)} yrs</span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
              <span>Real CS01 (EUR / 1bp):</span>
              <span className="text-cyan-400 font-semibold">€{cs01EurPerBp.toFixed(0)} EUR/bp</span>
            </div>
          </div>
        </div>

        {/* Metric 4: Carbon-Price Sensitivity & PV Asset Haircut */}
        <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-4 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              Carbon-Price Sensitivity
              <span
                title="5Y CDS spread change (in bp) per +$10/tCO2 parallel shift in the NGFS carbon price path"
                className="cursor-help text-slate-500 hover:text-slate-300"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </span>
            </span>
            <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2.5">
            {isInsolvent ? (
              <span className="text-lg font-bold font-mono text-rose-400 tracking-tight">
                n/a (insolvent)
              </span>
            ) : (
              <>
                <span className="text-2xl font-bold font-mono text-cyan-400 tracking-tight">
                  {formatAdaptiveBp(climate.carbonPriceSensitivityBp, true)}{' '}
                  <span className="text-sm font-normal text-slate-400">bp</span>
                </span>
                <span className="text-xs text-slate-400 font-mono">per +$10/tCO2</span>
              </>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
            <span>PV Haircut: ${(climate.totalHaircutUsd / 1e9).toFixed(2)}B</span>
            <span
              className={`font-mono font-semibold ${
                climate.haircutPctV >= 50 ? 'text-rose-400' : 'text-amber-400'
              }`}
            >
              -{climate.haircutPctV.toFixed(2)}% of V
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
