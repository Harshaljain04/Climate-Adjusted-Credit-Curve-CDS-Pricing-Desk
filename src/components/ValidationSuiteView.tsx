/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  BarChart3,
  HelpCircle,
  Activity,
  ShieldCheck,
  Flame,
  RefreshCw,
} from 'lucide-react';
import {
  DISTRESS_CASE_STUDIES,
  PRESET_ISSUERS,
  IssuerProfile,
} from '../data/issuers';
import quantlibBenchmark from '../../data/benchmarks/quantlib_2026-11-15.json';
import testResultsRaw from '../../TEST_RESULTS.txt?raw';
import {
  HazardCurve,
  MertonResult,
  ClimateScenarioDef,
  ClimateOverlayParams,
  runTornadoAnalysis,
  runMonteCarloSimulation,
  computeCrossSectionalValidation,
  computeDistressStudySeries,
  MONTE_CARLO_DEFAULT_DRAWS,
  DEFAULT_MC_SEED,
  TornadoItem,
} from '../lib/creditEngine';

interface ValidationSuiteViewProps {
  issuer: IssuerProfile;
  baseCurve: HazardCurve;
  merton: MertonResult;
  scenario: ClimateScenarioDef;
  params: ClimateOverlayParams;
}

export const ValidationSuiteView: React.FC<ValidationSuiteViewProps> = ({
  issuer,
  baseCurve,
  merton,
  scenario,
  params,
}) => {
  const [subTab, setSubTab] = useState<
    'quantlib' | 'regression' | 'distress' | 'tornado' | 'montecarlo' | 'mutation'
  >('quantlib');
  const [selectedDistressIssuer, setSelectedDistressIssuer] = useState<'peabody' | 'pge'>('peabody');
  const [regressionModelType, setRegressionModelType] = useState<'creditGrades' | 'merton'>('creditGrades');

  // Section 3.3: Reproducible PRNG seed state
  const [mcSeed, setMcSeed] = useState<number>(DEFAULT_MC_SEED);
  const [seedInputText, setSeedInputText] = useState<string>(String(DEFAULT_MC_SEED));

  // Section 3.1: Unfloored cross-sectional regression & tie-aware Spearman rank correlation
  const regressionData = useMemo(() => {
    return computeCrossSectionalValidation(PRESET_ISSUERS, regressionModelType);
  }, [regressionModelType]);

  // Also compute the companion model's summary so both CreditGrades and Merton are visible side by side
  const companionRegression = useMemo(() => {
    const other = regressionModelType === 'creditGrades' ? 'merton' : 'creditGrades';
    return computeCrossSectionalValidation(PRESET_ISSUERS, other);
  }, [regressionModelType]);

  // Section 3.2: Compute historical distress DD series dynamically on load (no DD typed in issuers.ts)
  const activeDistress = DISTRESS_CASE_STUDIES.find((d) => d.issuerId === selectedDistressIssuer)!;
  const computedDistress = useMemo(() => {
    return computeDistressStudySeries(activeDistress);
  }, [activeDistress]);

  // Subtab D: Tornado sensitivity analysis
  const tornadoItems: TornadoItem[] = useMemo(() => {
    return runTornadoAnalysis(
      merton,
      baseCurve,
      issuer.proxySpreadsBp,
      issuer.scope1MtCo2,
      issuer.scope2MtCo2,
      scenario,
      params
    );
  }, [merton, baseCurve, issuer, scenario, params]);

  // Section 3.3: Deterministic seeded Monte Carlo simulation
  const mcResult = useMemo(() => {
    return runMonteCarloSimulation(
      merton,
      baseCurve,
      issuer.proxySpreadsBp,
      issuer.scope1MtCo2,
      issuer.scope2MtCo2,
      scenario,
      MONTE_CARLO_DEFAULT_DRAWS,
      mcSeed
    );
  }, [merton, baseCurve, issuer, scenario, mcSeed]);

  const handleNewSeed = () => {
    // Deterministic step to a new 32-bit seed so every click advances reproducibly
    const nextSeed = ((mcSeed * 1664525 + 1013904223) >>> 0) || 1;
    setMcSeed(nextSeed);
    setSeedInputText(String(nextSeed));
  };

  const handleApplySeedInput = () => {
    const parsed = parseInt(seedInputText, 10);
    if (!Number.isNaN(parsed)) {
      setMcSeed(parsed >>> 0);
      setSeedInputText(String(parsed >>> 0));
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Sub-navigation Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0F1626] border border-slate-800 p-2 rounded-xl">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => setSubTab('quantlib')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
              subTab === 'quantlib'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            A. QuantLib Benchmark
          </button>
          <button
            onClick={() => setSubTab('regression')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
              subTab === 'regression'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            B. Cross-Sectional Check
          </button>
          <button
            onClick={() => setSubTab('distress')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
              subTab === 'distress'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            C. Historical Distress Studies
          </button>
          <button
            onClick={() => setSubTab('tornado')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
              subTab === 'tornado'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            D. Tornado Sensitivity
          </button>
          <button
            onClick={() => setSubTab('montecarlo')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
              subTab === 'montecarlo'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            E. Monte Carlo Uncertainty
          </button>
          <button
            onClick={() => setSubTab('mutation')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
              subTab === 'mutation'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            F. Deliberate Bug Audit
          </button>
        </div>

        <span className="text-[11px] text-slate-400 font-mono hidden lg:inline">
          Hardened Validation
        </span>
      </div>

      {/* SUBTAB A: QuantLib Benchmark */}
      {subTab === 'quantlib' && (
        <div className="space-y-6">
          <div className="bg-[#0F1626] border border-slate-800 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Independent Benchmark: Our Piecewise Hazard Engine vs. QuantLib {quantlibBenchmark.quantLibVersion}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Sloped {quantlibBenchmark.inputs.tenorsYears.length}-point curve ({quantlibBenchmark.inputs.spreadsBp.join('/')} bp at {quantlibBenchmark.inputs.tenorsYears.join('/')}Y, r={(quantlibBenchmark.inputs.riskFreeRate * 100).toFixed(1)}%, R={(quantlibBenchmark.inputs.recoveryRate * 100).toFixed(0)}%) · Generated {quantlibBenchmark.generatedAt}
                </p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded bg-amber-950/60 text-amber-300 border border-amber-800/40 font-mono font-semibold">
                Max Gap ({quantlibBenchmark.summary.maxDiffTenorYears}Y): {quantlibBenchmark.summary.maxAbsDiffPctPoints.toFixed(3)} pp ({quantlibBenchmark.summary.maxRelDiffPct.toFixed(3)}% rel)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-medium">
                    <th className="py-2.5 px-3">Tenor</th>
                    <th className="py-2.5 px-3">Spread</th>
                    <th className="py-2.5 px-3">Our Survival Q(t)</th>
                    <th className="py-2.5 px-3">QuantLib Q(t)</th>
                    <th className="py-2.5 px-3">Abs Residual</th>
                    <th className="py-2.5 px-3 text-right">Rel Gap (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {quantlibBenchmark.rows.map((row) => (
                    <tr key={row.tenorYears} className="hover:bg-slate-900/60 transition-colors">
                      <td className="py-2.5 px-3 text-white font-semibold">{row.tenorYears} Years</td>
                      <td className="py-2.5 px-3 text-slate-300">{row.parSpreadBp} bp</td>
                      <td className="py-2.5 px-3 text-cyan-300 tabular-nums">{(row.ourSurvivalProb * 100).toFixed(4)}%</td>
                      <td className="py-2.5 px-3 text-slate-300 tabular-nums">{(row.quantLibSurvivalProb * 100).toFixed(4)}%</td>
                      <td className="py-2.5 px-3 text-amber-300 tabular-nums">{row.absDiff.toFixed(6)}</td>
                      <td className="py-2.5 px-3 text-right text-amber-300 tabular-nums">{row.relDiffPct.toFixed(4)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Convention Attribution Experiment */}
            <div className="mt-5 p-4 rounded-lg bg-slate-900/90 border border-slate-800 text-xs space-y-3">
              <h4 className="font-semibold text-slate-200 flex items-center gap-2">
                <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
                Convention Attribution Experiment (Generated by benchmark_quantlib.py)
              </h4>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                {quantlibBenchmark.conventionExperiment.summary}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] font-mono">
                <div className="p-2.5 bg-slate-950/60 rounded border border-slate-800">
                  <span className="text-slate-400 block font-sans">1. {quantlibBenchmark.conventionExperiment.baselineIsda.label}</span>
                  <span className="text-amber-300 font-bold">
                    Max Δ: {quantlibBenchmark.conventionExperiment.baselineIsda.maxAbsDiff.toFixed(5)} ({quantlibBenchmark.conventionExperiment.baselineIsda.maxRelDiffPct.toFixed(3)}%)
                  </span>
                </div>
                <div className="p-2.5 bg-slate-950/60 rounded border border-slate-800">
                  <span className="text-slate-400 block font-sans">2. {quantlibBenchmark.conventionExperiment.actual365WithImm.label}</span>
                  <span className="text-cyan-300 font-bold">
                    Max Δ: {quantlibBenchmark.conventionExperiment.actual365WithImm.maxAbsDiff.toFixed(5)} ({quantlibBenchmark.conventionExperiment.actual365WithImm.gapReductionPct.toFixed(1)}% drop)
                  </span>
                </div>
                <div className="p-2.5 bg-slate-950/60 rounded border border-slate-800">
                  <span className="text-slate-400 block font-sans">3. {quantlibBenchmark.conventionExperiment.actual365WithoutImm.label}</span>
                  <span className="text-emerald-300 font-bold">
                    Max Δ: {quantlibBenchmark.conventionExperiment.actual365WithoutImm.maxAbsDiff.toFixed(5)} ({quantlibBenchmark.conventionExperiment.actual365WithoutImm.gapReductionPct.toFixed(1)}% drop)
                  </span>
                </div>
              </div>
              <div className="text-[10px] text-slate-400 pt-1">
                Our conventions: {quantlibBenchmark.inputs.ourConventions} · QuantLib baseline: {quantlibBenchmark.inputs.qlConventions}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB B: Cross-Sectional Check (Section 3.1) */}
      {subTab === 'regression' && (
        <div className="space-y-6">
          {/* Exploratory Warning & Exclusion Banner */}
          <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-slate-200 space-y-0.5">
                <div className="font-bold text-amber-300">
                  Exploratory, no statistical inference (N = {regressionData.nTotal} total issuers; N = {regressionData.nIncluded} with positive model spreads)
                </div>
                <p className="text-[11px] text-slate-300">
                  Artificial 1.0 bp flooring (<code className="text-amber-200">Math.max(1, mertonBp)</code>) has been removed.{' '}
                  {regressionData.excludedTickers.length > 0 && (
                    <span>
                      Excluded from log-spread regression due to non-positive model spread (&le; 0 bp under IEEE-754 double precision):{' '}
                      <strong className="text-rose-300 font-mono">{regressionData.excludedTickers.join(', ')}</strong>. All N = {regressionData.nTotal} issuers are included in the Distance-to-Default (DD) rank correlation check.
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Toggle between CreditGrades (2002) and Merton (1974) */}
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 shrink-0">
              <button
                onClick={() => setRegressionModelType('creditGrades')}
                className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
                  regressionModelType === 'creditGrades'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                CreditGrades (2002) 5Y
              </button>
              <button
                onClick={() => setRegressionModelType('merton')}
                className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
                  regressionModelType === 'merton'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Merton (1974) 5Y
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left 7 Columns: Unfloored Log-Log Regression Plot */}
            <div className="lg:col-span-7 bg-[#0F1626] border border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight">
                    Unfloored OLS: ln({regressionModelType === 'creditGrades' ? 'CreditGrades' : 'Merton'} 5Y Spread) ~ ln(Proxy 5Y Spread)
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Zero flooring applied · N = {regressionData.nIncluded} included ({regressionData.excludedTickers.join(', ')} excluded: spread &le; 0 bp)
                  </p>
                </div>
                <span className="text-xs font-mono text-amber-300 px-2 py-0.5 rounded bg-amber-950/50 border border-amber-700/40">
                  Exploratory (N={regressionData.nIncluded}/{regressionData.nTotal})
                </span>
              </div>

              {/* Dynamic Scatter Plot SVG */}
              <div className="w-full bg-[#080D1A] rounded-lg border border-slate-800/80 p-3 select-none font-mono text-xs">
                {(() => {
                  const inc = regressionData.includedPoints;
                  const xVals = inc.map((p) => p.proxyLog);
                  const yVals = inc.map((p) => p.modelLog);
                  const minX = Math.min(...xVals) - 0.15;
                  const maxX = Math.max(...xVals) + 0.15;
                  const minY = Math.min(...yVals) - 1.2;
                  const maxY = Math.max(...yVals) + 1.2;

                  const getX = (x: number) => 65 + ((x - minX) / Math.max(1e-6, maxX - minX)) * 435;
                  const getY = (y: number) => 220 - ((y - minY) / Math.max(1e-6, maxY - minY)) * 190;

                  const lineY1 = regressionData.alpha + regressionData.beta * minX;
                  const lineY2 = regressionData.alpha + regressionData.beta * maxX;

                  return (
                    <svg viewBox="0 0 540 260" className="w-full h-auto">
                      {/* Axes */}
                      <line x1="65" y1="220" x2="510" y2="220" stroke="#334155" strokeWidth="1.5" />
                      <line x1="65" y1="25" x2="65" y2="220" stroke="#334155" strokeWidth="1.5" />
                      <text x="285" y="248" fill="#94A3B8" textAnchor="middle" fontSize="10">
                        ln(Proxy 5Y Spread bp) [{minX.toFixed(1)} to {maxX.toFixed(1)}]
                      </text>
                      <text x="18" y="125" fill="#94A3B8" textAnchor="middle" fontSize="10" transform="rotate(-90 18 125)">
                        ln({regressionModelType === 'creditGrades' ? 'CreditGrades' : 'Merton'} 5Y bp)
                      </text>

                      {/* Horizontal Grid Lines */}
                      {[0.2, 0.5, 0.8].map((frac, idx) => {
                        const yVal = maxY - frac * (maxY - minY);
                        const py = getY(yVal);
                        return (
                          <g key={idx}>
                            <line x1="65" y1={py} x2="510" y2={py} stroke="#1E293B" strokeDasharray="3 3" />
                            <text x="58" y={py + 3} fill="#64748B" textAnchor="end" fontSize="9">
                              {yVal.toFixed(1)}
                            </text>
                          </g>
                        );
                      })}

                      {/* Fitted OLS Regression Line */}
                      <line
                        x1={getX(minX)}
                        y1={Math.max(25, Math.min(220, getY(lineY1)))}
                        x2={getX(maxX)}
                        y2={Math.max(25, Math.min(220, getY(lineY2)))}
                        stroke="#06B6D4"
                        strokeWidth="2"
                        strokeDasharray="4 2"
                      />

                      {/* Data Points */}
                      {inc.map((p) => {
                        const cx = getX(p.proxyLog);
                        const cy = getY(p.modelLog);

                        return (
                          <g key={p.ticker}>
                            <circle
                              cx={cx}
                              cy={cy}
                              r={p.isOutlier ? 6 : 4.5}
                              fill={p.isHighCarbon ? '#F59E0B' : '#06B6D4'}
                              stroke={p.isOutlier ? '#F43F5E' : '#FFFFFF'}
                              strokeWidth={p.isOutlier ? 2 : 1}
                            />
                            <text
                              x={cx + 7}
                              y={cy - 4}
                              fill={p.isOutlier ? '#FDA4AF' : '#E2E8F0'}
                              fontSize="9"
                              fontWeight="bold"
                            >
                              {p.ticker} ({p.selectedModelBp < 0.01 ? p.selectedModelBp.toExponential(1) : p.selectedModelBp.toFixed(2)}bp)
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  );
                })()}
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 mt-3 pt-3 border-t border-slate-800">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                    Low-Carbon Comparator
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    High-Carbon Issuer
                  </span>
                </div>
                <span className="text-rose-400">Ring = Residual &gt; 1.5σ</span>
              </div>
            </div>

            {/* Right 5 Columns: Regression & Spearman Rank Statistics */}
            <div className="lg:col-span-5 bg-[#0F1626] border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight mb-3">
                  Unfloored OLS &amp; Tie-Aware Spearman Statistics
                </h3>

                <div className="space-y-2.5 font-mono text-xs">
                  <div className="flex justify-between py-1.5 border-b border-slate-800/70">
                    <span className="text-amber-300 font-semibold">DD vs. Proxy 5Y Spearman ρ (N={regressionData.nTotal})</span>
                    <span className="text-emerald-400 font-bold">{regressionData.spearmanDdVsProxyRho.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800/70">
                    <span className="text-slate-400">Model vs. Proxy Spearman ρ (N={regressionData.nIncluded})</span>
                    <span className="text-cyan-300 font-bold">{regressionData.spearmanSpreadIncludedRho.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800/70">
                    <span className="text-slate-400">Model vs. Proxy Spearman ρ (All N={regressionData.nTotal})</span>
                    <span className="text-cyan-300 font-semibold">{regressionData.spearmanSpreadAllRho.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800/70">
                    <span className="text-slate-400">Unfloored Log-Log R² (N={regressionData.nIncluded})</span>
                    <span className="text-emerald-400 font-bold">{(regressionData.rSquared * 100).toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800/70">
                    <span className="text-slate-400">OLS Slope β (ln Model on ln Proxy)</span>
                    <span className="text-white font-semibold">{regressionData.beta.toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800/70">
                    <span className="text-slate-400">OLS Intercept α</span>
                    <span className="text-white font-semibold">{regressionData.alpha.toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800/70">
                    <span className="text-slate-400">Inverse Slope (ln Proxy on ln Model)</span>
                    <span className="text-slate-300">{regressionData.betaInv.toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800/70">
                    <span className="text-slate-400">
                      Companion ({companionRegression.modelType === 'creditGrades' ? 'CreditGrades' : 'Merton'}) R² / ρ
                    </span>
                    <span className="text-slate-300">
                      {(companionRegression.rSquared * 100).toFixed(1)}% / {companionRegression.spearmanSpreadIncludedRho.toFixed(3)}
                    </span>
                  </div>
                </div>

                {/* Dynamically Generated Verdict Sentence (Section 3.1) */}
                <div className="mt-4 p-3 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-300 leading-relaxed">
                  <strong className="text-cyan-300 block mb-1">Computed Verdict (Dynamic, Non-Hardcoded):</strong>
                  {regressionData.verdictSentence}
                </div>
              </div>

              <div className="mt-3 text-[10px] text-slate-400 font-mono">
                Spearman uses average ranks for ties (scipy.stats.spearmanr convention).
              </div>
            </div>

          </div>

          {/* Complete 9-Issuer Cross-Sectional Data & Rank Table */}
          <div className="bg-[#0F1626] border border-slate-800 rounded-xl p-5">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3">
              Cross-Sectional Issuer Panel (Unfloored Model Spreads, DD, and Average Tie-Handled Ranks)
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-sans">
                    <th className="py-2 px-3">Ticker</th>
                    <th className="py-2 px-3">Rating</th>
                    <th className="py-2 px-3">Proxy 5Y (bp)</th>
                    <th className="py-2 px-3">CreditGrades 5Y (bp)</th>
                    <th className="py-2 px-3">Merton 5Y (bp)</th>
                    <th className="py-2 px-3">Distance-to-Default (DD)</th>
                    <th className="py-2 px-3">DD Rank (N=9)</th>
                    <th className="py-2 px-3">Proxy Rank (N=9)</th>
                    <th className="py-2 px-3 text-right">Log-Regression Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {regressionData.allPoints.map((pt) => (
                    <tr key={pt.ticker} className="hover:bg-slate-900/60">
                      <td className="py-2 px-3 font-bold text-white">{pt.ticker}</td>
                      <td className="py-2 px-3 text-slate-300">{pt.rating}</td>
                      <td className="py-2 px-3 text-cyan-300">{pt.proxyBp.toFixed(1)}</td>
                      <td className="py-2 px-3 text-amber-300">
                        {pt.creditGradesBp === 0
                          ? '0.00 (underflow)'
                          : pt.creditGradesBp < 0.01
                            ? pt.creditGradesBp.toExponential(2)
                            : pt.creditGradesBp.toFixed(3)}
                      </td>
                      <td className="py-2 px-3 text-slate-300">
                        {pt.mertonBp === 0
                          ? '0.00 (underflow)'
                          : pt.mertonBp < 0.01
                            ? pt.mertonBp.toExponential(2)
                            : pt.mertonBp.toFixed(3)}
                      </td>
                      <td className="py-2 px-3 text-emerald-400 font-semibold">{pt.distanceToDefault.toFixed(2)} σ</td>
                      <td className="py-2 px-3 text-slate-300">{pt.rankDd.toFixed(1)}</td>
                      <td className="py-2 px-3 text-slate-300">{pt.rankProxyAll.toFixed(1)}</td>
                      <td className="py-2 px-3 text-right">
                        {pt.excludedFromLogRegression ? (
                          <span className="text-rose-400 text-[11px]">Excluded (spread &le; 0)</span>
                        ) : (
                          <span className="text-emerald-400 text-[11px]">
                            Included (ln={pt.modelLog.toFixed(2)})
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB C: Historical Distress Studies (Section 3.2) */}
      {subTab === 'distress' && (
        <div className="space-y-6">
          <div className="bg-[#0F1626] border border-slate-800 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                  <Flame className="w-4 h-4 text-rose-400" />
                  Historical Distress Event Studies: Engine-Computed Distance-to-Default Decay
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  All DD values are computed dynamically on load from (E, D, σ_E) at documented r = {(activeDistress.documentedRiskFreeRate * 100).toFixed(1)}% · Zero DD values typed in issuers.ts
                </p>
              </div>

              {/* Switch Distress Issuer */}
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                <button
                  onClick={() => setSelectedDistressIssuer('peabody')}
                  className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
                    selectedDistressIssuer === 'peabody'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Peabody Energy (2016)
                </button>
                <button
                  onClick={() => setSelectedDistressIssuer('pge')}
                  className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
                    selectedDistressIssuer === 'pge'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  PG&amp;E Wildfire (2019)
                </button>
              </div>
            </div>

            {/* Case Overview & Provenance Banner */}
            <div className="p-3.5 bg-rose-950/30 border border-rose-800/40 rounded-lg text-xs space-y-1.5 mb-5">
              <div className="flex flex-wrap justify-between items-center gap-2 text-rose-300 font-bold">
                <span>{activeDistress.name} ({activeDistress.ticker}) — {activeDistress.bankruptcyType}</span>
                <span className="font-mono text-[11px]">Filing Date: {activeDistress.filingDate}</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                {activeDistress.primaryCause}
              </p>
              <div className="pt-1.5 border-t border-rose-800/30 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-amber-300">
                <span>Provenance Label: {activeDistress.seriesLabel}</span>
                <span>Documented Parameters: r = {(activeDistress.documentedRiskFreeRate * 100).toFixed(1)}%, T = 5.0Y &amp; 1.0Y</span>
              </div>
            </div>

            {/* Historical DD Table (Computed on Load) */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-medium">
                    <th className="py-2.5 px-3">Quarter (As-Of)</th>
                    <th className="py-2.5 px-3">Equity (E)</th>
                    <th className="py-2.5 px-3">Debt (D)</th>
                    <th className="py-2.5 px-3">Equity Vol (σ_E)</th>
                    <th className="py-2.5 px-3">Computed DD (T=5Y)</th>
                    <th className="py-2.5 px-3">Computed DD (T=1Y)</th>
                    <th className="py-2.5 px-3">Naive Book DD (1Y)</th>
                    <th className="py-2.5 px-3">CreditGrades 5Y</th>
                    <th className="py-2.5 px-3">Input Provenance &amp; Event</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {computedDistress.rows.map((row) => (
                    <tr key={row.quarter} className="hover:bg-slate-900/60 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-white">
                        <div>{row.quarter}</div>
                        <div className="text-[10px] text-slate-400">{row.asOfDate}</div>
                      </td>
                      <td className="py-2.5 px-3 text-cyan-300 tabular-nums">${row.equityUsdB.toFixed(2)}B</td>
                      <td className="py-2.5 px-3 text-slate-300 tabular-nums">${row.debtUsdB.toFixed(2)}B</td>
                      <td className="py-2.5 px-3 text-amber-300 tabular-nums">{(row.equityVol * 100).toFixed(0)}%</td>
                      <td className="py-2.5 px-3 font-bold tabular-nums">
                        <span
                          className={`px-2 py-0.5 rounded ${
                            row.computedDd5y < 1.2
                              ? 'bg-rose-950 text-rose-300 border border-rose-800/50'
                              : row.computedDd5y < 2.5
                                ? 'bg-amber-950 text-amber-300 border border-amber-800/50'
                                : 'bg-emerald-950 text-emerald-300 border border-emerald-800/50'
                          }`}
                        >
                          {row.computedDd5y.toFixed(2)} σ
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-cyan-300 font-semibold tabular-nums">
                        {row.computedDd1y.toFixed(2)} σ
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 tabular-nums">
                        {row.naiveBookDd1y.toFixed(2)} σ
                      </td>
                      <td className="py-2.5 px-3 text-amber-300 tabular-nums">
                        {row.computedCreditGrades5yBp.toFixed(0)} bp
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 text-[11px] font-sans">
                        <div>{row.eventNote || row.sourceNote}</div>
                        {row.eventNote && (
                          <div className="text-[10px] text-slate-400 font-mono">{row.sourceNote}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-300 leading-relaxed">
              <strong className="text-cyan-300">Engine-Computed Summary:</strong> {computedDistress.computedSummaryNote}
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB D: Tornado Sensitivity */}
      {subTab === 'tornado' && (
        <div className="space-y-6">
          <div className="bg-[#0F1626] border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-cyan-400" />
                  Parameter Sensitivity: Tornado Chart on 5Y Spread Delta (Δbp)
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Identifying which quantitative modeling assumptions dominate the credit spread impact for {issuer.name}
                </p>
              </div>
              <span className="text-xs font-mono text-cyan-300">
                CreditGrades 5Y Base: {merton.creditGradesSpread5yBp.toFixed(2)} bp
              </span>
            </div>

            {/* Tornado Bars */}
            <div className="space-y-4 py-3">
              {tornadoItems.map((item) => {
                const maxSwing = Math.max(...tornadoItems.map((t) => t.swingBp), 0.01);
                const widthPct = (item.swingBp / maxSwing) * 100;

                return (
                  <div key={item.parameter} className="space-y-1">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-slate-300 font-semibold font-sans">{item.parameter}</span>
                      <span className="text-cyan-300 font-bold tabular-nums">
                        Swing: {item.swingBp < 0.1 ? item.swingBp.toFixed(4) : item.swingBp.toFixed(2)} bp ({item.lowSpreadDeltaBp < 0.1 ? item.lowSpreadDeltaBp.toFixed(4) : item.lowSpreadDeltaBp.toFixed(2)} to {item.highSpreadDeltaBp < 0.1 ? item.highSpreadDeltaBp.toFixed(4) : item.highSpreadDeltaBp.toFixed(2)} bp)
                      </span>
                    </div>

                    <div className="h-6 w-full bg-slate-900 rounded-lg overflow-hidden flex items-center px-1 border border-slate-800 font-mono text-[10px]">
                      <div
                        style={{ width: `${Math.max(5, widthPct)}%` }}
                        className="h-4 bg-gradient-to-r from-cyan-500 to-amber-500 rounded flex items-center justify-between px-2 text-white font-bold transition-all"
                      >
                        <span>{item.lowValue}</span>
                        <span>{item.highValue}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 leading-relaxed">
              <strong>Largest Computed Sensitivity ({issuer.ticker}):</strong>{' '}
              {tornadoItems[0]
                ? `${tornadoItems[0].parameter} drives the widest 5Y delta swing (${tornadoItems[0].swingBp < 0.1 ? tornadoItems[0].swingBp.toFixed(4) : tornadoItems[0].swingBp.toFixed(2)} bp, from ${tornadoItems[0].lowSpreadDeltaBp < 0.1 ? tornadoItems[0].lowSpreadDeltaBp.toFixed(4) : tornadoItems[0].lowSpreadDeltaBp.toFixed(2)} bp at ${tornadoItems[0].lowValue} to ${tornadoItems[0].highSpreadDeltaBp < 0.1 ? tornadoItems[0].highSpreadDeltaBp.toFixed(4) : tornadoItems[0].highSpreadDeltaBp.toFixed(2)} bp at ${tornadoItems[0].highValue}).`
                : 'No sensitivity items computed.'}
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB E: Reproducible Seeded Monte Carlo Uncertainty (Section 3.3) */}
      {subTab === 'montecarlo' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left 7 Columns: 5Y Delta Histogram + Seed Controls */}
            <div className="lg:col-span-7 bg-[#0F1626] border border-slate-800 rounded-xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan-400" />
                    Seeded Monte Carlo Distribution ({MONTE_CARLO_DEFAULT_DRAWS.toLocaleString()} Draws, 5Y Spread Δ)
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Mulberry32 seeded PRNG sampling cashflow priors, senior recovery R, CreditGrades (L&#772;, λ), and logistic ramp (m, w)
                  </p>
                </div>

                {/* Seed Input + New Seed Button (Section 3.3) */}
                <div className="flex items-center gap-2 font-mono text-xs">
                  <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg px-2 py-1">
                    <span className="text-slate-400 text-[10px] mr-1.5">Seed:</span>
                    <input
                      type="text"
                      value={seedInputText}
                      onChange={(e) => setSeedInputText(e.target.value)}
                      onBlur={handleApplySeedInput}
                      onKeyDown={(e) => e.key === 'Enter' && handleApplySeedInput()}
                      className="w-24 bg-transparent text-cyan-300 font-bold focus:outline-none text-xs"
                      aria-label="Monte Carlo PRNG Seed"
                    />
                  </div>
                  <button
                    onClick={handleNewSeed}
                    className="px-3 py-1.5 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors flex items-center gap-1.5 font-mono"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>New Seed ({MONTE_CARLO_DEFAULT_DRAWS.toLocaleString()} Draws)</span>
                  </button>
                </div>
              </div>

              {/* Histogram Visualization */}
              <div className="w-full bg-[#080D1A] rounded-lg border border-slate-800/80 p-3 select-none font-mono text-xs">
                <svg viewBox="0 0 540 230" className="w-full h-auto">
                  {(() => {
                    const maxCount = Math.max(...mcResult.histogram.map((h) => h.count), 1);
                    const binW = 440 / mcResult.histogram.length;
                    const fmt = (v: number) => (Math.abs(v) > 0 && Math.abs(v) < 0.1 ? v.toFixed(3) : v.toFixed(1));

                    return mcResult.histogram.map((bin, i) => {
                      const barH = (bin.count / maxCount) * 160;
                      const x = 50 + i * binW;
                      const y = 190 - barH;

                      return (
                        <g key={i}>
                          <rect
                            x={x + 1}
                            y={y}
                            width={binW - 2}
                            height={barH}
                            fill="#06B6D4"
                            opacity="0.8"
                            className="hover:opacity-100 transition-opacity"
                          />
                          {i % 3 === 0 && (
                            <text x={x + binW / 2} y="208" fill="#64748B" textAnchor="middle" fontSize="9">
                              {fmt(bin.binStart)}bp
                            </text>
                          )}
                        </g>
                      );
                    });
                  })()}

                  {/* P5, Median, P95 Vertical Lines */}
                  {(() => {
                    const minX = mcResult.histogram[0]?.binStart ?? 0;
                    const maxX = mcResult.histogram[mcResult.histogram.length - 1]?.binEnd ?? 1;
                    const span = Math.max(1e-6, maxX - minX);
                    const getLineX = (val: number) => 50 + ((val - minX) / span) * 440;
                    const fmt = (v: number) => (Math.abs(v) > 0 && Math.abs(v) < 0.1 ? v.toFixed(4) : v.toFixed(2));

                    return (
                      <>
                        <line x1={getLineX(mcResult.p5)} y1="30" x2={getLineX(mcResult.p5)} y2="190" stroke="#38BDF8" strokeDasharray="3 3" strokeWidth="1.5" />
                        <text x={getLineX(mcResult.p5)} y="24" fill="#38BDF8" textAnchor="middle" fontSize="9">
                          P5: +{fmt(mcResult.p5)}bp
                        </text>

                        <line x1={getLineX(mcResult.median)} y1="30" x2={getLineX(mcResult.median)} y2="190" stroke="#F59E0B" strokeWidth="2" />
                        <text x={getLineX(mcResult.median)} y="14" fill="#FCD34D" textAnchor="middle" fontSize="10" fontWeight="bold">
                          Median: +{fmt(mcResult.median)}bp
                        </text>

                        <line x1={getLineX(mcResult.p95)} y1="30" x2={getLineX(mcResult.p95)} y2="190" stroke="#F43F5E" strokeDasharray="3 3" strokeWidth="1.5" />
                        <text x={getLineX(mcResult.p95)} y="24" fill="#FDA4AF" textAnchor="middle" fontSize="9">
                          P95: +{fmt(mcResult.p95)}bp
                        </text>
                      </>
                    );
                  })()}
                </svg>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 mt-3 pt-3 border-t border-slate-800 font-mono">
                <span>P5 (Low): +{mcResult.p5 < 0.1 ? mcResult.p5.toFixed(4) : mcResult.p5.toFixed(2)} bp</span>
                <span className="text-amber-300 font-bold">Median: +{mcResult.median < 0.1 ? mcResult.median.toFixed(4) : mcResult.median.toFixed(2)} bp</span>
                <span>P95 (95th): +{mcResult.p95 < 0.1 ? mcResult.p95.toFixed(4) : mcResult.p95.toFixed(2)} bp</span>
              </div>
            </div>

            {/* Right 5 Columns: Distribution Metrics & Priors */}
            <div className="lg:col-span-5 bg-[#0F1626] border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight mb-4">
                  Reproducible Simulation Statistics
                </h3>

                <div className="space-y-2.5 font-mono text-xs">
                  <div className="flex justify-between py-1.5 border-b border-slate-800/70">
                    <span className="text-slate-400">Active PRNG Seed (mulberry32)</span>
                    <span className="text-cyan-300 font-bold">{mcResult.seed}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800/70">
                    <span className="text-slate-400">Shared Constant Draw Count</span>
                    <span className="text-white font-semibold">{mcResult.numDraws.toLocaleString()} Draws</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800/70">
                    <span className="text-slate-400">5Y Spread Δ Median (P50)</span>
                    <span className="text-amber-300 font-bold">
                      +{mcResult.median < 0.1 ? mcResult.median.toFixed(4) : mcResult.median.toFixed(2)} bp
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800/70">
                    <span className="text-slate-400">5Y Spread Δ Mean (μ)</span>
                    <span className="text-white font-semibold">
                      +{mcResult.mean < 0.1 ? mcResult.mean.toFixed(4) : mcResult.mean.toFixed(2)} bp
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800/70">
                    <span className="text-slate-400">Standard Deviation (σ)</span>
                    <span className="text-slate-300 font-semibold">
                      {mcResult.stdDev < 0.1 ? mcResult.stdDev.toFixed(4) : mcResult.stdDev.toFixed(2)} bp
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800/70">
                    <span className="text-cyan-400">90% Uncertainty Band [P5, P95]</span>
                    <span className="text-cyan-300 font-bold">
                      [+{mcResult.p5 < 0.1 ? mcResult.p5.toFixed(4) : mcResult.p5.toFixed(2)}, +{mcResult.p95 < 0.1 ? mcResult.p95.toFixed(4) : mcResult.p95.toFixed(2)}] bp
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800/70">
                    <span className="text-slate-400">Draws Exceeding Debt Barrier (V&apos; &le; D)</span>
                    <span className={mcResult.insolventCount > 0 ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                      {mcResult.insolventCount} / {mcResult.numDraws} ({((mcResult.insolventCount / mcResult.numDraws) * 100).toFixed(1)}%)
                    </span>
                  </div>
                </div>

                <div className="mt-4 p-3 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-300 space-y-1">
                  <strong className="text-white block">Jointly Sampled Priors (Cashflow + Recovery + Model):</strong>
                  <div className="font-mono text-[10px] text-slate-400 leading-relaxed">
                    • Pass-through ~ U(10%, 70%), WACC ~ U(5%, 11%), Horizon ~ U(15, 25Y), Terminal Value ~ Bernoulli(0.5), Vol Uplift ~ U(0.0, 0.8)<br />
                    • Senior Recovery R ~ U(25%, 55%)<br />
                    • CreditGrades L&#772; ~ U(0.40, 0.60), Barrier Uncertainty λ ~ U(0.20, 0.40)<br />
                    • Logistic Ramp Midpoint m ~ U(5.0Y, 9.0Y), Width w ~ U(1.0Y, 3.5Y)
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Per-Tenor P5 / Median / P95 Spread Fan Chart & Table (Section 3.3) */}
          <div className="bg-[#0F1626] border border-slate-800 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Term-Structure P5 / Median / P95 Uncertainty Band ({issuer.ticker} · {scenario.name})
                </h4>
                <p className="text-[11px] text-slate-400">
                  Shaded P5–P95 confidence band across 1Y, 3Y, 5Y, 7Y, and 10Y maturities ({MONTE_CARLO_DEFAULT_DRAWS.toLocaleString()} seeded draws, seed = {mcResult.seed})
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              {/* Fan Chart SVG */}
              <div className="lg:col-span-6 bg-[#080D1A] rounded-lg border border-slate-800/80 p-3 font-mono text-xs">
                {(() => {
                  const bands = mcResult.tenorBands;
                  const maxS = Math.max(...bands.map((b) => b.spreadP95Bp), 120) * 1.1;
                  const minS = Math.max(0, Math.min(...bands.map((b) => b.baseBp)) * 0.85);
                  const getX = (t: number) => 55 + ((t - 1) / 9) * 430;
                  const getY = (s: number) => 195 - ((s - minS) / Math.max(1e-6, maxS - minS)) * 165;

                  const upperPts = bands.map((b) => `${getX(b.tenor)},${getY(b.spreadP95Bp)}`);
                  const lowerPts = [...bands].reverse().map((b) => `${getX(b.tenor)},${getY(b.spreadP5Bp)}`);
                  const bandPolygon = [...upperPts, ...lowerPts].join(' ');
                  const medianPolyline = bands.map((b) => `${getX(b.tenor)},${getY(b.spreadMedianBp)}`).join(' ');
                  const basePolyline = bands.map((b) => `${getX(b.tenor)},${getY(b.baseBp)}`).join(' ');

                  return (
                    <svg viewBox="0 0 520 225" className="w-full h-auto">
                      {[0, 0.5, 1.0].map((frac, idx) => {
                        const val = maxS - frac * (maxS - minS);
                        const y = 30 + frac * 165;
                        return (
                          <g key={idx}>
                            <line x1="55" y1={y} x2="485" y2={y} stroke="#1E293B" strokeDasharray="3 3" />
                            <text x="48" y={y + 3} fill="#64748B" textAnchor="end" fontSize="9">
                              {val.toFixed(0)}bp
                            </text>
                          </g>
                        );
                      })}

                      {/* P5-P95 Shaded Band */}
                      <polygon points={bandPolygon} fill="#F59E0B" opacity="0.22" />

                      {/* Base Curve */}
                      <polyline fill="none" stroke="#06B6D4" strokeWidth="2" points={basePolyline} />

                      {/* Median Adjusted Curve */}
                      <polyline fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeDasharray="5 3" points={medianPolyline} />

                      {bands.map((b) => (
                        <g key={b.tenor}>
                          <circle cx={getX(b.tenor)} cy={getY(b.baseBp)} r="3.5" fill="#06B6D4" />
                          <circle cx={getX(b.tenor)} cy={getY(b.spreadMedianBp)} r="4" fill="#F59E0B" />
                          <text x={getX(b.tenor)} y="212" fill="#94A3B8" textAnchor="middle" fontSize="10">
                            {b.tenor}Y
                          </text>
                        </g>
                      ))}
                    </svg>
                  );
                })()}
              </div>

              {/* Per-Tenor Band Table */}
              <div className="lg:col-span-6 overflow-x-auto">
                <table className="w-full text-xs text-left font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-sans">
                      <th className="py-2 px-2.5">Tenor</th>
                      <th className="py-2 px-2.5">Base</th>
                      <th className="py-2 px-2.5">Δ P5</th>
                      <th className="py-2 px-2.5">Δ Median</th>
                      <th className="py-2 px-2.5">Δ P95</th>
                      <th className="py-2 px-2.5 text-right">Spread [P5 – P95]</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {mcResult.tenorBands.map((b) => {
                      const fmt = (v: number) => (Math.abs(v) > 0 && Math.abs(v) < 0.1 ? v.toFixed(4) : v.toFixed(2));
                      return (
                        <tr key={b.tenor} className="hover:bg-slate-900/60">
                          <td className="py-2 px-2.5 font-bold text-white">{b.tenor}Y</td>
                          <td className="py-2 px-2.5 text-cyan-300">{b.baseBp.toFixed(1)} bp</td>
                          <td className="py-2 px-2.5 text-slate-300">+{fmt(b.deltaP5Bp)} bp</td>
                          <td className="py-2 px-2.5 text-amber-300 font-bold">+{fmt(b.deltaMedianBp)} bp</td>
                          <td className="py-2 px-2.5 text-rose-300">+{fmt(b.deltaP95Bp)} bp</td>
                          <td className="py-2 px-2.5 text-right text-slate-200">
                            [{b.spreadP5Bp.toFixed(2)}, {b.spreadP95Bp.toFixed(2)}] bp
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB F: Deliberate Bug Audit */}
      {subTab === 'mutation' && (
        <div className="space-y-6">
          <div className="bg-[#0F1626] border border-slate-800 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  Step 2 Hardening: Deliberate Bug Mutation Audit Table
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  &ldquo;A passing test only matters if it fails when the code is wrong.&rdquo; See Codebase tab for recorded mutation checks in TEST_RESULTS.txt.
                </p>
              </div>

              <span className="text-xs px-2.5 py-1 rounded bg-amber-950/60 text-amber-300 border border-amber-800/40 font-mono font-semibold">
                {testResultsRaw.match(/(\d+)\s+passed/)?.[1] ?? '0'} Tests Passed (Recorded)
              </span>
            </div>

            {/* Mutation Audit Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-medium">
                    <th className="py-2.5 px-3">Deliberate Mutation Bug</th>
                    <th className="py-2.5 px-3">Which Test Fails</th>
                    <th className="py-2.5 px-3">Quantitative &amp; Economic Takeaway</th>
                    <th className="py-2.5 px-3 text-right">Protection Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  <tr className="hover:bg-slate-900/60 transition-colors">
                    <td className="py-2.5 px-3 text-white font-semibold font-sans">
                      Set recovery R = 0 inside protection leg
                    </td>
                    <td className="py-2.5 px-3 text-cyan-300 font-mono">
                      test_credit_triangle_approximation
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 font-sans">
                      Tests anchor the pricer to fundamental economics (s ≈ λ · (1 - R)), preventing arbitrary recovery tampering.
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-400 font-semibold font-sans">
                      ✓ Caught
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-900/60 transition-colors">
                    <td className="py-2.5 px-3 text-white font-semibold font-sans">
                      Delete accrual-on-default term
                    </td>
                    <td className="py-2.5 px-3 text-amber-300 font-mono">
                      QuantLib benchmark comparison
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 font-sans">
                      Round-trip tests alone reprice with identical legs and cannot catch definition bugs; independent QuantLib benchmark exposes this.
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-400 font-semibold font-sans">
                      ✓ Caught
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-900/60 transition-colors">
                    <td className="py-2.5 px-3 text-white font-semibold font-sans">
                      Use d₂ instead of d₁ in Merton credit spread
                    </td>
                    <td className="py-2.5 px-3 text-cyan-300 font-mono">
                      test_spread_increases_with_vol_and_leverage
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 font-sans">
                      Formula transcription errors invert volatility and leverage sensitivity, caught by monotonicity test.
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-400 font-semibold font-sans">
                      ✓ Caught
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-900/60 transition-colors">
                    <td className="py-2.5 px-3 text-white font-semibold font-sans">
                      Remove (1 - tax) factor in DCF cost waterfall
                    </td>
                    <td className="py-2.5 px-3 text-cyan-300 font-mono">
                      test_haircut_matches_hand_calculation
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 font-sans">
                      Hand-computed analytical test benchmark ($1,000,000 exact) catches tax shielding omission.
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-400 font-semibold font-sans">
                      ✓ Caught
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-900/60 transition-colors">
                    <td className="py-2.5 px-3 text-white font-semibold font-sans">
                      Swap sign of 1bp bump in CS01 calculation
                    </td>
                    <td className="py-2.5 px-3 text-cyan-300 font-mono">
                      test_cs01_positive_and_magnitude
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 font-sans">
                      Protection buyer sign conventions (CS01 &gt; 0) require explicit direction assertion tests.
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-400 font-semibold font-sans">
                      ✓ Caught
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-900/60 transition-colors">
                    <td className="py-2.5 px-3 text-white font-semibold font-sans">
                      Force steep curve inversion (s_{`5Y`} &lt; s_{`1Y`})
                    </td>
                    <td className="py-2.5 px-3 text-rose-300 font-mono">
                      test_negative_forward_hazard_raises
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 font-sans">
                      Pricer must raise ValueError loudly rather than poisoning downstream pricing with negative forward default intensity.
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-400 font-semibold font-sans">
                      ✓ Caught
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-900/60 transition-colors">
                    <td className="py-2.5 px-3 text-white font-semibold font-sans">
                      Positive carbon price produces 0.0 bp delta on high emitter
                    </td>
                    <td className="py-2.5 px-3 text-amber-300 font-mono">
                      test_positive_carbon_price_on_high_emitter_gives_positive_delta
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 font-sans">
                      Catches silent overlay suppression / underflow where positive carbon costs failed to widen credit spreads.
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-400 font-semibold font-sans">
                      ✓ Caught
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-900/60 transition-colors">
                    <td className="py-2.5 px-3 text-white font-semibold font-sans">
                      Mask raw repricing error as &quot;0.00e-9&quot;
                    </td>
                    <td className="py-2.5 px-3 text-cyan-300 font-mono">
                      test_raw_repricing_error_tolerance
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 font-sans">
                      Requires raw floating-point precision display (&lt; 1e-10) without artificial string zero-clipping.
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-400 font-semibold font-sans">
                      ✓ Caught
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Tolerance Audit Box */}
            <div className="mt-5 p-4 rounded-lg bg-slate-900 border border-slate-800 text-xs space-y-3">
              <h4 className="font-semibold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                Rigorous Tolerance Audit (No Generous Padding)
              </h4>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                A tolerance chosen just to make a test pass is a red flag. Every tolerance in this codebase is grounded in mathematical precision:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 font-mono text-[11px]">
                <div className="p-2.5 bg-slate-950/80 rounded border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Round-Trip Bootstrap</span>
                  <span className="text-emerald-400 font-bold text-xs">&lt; 1e-8 (0.0001 bp)</span>
                </div>
                <div className="p-2.5 bg-slate-950/80 rounded border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Credit Triangle</span>
                  <span className="text-cyan-300 font-bold text-xs">&lt; 2e-4</span>
                </div>
                <div className="p-2.5 bg-slate-950/80 rounded border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Merton Residuals</span>
                  <span className="text-emerald-400 font-bold text-xs">&lt; 1e-6</span>
                </div>
                <div className="p-2.5 bg-slate-950/80 rounded border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">QuantLib Max Gap</span>
                  <span className="text-amber-300 font-bold text-xs">
                    {quantlibBenchmark.summary.maxAbsDiffPctPoints.toFixed(3)} pp ({quantlibBenchmark.summary.maxRelDiffPct.toFixed(3)}% rel)
                  </span>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
