/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ArrowUpRight, TrendingUp, AlertTriangle, ShieldAlert, DollarSign, Activity } from 'lucide-react';
import { ClimateOutput, MertonResult, HazardCurve } from '../lib/creditEngine';
import { IssuerProfile } from '../data/issuers';

interface KeyMetricsRibbonProps {
  issuer: IssuerProfile;
  baseCurve: HazardCurve;
  merton: MertonResult;
  climate: ClimateOutput;
  base5ySpreadBp: number;
  adjusted5ySpreadBp: number;
}

export const KeyMetricsRibbon: React.FC<KeyMetricsRibbonProps> = ({
  issuer,
  baseCurve,
  merton,
  climate,
  base5ySpreadBp,
  adjusted5ySpreadBp,
}) => {
  const deltaBp = adjusted5ySpreadBp - base5ySpreadBp;
  const survivalDelta = (climate.adj5ySurvivalProb - climate.base5ySurvivalProb) * 100;
  const isHighCarbon = issuer.carbonIntensityCategory.includes('High Carbon');

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      
      {/* Metric 1: 5Y Par Spread */}
      <div className="bg-[#0F1626] border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="font-medium">5Y CDS Par Spread</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono">
            {issuer.rating}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold text-white font-mono tabular-nums">
            {adjusted5ySpreadBp.toFixed(1)}
          </span>
          <span className="text-xs text-slate-400">bp</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs mt-1.5 pt-1.5 border-t border-slate-800/80">
          <span className="text-slate-400 text-[11px]">Base: {base5ySpreadBp.toFixed(0)} bp</span>
          <span className={`font-mono text-[11px] font-semibold flex items-center ml-auto ${
            deltaBp > 0 ? 'text-amber-400' : 'text-slate-400'
          }`}>
            {deltaBp > 0 ? `+${deltaBp.toFixed(1)} bp` : '0.0 bp'}
          </span>
        </div>
      </div>

      {/* Metric 2: 5Y Survival Probability */}
      <div className="bg-[#0F1626] border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="font-medium">5Y Survival Prob Q(5)</span>
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold text-cyan-300 font-mono tabular-nums">
            {(climate.adj5ySurvivalProb * 100).toFixed(2)}%
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs mt-1.5 pt-1.5 border-t border-slate-800/80">
          <span className="text-slate-400 text-[11px]">Base: {(climate.base5ySurvivalProb * 100).toFixed(2)}%</span>
          <span className={`font-mono text-[11px] font-semibold ml-auto ${
            survivalDelta < 0 ? 'text-rose-400' : 'text-slate-400'
          }`}>
            {survivalDelta < 0 ? `${survivalDelta.toFixed(2)}%` : '0.00%'}
          </span>
        </div>
      </div>

      {/* Metric 3: MTM Protection Position (EUR 10M) */}
      <div className="bg-[#0F1626] border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="font-medium">MTM Impact (EUR 10m)</span>
          <span className="text-[10px] text-slate-400 font-mono">Prot. Buyer</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold text-emerald-400 font-mono tabular-nums">
            {climate.mtmProtectionImpactEur >= 1_000_000
              ? `+€${(climate.mtmProtectionImpactEur / 1_000_000).toFixed(2)}M`
              : `+€${(climate.mtmProtectionImpactEur / 1_000).toFixed(1)}k`}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1.5 pt-1.5 border-t border-slate-800/80">
          <span>RPV01: {((climate.mtmProtectionImpactEur / (deltaBp || 1)) / 1000).toFixed(2)}k</span>
          <span className="text-emerald-400/90 font-medium">Gain on spread</span>
        </div>
      </div>

      {/* Metric 4: Climate CS01 (+$10/tCO2 shock) */}
      <div className="bg-[#0F1626] border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="font-medium">Climate CS01</span>
          <span className="text-[10px] px-1 rounded bg-slate-800 text-cyan-300 font-mono">+$10/t</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold text-amber-300 font-mono tabular-nums">
            +{climate.climateCs01Bp.toFixed(2)}
          </span>
          <span className="text-xs text-slate-400">bp</span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1.5 pt-1.5 border-t border-slate-800/80">
          <span>Sensitivity</span>
          <span className="text-slate-300 font-mono">per +$10/tCO2</span>
        </div>
      </div>

      {/* Metric 5: PV Asset Haircut */}
      <div className="bg-[#0F1626] border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="font-medium">PV Asset Haircut</span>
          <span className="text-[10px] text-slate-400 font-mono">DCF</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold text-rose-400 font-mono tabular-nums">
            -${(climate.totalHaircutUsd / 1e9).toFixed(2)}B
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1.5 pt-1.5 border-t border-slate-800/80">
          <span>{climate.haircutPctV.toFixed(2)}% of V</span>
          <span className={isHighCarbon ? 'text-amber-400 font-medium' : 'text-emerald-400 font-medium'}>
            {isHighCarbon ? 'High Carbon' : 'Low Carbon'}
          </span>
        </div>
      </div>

      {/* Metric 6: Merton Structural DD & Kappa */}
      <div className="bg-[#0F1626] border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="font-medium">Distance-to-Default</span>
          <span className="text-[10px] text-slate-400 font-mono">κ = {merton.kappa.toFixed(2)}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold text-white font-mono tabular-nums">
            {merton.distanceToDefault.toFixed(2)} σ
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1.5 pt-1.5 border-t border-slate-800/80">
          <span>RN PD: {(merton.riskNeutralPd * 100).toFixed(2)}%</span>
          <span className="text-slate-300 font-mono">V: ${(merton.assetValue / 1e9).toFixed(0)}B</span>
        </div>
      </div>

    </div>
  );
};
