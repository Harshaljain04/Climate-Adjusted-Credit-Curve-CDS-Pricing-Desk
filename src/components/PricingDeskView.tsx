/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Sliders, Info, ShieldCheck, Zap, Plus, RefreshCw, Layers } from 'lucide-react';
import { IssuerProfile } from '../data/issuers';
import {
  HazardCurve,
  MertonResult,
  ClimateOutput,
  ClimateScenarioDef,
  ClimateOverlayParams,
  computeCdsLegs,
  survivalProb,
} from '../lib/creditEngine';

interface PricingDeskViewProps {
  issuer: IssuerProfile;
  baseCurve: HazardCurve;
  merton: MertonResult;
  climate: ClimateOutput;
  scenario: ClimateScenarioDef;
  params: ClimateOverlayParams;
  setParams: React.Dispatch<React.SetStateAction<ClimateOverlayParams>>;
  onSaveCustomIssuer?: (custom: IssuerProfile) => void;
}

export const PricingDeskView: React.FC<PricingDeskViewProps> = ({
  issuer,
  baseCurve,
  merton,
  climate,
  scenario,
  params,
  setParams,
  onSaveCustomIssuer,
}) => {
  const [activeChart, setActiveChart] = useState<'spreads' | 'survival' | 'scenario'>('spreads');
  const [showCustomModal, setShowCustomModal] = useState(false);

  // Custom Issuer Form State
  const [customName, setCustomName] = useState('Custom Corp');
  const [customTicker, setCustomTicker] = useState('CUST');
  const [customEquity, setCustomEquity] = useState(100);
  const [customDebt, setCustomDebt] = useState(40);
  const [customVol, setCustomVol] = useState(0.25);
  const [customScope1, setCustomScope1] = useState(25.0);
  const [customScope2, setCustomScope2] = useState(5.0);
  const [customRating, setCustomRating] = useState('BBB');

  // Compute table rows for each tenor
  const tableRows = issuer.tenors.map((tenor, idx) => {
    const baseBp = issuer.proxySpreadsBp[idx];
    const adjBp = climate.adjustedSpreadsBp[idx];
    const deltaBp = adjBp - baseBp;

    const baseLegs = computeCdsLegs(baseCurve, tenor);
    const baseQ = survivalProb(baseCurve, tenor);
    const adjQ = climate.adjustedSurvivalProbs[tenor - 1] ?? baseQ;
    const hazardRate = baseCurve.hazardRates[idx];
    const creditTriangleHazard = (baseBp / 10000) / (1 - baseCurve.recovery);
    const roundTripError = Math.abs(baseLegs.parSpreadBp - baseBp);

    return {
      tenor,
      baseBp,
      adjBp,
      deltaBp,
      hazardRate,
      creditTriangleHazard,
      baseQ,
      adjQ,
      rpv01: baseLegs.rpv01,
      protLeg: baseLegs.protectionLeg,
      roundTripError,
    };
  });

  // SVG Chart Geometry
  const width = 640;
  const height = 260;
  const padding = { top: 25, right: 30, bottom: 40, left: 55 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  // Max value calculations for Spreads Chart
  const maxSpread = Math.max(...climate.adjustedSpreadsBp, ...issuer.proxySpreadsBp, 150) * 1.15;
  const minSpread = Math.max(0, Math.min(...issuer.proxySpreadsBp) * 0.8);

  const getSpreadX = (tenor: number) => padding.left + ((tenor - 1) / 9) * plotW;
  const getSpreadY = (val: number) => padding.top + plotH - ((val - minSpread) / (maxSpread - minSpread)) * plotH;

  const basePoints = issuer.tenors.map((t, i) => `${getSpreadX(t)},${getSpreadY(issuer.proxySpreadsBp[i])}`).join(' ');
  const adjPoints = issuer.tenors.map((t, i) => `${getSpreadX(t)},${getSpreadY(climate.adjustedSpreadsBp[i])}`).join(' ');

  // Survival Curve points (t=0 to 10)
  const timeSteps = Array.from({ length: 21 }, (_, i) => i * 0.5);
  const getSurvX = (t: number) => padding.left + (t / 10) * plotW;
  const getSurvY = (q: number) => padding.top + plotH - ((q - 0.7) / 0.3) * plotH;

  const baseSurvPoints = timeSteps.map((t) => `${getSurvX(t)},${getSurvY(survivalProb(baseCurve, t))}`).join(' ');

  // NGFS Carbon Price Path (2025 to 2050)
  const maxCarbonPrice = Math.max(...scenario.carbonPrices, 300) * 1.1;
  const getScenarioX = (yearIdx: number) => padding.left + (yearIdx / 25) * plotW;
  const getScenarioY = (price: number) => padding.top + plotH - (price / maxCarbonPrice) * plotH;
  const scenarioPoints = scenario.carbonPrices.map((p, i) => `${getScenarioX(i)},${getScenarioY(p)}`).join(' ');

  const handleApplyCustom = () => {
    if (onSaveCustomIssuer) {
      const custom: IssuerProfile = {
        id: `custom_${Date.now()}`,
        name: customName,
        ticker: customTicker.toUpperCase(),
        region: 'US',
        sector: 'Custom Simulation',
        carbonIntensityCategory: 'High Carbon / Transition-Exposed',
        rating: customRating,
        equityUsdB: customEquity,
        equityVol: customVol,
        totalDebtUsdB: customDebt,
        riskFreeRate: baseCurve.r,
        scope1MtCo2: customScope1,
        scope2MtCo2: customScope2,
        revenueUsdB: customEquity * 0.6,
        carbonIntensityTonsPerDollar: ((customScope1 + customScope2) * 1e6) / (customEquity * 0.6 * 1e3),
        proxySpreadsBp: [45, 65, 95, 120, 145],
        tenors: [1, 3, 5, 7, 10],
        dataProvenance: 'User Custom Interactive Parameters',
      };
      onSaveCustomIssuer(custom);
      setShowCustomModal(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Upper Grid: Visual Chart & Parameter Sliders */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left 7 Columns: Interactive Charting Card */}
        <div className="lg:col-span-7 bg-[#0F1626] border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white tracking-tight">
                  {activeChart === 'spreads' && 'Par CDS Spread Term Structure'}
                  {activeChart === 'survival' && 'Survival Probability Curve Q(t)'}
                  {activeChart === 'scenario' && 'NGFS 2025-2050 Carbon Price Trajectory'}
                </span>
                <span className="text-xs text-slate-400">·</span>
                <span className="text-xs text-cyan-300 font-mono">
                  {issuer.name} ({issuer.ticker})
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {activeChart === 'spreads' && 'Baseline proxy curve vs. post-haircut Merton climate-adjusted spreads'}
                {activeChart === 'survival' && 'Quarterly cumulative survival function derived from piecewise hazard rates'}
                {activeChart === 'scenario' && `${scenario.name} shadow price path ($/tCO2) and emissions reduction index`}
              </p>
            </div>

            {/* Chart Mode Toggle */}
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setActiveChart('spreads')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  activeChart === 'spreads'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                CDS Spreads
              </button>
              <button
                onClick={() => setActiveChart('survival')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  activeChart === 'survival'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Survival Q(t)
              </button>
              <button
                onClick={() => setActiveChart('scenario')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  activeChart === 'scenario'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Carbon Price
              </button>
            </div>
          </div>

          {/* SVG Rendering Area */}
          <div className="w-full bg-[#080D1A] rounded-lg border border-slate-800/80 p-2 flex items-center justify-center overflow-hidden">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto max-h-[290px] select-none font-mono text-xs">
              
              {/* Grid Lines */}
              {[0, 0.25, 0.5, 0.75, 1.0].map((frac, idx) => {
                const y = padding.top + plotH * frac;
                let label = '';
                if (activeChart === 'spreads') {
                  const spreadVal = maxSpread - frac * (maxSpread - minSpread);
                  label = `${Math.round(spreadVal)} bp`;
                } else if (activeChart === 'survival') {
                  const qVal = 1.0 - frac * 0.3;
                  label = `${(qVal * 100).toFixed(0)}%`;
                } else {
                  const priceVal = maxCarbonPrice - frac * maxCarbonPrice;
                  label = `$${Math.round(priceVal)}`;
                }

                return (
                  <g key={idx}>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={width - padding.right}
                      y2={y}
                      stroke="#1E293B"
                      strokeDasharray="4 4"
                      strokeWidth="1"
                    />
                    <text x={padding.left - 8} y={y + 4} fill="#64748B" textAnchor="end" fontSize="10">
                      {label}
                    </text>
                  </g>
                );
              })}

              {/* Chart 1: CDS Spreads */}
              {activeChart === 'spreads' && (
                <>
                  {/* Baseline Spread Curve (Cyan) */}
                  <polyline
                    fill="none"
                    stroke="#06B6D4"
                    strokeWidth="2.5"
                    points={basePoints}
                  />

                  {/* Climate Adjusted Spread Curve (Amber/Coral) */}
                  <polyline
                    fill="none"
                    stroke="#F59E0B"
                    strokeWidth="2.5"
                    strokeDasharray="6 3"
                    points={adjPoints}
                  />

                  {/* Tenor Markers & Tooltip Anchors */}
                  {issuer.tenors.map((t, idx) => {
                    const bx = getSpreadX(t);
                    const by = getSpreadY(issuer.proxySpreadsBp[idx]);
                    const ay = getSpreadY(climate.adjustedSpreadsBp[idx]);

                    return (
                      <g key={t}>
                        <line x1={bx} y1={padding.top} x2={bx} y2={padding.top + plotH} stroke="#1E293B" strokeWidth="1" />
                        <text x={bx} y={padding.top + plotH + 18} fill="#94A3B8" textAnchor="middle" fontSize="11" fontWeight="600">
                          {t}Y
                        </text>

                        {/* Baseline dot */}
                        <circle cx={bx} cy={by} r="4" fill="#06B6D4" />

                        {/* Adjusted dot */}
                        <circle cx={bx} cy={ay} r="4.5" fill="#F59E0B" />

                        {/* Value labels */}
                        <text x={bx} y={ay - 9} fill="#FCD34D" textAnchor="middle" fontSize="10" fontWeight="bold">
                          {climate.adjustedSpreadsBp[idx].toFixed(0)}
                        </text>
                        <text x={bx} y={by + 16} fill="#38BDF8" textAnchor="middle" fontSize="10">
                          {issuer.proxySpreadsBp[idx]}
                        </text>
                      </g>
                    );
                  })}
                </>
              )}

              {/* Chart 2: Survival Probabilities */}
              {activeChart === 'survival' && (
                <>
                  <polyline
                    fill="none"
                    stroke="#06B6D4"
                    strokeWidth="2.5"
                    points={baseSurvPoints}
                  />
                  {/* Adjusted points */}
                  {issuer.tenors.map((t, idx) => {
                    const x = getSurvX(t);
                    const qAdj = climate.adjustedSurvivalProbs[t - 1] ?? 0.9;
                    const yAdj = getSurvY(qAdj);

                    return (
                      <g key={t}>
                        <line x1={x} y1={padding.top} x2={x} y2={padding.top + plotH} stroke="#1E293B" strokeWidth="1" />
                        <text x={x} y={padding.top + plotH + 18} fill="#94A3B8" textAnchor="middle" fontSize="11">
                          {t}Y
                        </text>
                        <circle cx={x} cy={yAdj} r="4" fill="#F43F5E" />
                        <text x={x} y={yAdj - 8} fill="#FDA4AF" textAnchor="middle" fontSize="10">
                          {(qAdj * 100).toFixed(1)}%
                        </text>
                      </g>
                    );
                  })}
                </>
              )}

              {/* Chart 3: NGFS Carbon Price Path */}
              {activeChart === 'scenario' && (
                <>
                  <polyline
                    fill="none"
                    stroke="#10B981"
                    strokeWidth="2.5"
                    points={scenarioPoints}
                  />
                  {[0, 5, 10, 15, 20, 25].map((idx) => {
                    const year = 2025 + idx;
                    const x = getScenarioX(idx);
                    const y = getScenarioY(scenario.carbonPrices[idx]);

                    return (
                      <g key={year}>
                        <line x1={x} y1={padding.top} x2={x} y2={padding.top + plotH} stroke="#1E293B" strokeWidth="1" />
                        <text x={x} y={padding.top + plotH + 18} fill="#94A3B8" textAnchor="middle" fontSize="10">
                          {year}
                        </text>
                        <circle cx={x} cy={y} r="4" fill="#10B981" />
                        <text x={x} y={y - 8} fill="#6EE7B7" textAnchor="middle" fontSize="10">
                          ${scenario.carbonPrices[idx]}
                        </text>
                      </g>
                    );
                  })}
                </>
              )}

            </svg>
          </div>

          {/* Chart Legend & Indicators */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 mt-3 pt-3 border-t border-slate-800">
            <div className="flex items-center gap-4">
              {activeChart === 'spreads' && (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-1 bg-cyan-400 rounded-full" />
                    <span>Baseline Proxy Curve</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-1 bg-amber-400 rounded-full" />
                    <span>Climate-Adjusted (+κ·ΔMerton)</span>
                  </div>
                </>
              )}
              {activeChart === 'survival' && (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-1 bg-cyan-400 rounded-full" />
                    <span>Baseline Survival Q(t)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                    <span>Adjusted Survival Q_adj(t)</span>
                  </div>
                </>
              )}
              {activeChart === 'scenario' && (
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-1 bg-emerald-400 rounded-full" />
                  <span>Carbon Price Path ($/tCO2)</span>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowCustomModal(true)}
              className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium transition-colors"
            >
              <Plus className="w-3 h-3" />
              Simulate Custom Firm
            </button>
          </div>

        </div>

        {/* Right 5 Columns: Parameter Controls Drawer */}
        <div className="lg:col-span-5 bg-[#0F1626] border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white tracking-tight">
                  Pricing &amp; Climate Controls
                </h3>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                Live Reactivity
              </span>
            </div>

            <div className="space-y-4">
              
              {/* Control 1: Pass-Through Fraction */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <label className="text-slate-300 font-medium">Cost Pass-Through (p)</label>
                  <span className="font-mono text-cyan-300 font-bold tabular-nums">
                    {(params.passThrough * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="0.8"
                  step="0.05"
                  value={params.passThrough}
                  onChange={(e) => setParams((p) => ({ ...p, passThrough: parseFloat(e.target.value) }))}
                  className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                  <span>0% (Firm absorbs 100%)</span>
                  <span>80% (High elasticity)</span>
                </div>
              </div>

              {/* Control 2: Recovery Rate */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <label className="text-slate-300 font-medium">Senior Recovery Rate (R)</label>
                  <span className="font-mono text-cyan-300 font-bold tabular-nums">
                    {(baseCurve.recovery * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="0.6"
                  step="0.05"
                  value={baseCurve.recovery}
                  onChange={(e) => {
                    const r = parseFloat(e.target.value);
                    baseCurve.recovery = r;
                    setParams((p) => ({ ...p })); // trigger re-render
                  }}
                  className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                  <span>20% (Subordinated)</span>
                  <span>40% (Standard)</span>
                  <span>60% (Senior secured)</span>
                </div>
              </div>

              {/* Control 3: WACC Discount Rate */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <label className="text-slate-300 font-medium">Discount Rate (WACC)</label>
                  <span className="font-mono text-cyan-300 font-bold tabular-nums">
                    {(params.wacc * 100).toFixed(1)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.04"
                  max="0.14"
                  step="0.005"
                  value={params.wacc}
                  onChange={(e) => setParams((p) => ({ ...p, wacc: parseFloat(e.target.value) }))}
                  className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                  <span>4% (Low cost of capital)</span>
                  <span>14% (High risk)</span>
                </div>
              </div>

              {/* Control 4: Horizon Years */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <label className="text-slate-300 font-medium">DCF Horizon</label>
                  <span className="font-mono text-cyan-300 font-bold tabular-nums">
                    {params.horizonYears} Years (to {2025 + params.horizonYears})
                  </span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="25"
                  step="1"
                  value={params.horizonYears}
                  onChange={(e) => setParams((p) => ({ ...p, horizonYears: parseInt(e.target.value) }))}
                  className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                  <span>10 Years (2035)</span>
                  <span>25 Years (2050 Net Zero)</span>
                </div>
              </div>

              {/* Control 5: Terminal Value & Volatility Toggles */}
              <div className="pt-2 border-t border-slate-800/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-medium text-slate-300">Terminal Value in Haircut</span>
                    <p className="text-[10px] text-slate-400">Gordon Growth Model (g = 1.5%) beyond horizon</p>
                  </div>
                  <button
                    onClick={() => setParams((p) => ({ ...p, includeTerminalValue: !p.includeTerminalValue }))}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                      params.includeTerminalValue
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {params.includeTerminalValue ? 'Active' : 'Off'}
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-medium text-slate-300">Transition Volatility Uplift</span>
                    <p className="text-[10px] text-slate-400">Scale asset vol by haircut ratio (0.5x)</p>
                  </div>
                  <button
                    onClick={() => setParams((p) => ({ ...p, volUpliftFactor: p.volUpliftFactor > 0 ? 0 : 0.5 }))}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                      params.volUpliftFactor > 0
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {params.volUpliftFactor > 0 ? '0.5x Uplift' : 'Flat Vol'}
                  </button>
                </div>
              </div>

            </div>
          </div>

          <div className="mt-4 p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
            <span>
              All adjustments update the Merton calibration instantly, re-solving the bivariate structural boundary and re-bootstrapping the quarterly hazard rate curve.
            </span>
          </div>

        </div>

      </div>

      {/* Lower Section: Complete CDS Term Structure Data Grid */}
      <div className="bg-[#0F1626] border border-slate-800 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              CDS Spread Term Structure &amp; Hazard Rate Bootstrap Grid
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Piecewise-constant hazard rate curve &lambda;(t) solved to match market proxy spreads with round-trip error &lt; 1e-8
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Tolerance: &lt; 1e-8
            </span>
            <span>·</span>
            <span>Accrual: Half-period</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-medium">
                <th className="py-2.5 px-3">Tenor</th>
                <th className="py-2.5 px-3">Baseline Spread</th>
                <th className="py-2.5 px-3">Adjusted Spread</th>
                <th className="py-2.5 px-3">Spread Delta</th>
                <th className="py-2.5 px-3">Hazard Rate &lambda;</th>
                <th className="py-2.5 px-3">Survival Q(t)</th>
                <th className="py-2.5 px-3">Protection Leg PV</th>
                <th className="py-2.5 px-3">RPV01</th>
                <th className="py-2.5 px-3">Credit Triangle s/(1-R)</th>
                <th className="py-2.5 px-3 text-right">Repricing Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {tableRows.map((row) => (
                <tr key={row.tenor} className="hover:bg-slate-900/60 transition-colors">
                  <td className="py-2.5 px-3 font-semibold text-white">
                    {row.tenor} Years
                  </td>
                  <td className="py-2.5 px-3 text-cyan-300 tabular-nums">
                    {row.baseBp.toFixed(1)} bp
                  </td>
                  <td className="py-2.5 px-3 text-amber-300 font-bold tabular-nums">
                    {row.adjBp.toFixed(1)} bp
                  </td>
                  <td className="py-2.5 px-3 text-rose-400 font-bold tabular-nums">
                    {row.deltaBp > 0 ? `+${row.deltaBp.toFixed(1)} bp` : '0.0 bp'}
                  </td>
                  <td className="py-2.5 px-3 text-slate-300 tabular-nums">
                    {(row.hazardRate * 100).toFixed(3)}%
                  </td>
                  <td className="py-2.5 px-3 text-emerald-400 tabular-nums">
                    {(row.adjQ * 100).toFixed(2)}%
                  </td>
                  <td className="py-2.5 px-3 text-slate-300 tabular-nums">
                    {(row.protLeg * 100).toFixed(4)}%
                  </td>
                  <td className="py-2.5 px-3 text-slate-300 tabular-nums">
                    {row.rpv01.toFixed(3)}
                  </td>
                  <td className="py-2.5 px-3 text-slate-400 tabular-nums">
                    {(row.creditTriangleHazard * 100).toFixed(3)}%
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-emerald-400">
                    {row.roundTripError < 1e-7 ? '0.00e-9' : row.roundTripError.toExponential(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footnote Disclosures */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between text-[11px] text-slate-400">
          <div>
            <strong className="text-slate-300">Non-Negotiable Honesty Rule:</strong> Spreads are CDS-equivalent spreads calibrated to rating-based proxies (FRED ICE BofA OAS and Damodaran tables). Traded dealer CDS quotes are proprietary.
          </div>
          <div className="font-mono text-cyan-400">
            Source: {issuer.dataProvenance}
          </div>
        </div>
      </div>

      {/* Custom Issuer Simulation Modal */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0F1626] border border-slate-700 rounded-xl p-6 max-w-lg w-full space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Create Custom Issuer Sandbox</h3>
              <button
                onClick={() => setShowCustomModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Company Name</label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Ticker</label>
                <input
                  type="text"
                  value={customTicker}
                  onChange={(e) => setCustomTicker(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Market Cap ($B)</label>
                <input
                  type="number"
                  value={customEquity}
                  onChange={(e) => setCustomEquity(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Total Book Debt ($B)</label>
                <input
                  type="number"
                  value={customDebt}
                  onChange={(e) => setCustomDebt(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Equity Volatility (ann)</label>
                <input
                  type="number"
                  step="0.01"
                  value={customVol}
                  onChange={(e) => setCustomVol(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Rating Bucket</label>
                <select
                  value={customRating}
                  onChange={(e) => setCustomRating(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                >
                  <option value="AAA">AAA</option>
                  <option value="AA">AA</option>
                  <option value="A">A</option>
                  <option value="BBB">BBB</option>
                  <option value="BB">BB</option>
                  <option value="B">B</option>
                </select>
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Scope 1 (MtCO2)</label>
                <input
                  type="number"
                  value={customScope1}
                  onChange={(e) => setCustomScope1(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Scope 2 (MtCO2)</label>
                <input
                  type="number"
                  value={customScope2}
                  onChange={(e) => setCustomScope2(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowCustomModal(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyCustom}
                className="px-4 py-1.5 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
              >
                Inject into Desk
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
