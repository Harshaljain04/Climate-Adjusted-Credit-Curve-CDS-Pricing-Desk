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
  Play,
  RotateCcw,
  TrendingDown,
  AlertTriangle,
  Zap,
  Layers,
  Sparkles,
} from 'lucide-react';
import { MertonResult, ClimateOutput, mertonCalibrate, normalCdf } from '../lib/creditEngine';
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

  // Percentage cushion over debt
  const baseCushionPct = ((baseAssetB - debtB) / baseAssetB) * 100;
  const shockedCushionPct = ((shockedAssetB - debtB) / shockedAssetB) * 100;

  // =========================================================================
  // Monte Carlo Equity Volatility Simulation State
  // =========================================================================
  const [showMonteCarlo, setShowMonteCarlo] = useState(false);
  const [volStressMultiplier, setVolStressMultiplier] = useState(1.4); // 40% vol surge
  const [volDispersionPct, setVolDispersionPct] = useState(25); // +/- 25% uncertainty spread
  const [mcDrawCount, setMcDrawCount] = useState(1500);
  const [isSimulating, setIsSimulating] = useState(false);

  // Compute Monte Carlo distributions dynamically
  const mcResults = useMemo(() => {
    if (!showMonteCarlo) return null;

    const baseVol = issuer.equityVol;
    const meanVol = baseVol * volStressMultiplier;
    const stdVol = meanVol * (volDispersionPct / 100) * 0.5;

    const ddList: number[] = [];
    const pdList: number[] = [];
    const spreadList: number[] = [];
    const sampledVols: number[] = [];

    const E = issuer.equityUsdB * 1e9;
    const D = issuer.totalDebtUsdB * 1e9;
    const r = issuer.riskFreeRate;

    for (let i = 0; i < mcDrawCount; i++) {
      // Box-Muller standard normal draw
      const u1 = Math.max(1e-7, Math.random());
      const u2 = Math.random();
      const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

      // Sample equity volatility (bounded >= 5%)
      const sampledVol = Math.max(0.05, Math.min(2.0, meanVol + z * stdVol));
      sampledVols.push(sampledVol);

      const res = mertonCalibrate(E, sampledVol, D, r, 5.0, issuer.proxySpreadsBp[2] / 10000);
      ddList.push(res.distanceToDefault);
      pdList.push(res.riskNeutralPd * 100);
      spreadList.push(res.modelSpreadBp);
    }

    // Sort arrays for percentile extraction
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

    // Build 12 histogram bins for DD
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

    // Build 12 histogram bins for PD
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
  }, [showMonteCarlo, volStressMultiplier, volDispersionPct, mcDrawCount, issuer]);

  const handleApplyPreset = (mult: number, disp: number) => {
    setIsSimulating(true);
    setVolStressMultiplier(mult);
    setVolDispersionPct(disp);
    setTimeout(() => setIsSimulating(false), 150);
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
              Merton Structural Inspector &amp; Balance Sheet Dynamics
            </h2>
            <p className="text-[11px] text-slate-400">
              Invert observable equity capitalization and volatility into unobserved asset value and default metrics
            </p>
          </div>
        </div>

        {/* Monte Carlo Mode Switch Button */}
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

      {/* Dynamic Monte Carlo Volatility Shock Section (When Active) */}
      {showMonteCarlo && mcResults && (
        <div className="bg-[#0F1626] border border-amber-500/40 rounded-xl p-5 space-y-5 animate-in fade-in duration-300">
          
          {/* Header & Presets */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                  <Activity className="w-4 h-4 text-amber-400" />
                  Equity Volatility Monte Carlo Shock Engine
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950/70 border border-amber-600/40 text-amber-300 font-mono">
                  {mcDrawCount.toLocaleString()} Iterations
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Stress-testing Distance to Default (DD) and Default Probability (PD) under stochastic equity market turmoil
              </p>
            </div>

            {/* Quick Stress Presets */}
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

          {/* Interactive Sliders Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-900/60 p-4 rounded-lg border border-slate-800">
            
            {/* Slider 1: Volatility Stress Multiplier */}
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
              <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                <span>0.8x (Calm)</span>
                <span>1.5x (Elevated)</span>
                <span>2.5x (Crisis)</span>
              </div>
            </div>

            {/* Slider 2: Volatility Uncertainty Dispersion */}
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
              <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                <span>Narrow (±5%)</span>
                <span>Moderate (±25%)</span>
                <span>Wide (±50%)</span>
              </div>
            </div>

            {/* Metric Summary Box */}
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

          {/* Dual Distribution SVG Charts: DD Shift and PD Shift */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            
            {/* Chart 1: Distance to Default (DD) Distribution */}
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
                  {/* Critical distress background shaded zone */}
                  {(() => {
                    const minDD = mcResults.ddBins[0]?.start || 0;
                    const maxDD = mcResults.ddBins[mcResults.ddBins.length - 1]?.end || 6;
                    const getX = (val: number) => 35 + ((val - minDD) / (maxDD - minDD)) * 340;
                    const critX = Math.max(35, Math.min(375, getX(1.5)));

                    return (
                      <>
                        {critX > 35 && (
                          <rect
                            x="35"
                            y="15"
                            width={critX - 35}
                            height="95"
                            fill="#F43F5E"
                            opacity="0.12"
                          />
                        )}
                        <line x1="35" y1="110" x2="375" y2="110" stroke="#334155" strokeWidth="1" />
                        
                        {/* Histogram Bars */}
                        {(() => {
                          const maxCount = Math.max(...mcResults.ddBins.map((b) => b.count), 1);
                          const barW = 340 / mcResults.ddBins.length;

                          return mcResults.ddBins.map((bin, i) => {
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
                          });
                        })()}

                        {/* Baseline DD Marker */}
                        <line
                          x1={getX(merton.distanceToDefault)}
                          y1="10"
                          x2={getX(merton.distanceToDefault)}
                          y2="110"
                          stroke="#FCD34D"
                          strokeWidth="2"
                        />
                        <text
                          x={getX(merton.distanceToDefault)}
                          y="9"
                          fill="#FCD34D"
                          textAnchor="middle"
                          fontSize="9"
                          fontWeight="bold"
                        >
                          Base: {merton.distanceToDefault.toFixed(2)}σ
                        </text>
                      </>
                    );
                  })()}
                </svg>
              </div>

              <div className="flex justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/80 font-mono">
                <span>P5 (Severe): {mcResults.ddStats.p5.toFixed(2)} σ</span>
                <span className="text-amber-300 font-semibold">Median: {mcResults.ddStats.median.toFixed(2)} σ</span>
                <span>P95 (Safe): {mcResults.ddStats.p95.toFixed(2)} σ</span>
              </div>
            </div>

            {/* Chart 2: Default Probability (PD) Distribution */}
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
                    const minPD = 0;
                    const maxPD = Math.max(10, Math.ceil(mcResults.pdStats.p95 * 1.2));
                    const getX = (val: number) => 35 + (val / maxPD) * 340;

                    const maxCount = Math.max(...mcResults.pdBins.map((b) => b.count), 1);
                    const barW = 340 / mcResults.pdBins.length;

                    return (
                      <>
                        <line x1="35" y1="110" x2="375" y2="110" stroke="#334155" strokeWidth="1" />

                        {/* Histogram Bars */}
                        {mcResults.pdBins.map((bin, i) => {
                          const barH = (bin.count / maxCount) * 85;
                          const x = 35 + i * barW;
                          const y = 110 - barH;

                          return (
                            <g key={i}>
                              <rect
                                x={x + 1}
                                y={y}
                                width={barW - 2}
                                height={barH}
                                fill="#F59E0B"
                                opacity="0.85"
                              />
                              {i % 3 === 0 && (
                                <text x={x + barW / 2} y="122" fill="#64748B" textAnchor="middle" fontSize="8">
                                  {bin.start.toFixed(1)}%
                                </text>
                              )}
                            </g>
                          );
                        })}

                        {/* Baseline PD Marker */}
                        <line
                          x1={getX(merton.riskNeutralPd * 100)}
                          y1="10"
                          x2={getX(merton.riskNeutralPd * 100)}
                          y2="110"
                          stroke="#38BDF8"
                          strokeWidth="2"
                        />
                        <text
                          x={Math.max(45, getX(merton.riskNeutralPd * 100))}
                          y="9"
                          fill="#38BDF8"
                          textAnchor="middle"
                          fontSize="9"
                          fontWeight="bold"
                        >
                          Base: {(merton.riskNeutralPd * 100).toFixed(2)}%
                        </text>
                      </>
                    );
                  })()}
                </svg>
              </div>

              <div className="flex justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/80 font-mono">
                <span>Base PD: {(merton.riskNeutralPd * 100).toFixed(2)}%</span>
                <span className="text-amber-300 font-semibold">Mean PD: {mcResults.pdStats.mean.toFixed(2)}%</span>
                <span className="text-rose-400 font-bold">P95 Tail: {mcResults.pdStats.p95.toFixed(2)}%</span>
              </div>
            </div>

          </div>

          <div className="text-[11px] text-slate-300 bg-slate-900 p-3 rounded-lg border border-slate-800 flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              <strong>Structural Vega Convexity Takeaway:</strong> In the Merton framework, default probability N(-d2) is strongly convex with respect to asset volatility. Even when median distance-to-default shifts moderately, the tail risk (P95 Default Probability) accelerates non-linearly under elevated volatility, demonstrating why market credit spreads widen rapidly during transition turmoil.
            </span>
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
                Visualizing asset value haircut relative to the default barrier (Book Debt $D$)
              </p>
            </div>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-300 font-mono">
              {issuer.ticker}
            </span>
          </div>

          {/* Capital Structure Comparison Bars */}
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
                  title={`Book Debt D: $${debtB.toFixed(1)}B`}
                >
                  Debt D: ${debtB.toFixed(1)}B
                </div>
                <div
                  style={{ width: `${(equityB / baseAssetB) * 100}%` }}
                  className="bg-cyan-950/60 text-cyan-300 flex items-center justify-center font-semibold px-2"
                  title={`Equity Market Cap E: $${equityB.toFixed(1)}B`}
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
                <span className="text-amber-300">Shocked Assets (V_scen): <strong>${shockedAssetB.toFixed(1)}B</strong></span>
                <span className={shockedCushionPct < 25 ? 'text-rose-400 font-bold' : 'text-slate-400'}>
                  Shocked Cushion: {shockedCushionPct.toFixed(1)}%
                </span>
              </div>
              <div className="h-7 w-full bg-slate-900 rounded-lg overflow-hidden flex border border-slate-800 font-mono text-[11px]">
                <div
                  style={{ width: `${Math.min(100, (debtB / shockedAssetB) * 100)}%` }}
                  className="bg-rose-950/90 border-r border-rose-500/50 text-rose-300 flex items-center justify-center font-semibold px-2"
                >
                  Debt D: ${debtB.toFixed(1)}B
                </div>
                <div
                  style={{ width: `${Math.max(0, 100 - (debtB / shockedAssetB) * 100)}%` }}
                  className="bg-amber-950/60 text-amber-300 flex items-center justify-center font-semibold px-2"
                >
                  Remaining Cushion: ${(shockedAssetB - debtB).toFixed(1)}B
                </div>
              </div>
            </div>

          </div>

          {/* Metric Comparison Table */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-4 border-t border-slate-800 text-xs font-mono">
            <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800/80">
              <span className="text-slate-400 text-[10px] block">Merton Base Spread</span>
              <span className="text-cyan-300 font-bold text-sm">{merton.modelSpreadBp.toFixed(1)} bp</span>
            </div>
            <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800/80">
              <span className="text-slate-400 text-[10px] block">Merton Shocked Spread</span>
              <span className="text-amber-300 font-bold text-sm">{climate.shockedMertonSpreadBp.toFixed(1)} bp</span>
            </div>
            <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800/80">
              <span className="text-slate-400 text-[10px] block">Merton Delta (Δ)</span>
              <span className="text-rose-400 font-bold text-sm">+{climate.deltaMertonSpreadBp.toFixed(1)} bp</span>
            </div>
            <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800/80">
              <span className="text-slate-400 text-[10px] block">Scaled Delta (κ · Δ)</span>
              <span className="text-amber-400 font-bold text-sm">+{climate.scaledDeltaSpreadBp.toFixed(1)} bp</span>
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
                Brent Solver
              </span>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-800/70">
                <span className="text-slate-400">Equity Market Cap (E)</span>
                <span className="text-white font-semibold">${equityB.toFixed(1)}B</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800/70">
                <span className="text-slate-400">Observed Equity Vol (σ_E)</span>
                <span className="text-white font-semibold">{(issuer.equityVol * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800/70">
                <span className="text-slate-400">Default Barrier / Debt (D)</span>
                <span className="text-white font-semibold">${debtB.toFixed(1)}B</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800/70">
                <span className="text-cyan-400 font-medium">Unobserved Asset Value (V)</span>
                <span className="text-cyan-300 font-bold">${baseAssetB.toFixed(2)}B</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800/70">
                <span className="text-cyan-400 font-medium">Unobserved Asset Vol (σ_V)</span>
                <span className="text-cyan-300 font-bold">{(merton.assetVol * 100).toFixed(2)}%</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800/70">
                <span className="text-slate-400">Black-Scholes d1 / d2</span>
                <span className="text-slate-300">{merton.d1.toFixed(3)} / {merton.d2.toFixed(3)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800/70">
                <span className="text-slate-400">Distance-to-Default (DD)</span>
                <span className="text-emerald-400 font-bold">{merton.distanceToDefault.toFixed(2)} σ</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800/70">
                <span className="text-slate-400">Risk-Neutral PD (N(-d2))</span>
                <span className="text-slate-300 font-semibold">{(merton.riskNeutralPd * 100).toFixed(3)}%</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-amber-400 font-medium">Calibration Scaling (κ)</span>
                <span className="text-amber-300 font-bold">{merton.kappa.toFixed(2)}x</span>
              </div>
            </div>
          </div>

          <div className="mt-4 p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-400">
            <strong>κ Scaling Factor:</strong> &kappa; = s_proxy(5Y) / s_Merton(5Y) = {merton.kappa.toFixed(2)}. This scales the theoretical Merton delta to match observable credit derivative trading levels.
          </div>
        </div>

      </div>

      {/* Lower Card: Quantitative Formula Derivations & Short-End Spread Under-Prediction */}
      <div className="bg-[#0F1626] border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-bold text-white tracking-tight mb-3">
          Merton (1974) Foundations &amp; The Short-End Spread Problem
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-300 leading-relaxed">
          
          <div className="space-y-3">
            <h4 className="font-semibold text-cyan-300 text-xs">1. Mathematical Model Formulation</h4>
            <p>
              In Merton&apos;s structural model, a firm&apos;s equity E is modeled as a European call option on the total unobserved market value of the firm&apos;s assets V, struck at the face value of zero-coupon debt D maturing at time T:
            </p>
            <div className="p-3 bg-slate-900 rounded border border-slate-800 font-mono text-cyan-200 text-[11px] space-y-1">
              <div>E = V · N(d₁) - D · e^(-rT) · N(d₂)</div>
              <div>σ_E · E = N(d₁) · σ_V · V</div>
              <div className="text-slate-400 text-[10px]">
                where d₁ = [ln(V/D) + (r + 0.5 σ_V²)T] / (σ_V √T),  d₂ = d₁ - σ_V √T
              </div>
            </div>
            <p>
              By observing market capitalization E and historical equity volatility σ_E, we invert this bivariate nonlinear system using root-finding to uniquely determine the unobservable parameters (V, σ_V).
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-amber-300 text-xs">2. Why Merton Under-Predicts Short-Maturity Spreads</h4>
            <p>
              A classic empirical shortcoming of the Merton model is that as maturity T → 0, the default probability N(-d₂) plummets to zero asymptotically fast under continuous Brownian diffusion:
            </p>
            <div className="p-3 bg-slate-900 rounded border border-slate-800 font-mono text-amber-200 text-[11px]">
              <div>lim (T → 0) s_Merton(T) = 0   (for V &gt; D)</div>
            </div>
            <p>
              In reality, traded corporate bonds and CDS show positive spreads even at 3-month tenors due to <em>jump-to-default risk</em>, accounting noise, and liquidity premia. In our desk, we handle this through the <strong>κ scaling factor</strong> (κ = s_proxy,5Y / s_Merton,5Y), which maps the structural transition delta into empirical market credit spreads.
            </p>
          </div>

        </div>
      </div>

    </div>
  );
};
