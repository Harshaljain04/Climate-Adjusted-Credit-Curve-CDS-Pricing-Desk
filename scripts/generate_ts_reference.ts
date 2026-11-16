import fs from 'node:fs';
import path from 'node:path';
import { PRESET_ISSUERS } from '../src/data/issuers';
import {
  NGFS_SCENARIOS,
  ClimateOverlayParams,
  bootstrapHazardCurve,
  mertonCalibrate,
  computeClimateImpact,
} from '../src/lib/creditEngine';

const DEFAULT_PARAMS: ClimateOverlayParams = {
  passThrough: 0.40,
  wacc: 0.08,
  taxRate: 0.25,
  horizonYears: 25,
  includeTerminalValue: false,
  terminalGrowthRate: 0.015,
  volUpliftFactor: 0.50,
  rampMidpointYears: 7.0,
  rampWidthYears: 2.0,
};

const scenarioIds = ['net_zero_2050', 'delayed_transition', 'current_policies'] as const;

const fixture = {
  generatedAt: new Date().toISOString().slice(0, 10),
  params: DEFAULT_PARAMS,
  scenarios: Object.fromEntries(
    scenarioIds.map((id) => [
      id,
      {
        id,
        name: NGFS_SCENARIOS[id].name,
        carbonPrices: NGFS_SCENARIOS[id].carbonPrices,
        emissionsIndex: NGFS_SCENARIOS[id].emissionsIndex,
      },
    ])
  ),
  issuers: PRESET_ISSUERS.map((iss) => {
    const baseCurve = bootstrapHazardCurve(
      iss.tenors,
      iss.proxySpreadsBp.map((s) => s / 10000),
      0.40,
      iss.riskFreeRate
    );
    const merton = mertonCalibrate(
      iss.equityUsdB * 1e9,
      iss.equityVol,
      iss.totalDebtUsdB * 1e9,
      iss.riskFreeRate,
      5.0,
      iss.proxySpreadsBp[2] / 10000
    );

    const scenarioOutputs: Record<string, unknown> = {};
    for (const sid of scenarioIds) {
      const out = computeClimateImpact(
        merton,
        baseCurve,
        iss.proxySpreadsBp,
        iss.scope1MtCo2,
        iss.scope2MtCo2,
        NGFS_SCENARIOS[sid],
        DEFAULT_PARAMS
      );
      scenarioOutputs[sid] = {
        status: out.status,
        exceedsEmpiricalRange: out.exceedsEmpiricalRange,
        totalHaircutUsd: out.totalHaircutUsd,
        haircutPctV: out.haircutPctV,
        shockedAssetValue: out.shockedAssetValue,
        creditGradesBase5yBp: out.creditGradesBase5yBp,
        creditGradesShocked5yBp: out.creditGradesShocked5yBp,
        creditGradesDelta5yBp: out.creditGradesDelta5yBp,
        creditGradesDelta10yBp: out.creditGradesDelta10yBp,
        scaledDeltaSpreadBp: out.scaledDeltaSpreadBp,
        tenorShiftsBp: out.tenorShiftsBp,
        adjustedSpreadsBp: out.adjustedSpreadsBp,
        adjustedHazardRates: out.adjustedHazardRates,
        mtmProtectionImpactEur: out.mtmProtectionImpactEur,
        carbonPriceSensitivityBp: out.carbonPriceSensitivityBp,
        climateCs01Bp: out.climateCs01Bp,
        cs01EurPerBp: out.cs01EurPerBp,
      };
    }

    return {
      id: iss.id,
      ticker: iss.ticker,
      tenors: iss.tenors,
      proxySpreadsBp: iss.proxySpreadsBp,
      equityUsdB: iss.equityUsdB,
      totalDebtUsdB: iss.totalDebtUsdB,
      equityVol: iss.equityVol,
      riskFreeRate: iss.riskFreeRate,
      scope1MtCo2: iss.scope1MtCo2,
      scope2MtCo2: iss.scope2MtCo2,
      baseHazardRates: baseCurve.hazardRates,
      merton: {
        V: merton.assetValue,
        sigma_V: merton.assetVol,
        dd: merton.distanceToDefault,
        rnPd: merton.riskNeutralPd,
        modelSpreadBp: merton.modelSpreadBp,
        kappa: Number.isFinite(merton.kappa) ? merton.kappa : null,
        creditGradesSpread5yBp: merton.creditGradesSpread5yBp,
        creditGradesAssetVol: merton.creditGradesAssetVol,
      },
      scenarios: scenarioOutputs,
    };
  }),
};

const outPath = path.resolve('tests/fixtures/ts_reference.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2) + '\n', 'utf-8');
console.log(`Wrote ${fixture.issuers.length} issuers x ${scenarioIds.length} scenarios to ${outPath}`);
