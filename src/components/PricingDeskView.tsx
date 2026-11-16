import React from 'react';
import {
  Sliders,
  Layers,
  Activity,
  RotateCcw,
  AlertTriangle,
  ShieldCheck,
  ExternalLink,
  CheckCircle2,
  XCircle,
  BookOpen,
  Flame,
} from 'lucide-react';
import { IssuerProfile } from '../data/issuers';
import {
  HazardCurve,
  MertonResult,
  ClimateOutput,
  ClimateScenarioDef,
  ClimateOverlayParams,
  TornadoItem,
  MonteCarloResult,
  NGFS_SCENARIOS,
  MONTE_CARLO_DEFAULT_DRAWS,
  survivalProb,
  computeCdsLegs,
  computeCs01,
} from '../lib/creditEngine';
import quantlibBenchmark from '../../data/benchmarks/quantlib_2026-11-15.json';

interface PricingDeskViewProps {
  issuer: IssuerProfile;
  baseCurve: HazardCurve;
  merton: MertonResult;
  climate: ClimateOutput;
  mcResult: MonteCarloResult;
  scenario: ClimateScenarioDef;
  onSelectScenario: (id: string) => void;
  climateParams: ClimateOverlayParams;
  onUpdateParams: (params: Partial<ClimateOverlayParams>) => void;
  recovery: number;
  onUpdateRecovery: (r: number) => void;
  customSpreadsBp: number[] | null;
  onUpdateCustomSpreads: (spreads: number[] | null) => void;
  tornadoData: TornadoItem[];
}

