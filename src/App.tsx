/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Header, ActiveTab } from './components/Header';
import { KeyMetricsRibbon } from './components/KeyMetricsRibbon';
import { PricingDeskView } from './components/PricingDeskView';
import { MertonInspectorView } from './components/MertonInspectorView';
import { ValidationSuiteView } from './components/ValidationSuiteView';
import { MethodologyView } from './components/MethodologyView';
import { CodebaseViewer } from './components/CodebaseViewer';
import { PRESET_ISSUERS, IssuerProfile } from './data/issuers';
import {
  bootstrapHazardCurve,
  mertonCalibrate,
  computeClimateImpact,
  runTornadoAnalysis,
  runMonteCarloSimulation,
  NGFS_SCENARIOS,
  ClimateOverlayParams,
  MONTE_CARLO_DEFAULT_DRAWS,
  DEFAULT_MC_SEED,
  survivalProb,
  computeCdsLegs,
  computeCs01,
} from './lib/creditEngine';

export default function App() {
  const [selectedIssuer, setSelectedIssuer] = useState<IssuerProfile>(PRESET_ISSUERS[0]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('desk');
  const [scenarioId, setScenarioId] = useState<string>('net_zero_2050');
  const [recovery, setRecovery] = useState<number>(0.40);
  const [customSpreadsBp, setCustomSpreadsBp] = useState<number[] | null>(null);

  const [climateParams, setClimateParams] = useState<ClimateOverlayParams>({
    passThrough: 0.40,
    wacc: 0.08,
    taxRate: 0.25,
    horizonYears: 25,
    includeTerminalValue: false,
    terminalGrowthRate: 0.015,
    volUpliftFactor: 0.50,
    rampMidpointYears: 7.0,
    rampWidthYears: 2.0,
    includeScope3: false,
    scope3MtCo2: PRESET_ISSUERS[0].scope3MtCo2,
  });

  const handleSelectIssuer = (issuer: IssuerProfile) => {
    setSelectedIssuer(issuer);
    setCustomSpreadsBp(null);
    setClimateParams((prev) => ({
      ...prev,
      includeScope3: false,
      scope3MtCo2: issuer.scope3MtCo2,
    }));
  };

  const handleUpdateParams = (partial: Partial<ClimateOverlayParams>) => {
    setClimateParams((prev) => ({ ...prev, ...partial }));
  };

  const activeSpreadsBp = customSpreadsBp || selectedIssuer.proxySpreadsBp;
  const selectedScenario = NGFS_SCENARIOS[scenarioId] || NGFS_SCENARIOS.net_zero_2050;

  // 1. Bootstrap Baseline ISDA Hazard Curve (re-bootstraps whenever recovery or spreads change)
  const baseCurve = useMemo(() => {
    const spreadsDecimal = activeSpreadsBp.map((s) => s / 10000);
    return bootstrapHazardCurve(
      selectedIssuer.tenors,
      spreadsDecimal,
      recovery,
      selectedIssuer.riskFreeRate
    );
  }, [selectedIssuer, activeSpreadsBp, recovery]);

  // 2. Calibrate Merton Structural Parameters + CreditGrades (2002)
  const merton = useMemo(() => {
    const fiveYearSpreadDec = activeSpreadsBp[2] / 10000;
    return mertonCalibrate(
      selectedIssuer.equityUsdB * 1e9,
      selectedIssuer.equityVol,
      selectedIssuer.totalDebtUsdB * 1e9,
      selectedIssuer.riskFreeRate,
      5.0,
      fiveYearSpreadDec
    );
  }, [selectedIssuer, activeSpreadsBp]);

  // 3. Compute NGFS Climate Transition Overlay
  const climate = useMemo(() => {
    return computeClimateImpact(
      merton,
      baseCurve,
      activeSpreadsBp,
      selectedIssuer.scope1MtCo2,
      selectedIssuer.scope2MtCo2,
      selectedScenario,
      {
        ...climateParams,
        scope3MtCo2: selectedIssuer.scope3MtCo2,
      }
    );
  }, [merton, baseCurve, activeSpreadsBp, selectedIssuer, selectedScenario, climateParams]);

  // 4. Compute Parameter Sensitivity Tornado
  const tornadoData = useMemo(() => {
    return runTornadoAnalysis(
      merton,
      baseCurve,
      activeSpreadsBp,
      selectedIssuer.scope1MtCo2,
      selectedIssuer.scope2MtCo2,
      selectedScenario,
      {
        ...climateParams,
        scope3MtCo2: selectedIssuer.scope3MtCo2,
      }
    );
  }, [merton, baseCurve, activeSpreadsBp, selectedIssuer, selectedScenario, climateParams]);

  // 5. Compute Reproducible Seeded Monte Carlo Uncertainty Bands (Section 3.3 & 4.5)
  const mcResult = useMemo(() => {
    const scope3Active = climateParams.includeScope3 ? (selectedIssuer.scope3MtCo2 || 0) : 0;
    return runMonteCarloSimulation(
      merton,
      baseCurve,
      activeSpreadsBp,
      selectedIssuer.scope1MtCo2,
      selectedIssuer.scope2MtCo2,
      selectedScenario,
      MONTE_CARLO_DEFAULT_DRAWS,
      DEFAULT_MC_SEED,
      scope3Active
    );
  }, [merton, baseCurve, activeSpreadsBp, selectedIssuer, selectedScenario, climateParams.includeScope3]);

  // Section 4.2: CSV Export Handler using Blob, URL.createObjectURL, and URL.revokeObjectURL
  // with full metadata header (recovery, scenario, parameters, model version, as-of date, status flags)
  const handleExportCsv = () => {
    const isInsolvent = climate.status === 'insolvent_in_scenario';
    const scope3Included = Boolean(climateParams.includeScope3 && selectedIssuer.scope3MtCo2);
    const metadataLines = [
      `# Model: Climate-Adjusted Credit Curve & CDS Pricing Desk`,
      `# Model Version: v1.1.0 (ISDA Piecewise-Constant Hazard + CreditGrades 2002 + Logistic Tenor Ramp)`,
      `# Issuer: ${selectedIssuer.name} (${selectedIssuer.ticker}) | Rating: ${selectedIssuer.rating} | Sector: ${selectedIssuer.sector}`,
      `# Valuation As-Of Date: ${selectedIssuer.asOfDate || '2026-10-15'}`,
      `# Scenario: ${selectedScenario.name} (${selectedScenario.type})`,
      `# Recovery Rate (R): ${(recovery * 100).toFixed(1)}% | Risk-Free Rate (r): ${(selectedIssuer.riskFreeRate * 100).toFixed(2)}%`,
      `# Overlay Parameters: PassThrough=${(climateParams.passThrough * 100).toFixed(0)}%, WACC=${(climateParams.wacc * 100).toFixed(1)}%, TaxRate=${(climateParams.taxRate * 100).toFixed(0)}%, Horizon=${climateParams.horizonYears}Y, TerminalValue=${climateParams.includeTerminalValue}, VolUplift=${climateParams.volUpliftFactor.toFixed(1)}x, RampMidpoint=${(climateParams.rampMidpointYears ?? 7.0).toFixed(1)}Y, RampWidth=${(climateParams.rampWidthYears ?? 2.0).toFixed(1)}Y, IncludeScope3=${scope3Included}`,
      `# Status Flag: ${climate.status} | Exceeds Empirical Range (>300bp): ${climate.exceedsEmpiricalRange}`,
      `# Status Explanation: ${climate.statusExplanation}`,
      `# Headline 5Y Shift MC Range (N=${MONTE_CARLO_DEFAULT_DRAWS}, Seed=${DEFAULT_MC_SEED}): P5=${mcResult.p5.toFixed(2)}bp, Median=${mcResult.median.toFixed(2)}bp, P95=${mcResult.p95.toFixed(2)}bp`,
      `# Spread Source: ${selectedIssuer.spreadSource || selectedIssuer.dataProvenance}`,
      `# Balance Sheet Source: ${selectedIssuer.mertonSource || selectedIssuer.dataProvenance}`,
      `# Emissions Source: ${selectedIssuer.emissionsSource || selectedIssuer.dataProvenance}`,
    ];

    const headers = [
      'Issuer',
      'Rating',
      'Scenario',
      'Status_Flag',
      'Tenor_Years',
      'Proxy_Spread_bp',
      'Repriced_Spread_bp',
      'Repricing_Error_bp',
      'Forward_Interval_Hazard_Pct',
      'Avg_Cumulative_Hazard_Pct',
      'Credit_Triangle_Approx_Pct',
      'Climate_Adj_Spread_bp',
      'Tenor_Spread_Delta_bp',
      'MC_P5_Spread_bp',
      'MC_Median_Spread_bp',
      'MC_P95_Spread_bp',
      'Base_Survival_Prob_Pct',
      'Adj_Survival_Prob_Pct',
      'RPV01_Years',
      'Real_CS01_EUR_per_bp',
    ];

    const rows = selectedIssuer.tenors.map((t, i) => {
      const legs = computeCdsLegs(baseCurve, t);
      const repricedBp = legs.parSpreadBp;
      const errBp = Math.abs(repricedBp - activeSpreadsBp[i]);
      const survT = survivalProb(baseCurve, t);
      const avgHazPct = (-(Math.log(survT)) / t) * 100;
      const trianglePct = (activeSpreadsBp[i] / 10000 / (1 - recovery)) * 100;
      const adjSurv = isInsolvent ? null : (climate.adjustedSurvivalProbs[t - 1] ?? survT) * 100;
      const cs01Eur = computeCs01(baseCurve, t, 10_000_000);
      const band = mcResult.tenorBands[i];
      return [
        selectedIssuer.ticker,
        selectedIssuer.rating,
        selectedScenario.id,
        climate.status,
        t,
        activeSpreadsBp[i].toFixed(2),
        repricedBp.toFixed(6),
        errBp.toExponential(3),
        (baseCurve.hazardRates[i] * 100).toFixed(4),
        avgHazPct.toFixed(4),
        trianglePct.toFixed(4),
        isInsolvent ? 'n/a (insolvent in scenario)' : climate.adjustedSpreadsBp[i].toFixed(4),
        isInsolvent ? 'n/a (insolvent in scenario)' : climate.tenorShiftsBp[i].toFixed(4),
        isInsolvent || !band ? 'n/a' : band.spreadP5Bp.toFixed(4),
        isInsolvent || !band ? 'n/a' : band.spreadMedianBp.toFixed(4),
        isInsolvent || !band ? 'n/a' : band.spreadP95Bp.toFixed(4),
        (survT * 100).toFixed(3),
        adjSurv === null ? 'n/a (insolvent in scenario)' : adjSurv.toFixed(3),
        legs.rpv01.toFixed(4),
        cs01Eur.toFixed(2),
      ].join(',');
    });

    const csvString = [...metadataLines, headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `${selectedIssuer.ticker}_climate_cds_${selectedScenario.id}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      <Header
        selectedIssuer={selectedIssuer}
        onSelectIssuer={handleSelectIssuer}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onExportCsv={handleExportCsv}
      />

      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-6">
        <KeyMetricsRibbon
          issuer={selectedIssuer}
          merton={merton}
          climate={climate}
          baseCurve={baseCurve}
          mcResult={mcResult}
        />

        {activeTab === 'desk' && (
          <PricingDeskView
            issuer={selectedIssuer}
            baseCurve={baseCurve}
            merton={merton}
            climate={climate}
            mcResult={mcResult}
            scenario={selectedScenario}
            onSelectScenario={setScenarioId}
            climateParams={climateParams}
            onUpdateParams={handleUpdateParams}
            recovery={recovery}
            onUpdateRecovery={setRecovery}
            customSpreadsBp={customSpreadsBp}
            onUpdateCustomSpreads={setCustomSpreadsBp}
            tornadoData={tornadoData}
          />
        )}

        {activeTab === 'merton' && (
          <MertonInspectorView
            issuer={selectedIssuer}
            merton={merton}
            climate={climate}
          />
        )}

        {activeTab === 'validation' && (
          <ValidationSuiteView
            issuer={selectedIssuer}
            baseCurve={baseCurve}
            merton={merton}
            scenario={selectedScenario}
            params={{
              ...climateParams,
              scope3MtCo2: selectedIssuer.scope3MtCo2,
            }}
          />
        )}

        {activeTab === 'methodology' && <MethodologyView />}

        {activeTab === 'codebase' && <CodebaseViewer />}
      </main>

      <footer className="border-t border-slate-900 bg-slate-950 py-4 px-6 mt-12">
        <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <div>
            Climate-Adjusted Credit Curve &amp; CDS Pricing Desk (v1.1)
          </div>
          <div className="font-mono text-[11px] text-slate-400">
            O&apos;Kane &amp; Turnbull (2003) • Merton (1974) • CreditGrades (2002) • NGFS Phase IV
          </div>
        </div>
      </footer>
    </div>
  );
}
