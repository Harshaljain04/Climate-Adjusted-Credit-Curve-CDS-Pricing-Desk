/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Building2,
  Info,
  ArrowDown,
  Activity,
  RefreshCw,
} from 'lucide-react';
import {
  MertonResult,
  ClimateOutput,
  mertonCalibrate,
  mulberry32,
  MONTE_CARLO_DEFAULT_DRAWS,
  DEFAULT_MC_SEED,
} from '../lib/creditEngine';
import { IssuerProfile } from '../data/issuers';

interface MertonInspectorViewProps {
  issuer: IssuerProfile;
  merton: MertonResult;
  climate: ClimateOutput;
}

export const MertonInspectorView: React.FC<MertonInspectorViewProps> = ({
  issuer,
  merton,
  climate,
}) => {
  const baseAssetB = merton.assetValue / 1e9;
  const shockedAssetB = climate.shockedAssetValue / 1e9;
  const debtB = merton.debtValue / 1e9;
  const equityB = merton.equityValue / 1e9;
  const haircutB = climate.totalHaircutUsd / 1e9;
  const isInsolvent = climate.status === 'insolvent_in_scenario';

  const baseCushionPct = ((baseAssetB - debtB) / baseAssetB) * 100;
  const shockedCushionPct = shockedAssetB > 0 ? ((shockedAssetB - debtB) / shockedAssetB) * 100 : -100;

  const formatRawKappa = (k: number): string => {
    if (!Number.isFinite(k)) return '∞ (Merton spread ≈ 0)';
    if (k >= 1000) return `${k.toExponential(2)}x`;
    return `${k.toFixed(2)}x`;
  };

  // =========================================================================
  // Seeded Monte Carlo Equity Volatility Simulation State (Section 3.3)
  // =========================================================================
  const [showMonteCarlo, setShowMonteCarlo] = useState(false);
  const [volStressMultiplier, setVolStressMultiplier] = useState(1.4);
  const [volDispersionPct, setVolDispersionPct] = useState(25);
  const [mcSeed, setMcSeed] = useState<number>(DEFAULT_MC_SEED);
  const mcDrawCount = MONTE_CARLO_DEFAULT_DRAWS;

  const mcResults = useMemo(() => {
    if (!showMonteCarlo) return null;

    const rng = mulberry32(mcSeed);
    const baseVol = issuer.equityVol;
    const meanVol = baseVol * volStressMultiplier;
    const stdVol = meanVol * (volDispersionPct / 100) * 0.5;

    const ddList: number[] = [];
    const pdList: number[] = [];
    const spreadList: number[] = [];

    const E = issuer.equityUsdB * 1e9;
    const D = issuer.totalDebtUsdB * 1e9;
    const r = issuer.riskFreeRate;

    for (let i = 0; i < mcDrawCount; i++) {
      const u1 = Math.max(1e-7, rng());
      const u2 = rng();
      const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

      const sampledVol = Math.max(0.05, Math.min(2.0, meanVol + z * stdVol));
      const res = mertonCalibrate(E, sampledVol, D, r, 5.0, issuer.proxySpreadsBp[2] / 10000);
      ddList.push(res.distanceToDefault);
      pdList.push(res.riskNeutralPd * 100);
      spreadList.push(res.modelSpreadBp);
    }

    ddList.sort((a, b) => a - b);
    pdList.sort((a, b) => a - b);
    spreadList.sort((a, b) => a - b);

    const getStats = (arr: number[]) => {
      const sum = arr.reduce((acc, v) => acc + v, 0);
      const mean = sum / arr.length;
      const median = arr[Math.floor(arr.length * 0.5)];
      const p5 = arr[Math.floor(arr.length * 0.05)];
      const p95 = arr[Math.floor(arr.length * 0.95)];
      const min = arr[0];
      const max = arr[arr.length - 1];
      return { mean, median, p5, p95, min, max };
    };

    const ddStats = getStats(ddList);
    const pdStats = getStats(pdList);
    const spreadStats = getStats(spreadList);

    const ddMin = Math.max(-0.5, Math.floor(ddStats.p5 * 0.8));
    const ddMax = Math.ceil(ddStats.p95 * 1.2);
    const ddBinW = Math.max(0.2, (ddMax - ddMin) / 12);
    const ddBins = Array.from({ length: 12 }, (_, idx) => {
      const start = ddMin + idx * ddBinW;
      const end = start + ddBinW;
      return { start, end, count: 0 };
    });

    for (const d of ddList) {
      for (const b of ddBins) {
        if (d >= b.start && (d < b.end || b === ddBins[ddBins.length - 1])) {
          b.count++;
          break;
        }
      }
    }

    const pdMin = 0;
    const pdMax = Math.max(10, Math.ceil(pdStats.p95 * 1.2));
    const pdBinW = Math.max(0.5, (pdMax - pdMin) / 12);
    const pdBins = Array.from({ length: 12 }, (_, idx) => {
      const start = pdMin + idx * pdBinW;
      const end = start + pdBinW;
      return { start, end, count: 0 };
    });

    for (const p of pdList) {
      for (const b of pdBins) {
        if (p >= b.start && (p < b.end || b === pdBins[pdBins.length - 1])) {
          b.count++;
          break;
        }
      }
    }

    return {
      meanVol,
      ddStats,
      pdStats,
      spreadStats,
      ddBins,
      pdBins,
    };
  }, [showMonteCarlo, volStressMultiplier, volDispersionPct, mcDrawCount, mcSeed, issuer]);

  const handleApplyPreset = (mult: number, disp: number) => {
    setVolStressMultiplier(mult);
    setVolDispersionPct(disp);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Bar with Monte Carlo Toggle Switch */}
      <div className="bg-[#0F1626] border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-cyan-950/80 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              Merton (1974) &amp; CreditGrades (2002) Structural Inspector
            </h2>
            <p className="text-[11px] text-slate-400">
              Invert observable equity capitalization and volatility into unobserved asset value, barrier uncertainty, and default metrics
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowMonteCarlo(!showMonteCarlo)}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm ${
              showMonteCarlo
                ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 border border-amber-400'
                : 'bg-slate-800 text-cyan-300 hover:bg-slate-700 border border-slate-700'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{showMonteCarlo ? 'Monte Carlo: Active' : 'Enable Volatility Monte Carlo'}</span>
          </button>
        </div>
      </div>

      {/* Dynamic Monte Carlo Volatility Shock Section */}
      {showMonteCarlo && mcResults && (
        <div className="bg-[#0F1626] border border-amber-500/40 rounded-xl p-5 space-y-5">
          
          <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                  <Activity className="w-4 h-4 text-amber-400" />
                  Equity Volatility Monte Carlo Shock Engine
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950/70 border border-amber-600/40 text-amber-300 font-mono">
                  {mcDrawCount.toLocaleString()} Draws · Seed: {mcSeed}
                </span>
                <button
                  onClick={() => setMcSeed(((mcSeed * 1664525 + 1013904223) >>> 0) || 1)}
                  className="px-2 py-0.5 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded border border-slate-700 flex items-center gap-1"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  New Seed
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Stress-testing Distance to Default (DD) and Default Probability (PD) under seeded stochastic equity volatility (mulberry32)
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">Stress Presets:</span>
              <button
                onClick={() => handleApplyPreset(1.2, 15)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors ${
                  volStressMultiplier === 1.2
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                +20% Mild
              </button>
              <button
                onClick={() => handleApplyPreset(1.5, 25)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors ${
                  volStressMultiplier === 1.5
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                +50% Turmoil
              </button>
              <button
                onClick={() => handleApplyPreset(2.0, 35)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors ${
                  volStressMultiplier === 2.0
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                2.0x Black Swan
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-900/60 p-4 rounded-lg border border-slate-800">
            <div>
              <div className="flex justify-between text-xs mb-1 font-mono">
                <span className="text-slate-300 font-sans">Vol Stress Multiplier</span>
                <span className="text-amber-400 font-bold tabular-nums">
                  {volStressMultiplier.toFixed(2)}x ({(mcResults.meanVol * 100).toFixed(1)}% vs {(issuer.equityVol * 100).toFixed(1)}%)
                </span>
              </div>
              <input
                type="range"
                min="0.8"
                max="2.5"
                step="0.05"
                value={volStressMultiplier}
                onChange={(e) => setVolStressMultiplier(parseFloat(e.target.value))}
                className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1 font-mono">
                <span className="text-slate-300 font-sans">Dispersion (Std Dev)</span>
                <span className="text-cyan-300 font-bold tabular-nums">
                  ±{volDispersionPct}%
                </span>
              </div>
              <input
                type="range"
                min="5"
                max="50"
                step="5"
                value={volDispersionPct}
                onChange={(e) => setVolDispersionPct(parseInt(e.target.value))}
                className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            <div className="bg-[#0A0F1D] p-3 rounded border border-slate-800 flex flex-col justify-between text-xs font-mono">
              <div className="flex justify-between items-center text-[11px] text-slate-400">
                <span>Base DD: {merton.distanceToDefault.toFixed(2)} σ</span>
                <span className="text-amber-400 font-bold">
                  Shock Median: {mcResults.ddStats.median.toFixed(2)} σ
                </span>
              </div>
              <div className="flex justify-between items-center text-[11px] mt-1 pt-1 border-t border-slate-800/80">
                <span className="text-slate-400">P5 Severe DD:</span>
                <span className="text-rose-400 font-bold">
                  {mcResults.ddStats.p5.toFixed(2)} σ
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-[#080D1A] rounded-lg border border-slate-800 p-4 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                  Distance to Default (DD) Shift Distribution
                </span>
                <span className="text-slate-400 font-mono text-[11px]">
                  Critical Zone: &lt; 1.5 σ
                </span>
              </div>

              <div className="w-full h-40 select-none font-mono text-xs">
                <svg viewBox="0 0 400 130" className="w-full h-full">
                  {(() => {
                    const minDD = mcResults.ddBins[0]?.start || 0;
                    const maxDD = mcResults.ddBins[mcResults.ddBins.length - 1]?.end || 6;
                    const getX = (val: number) => 35 + ((val - minDD) / (maxDD - minDD)) * 340;
                    const critX = Math.max(35, Math.min(375, getX(1.5)));
                    const maxCount = Math.max(...mcResults.ddBins.map((b) => b.count), 1);
                    const barW = 340 / mcResults.ddBins.length;

                    return (
                      <>
                        {critX > 35 && (
                          <rect x="35" y="15" width={critX - 35} height="95" fill="#F43F5E" opacity="0.12" />
                        )}
                        <line x1="35" y1="110" x2="375" y2="110" stroke="#334155" strokeWidth="1" />
                        {mcResults.ddBins.map((bin, i) => {
                          const barH = (bin.count / maxCount) * 85;
                          const x = 35 + i * barW;
                          const y = 110 - barH;
                          const isCritical = bin.end <= 1.5;

                          return (
                            <g key={i}>
                              <rect
                                x={x + 1}
                                y={y}
                                width={barW - 2}
                                height={barH}
                                fill={isCritical ? '#F43F5E' : '#06B6D4'}
                                opacity="0.85"
                              />
                              {i % 3 === 0 && (
                                <text x={x + barW / 2} y="122" fill="#64748B" textAnchor="middle" fontSize="8">
                                  {bin.start.toFixed(1)}σ
                                </text>
                              )}
                            </g>
                          );
                        })}
                        <line
                          x1={getX(merton.distanceToDefault)}
                          y1="10"
                          x2={getX(merton.distanceToDefault)}
                          y2="110"
                          stroke="#FCD34D"
                          strokeWidth="2"
                        />
                      </>
                    );
                  })()}
                </svg>
              </div>
            </div>

            <div className="bg-[#080D1A] rounded-lg border border-slate-800 p-4 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                  Default Probability (PD_RN) Tail Risk
                </span>
                <span className="text-rose-400 font-mono text-[11px]">
                  P95 Tail: {mcResults.pdStats.p95.toFixed(2)}%
                </span>
              </div>

              <div className="w-full h-40 select-none font-mono text-xs">
                <svg viewBox="0 0 400 130" className="w-full h-full">
                  {(() => {
                    const maxCount = Math.max(...mcResults.pdBins.map((b) => b.count), 1);
                    const barW = 340 / mcResults.pdBins.length;

                    return (
                      <>
                        <line x1="35" y1="110" x2="375" y2="110" stroke="#334155" strokeWidth="1" />
                        {mcResults.pdBins.map((bin, i) => {
                          const barH = (bin.count / maxCount) * 85;
                          const x = 35 + i * barW;
                          const y = 110 - barH;
                          return (
                            <g key={i}>
                              <rect x={x + 1} y={y} width={barW - 2} height={barH} fill="#F59E0B" opacity="0.85" />
                              {i % 3 === 0 && (
                                <text x={x + barW / 2} y="122" fill="#64748B" textAnchor="middle" fontSize="8">
                                  {bin.start.toFixed(1)}%
                                </text>
                              )}
                            </g>
                          );
                        })}
                      </>
                    );
                  })()}
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upper Grid: Capital Structure Waterfall & Calibrated State */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left 7 Columns: Capital Structure & Haircut Transmission */}
        <div className="lg:col-span-7 bg-[#0F1626] border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                <Building2 className="w-4 h-4 text-cyan-400" />
                Structural Balance Sheet &amp; Climate Haircut Transmission
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Visualizing asset value haircut relative to the default barrier (Book Debt D, without artificial 1.01·D floor)
              </p>
            </div>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-300 font-mono">
              {issuer.ticker} · {climate.status}
            </span>
          </div>

          <div className="space-y-5 my-4">
            {/* Baseline Capital Structure */}
            <div>
              <div className="flex justify-between text-xs mb-1.5 font-mono">
                <span className="text-slate-300">Baseline Firm Assets (V): <strong>${baseAssetB.toFixed(1)}B</strong></span>
                <span className="text-slate-400">Debt Cushion: {baseCushionPct.toFixed(1)}%</span>
              </div>
              <div className="h-7 w-full bg-slate-900 rounded-lg overflow-hidden flex border border-slate-800 font-mono text-[11px]">
                <div
                  style={{ width: `${(debtB / baseAssetB) * 100}%` }}
                  className="bg-rose-950/70 border-r border-rose-500/40 text-rose-300 flex items-center justify-center font-semibold px-2"
                >
                  Debt D: ${debtB.toFixed(1)}B
                </div>
                <div
                  style={{ width: `${(equityB / baseAssetB) * 100}%` }}
                  className="bg-cyan-950/60 text-cyan-300 flex items-center justify-center font-semibold px-2"
                >
                  Equity E: ${equityB.toFixed(1)}B
                </div>
              </div>
            </div>

            {/* Haircut Impact Step */}
            <div className="flex items-center gap-3 px-4 py-2 bg-slate-900/50 rounded-lg border border-slate-800/80 text-xs">
              <ArrowDown className="w-4 h-4 text-rose-400 shrink-0" />
              <div className="flex-1 flex justify-between">
                <span className="text-slate-300">
                  Direct PV Climate Haircut: <strong className="text-rose-400 font-mono">-${haircutB.toFixed(2)}B</strong> ({climate.haircutPctV.toFixed(2)}% of V)
                </span>
                <span className="text-slate-400 font-mono">
                  Post-shock Vol: {(climate.shockedAssetVol * 100).toFixed(1)}% (Base: {(merton.assetVol * 100).toFixed(1)}%)
                </span>
              </div>
            </div>

            {/* Post-Shock Capital Structure */}
            <div>
              <div className="flex justify-between text-xs mb-1.5 font-mono">
                <span className="text-amber-300">
                  Shocked Assets (V_scen = V - Haircut): <strong>${shockedAssetB.toFixed(2)}B</strong>
                </span>
                <span className={isInsolvent || shockedCushionPct < 25 ? 'text-rose-400 font-bold' : 'text-slate-400'}>
                  {isInsolvent
                    ? `Insolvent (Deficit: -$${(debtB - shockedAssetB).toFixed(2)}B)`
                    : `Shocked Cushion: ${shockedCushionPct.toFixed(1)}%`}
                </span>
              </div>
              <div className="h-7 w-full bg-slate-900 rounded-lg overflow-hidden flex border border-slate-800 font-mono text-[11px]">
                <div
                  style={{ width: `${isInsolvent ? 100 : Math.min(100, (debtB / Math.max(0.01, shockedAssetB)) * 100)}%` }}
                  className="bg-rose-950/90 border-r border-rose-500/50 text-rose-300 flex items-center justify-center font-semibold px-2"
                >
                  {isInsolvent
                    ? `Insolvent in Scenario: V_scen ($${shockedAssetB.toFixed(1)}B) <= Debt D ($${debtB.toFixed(1)}B)`
                    : `Debt D: $${debtB.toFixed(1)}B`}
                </div>
                {!isInsolvent && (
                  <div
                    style={{ width: `${Math.max(0, 100 - (debtB / Math.max(0.01, shockedAssetB)) * 100)}%` }}
                    className="bg-amber-950/60 text-amber-300 flex items-center justify-center font-semibold px-2"
                  >
                    Remaining Cushion: ${(shockedAssetB - debtB).toFixed(1)}B
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Metric Comparison Table (CreditGrades Option A + Unclipped Merton Option B) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-4 border-t border-slate-800 text-xs font-mono">
            <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800/80">
              <span className="text-slate-400 text-[10px] block">Merton 5Y (Base → Shock)</span>
              <span className="text-cyan-300 font-bold text-xs">
                {merton.modelSpreadBp < 0.01 ? merton.modelSpreadBp.toExponential(2) : merton.modelSpreadBp.toFixed(2)} →{' '}
                {isInsolvent
                  ? 'n/a (insolvent)'
                  : climate.shockedMertonSpreadBp < 0.01
                    ? `${climate.shockedMertonSpreadBp.toExponential(2)} bp`
                    : `${climate.shockedMertonSpreadBp.toFixed(2)} bp`}
              </span>
            </div>
            <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800/80">
              <span className="text-slate-400 text-[10px] block">CreditGrades 5Y (Base → Shock)</span>
              <span className="text-amber-300 font-bold text-xs">
                {climate.creditGradesBase5yBp < 0.01 ? climate.creditGradesBase5yBp.toFixed(4) : climate.creditGradesBase5yBp.toFixed(2)} →{' '}
                {isInsolvent
                  ? 'n/a (insolvent)'
                  : climate.creditGradesShocked5yBp < 0.01
                    ? `${climate.creditGradesShocked5yBp.toFixed(4)} bp`
                    : `${climate.creditGradesShocked5yBp.toFixed(2)} bp`}
              </span>
            </div>
            <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800/80">
              <span className="text-slate-400 text-[10px] block">CreditGrades 10Y Shift</span>
              <span className="text-rose-400 font-bold text-xs">
                {isInsolvent
                  ? 'n/a (insolvent)'
                  : Math.abs(climate.creditGradesDelta10yBp) < 0.1
                    ? `+${climate.creditGradesDelta10yBp.toFixed(4)} bp`
                    : `+${climate.creditGradesDelta10yBp.toFixed(2)} bp`}
              </span>
            </div>
            <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800/80">
              <span className="text-slate-400 text-[10px] block">Applied 5Y Shift (g(5)·Δ10Y)</span>
              <span className="text-amber-400 font-bold text-xs">
                {isInsolvent
                  ? 'n/a (insolvent)'
                  : Math.abs(climate.scaledDeltaSpreadBp) < 0.1
                    ? `+${climate.scaledDeltaSpreadBp.toFixed(4)} bp`
                    : `+${climate.scaledDeltaSpreadBp.toFixed(2)} bp`}
              </span>
            </div>
          </div>

        </div>

        {/* Right 5 Columns: Structural Calibration Card */}
        <div className="lg:col-span-5 bg-[#0F1626] border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white tracking-tight">
                Calibrated Structural Variables
              </h3>
              <span className="text-[11px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/50 font-mono">
                Unclipped Exact Solver
              </span>
            </div>

            <div className="space-y-2.5 font-mono text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800/70">
                <span className="text-slate-400">Equity Market Cap (E)</span>
                <span className="text-white font-semibold">${equityB.toFixed(1)}B</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/70">
                <span className="text-slate-400">Observed Equity Vol (σ_E)</span>
                <span className="text-white font-semibold">{(issuer.equityVol * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/70">
                <span className="text-slate-400">Default Barrier / Debt (D)</span>
                <span className="text-white font-semibold">${debtB.toFixed(1)}B</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/70">
                <span className="text-cyan-400 font-medium">Merton Asset Value (V)</span>
                <span className="text-cyan-300 font-bold">${baseAssetB.toFixed(2)}B</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/70">
                <span className="text-cyan-400 font-medium">Merton Asset Vol (σ_V)</span>
                <span className="text-cyan-300 font-bold">{(merton.assetVol * 100).toFixed(2)}%</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/70">
                <span className="text-slate-400">CreditGrades Asset Vol (σ_V,CG)</span>
                <span className="text-slate-200">{(merton.creditGradesAssetVol * 100).toFixed(2)}%</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/70">
                <span className="text-slate-400">Distance-to-Default (DD)</span>
                <span className="text-emerald-400 font-bold">{merton.distanceToDefault.toFixed(2)} σ</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/70">
                <span className="text-slate-400">Risk-Neutral PD (N(-d2))</span>
                <span className="text-slate-300 font-semibold">{(merton.riskNeutralPd * 100).toFixed(4)}%</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-amber-400 font-medium">Raw Unclipped Ratio (κ = s_proxy/s_Merton)</span>
                <span className="text-amber-300 font-bold">{formatRawKappa(merton.kappa)}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-400">
            <strong>Phase 2 Diagnostic Note:</strong> Hardcoded &kappa; clipping ([0.2, 12.0]) and the &kappa; = 1.0 fallback have been removed. The desk computes unscaled first-passage spreads via CreditGrades (2002, L&#772;=0.5, &lambda;=0.3) and flags low-leverage issuers where Merton 5Y &lt; 5 bp and &kappa; &gt; 3.
          </div>
        </div>

      </div>

      {/* Lower Card: Quantitative Formula Derivations & CreditGrades First-Passage Solution */}
      <div className="bg-[#0F1626] border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-bold text-white tracking-tight mb-3">
          Merton (1974) vs. CreditGrades (2002) Barrier Uncertainty &amp; Honest Leverage Flags
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-300 leading-relaxed">
          
          <div className="space-y-3">
            <h4 className="font-semibold text-cyan-300 text-xs">1. Merton (1974) Exact Calibration &amp; Why Clipped κ Fails</h4>
            <p>
              In Merton&apos;s structural model, equity E is a European call option on firm assets V struck at book debt D maturing at time T. Under continuous diffusion without barrier uncertainty, investment-grade firms with low book leverage (such as XOM, MSFT, SAP) have 5Y Merton spreads below 0.01 bp, causing raw κ = s_proxy / s_Merton to exceed 10<sup>4</sup>. Clipping κ to [0.2, 12.0] with a 1.0 fallback previously caused artificial 12x scaling on utilities and silent 0.0 bp shifts on XOM.
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-amber-300 text-xs">2. CreditGrades (2002) First-Passage &amp; Honest Leverage Reporting</h4>
            <p>
              CreditGrades (Finkelstein et al., RiskMetrics 2002) models default as first passage across a random recovery barrier L·D with mean global recovery L&#772; = 0.5 and barrier uncertainty &lambda; = 0.3:
            </p>
            <div className="p-2.5 bg-slate-900 rounded border border-slate-800 font-mono text-amber-200 text-[11px]">
              <div>P(t) = &Phi;(&minus;A_t/2 + ln(d)/A_t) &minus; d · &Phi;(&minus;A_t/2 &minus; ln(d)/A_t),  A_t² = &sigma;_V² t + &lambda;²</div>
            </div>
            <p>
              While barrier uncertainty raises model spreads by an order of magnitude for leveraged industrial/utility issuers (e.g., TATASTEEL, NTPC, HOLN, NEE), ultra-low-leverage balance sheets (D/E &lt; 10%) remain deep out of the money and are explicitly flagged as <em>Structural model uninformative at current leverage</em> rather than scaled by an arbitrary multiplier.
            </p>
          </div>

        </div>
      </div>

    </div>
  );
};