export const PricingDeskView: React.FC<PricingDeskViewProps> = ({
  issuer,
  baseCurve,
  merton,
  climate,
  mcResult,
  scenario,
  onSelectScenario,
  climateParams,
  onUpdateParams,
  recovery,
  onUpdateRecovery,
  customSpreadsBp,
  onUpdateCustomSpreads,
  tornadoData,
}) => {
  const activeSpreads = customSpreadsBp || issuer.proxySpreadsBp;
  const isInsolvent = climate.status === 'insolvent_in_scenario';
  const isUninformative = climate.status === 'uninformative_at_current_leverage';
  const isSevere = climate.status === 'severe';

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

  // Repricing verification table rows
  const repricingTable = issuer.tenors.map((t, i) => {
    const inputBp = activeSpreads[i];
    const legs = computeCdsLegs(baseCurve, t);
    const repricedBp = legs.parSpreadBp;
    const errorBp = Math.abs(repricedBp - inputBp);
    const intervalHazard = baseCurve.hazardRates[i] * 100;
    const survT = survivalProb(baseCurve, t);
    const avgHazard = (-(Math.log(survT)) / t) * 100;
    const approxTriangle = (inputBp / 10000 / (1 - recovery)) * 100;
    const cs01Eur = computeCs01(baseCurve, t, 10_000_000);
    return {
      tenor: `${t}Y`,
      tenorNum: t,
      inputBp,
      repricedBp,
      errorBp,
      intervalHazard,
      avgHazard,
      approxTriangle,
      adjSpreadBp: isInsolvent ? null : climate.adjustedSpreadsBp[i],
      shiftBp: isInsolvent ? null : climate.tenorShiftsBp[i],
      adjHazard: isInsolvent ? null : (climate.adjustedHazardRates[i] ?? baseCurve.hazardRates[i]) * 100,
      survProb: survT * 100,
      adjSurvProb: isInsolvent
        ? null
        : (climate.adjustedSurvivalProbs[t - 1] ?? survT) * 100,
      rpv01: legs.rpv01,
      cs01Eur,
    };
  });

  // ==========================================================================
  // Section 4.5: Live Traffic-Light Checks ('Model risk and limitations' panel)
  // ==========================================================================
  const maxBootstrapErrorBp = Math.max(...repricingTable.map((r) => r.errorBp));
  const bootstrapPass = maxBootstrapErrorBp < 1e-8;

  const eq1RelResidual = merton.eq1Residual / Math.max(1.0, merton.equityValue);
  const eq2RelResidual = merton.eq2Residual / Math.max(1.0, merton.equityValue);
  const maxMertonRelResidual = Math.max(eq1RelResidual, eq2RelResidual);
  const mertonResidualPass = maxMertonRelResidual < 1e-6;

  const qlMaxAbsSurvGap = quantlibBenchmark.summary.maxAbsDiff;
  const qlMaxRelSurvGapPct = quantlibBenchmark.summary.maxRelDiffPct;
  const qlGapExplainedPct = quantlibBenchmark.conventionExperiment.actual365WithoutImm.gapReductionPct;

  const shifts = climate.tenorShiftsBp;
  const isMonotonicNonDecreasing = shifts.every((v, idx) => idx === 0 || v + 1e-12 >= shifts[idx - 1]);
  const shortToLongRatio = shifts[4] > 0 ? shifts[0] / shifts[4] : 0;
  const isStrictRampRatio = shifts[4] <= 0 || shortToLongRatio < 0.25;
  const tenorMonotonicPass = isMonotonicNonDecreasing && isStrictRampRatio;

  const haircutStatus: 'pass' | 'warn' | 'fail' =
    isInsolvent || climate.haircutPctV >= 50
      ? 'fail'
      : climate.haircutPctV >= 25
      ? 'warn'
      : 'pass';

  const plausibilityStatus: 'pass' | 'warn' | 'fail' =
    isInsolvent
      ? 'fail'
      : climate.exceedsEmpiricalRange || isSevere || isUninformative
      ? 'warn'
      : 'pass';

  const handleSpreadEdit = (index: number, valStr: string) => {
    const num = parseFloat(valStr);
    if (isNaN(num) || num <= 0) return;
    const next = [...activeSpreads];
    next[index] = num;
    onUpdateCustomSpreads(next);
  };

  const fiveYearBand = mcResult.tenorBands[2];
  const tenYearBand = mcResult.tenorBands[4];

  // SVG Chart Geometry for Tenor-Dependent Spread Curve + Seeded MC P5-P95 Band
  const svgW = 680;
  const svgH = 260;
  const padL = 52;
  const padR = 24;
  const padT = 20;
  const padB = 34;

  const allSpreadVals = [
    ...activeSpreads,
    ...(isInsolvent ? [] : climate.adjustedSpreadsBp),
    ...(isInsolvent ? [] : mcResult.tenorBands.map((b) => b.spreadP95Bp)),
  ];
  const maxSpreadY = Math.max(50, Math.ceil((Math.max(...allSpreadVals) * 1.12) / 10) * 10);
  const minSpreadY = 0;

  const xTenor = (t: number) => padL + ((t - 1) / 9) * (svgW - padL - padR);
  const ySpread = (s: number) =>
    padT + (1 - (s - minSpreadY) / Math.max(1, maxSpreadY - minSpreadY)) * (svgH - padT - padB);

  const basePolylinePoints = issuer.tenors
    .map((t, i) => `${xTenor(t)},${ySpread(activeSpreads[i])}`)
    .join(' ');
  const adjPolylinePoints = !isInsolvent
    ? issuer.tenors.map((t, i) => `${xTenor(t)},${ySpread(climate.adjustedSpreadsBp[i])}`).join(' ')
    : '';

  const mcBandPolygonPoints =
    !isInsolvent && mcResult.tenorBands.length === issuer.tenors.length
      ? [
          ...issuer.tenors.map((t, i) => `${xTenor(t)},${ySpread(mcResult.tenorBands[i].spreadP95Bp)}`),
          ...[...issuer.tenors]
            .reverse()
            .map((t, revIdx) => {
              const i = issuer.tenors.length - 1 - revIdx;
              return `${xTenor(t)},${ySpread(mcResult.tenorBands[i].spreadP5Bp)}`;
            }),
        ].join(' ')
      : '';

  // SVG Chart Geometry for Survival Probability Q(t) (1Y to 10Y)
  const survW = 360;
  const survH = 200;
  const sPadL = 42;
  const sPadR = 16;
  const sPadT = 16;
  const sPadB = 28;
  const years1to10 = Array.from({ length: 10 }, (_, idx) => idx + 1);
  const baseSurvSeries = years1to10.map((y) => survivalProb(baseCurve, y) * 100);
  const adjSurvSeries = years1to10.map((y, idx) =>
    isInsolvent ? 0 : (climate.adjustedSurvivalProbs[idx] ?? baseSurvSeries[idx] / 100) * 100
  );
  const minSurvPct = Math.max(
    0,
    Math.floor((Math.min(...baseSurvSeries, ...(isInsolvent ? [50] : adjSurvSeries)) - 5) / 5) * 5
  );
  const xSurv = (y: number) => sPadL + ((y - 1) / 9) * (survW - sPadL - sPadR);
  const ySurv = (pct: number) =>
    sPadT + (1 - (pct - minSurvPct) / Math.max(1, 100 - minSurvPct)) * (survH - sPadT - sPadB);

  const baseSurvPoints = years1to10.map((y, i) => `${xSurv(y)},${ySurv(baseSurvSeries[i])}`).join(' ');
  const adjSurvPoints = !isInsolvent
    ? years1to10.map((y, i) => `${xSurv(y)},${ySurv(adjSurvSeries[i])}`).join(' ')
    : '';

  const maxTornadoSwing = Math.max(1e-6, ...tornadoData.map((d) => d.swingBp));

  const provenanceRows = [
    {
      label: 'Market Capitalisation (E)',
      value: `$${issuer.equityUsdB.toFixed(1)}B`,
      item: issuer.inputProvenance.marketCap,
    },
    {
      label: 'Total Book Debt (D)',
      value: `$${issuer.totalDebtUsdB.toFixed(1)}B`,
      item: issuer.inputProvenance.debt,
    },
    {
      label: 'Equity Volatility (σ_E)',
      value: `${(issuer.equityVol * 100).toFixed(1)}%`,
      item: issuer.inputProvenance.equityVol,
    },
    {
      label: 'Scope 1 & 2 Emissions',
      value: `${issuer.scope1MtCo2} + ${issuer.scope2MtCo2} MtCO2e${
        issuer.scope3MtCo2 ? ` (Optional Scope 3: ${issuer.scope3MtCo2} Mt)` : ''
      }`,
      item: issuer.inputProvenance.emissions,
    },
    {
      label: 'Annual Revenue',
      value: `$${issuer.revenueUsdB.toFixed(1)}B`,
      item: issuer.inputProvenance.revenue,
    },
    {
      label: 'Senior Credit Rating',
      value: issuer.rating,
      item: issuer.inputProvenance.rating,
    },
    {
      label: 'Baseline Spread Curve (1–10Y)',
      value: `[${issuer.proxySpreadsBp.join(', ')}] bp`,
      item: issuer.inputProvenance.proxySpreads,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Section 4.5: Live Model Risk & Limitations Traffic-Light Panel on First Screen */}
      <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-5 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Model Risk &amp; Live Diagnostic Traffic-Light Panel
            </h3>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            Computed live on render • Headline 5Y Shift Range (MC P5–P95, N={MONTE_CARLO_DEFAULT_DRAWS.toLocaleString()}):{' '}
            <strong className="text-amber-300">
              {isInsolvent
                ? 'n/a (insolvent in scenario)'
                : `[${formatAdaptiveBp(mcResult.p5, true)}, ${formatAdaptiveBp(mcResult.p95, true)}] bp (Median ${formatAdaptiveBp(mcResult.median, true)} bp)`}
            </strong>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Check 1: Bootstrap round-trip error */}
          <div className="bg-slate-950/70 border border-slate-800/90 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                1. Bootstrap Error
              </span>
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                  bootstrapPass
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                }`}
              >
                {bootstrapPass ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {bootstrapPass ? 'PASS' : 'FAIL'}
              </span>
            </div>
            <div className="text-xs font-mono font-bold text-white">
              {maxBootstrapErrorBp.toExponential(2)} bp
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              Max |s_repriced - s_in| across 1–10Y (tol &lt; 1e-8 bp)
            </div>
          </div>

          {/* Check 2: Merton equation residuals */}
          <div className="bg-slate-950/70 border border-slate-800/90 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                2. Merton Residuals
              </span>
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                  mertonResidualPass
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                }`}
              >
                {mertonResidualPass ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {mertonResidualPass ? 'PASS' : 'FAIL'}
              </span>
            </div>
            <div className="text-xs font-mono font-bold text-white">
              {maxMertonRelResidual.toExponential(2)} rel
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              Coupled 2-eq solver |eq1|, |eq2| / E (tol &lt; 1e-6)
            </div>
          </div>

          {/* Check 3: QuantLib gap from fixture */}
          <div className="bg-slate-950/70 border border-slate-800/90 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                3. QuantLib Gap
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                <AlertTriangle className="w-3 h-3" />
                CONVENTION
              </span>
            </div>
            <div className="text-xs font-mono font-bold text-amber-300">
              {(qlMaxAbsSurvGap * 100).toFixed(3)} pp ({qlMaxRelSurvGapPct.toFixed(2)}%)
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              10Y surv diff vs QuantLib {quantlibBenchmark.quantLibVersion} ({qlGapExplainedPct.toFixed(1)}% Act/365+IMM)
            </div>
          </div>

          {/* Check 4: Haircut as % of V */}
          <div className="bg-slate-950/70 border border-slate-800/90 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                4. Haircut % of V
              </span>
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                  haircutStatus === 'pass'
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : haircutStatus === 'warn'
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                    : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                }`}
              >
                {haircutStatus === 'pass' ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : haircutStatus === 'warn' ? (
                  <AlertTriangle className="w-3 h-3" />
                ) : (
                  <XCircle className="w-3 h-3" />
                )}
                {haircutStatus === 'pass' ? 'NORMAL' : haircutStatus === 'warn' ? 'ELEVATED' : 'SEVERE'}
              </span>
            </div>
            <div className="text-xs font-mono font-bold text-white">
              {climate.haircutPctV.toFixed(2)}% of V
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              PV Haircut ${(climate.totalHaircutUsd / 1e9).toFixed(2)}B vs V ${(merton.assetValue / 1e9).toFixed(1)}B
            </div>
          </div>

          {/* Check 5: Tenor monotonicity */}
          <div className="bg-slate-950/70 border border-slate-800/90 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                5. Tenor Ramp g(T)
              </span>
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                  tenorMonotonicPass
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                }`}
              >
                {tenorMonotonicPass ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {tenorMonotonicPass ? 'MONOTONIC' : 'NON-MONO'}
              </span>
            </div>
            <div className="text-xs font-mono font-bold text-white">
              1Y/10Y = {(shortToLongRatio * 100).toFixed(1)}%
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              s(1Y) &le; s(3Y) &le; s(5Y) &le; s(7Y) &le; s(10Y) (&lt;25% at 1Y)
            </div>
          </div>

          {/* Check 6: Plausibility banner status */}
          <div className="bg-slate-950/70 border border-slate-800/90 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                6. Plausibility Status
              </span>
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                  plausibilityStatus === 'pass'
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : plausibilityStatus === 'warn'
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                    : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                }`}
              >
                {plausibilityStatus === 'pass' ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : plausibilityStatus === 'warn' ? (
                  <AlertTriangle className="w-3 h-3" />
                ) : (
                  <XCircle className="w-3 h-3" />
                )}
                {plausibilityStatus === 'pass' ? 'IN BOUNDS' : plausibilityStatus === 'warn' ? 'FLAGGED' : 'INSOLVENT'}
              </span>
            </div>
            <div className="text-xs font-mono font-bold text-white truncate">
              {climate.status}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              Empirical benchmark: 5–150 bp (Vozian &amp; Costola 2025)
            </div>
          </div>
        </div>
      </div>

      {/* Top Row: Controls & Primary Curve Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Sidebar Controls (4 Cols) */}
        <div className="lg:col-span-4 space-y-5">
          {/* Scenario Selector Card */}
          <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-5 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                NGFS Phase IV Scenario
              </h3>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {scenario.type}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2 mb-3">
              {Object.values(NGFS_SCENARIOS).map((scen) => {
                const isSelected = scen.id === scenario.id;
                return (
                  <button
                    key={scen.id}
                    onClick={() => onSelectScenario(scen.id)}
                    className={`text-left p-3 rounded-lg border transition-all ${
                      isSelected
                        ? 'bg-emerald-500/15 border-emerald-500/50 text-white shadow-sm'
                        : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">{scen.name}</span>
                      <span className="text-[11px] font-mono text-amber-400">
                        2035: ${scen.carbonPrices[10]}/t
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">{scenario.description}</p>
          </div>

          {/* Climate Overlay & ISDA Parameters */}
          <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-5 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                Climate Transition Overlay Controls
              </h3>
              <button
                onClick={() => {
                  onUpdateParams({
                    passThrough: 0.4,
                    wacc: 0.08,
                    horizonYears: 25,
                    includeTerminalValue: false,
                    volUpliftFactor: 0.5,
                    rampMidpointYears: 7.0,
                    rampWidthYears: 2.0,
                    includeScope3: false,
                  });
                  onUpdateRecovery(0.4);
                  onUpdateCustomSpreads(null);
                }}
                className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
                title="Reset parameters to baseline"
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            </div>

            <div className="space-y-4">
              {/* Optional Scope 3 Toggle for Oil & Gas Issuers (Section 4.5) */}
              {issuer.scope3MtCo2 !== undefined && (
                <div className="p-3 rounded-lg bg-amber-950/25 border border-amber-500/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-amber-400" />
                      Include Scope 3 Emissions ({issuer.scope3MtCo2.toFixed(0)} MtCO2e)
                    </span>
                    <button
                      onClick={() =>
                        onUpdateParams({
                          includeScope3: !climateParams.includeScope3,
                          scope3MtCo2: issuer.scope3MtCo2,
                        })
                      }
                      className={`w-10 h-5 rounded-full transition-colors relative ${
                        climateParams.includeScope3 ? 'bg-amber-500' : 'bg-slate-700'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${
                          climateParams.includeScope3 ? 'left-5' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    {issuer.scope3Note ||
                      'Note: Scope 1 and 2 understate transition exposure for oil and gas issuers; toggle on to include illustrative Scope 3 Category 11 emissions.'}
                  </p>
                </div>
              )}

              {/* Cost Pass-Through */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">Carbon Cost Pass-Through</span>
                  <span className="font-mono text-cyan-400 font-semibold">
                    {Math.round(climateParams.passThrough * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="0.9"
                  step="0.05"
                  value={climateParams.passThrough}
                  onChange={(e) => onUpdateParams({ passThrough: parseFloat(e.target.value) })}
                  className="w-full accent-cyan-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
                  <span>0% (Full Absorption)</span>
                  <span>90% (High Pricing Power)</span>
                </div>
              </div>

              {/* WACC Discount Rate */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">WACC Discount Rate</span>
                  <span className="font-mono text-cyan-400 font-semibold">
                    {(climateParams.wacc * 100).toFixed(1)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="0.14"
                  step="0.005"
                  value={climateParams.wacc}
                  onChange={(e) => onUpdateParams({ wacc: parseFloat(e.target.value) })}
                  className="w-full accent-cyan-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              {/* Projection Horizon */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">DCF Projection Horizon</span>
                  <span className="font-mono text-cyan-400 font-semibold">
                    {climateParams.horizonYears} Years
                  </span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="26"
                  step="1"
                  value={climateParams.horizonYears}
                  onChange={(e) => onUpdateParams({ horizonYears: parseInt(e.target.value, 10) })}
                  className="w-full accent-cyan-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              {/* Logistic Tenor Ramp Midpoint m and Width w (Section 2.2) */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-400">Ramp Midpoint (m)</span>
                    <span className="font-mono text-amber-400 font-semibold">
                      {(climateParams.rampMidpointYears ?? 7.0).toFixed(1)}Y
                    </span>
                  </div>
                  <input
                    type="range"
                    min="4.0"
                    max="9.0"
                    step="0.5"
                    value={climateParams.rampMidpointYears ?? 7.0}
                    onChange={(e) =>
                      onUpdateParams({ rampMidpointYears: parseFloat(e.target.value) })
                    }
                    className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-400">Ramp Width (w)</span>
                    <span className="font-mono text-amber-400 font-semibold">
                      {(climateParams.rampWidthYears ?? 2.0).toFixed(1)}Y
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="4.0"
                    step="0.5"
                    value={climateParams.rampWidthYears ?? 2.0}
                    onChange={(e) =>
                      onUpdateParams({ rampWidthYears: parseFloat(e.target.value) })
                    }
                    className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              {/* Recovery Rate R */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">ISDA Recovery Rate (R)</span>
                  <span className="font-mono text-emerald-400 font-semibold">
                    {Math.round(recovery * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.15"
                  max="0.60"
                  step="0.05"
                  value={recovery}
                  onChange={(e) => onUpdateRecovery(parseFloat(e.target.value))}
                  className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
                  <span>15% (Subordinated)</span>
                  <span>40% (Senior Unsecured)</span>
                  <span>60% (Secured)</span>
                </div>
              </div>

              {/* Asset Vol Uplift */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">Transition Asset Vol Uplift</span>
                  <span className="font-mono text-cyan-400 font-semibold">
                    {climateParams.volUpliftFactor.toFixed(1)}x
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1.0"
                  step="0.1"
                  value={climateParams.volUpliftFactor}
                  onChange={(e) => onUpdateParams({ volUpliftFactor: parseFloat(e.target.value) })}
                  className="w-full accent-cyan-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              {/* Terminal Value Toggle */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                <div>
                  <span className="text-xs text-slate-300 font-medium block">
                    Include Perpetual Terminal Value
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Post-2050 steady-state carbon annuity
                  </span>
                </div>
                <button
                  onClick={() =>
                    onUpdateParams({ includeTerminalValue: !climateParams.includeTerminalValue })
                  }
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    climateParams.includeTerminalValue ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                      climateParams.includeTerminalValue ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Market Spread Override */}
          <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-5 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Input Spread Curve (bp)
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                {customSpreadsBp ? 'Custom User Curve' : 'Rating-based proxies, not traded CDS quotes'}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {issuer.tenors.map((t, i) => (
                <div key={t} className="text-center">
                  <label className="text-[10px] text-slate-400 font-mono block mb-1">{t}Y</label>
                  <input
                    type="number"
                    value={activeSpreads[i]}
                    onChange={(e) => handleSpreadEdit(i, e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-xs font-mono text-center text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Charts Area (8 Cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Primary Credit Spread Curve SVG Chart */}
          <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-5 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-amber-400" />
                  Tenor-Dependent Climate-Adjusted CDS Curve ({issuer.ticker})
                </h3>
                <p className="text-xs text-slate-400">
                  Rating-Based Proxy Curve vs. CreditGrades (2002) + Logistic Tenor Ramp g(T) under{' '}
                  <span className="text-slate-200 font-medium">{scenario.name}</span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                <span className="flex items-center gap-1.5 text-cyan-400">
                  <span className="w-2.5 h-0.5 bg-cyan-400 inline-block"></span> Proxy Curve
                </span>
                <span className="flex items-center gap-1.5 text-amber-400">
                  <span className="w-2.5 h-0.5 bg-amber-400 inline-block"></span> Climate-Adjusted
                </span>
                <span className="flex items-center gap-1.5 text-amber-300/80">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/25 border border-amber-400/50 inline-block"></span>{' '}
                  MC P5–P95 Band ({MONTE_CARLO_DEFAULT_DRAWS.toLocaleString()} draws)
                </span>
              </div>
            </div>

            {/* Section 4.5: Headline Result Stated as a Range */}
            {!isInsolvent && fiveYearBand && tenYearBand && (
              <div className="mb-3 px-3.5 py-2 rounded-lg bg-slate-950/80 border border-slate-800/90 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                <div>
                  <span className="text-slate-400">5Y Headline Spread Range (P5–P95): </span>
                  <strong className="text-white">
                    {fiveYearBand.spreadP5Bp.toFixed(2)} – {fiveYearBand.spreadP95Bp.toFixed(2)} bp
                  </strong>{' '}
                  <span className="text-amber-400">
                    (Δ [{formatAdaptiveBp(fiveYearBand.deltaP5Bp, true)}, {formatAdaptiveBp(fiveYearBand.deltaP95Bp, true)}] bp)
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">10Y Range (P5–P95): </span>
                  <strong className="text-white">
                    {tenYearBand.spreadP5Bp.toFixed(2)} – {tenYearBand.spreadP95Bp.toFixed(2)} bp
                  </strong>{' '}
                  <span className="text-amber-400">
                    (Δ [{formatAdaptiveBp(tenYearBand.deltaP5Bp, true)}, {formatAdaptiveBp(tenYearBand.deltaP95Bp, true)}] bp)
                  </span>
                </div>
              </div>
            )}

            {isInsolvent ? (
              <div className="h-64 w-full flex flex-col items-center justify-center bg-rose-950/20 border border-rose-500/30 rounded-xl p-6 text-center">
                <AlertTriangle className="w-8 h-8 text-rose-400 mb-2" />
                <div className="text-sm font-bold text-rose-200 uppercase tracking-wider mb-1">
                  n/a (insolvent in scenario)
                </div>
                <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
                  {climate.statusExplanation} Numeric climate-adjusted spreads are suppressed to prevent displaying uncalibrated thousands-of-bp extrapolation as a tradeable price.
                </p>
              </div>
            ) : (
              <div className="w-full bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
                <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-64">
                  {/* Horizontal Grid Lines */}
                  {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                    const val = minSpreadY + frac * (maxSpreadY - minSpreadY);
                    const y = ySpread(val);
                    return (
                      <g key={frac}>
                        <line
                          x1={padL}
                          y1={y}
                          x2={svgW - padR}
                          y2={y}
                          stroke="#1e293b"
                          strokeDasharray="3 3"
                        />
                        <text
                          x={padL - 8}
                          y={y + 4}
                          textAnchor="end"
                          className="fill-slate-400 text-[10px] font-mono"
                        >
                          {val.toFixed(0)}bp
                        </text>
                      </g>
                    );
                  })}

                  {/* Seeded Monte Carlo P5-P95 Shaded Band */}
                  {mcBandPolygonPoints && (
                    <polygon
                      points={mcBandPolygonPoints}
                      fill="#f59e0b"
                      fillOpacity={0.18}
                      stroke="#f59e0b"
                      strokeOpacity={0.35}
                      strokeDasharray="3 3"
                    />
                  )}

                  {/* Baseline Proxy Spread Polyline */}
                  <polyline
                    fill="none"
                    stroke="#22d3ee"
                    strokeWidth="2.5"
                    points={basePolylinePoints}
                  />

                  {/* Climate-Adjusted Spread Polyline */}
                  <polyline
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="2.5"
                    points={adjPolylinePoints}
                  />

                  {/* Data Points & Tenor Labels */}
                  {issuer.tenors.map((t, i) => {
                    const cx = xTenor(t);
                    const cyBase = ySpread(activeSpreads[i]);
                    const cyAdj = ySpread(climate.adjustedSpreadsBp[i]);
                    return (
                      <g key={t}>
                        <text
                          x={cx}
                          y={svgH - 8}
                          textAnchor="middle"
                          className="fill-slate-300 text-[11px] font-mono"
                        >
                          {t}Y
                        </text>
                        <circle cx={cx} cy={cyBase} r={4} fill="#22d3ee" />
                        <circle cx={cx} cy={cyAdj} r={5} fill="#f59e0b" />
                        <text
                          x={cx}
                          y={Math.max(12, cyAdj - 9)}
                          textAnchor="middle"
                          className="fill-amber-300 text-[10px] font-mono font-semibold"
                        >
                          {climate.adjustedSpreadsBp[i].toFixed(1)}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}

            {/* Tenor Shift Bar Strip */}
            {!isInsolvent && (
              <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-5 gap-2">
                {issuer.tenors.map((t, idx) => {
                  const shift = climate.tenorShiftsBp[idx];
                  const weight =
                    climate.creditGradesDelta10yBp > 0
                      ? shift / climate.creditGradesDelta10yBp
                      : 0;
                  return (
                    <div
                      key={t}
                      className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-2 text-center"
                    >
                      <div className="text-[10px] text-slate-400 font-mono">
                        {t}Y Shift (g={weight.toFixed(2)})
                      </div>
                      <div className="text-xs font-mono font-bold text-amber-400 mt-0.5">
                        {formatAdaptiveBp(shift, true)} bp
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Second Row of Charts: Survival Curve & Tornado Sensitivity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Survival Probability Q(t) SVG Chart */}
            <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-5 shadow-lg">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                Survival Probability Curve Q(t)
              </h3>
              <p className="text-[11px] text-slate-400 mb-3">
                10-Year cumulative survival decay under piecewise-constant hazard rates
              </p>
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-2">
                <svg viewBox={`0 0 ${survW} ${survH}`} className="w-full h-48">
                  {[0, 0.5, 1].map((frac) => {
                    const val = minSurvPct + frac * (100 - minSurvPct);
                    const y = ySurv(val);
                    return (
                      <g key={frac}>
                        <line
                          x1={sPadL}
                          y1={y}
                          x2={survW - sPadR}
                          y2={y}
                          stroke="#1e293b"
                          strokeDasharray="3 3"
                        />
                        <text
                          x={sPadL - 6}
                          y={y + 3}
                          textAnchor="end"
                          className="fill-slate-400 text-[9px] font-mono"
                        >
                          {val.toFixed(0)}%
                        </text>
                      </g>
                    );
                  })}
                  <polyline
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2"
                    points={baseSurvPoints}
                  />
                  {!isInsolvent && (
                    <polyline
                      fill="none"
                      stroke="#f43f5e"
                      strokeWidth="2"
                      strokeDasharray="4 4"
                      points={adjSurvPoints}
                    />
                  )}
                  {[1, 3, 5, 7, 10].map((yr) => (
                    <text
                      key={yr}
                      x={xSurv(yr)}
                      y={survH - 6}
                      textAnchor="middle"
                      className="fill-slate-400 text-[9px] font-mono"
                    >
                      {yr}Y
                    </text>
                  ))}
                </svg>
              </div>
            </div>

            {/* Parameter Sensitivity Tornado Bars */}
            <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-5 shadow-lg">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                5Y Spread Delta Sensitivity Tornado
              </h3>
              <p className="text-[11px] text-slate-400 mb-3">
                One-at-a-time parameter perturbation impact on 5Y spread shift (bp)
              </p>
              {isInsolvent ? (
                <div className="h-48 w-full flex items-center justify-center text-xs font-mono text-slate-400 border border-slate-800/80 rounded-lg bg-slate-950/50 p-4 text-center">
                  Sensitivity tornado n/a: issuer is insolvent in baseline scenario
                </div>
              ) : (
                <div className="space-y-2.5">
                  {tornadoData.map((item, idx) => {
                    const widthPct = Math.min(100, Math.max(4, (item.swingBp / maxTornadoSwing) * 100));
                    return (
                      <div key={item.parameter} className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-300 font-medium">{item.parameter}</span>
                          <span className="font-mono text-amber-300">
                            Swing: {formatAdaptiveBp(item.swingBp)} bp ({item.lowValue} → {item.highValue})
                          </span>
                        </div>
                        <div className="h-2.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                          <div
                            className={`h-full rounded-full ${
                              idx === 0
                                ? 'bg-rose-500'
                                : idx === 1
                                ? 'bg-amber-500'
                                : 'bg-cyan-500'
                            }`}
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Exact Repricing & Hazard Diagnostic Table */}
      <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-5 shadow-lg overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Exact ISDA CDS Hazard Bootstrap, Repricing &amp; Tenor-Shift Verification Table
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Piecewise-constant hazard rates λ_k calibrated via Brent&apos;s method. Notice that{' '}
              <span className="text-emerald-400 font-mono">λ_k</span> is the forward interval hazard
              while <span className="text-cyan-400 font-mono">Avg Hazard (-ln Q(T)/T)</span>{' '}
              compares directly to the Credit Triangle <span className="font-mono">s/(1-R)</span>.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
            <span className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300">
              Issuer: <strong className="text-white">{issuer.ticker}</strong> ({issuer.rating})
            </span>
            <span className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300">
              Scenario: <strong className="text-emerald-400">{scenario.name}</strong>
            </span>
            <span className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300">
              R = {(recovery * 100).toFixed(0)}% | r = {(issuer.riskFreeRate * 100).toFixed(2)}%
            </span>
            <span className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300">
              As-of: {issuer.asOfDate || '2026-10-15'}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400">
                <th className="py-2.5 px-3">Tenor</th>
                <th className="py-2.5 px-3">Proxy Spread</th>
                <th className="py-2.5 px-3">Repriced Par</th>
                <th className="py-2.5 px-3">Raw Error (bp)</th>
                <th className="py-2.5 px-3">Interval λ_k</th>
                <th className="py-2.5 px-3">Avg λ (-ln Q/T)</th>
                <th className="py-2.5 px-3">Triangle s/(1-R)</th>
                <th className="py-2.5 px-3">Climate Adj Spread</th>
                <th className="py-2.5 px-3">Tenor Shift Δ</th>
                <th className="py-2.5 px-3">RPV01 (Yrs)</th>
                <th className="py-2.5 px-3">Real CS01 (EUR/bp)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs font-mono">
              {repricingTable.map((row) => (
                <tr key={row.tenor} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-2.5 px-3 font-bold text-white">{row.tenor}</td>
                  <td className="py-2.5 px-3 text-cyan-400">{row.inputBp.toFixed(2)} bp</td>
                  <td className="py-2.5 px-3 text-slate-300">{row.repricedBp.toFixed(2)} bp</td>
                  <td className="py-2.5 px-3 text-emerald-400">{row.errorBp.toExponential(2)}</td>
                  <td className="py-2.5 px-3 text-slate-300">{row.intervalHazard.toFixed(3)}%</td>
                  <td className="py-2.5 px-3 text-cyan-300 font-semibold">
                    {row.avgHazard.toFixed(3)}%
                  </td>
                  <td className="py-2.5 px-3 text-slate-400">{row.approxTriangle.toFixed(3)}%</td>
                  <td className="py-2.5 px-3 text-amber-400 font-semibold">
                    {row.adjSpreadBp === null
                      ? 'n/a (insolvent)'
                      : `${row.adjSpreadBp.toFixed(
                          row.shiftBp !== null && Math.abs(row.shiftBp) > 0 && Math.abs(row.shiftBp) < 0.05 ? 4 : 2
                        )} bp`}
                  </td>
                  <td className="py-2.5 px-3 text-rose-400">
                    {row.shiftBp === null ? 'n/a' : `${formatAdaptiveBp(row.shiftBp, true)} bp`}
                  </td>
                  <td className="py-2.5 px-3 text-slate-300">{row.rpv01.toFixed(4)}</td>
                  <td className="py-2.5 px-3 text-emerald-300">€{row.cs01Eur.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Section 4.1: Per-Input Provenance & Source Verification Table */}
        <div className="mt-5 pt-4 border-t border-slate-800/80">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Per-Input Provenance &amp; Verification Status ({issuer.name} — {issuer.ticker})
            </h4>
            <span className="text-[11px] font-mono text-amber-300 bg-amber-500/10 px-2.5 py-0.5 rounded border border-amber-500/20">
              Proxy spreads loaded from data/raw/proxy_spreads.csv
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] font-mono uppercase text-slate-400">
                  <th className="py-2 px-3">Input Parameter</th>
                  <th className="py-2 px-3">Value</th>
                  <th className="py-2 px-3">As-Of Date</th>
                  <th className="py-2 px-3">Verification / Provenance Label</th>
                  <th className="py-2 px-3">Source Citation &amp; Reference Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 text-[11px] font-mono">
                {provenanceRows.map((pRow) => (
                  <tr key={pRow.label} className="hover:bg-slate-800/20">
                    <td className="py-2 px-3 text-slate-200 font-semibold">{pRow.label}</td>
                    <td className="py-2 px-3 text-cyan-400">{pRow.value}</td>
                    <td className="py-2 px-3 text-slate-400">{pRow.item.asOf}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] ${
                          pRow.item.verificationStatus.includes('rating-based proxies')
                            ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/25'
                            : 'bg-amber-500/10 text-amber-300 border border-amber-500/25'
                        }`}
                      >
                        {pRow.item.verificationStatus}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-400 font-sans">
                      <a
                        href={pRow.item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
                      >
                        <span>{pRow.item.citation}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Section 4.5: In-App Structural Assumptions & Model Limitations Section */}
      <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-5 shadow-lg">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-800">
          <BookOpen className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Structural Assumptions &amp; Model Limitations (In-App Reference)
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs text-slate-400 leading-relaxed">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3.5">
            <div className="font-bold text-slate-200 mb-1">1. Horizon Mismatch (1–10Y CDS vs. 25Y NGFS DCF)</div>
            <p>
              NGFS carbon cost projections run through 2050 (25 years), whereas liquid corporate CDS contracts trade at 1Y–10Y tenors. Applying the full 25Y present-value haircut at t=0 overstates short-dated credit risk; we bridge this via the Kenyon / Forvis Mazars (2023) logistic tenor ramp g(T), but this remains a reduced-form parameterisation.
            </p>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3.5">
            <div className="font-bold text-slate-200 mb-1">2. Scope 3 Omission by Default</div>
            <p>
              Default carbon haircuts price direct Scope 1 and indirect Scope 2 emissions only. For integrated oil and gas issuers (XOM, TTE), downstream Scope 3 Category 11 combustion represents &gt;80% of lifecycle emissions. Use the optional Scope 3 toggle above to test indirect demand/liability pass-through.
            </p>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3.5">
            <div className="font-bold text-slate-200 mb-1">3. Single Bullet Debt Maturity</div>
            <p>
              Both Merton (1974) and CreditGrades (2002) collapse an issuer&apos;s multi-tranche corporate bond ladder into a single effective liability barrier D. Real corporations refinance debt incrementally, meaning refinancing roll-over risk is only approximated.
            </p>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3.5">
            <div className="font-bold text-slate-200 mb-1">4. Shadow Carbon Price vs. Cash Tax</div>
            <p>
              NGFS Phase IV carbon prices represent macro-model marginal abatement shadow prices rather than enacted statutory cash carbon taxes across all operating jurisdictions. Treating them as 100% cash outflows (modulo pass-through) represents an upper-bound stress test.
            </p>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3.5">
            <div className="font-bold text-slate-200 mb-1">5. Continuous Diffusion Without Jumps</div>
            <p>
              Merton (1974) assumes continuous geometric Brownian motion asset paths, yielding near-zero short-dated default probabilities for low-leverage firms. CreditGrades (2002) introduces barrier uncertainty (λ = 0.3) to lift short-end spreads, but does not model Poisson jump-to-default events (cf. Livieri, Radi &amp; Smaniotto 2023).
            </p>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3.5">
            <div className="font-bold text-slate-200 mb-1">6. Rating-Based Proxy Spreads</div>
            <p>
              Baseline spread curves in <code className="text-cyan-400">data/raw/proxy_spreads.csv</code> are constructed from FRED ICE BofA rating-bucket OAS indices and Damodaran default spreads—not live dealer-quoted single-name CDS spreads from Markit or Bloomberg.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
