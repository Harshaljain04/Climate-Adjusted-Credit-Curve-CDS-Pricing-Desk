/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Climate-Adjusted Credit Curve & CDS Pricing Desk
 * Author: Harshal Jain | GrEnFIn Application Portfolio
 */

import React, { useState, useMemo } from 'react';
import { Header } from './components/Header';
import { KeyMetricsRibbon } from './components/KeyMetricsRibbon';
import { PricingDeskView } from './components/PricingDeskView';
import { MertonInspectorView } from './components/MertonInspectorView';
import { ValidationSuiteView } from './components/ValidationSuiteView';
import { MethodologyView } from './components/MethodologyView';
import { CodebaseViewer } from './components/CodebaseViewer';
import { PRESET_ISSUERS, IssuerProfile } from './data/issuers';
import {
  NGFS_SCENARIOS,
  ClimateScenarioDef,
  ClimateOverlayParams,
  bootstrapHazardCurve,
  mertonCalibrate,
  computeClimateImpact,
} from './lib/creditEngine';

const DEFAULT_PARAMS: ClimateOverlayParams = {
  passThrough: 0.40,
  wacc: 0.08,
  taxRate: 0.25,
  horizonYears: 25,
  includeTerminalValue: false,
  terminalGrowthRate: 0.015,
  volUpliftFactor: 0.50,
};

export default function App() {
  const [currentTab, setCurrentTab] = useState<'desk' | 'merton' | 'validation' | 'methodology' | 'codebase'>('desk');
  const [selectedIssuer, setSelectedIssuer] = useState<IssuerProfile>(PRESET_ISSUERS[0]);
  const [selectedScenario, setSelectedScenario] = useState<ClimateScenarioDef>(NGFS_SCENARIOS.net_zero_2050);
  const [params, setParams] = useState<ClimateOverlayParams>(DEFAULT_PARAMS);

  // Core Quantitative Calibrations (Instant Client Reactivity)
  const baseCurve = useMemo(() => {
    const spreadsDecimals = selectedIssuer.proxySpreadsBp.map((s) => s / 10000);
    return bootstrapHazardCurve(
      selectedIssuer.tenors,
      spreadsDecimals,
      0.40,
      selectedIssuer.riskFreeRate
    );
  }, [selectedIssuer]);

  const merton = useMemo(() => {
    const E = selectedIssuer.equityUsdB * 1e9;
    const D = selectedIssuer.totalDebtUsdB * 1e9;
    const proxy5y = selectedIssuer.proxySpreadsBp[2] / 10000;
    return mertonCalibrate(
      E,
      selectedIssuer.equityVol,
      D,
      selectedIssuer.riskFreeRate,
      5.0,
      proxy5y
    );
  }, [selectedIssuer]);

  const climate = useMemo(() => {
    return computeClimateImpact(
      merton,
      baseCurve,
      selectedIssuer.proxySpreadsBp,
      selectedIssuer.scope1MtCo2,
      selectedIssuer.scope2MtCo2,
      selectedScenario,
      params
    );
  }, [merton, baseCurve, selectedIssuer, selectedScenario, params]);

  const base5ySpreadBp = selectedIssuer.proxySpreadsBp[2];
  const adjusted5ySpreadBp = climate.adjustedSpreadsBp[2];

  const handleReset = () => {
    setParams(DEFAULT_PARAMS);
    baseCurve.recovery = 0.40;
  };

  const handleExportCsv = () => {
    const headers = [
      'Tenor_Years',
      'Baseline_Spread_bp',
      'Adjusted_Spread_bp',
      'Delta_Spread_bp',
      'Hazard_Rate_lambda',
      'Survival_Prob_Q',
    ];
    const rows = selectedIssuer.tenors.map((t, i) => [
      t,
      selectedIssuer.proxySpreadsBp[i],
      climate.adjustedSpreadsBp[i],
      (climate.adjustedSpreadsBp[i] - selectedIssuer.proxySpreadsBp[i]).toFixed(1),
      baseCurve.hazardRates[i].toFixed(5),
      climate.adjustedSurvivalProbs[t - 1]?.toFixed(4) || 'N/A',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [
        `# Issuer: ${selectedIssuer.name} (${selectedIssuer.ticker}) | Scenario: ${selectedScenario.name}`,
        `# Pass-Through: ${(params.passThrough * 100).toFixed(0)}% | WACC: ${(params.wacc * 100).toFixed(1)}% | Recovery: ${(baseCurve.recovery * 100).toFixed(0)}%`,
        headers.join(','),
        ...rows.map((e) => e.join(',')),
      ].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `CDS_${selectedIssuer.ticker}_${selectedScenario.id}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSaveCustomIssuer = (custom: IssuerProfile) => {
    setSelectedIssuer(custom);
  };

  return (
    <div className="min-h-screen bg-[#070B13] text-[#F8FAFC] flex flex-col font-sans">
      {/* Institutional Quant Header */}
      <Header
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        selectedIssuer={selectedIssuer}
        setSelectedIssuer={setSelectedIssuer}
        selectedScenario={selectedScenario}
        setSelectedScenario={setSelectedScenario}
        onReset={handleReset}
        onExportCsv={handleExportCsv}
      />

      {/* Main Trading Desk Content */}
      <main className="flex-1 max-w-[1720px] w-full mx-auto px-4 lg:px-6 py-6">
        
        {/* Top Key Metrics Ribbon (visible across Desk, Merton, and Validation tabs) */}
        <KeyMetricsRibbon
          issuer={selectedIssuer}
          baseCurve={baseCurve}
          merton={merton}
          climate={climate}
          base5ySpreadBp={base5ySpreadBp}
          adjusted5ySpreadBp={adjusted5ySpreadBp}
        />

        {/* View Routing */}
        {currentTab === 'desk' && (
          <PricingDeskView
            issuer={selectedIssuer}
            baseCurve={baseCurve}
            merton={merton}
            climate={climate}
            scenario={selectedScenario}
            params={params}
            setParams={setParams}
            onSaveCustomIssuer={handleSaveCustomIssuer}
          />
        )}

        {currentTab === 'merton' && (
          <MertonInspectorView
            issuer={selectedIssuer}
            merton={merton}
            climate={climate}
          />
        )}

        {currentTab === 'validation' && (
          <ValidationSuiteView
            issuer={selectedIssuer}
            baseCurve={baseCurve}
            merton={merton}
            scenario={selectedScenario}
            params={params}
          />
        )}

        {currentTab === 'methodology' && (
          <MethodologyView
            issuer={selectedIssuer}
            merton={merton}
            climate={climate}
            base5ySpreadBp={base5ySpreadBp}
            adjusted5ySpreadBp={adjusted5ySpreadBp}
          />
        )}

        {currentTab === 'codebase' && (
          <CodebaseViewer />
        )}

      </main>

      {/* Institutional Quant Desk Footer */}
      <footer className="border-t border-slate-800/80 bg-[#070B13] text-slate-400 text-xs py-4 px-4 lg:px-6">
        <div className="max-w-[1720px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-300">Climate-Adjusted Credit Curve &amp; CDS Pricing Desk (v1.0)</span>
          </div>

          <div className="text-[11px] text-slate-400">
            Market spreads are calibrated to rating proxies (FRED ICE BofA &amp; Damodaran tables). Verified against QuantLib Python API.
          </div>
        </div>
      </footer>
    </div>
  );
}
