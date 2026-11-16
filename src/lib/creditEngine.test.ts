import { describe, it, expect } from 'vitest';
import { PRESET_ISSUERS, DISTRESS_CASE_STUDIES, PROXY_SPREAD_TABLE } from '../data/issuers';
import {
  NGFS_SCENARIOS,
  ClimateOverlayParams,
  normalCdf,
  bootstrapHazardCurve,
  computeCdsLegs,
  mertonCalibrate,
  creditGradesSurvival,
  creditGradesSpreadBp,
  logisticTenorRamp,
  computeClimateImpact,
  mulberry32,
  MONTE_CARLO_DEFAULT_DRAWS,
  DEFAULT_MC_SEED,
  computeAverageRanks,
  spearmanRankCorrelation,
  computeCrossSectionalValidation,
  computeDistressStudySeries,
  runMonteCarloSimulation,
} from './creditEngine';

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

describe('Phase 2 Quantitative Credit Engine Suite', () => {
  it('1. Bootstrap round-trip error is < 1e-8 on all 9 preset issuers', () => {
    for (const iss of PRESET_ISSUERS) {
      const spreadsDecimals = iss.proxySpreadsBp.map((s) => s / 10000);
      const curve = bootstrapHazardCurve(iss.tenors, spreadsDecimals, 0.40, iss.riskFreeRate);
      iss.tenors.forEach((tenor, idx) => {
        const legs = computeCdsLegs(curve, tenor);
        expect(Math.abs(legs.parSpread - spreadsDecimals[idx])).toBeLessThan(1e-8);
      });
    }
  });

  it('2. Steeply inverted spread curve throws a descriptive error (Section 2.6)', () => {
    const tenors = [1, 3, 5, 7, 10];
    const invertedSpreadsDecimals = [0.0500, 0.0100, 0.0080, 0.0070, 0.0060];
    expect(() =>
      bootstrapHazardCurve(tenors, invertedSpreadsDecimals, 0.40, 0.04)
    ).toThrow(/Negative forward hazard rate implied/);
  });

  it('3. Merton calibration residuals are < 1e-6 on both equations across all 9 issuers', () => {
    for (const iss of PRESET_ISSUERS) {
      const E = iss.equityUsdB * 1e9;
      const D = iss.totalDebtUsdB * 1e9;
      const sigmaE = iss.equityVol;
      const r = iss.riskFreeRate;
      const T = 5.0;
      const m = mertonCalibrate(E, sigmaE, D, r, T, iss.proxySpreadsBp[2] / 10000);

      const discount = Math.exp(-r * T);
      const eq1Res = Math.abs(m.assetValue * normalCdf(m.d1) - D * discount * normalCdf(m.d2) - E);
      const eq2Res = Math.abs(normalCdf(m.d1) * m.assetVol * m.assetValue - sigmaE * E);

      expect(eq1Res).toBeLessThan(1e-6 * Math.max(1.0, E));
      expect(eq2Res).toBeLessThan(1e-6 * Math.max(1.0, sigmaE * E));
    }
  });

  it('4. Matches John Hull textbook worked example (E=3, sigmaE=0.80, D=10, r=0.05, T=1)', () => {
    const res = mertonCalibrate(3.0, 0.80, 10.0, 0.05, 1.0, 0.0120);
    expect(Math.abs(res.assetValue - 12.40)).toBeLessThan(0.05);
    expect(Math.abs(res.assetVol - 0.2123)).toBeLessThan(0.005);
    expect(Math.abs(res.riskNeutralPd - 0.127)).toBeLessThan(0.01);
  });

  it('5. CreditGrades (2002) first-passage survival matches closed-form & random-barrier MC (Section 2.1)', () => {
    const E = 150.0;
    const D = 100.0;
    const sigmaE = 0.30;
    const T = 5.0;
    const lBar = 0.5;
    const lam = 0.3;
    const sigmaV = sigmaE * (E / (E + lBar * D));

    const cgP = creditGradesSurvival(E, D, sigmaV, T, lBar, lam);
    const cgSpr = creditGradesSpreadBp(E, D, sigmaV, T, 0.4, lBar, lam);
    expect(cgP).toBeGreaterThan(0.95);
    expect(cgP).toBeLessThan(0.99);
    expect(cgSpr).toBeGreaterThan(20.0);

    // Deterministic quadrature over standard normal Z for random barrier B = lBar * D * exp(lam*Z - 0.5*lam^2)
    const V0 = E + lBar * D;
    const nPoints = 2000;
    let sumSurv = 0;
    for (let i = 1; i <= nPoints; i++) {
      const u = (i - 0.5) / nPoints;
      const z = -5.0 + (10.0 * (i - 0.5)) / nPoints;
      const pdf = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
      const dz = 10.0 / nPoints;
      const B = lBar * D * Math.exp(lam * z - 0.5 * lam * lam);
      const ratio = V0 / B;
      let condSurv = 0;
      if (ratio > 1.0) {
        const lnR = Math.log(ratio);
        const sigSqrtT = sigmaV * Math.sqrt(T);
        condSurv =
          normalCdf((lnR - 0.5 * sigmaV * sigmaV * T) / sigSqrtT) -
          (1.0 / ratio) * normalCdf((-lnR - 0.5 * sigmaV * sigmaV * T) / sigSqrtT);
      }
      sumSurv += condSurv * pdf * dz * (u > 0 ? 1 : 1);
    }
    expect(Math.abs(cgP - sumSurv)).toBeLessThan(0.015);
  });

  it('6. Removes hardcoded kappa bounds [0.2, 12.0] and 1.0 fallback (Section 2.1)', () => {
    const xom = PRESET_ISSUERS.find((i) => i.ticker === 'XOM')!;
    const mXom = mertonCalibrate(
      xom.equityUsdB * 1e9,
      xom.equityVol,
      xom.totalDebtUsdB * 1e9,
      xom.riskFreeRate,
      5.0,
      xom.proxySpreadsBp[2] / 10000
    );
    expect(mXom.kappa).toBeGreaterThan(1000);

    const curveXom = bootstrapHazardCurve(
      xom.tenors,
      xom.proxySpreadsBp.map((s) => s / 10000),
      0.40,
      xom.riskFreeRate
    );
    const outXom = computeClimateImpact(
      mXom,
      curveXom,
      xom.proxySpreadsBp,
      xom.scope1MtCo2,
      xom.scope2MtCo2,
      NGFS_SCENARIOS.net_zero_2050,
      DEFAULT_PARAMS
    );
    expect(outXom.status).toBe('uninformative_at_current_leverage');
    expect(outXom.scaledDeltaSpreadBp).toBeGreaterThan(0);
  });

  it('7. Matches hand-calculated haircut: 1,000t at $100/t, no tax, no discounting = $100,000 (Section 2.7)', () => {
    const m = mertonCalibrate(100e9, 0.25, 40e9, 0.04, 5.0, 0.0100);
    const curve = bootstrapHazardCurve([1, 3, 5, 7, 10], [0.005, 0.007, 0.010, 0.012, 0.014], 0.40, 0.04);
    const singleYearScenario = {
      id: 'net_zero_2050' as const,
      name: 'Test 1Y Scenario',
      type: 'Orderly' as const,
      description: 'Test',
      carbonPrices: [100],
      emissionsIndex: [1.0],
    };
    const out = computeClimateImpact(
      m,
      curve,
      [50, 70, 100, 120, 140],
      0.001, // 0.001 MtCO2 = 1,000 tCO2
      0.0,
      singleYearScenario,
      {
        passThrough: 0.0,
        wacc: 0.0,
        taxRate: 0.0,
        horizonYears: 1,
        includeTerminalValue: false,
        terminalGrowthRate: 0.0,
        volUpliftFactor: 0.0,
      }
    );
    expect(Math.abs(out.totalHaircutUsd - 100_000)).toBeLessThan(1e-6);
  });

  it('8. Tenor monotonicity: shift(1Y) <= shift(5Y) <= shift(10Y) and shift(1Y) < 25% of shift(10Y) (Section 2.2)', () => {
    expect(logisticTenorRamp(1, 7, 2)).toBeLessThan(0.25);
    expect(logisticTenorRamp(10, 7, 2)).toBeCloseTo(1.0, 10);

    for (const iss of PRESET_ISSUERS) {
      const curve = bootstrapHazardCurve(
        iss.tenors,
        iss.proxySpreadsBp.map((s) => s / 10000),
        0.40,
        iss.riskFreeRate
      );
      const m = mertonCalibrate(
        iss.equityUsdB * 1e9,
        iss.equityVol,
        iss.totalDebtUsdB * 1e9,
        iss.riskFreeRate,
        5.0,
        iss.proxySpreadsBp[2] / 10000
      );

      for (const scen of Object.values(NGFS_SCENARIOS)) {
        const out = computeClimateImpact(
          m,
          curve,
          iss.proxySpreadsBp,
          iss.scope1MtCo2,
          iss.scope2MtCo2,
          scen,
          DEFAULT_PARAMS
        );
        const [s1, s3, s5, s7, s10] = out.tenorShiftsBp;
        expect(s1).toBeLessThanOrEqual(s3 + 1e-12);
        expect(s3).toBeLessThanOrEqual(s5 + 1e-12);
        expect(s5).toBeLessThanOrEqual(s7 + 1e-12);
        expect(s7).toBeLessThanOrEqual(s10 + 1e-12);
        if (s10 > 0) {
          expect(s1 / s10).toBeLessThan(0.25);
        }
      }
    }
  });

  it('9. Sanity guards & sensitivity monotonicity: NTPC flagged insolvent in Net Zero; sensitivities non-negative & monotone (Section 2.3)', () => {
    const ntpc = PRESET_ISSUERS.find((i) => i.ticker === 'NTPC')!;
    const curveNtpc = bootstrapHazardCurve(
      ntpc.tenors,
      ntpc.proxySpreadsBp.map((s) => s / 10000),
      0.40,
      ntpc.riskFreeRate
    );
    const mNtpc = mertonCalibrate(
      ntpc.equityUsdB * 1e9,
      ntpc.equityVol,
      ntpc.totalDebtUsdB * 1e9,
      ntpc.riskFreeRate,
      5.0,
      ntpc.proxySpreadsBp[2] / 10000
    );

    const outNtpcNz = computeClimateImpact(
      mNtpc,
      curveNtpc,
      ntpc.proxySpreadsBp,
      ntpc.scope1MtCo2,
      ntpc.scope2MtCo2,
      NGFS_SCENARIOS.net_zero_2050,
      DEFAULT_PARAMS
    );
    expect(outNtpcNz.status).toBe('insolvent_in_scenario');
    expect(outNtpcNz.shockedAssetValue).toBeLessThanOrEqual(mNtpc.debtValue);

    for (const iss of PRESET_ISSUERS) {
      if (iss.ticker === 'NTPC') continue;
      const curve = bootstrapHazardCurve(
        iss.tenors,
        iss.proxySpreadsBp.map((s) => s / 10000),
        0.40,
        iss.riskFreeRate
      );
      const m = mertonCalibrate(
        iss.equityUsdB * 1e9,
        iss.equityVol,
        iss.totalDebtUsdB * 1e9,
        iss.riskFreeRate,
        5.0,
        iss.proxySpreadsBp[2] / 10000
      );

      const levels = [0, 10, 20, 30];
      const sensitivities: number[] = [];
      for (const lvl of levels) {
        const bumpedScen = {
          ...NGFS_SCENARIOS.net_zero_2050,
          carbonPrices: NGFS_SCENARIOS.net_zero_2050.carbonPrices.map((p) => p + lvl),
        };
        const out = computeClimateImpact(
          m,
          curve,
          iss.proxySpreadsBp,
          iss.scope1MtCo2,
          iss.scope2MtCo2,
          bumpedScen,
          DEFAULT_PARAMS
        );
        expect(out.carbonPriceSensitivityBp).toBeGreaterThanOrEqual(0);
        sensitivities.push(out.carbonPriceSensitivityBp);
      }
      for (let i = 1; i < sensitivities.length; i++) {
        expect(sensitivities[i]).toBeGreaterThanOrEqual(sensitivities[i - 1] - 1e-9);
      }
    }
  });

  it('10. Recovery rate change from 40% to 25% changes hazard rates and preserves round-trip < 1e-8 (Section 2.5)', () => {
    const iss = PRESET_ISSUERS[0];
    const spreadsDecimals = iss.proxySpreadsBp.map((s) => s / 10000);
    const curve40 = bootstrapHazardCurve(iss.tenors, spreadsDecimals, 0.40, iss.riskFreeRate);
    const curve25 = bootstrapHazardCurve(iss.tenors, spreadsDecimals, 0.25, iss.riskFreeRate);

    iss.tenors.forEach((tenor, idx) => {
      expect(curve25.hazardRates[idx]).toBeLessThan(curve40.hazardRates[idx]);
      const legs25 = computeCdsLegs(curve25, tenor);
      expect(Math.abs(legs25.parSpread - spreadsDecimals[idx])).toBeLessThan(1e-8);
    });
  });
});

describe('Phase 3 Validation Tab Suite (Sections 3.1, 3.2, 3.3)', () => {
  it('11. Spearman rank correlation handles ties with average ranks matching scipy.stats.spearmanr (Section 3.1)', () => {
    // Tied vector [1, 1, 1, 1, 1, 1, 1, 1, 3.85] -> 8 tied at 1 get average rank (1+8)/2 = 4.5, 3.85 gets 9.0
    const tiedX = [1, 1, 1, 1, 3.85, 1, 1, 1, 1];
    const ranks = computeAverageRanks(tiedX);
    expect(ranks).toEqual([4.5, 4.5, 4.5, 4.5, 9.0, 4.5, 4.5, 4.5, 4.5]);

    const y = [62, 85, 118, 65, 178, 172, 38, 60, 56];
    const rhoTied = spearmanRankCorrelation(tiedX, y);
    // Exact scipy.stats.spearmanr([1,1,1,1,3.85,1,1,1,1], [62,85,118,65,178,172,38,60,56]) = 0.5477225575051661
    expect(Math.abs(rhoTied - 0.5477225575051661)).toBeLessThan(1e-12);
  });

  it('12. Unfloored cross-sectional regression excludes non-positive spreads (MSFT in Merton) and computes DD vs Proxy Spearman (Section 3.1)', () => {
    const mertonVal = computeCrossSectionalValidation(PRESET_ISSUERS, 'merton');
    expect(mertonVal.nTotal).toBe(9);
    expect(mertonVal.nIncluded).toBe(8);
    expect(mertonVal.excludedTickers).toEqual(['MSFT']);
    expect(mertonVal.verdictSentence).toContain('Exploratory, no statistical inference');
    expect(mertonVal.verdictSentence).toContain('MSFT');

    const cgVal = computeCrossSectionalValidation(PRESET_ISSUERS, 'creditGrades');
    expect(cgVal.nTotal).toBe(9);
    expect(cgVal.nIncluded).toBe(9);
    expect(cgVal.rSquared).toBeGreaterThan(0.5);
    expect(cgVal.spearmanSpreadIncludedRho).toBeGreaterThan(0.75);
    // Higher DD -> lower proxy spread (strong negative rank correlation across all N=9)
    expect(cgVal.spearmanDdVsProxyRho).toBeLessThan(-0.8);
  });

  it('13. Distress event studies have zero typed DD values in issuers.ts and compute monotonic DD decay on load (Section 3.2)', () => {
    for (const study of DISTRESS_CASE_STUDIES) {
      for (const pt of study.timeSeries) {
        expect('distanceToDefault' in pt).toBe(false);
        expect(pt.asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(pt.sourceNote).toContain('Illustrative reconstruction, approximate inputs');
      }
    }

    const peabody = DISTRESS_CASE_STUDIES.find((d) => d.issuerId === 'peabody')!;
    const pge = DISTRESS_CASE_STUDIES.find((d) => d.issuerId === 'pge')!;

    const compPeabody = computeDistressStudySeries(peabody);
    const compPge = computeDistressStudySeries(pge);

    // Finding F12 verification: PG&E 2016 Q4 (r=2%): DD = 4.05 (T=5) and 9.09 (T=1)
    expect(compPge.rows[0].computedDd5y).toBeCloseTo(4.05, 1);
    expect(compPge.rows[0].computedDd1y).toBeCloseTo(9.09, 1);

    // Exact coupled Merton solver on Peabody 2016 Q1 (E=0.06B, D=6.4B -> V < D) gives negative DD (-2.40 at T=5, -0.32 at T=1)
    const lastPeabody = compPeabody.rows[compPeabody.rows.length - 1];
    expect(lastPeabody.computedDd5y).toBeCloseTo(-2.40, 1);
    expect(lastPeabody.computedDd1y).toBeCloseTo(-0.32, 1);

    // Monotonic decline of Peabody DD into Chapter 11
    for (let i = 1; i < compPeabody.rows.length; i++) {
      expect(compPeabody.rows[i].computedDd5y).toBeLessThan(compPeabody.rows[i - 1].computedDd5y);
    }
  });

  it('14. Seeded Monte Carlo (mulberry32) is 100% deterministic, uses shared 2,000 draw constant, and orders P5 <= Median <= P95 (Section 3.3)', () => {
    expect(MONTE_CARLO_DEFAULT_DRAWS).toBe(2000);

    const rngA = mulberry32(DEFAULT_MC_SEED);
    const rngB = mulberry32(DEFAULT_MC_SEED);
    for (let i = 0; i < 20; i++) {
      expect(rngA()).toBe(rngB());
    }

    const tte = PRESET_ISSUERS.find((i) => i.ticker === 'TTE')!;
    const curve = bootstrapHazardCurve(
      tte.tenors,
      tte.proxySpreadsBp.map((s) => s / 10000),
      0.40,
      tte.riskFreeRate
    );
    const m = mertonCalibrate(
      tte.equityUsdB * 1e9,
      tte.equityVol,
      tte.totalDebtUsdB * 1e9,
      tte.riskFreeRate,
      5.0,
      tte.proxySpreadsBp[2] / 10000
    );

    const run1 = runMonteCarloSimulation(
      m,
      curve,
      tte.proxySpreadsBp,
      tte.scope1MtCo2,
      tte.scope2MtCo2,
      NGFS_SCENARIOS.net_zero_2050,
      MONTE_CARLO_DEFAULT_DRAWS,
      DEFAULT_MC_SEED
    );
    const run2 = runMonteCarloSimulation(
      m,
      curve,
      tte.proxySpreadsBp,
      tte.scope1MtCo2,
      tte.scope2MtCo2,
      NGFS_SCENARIOS.net_zero_2050,
      MONTE_CARLO_DEFAULT_DRAWS,
      DEFAULT_MC_SEED
    );
    const runDiffSeed = runMonteCarloSimulation(
      m,
      curve,
      tte.proxySpreadsBp,
      tte.scope1MtCo2,
      tte.scope2MtCo2,
      NGFS_SCENARIOS.net_zero_2050,
      MONTE_CARLO_DEFAULT_DRAWS,
      DEFAULT_MC_SEED + 1
    );

    expect(run1.numDraws).toBe(2000);
    expect(run1.p5).toBe(run2.p5);
    expect(run1.median).toBe(run2.median);
    expect(run1.p95).toBe(run2.p95);
    expect(run1.median).not.toBe(runDiffSeed.median);

    for (const band of run1.tenorBands) {
      expect(band.deltaP5Bp).toBeLessThanOrEqual(band.deltaMedianBp);
      expect(band.deltaMedianBp).toBeLessThanOrEqual(band.deltaP95Bp);
      expect(band.spreadP5Bp).toBeLessThanOrEqual(band.spreadMedianBp);
      expect(band.spreadMedianBp).toBeLessThanOrEqual(band.spreadP95Bp);
    }
  });

  it('15. Phase 4 data provenance (proxy_spreads.csv, per-input asOf/sourceUrl/status) and oil & gas Scope 3 toggle (Sections 4.1 & 4.5)', () => {
    expect(Object.keys(PROXY_SPREAD_TABLE).length).toBeGreaterThanOrEqual(9);

    for (const iss of PRESET_ISSUERS) {
      const prov = iss.inputProvenance;
      expect(prov.marketCap.asOf).toBeTruthy();
      expect(prov.marketCap.sourceUrl).toMatch(/^https?:\/\//);
      expect(prov.marketCap.verificationStatus).toBe('illustrative, hand-entered');
      expect(prov.proxySpreads.verificationStatus).toBe(
        'rating-based proxies, not traded CDS quotes'
      );
      expect(PROXY_SPREAD_TABLE[iss.ticker].tenorsBp).toEqual(iss.proxySpreadsBp);
    }

    const xom = PRESET_ISSUERS.find((i) => i.ticker === 'XOM')!;
    expect(xom.scope3MtCo2).toBeGreaterThan(400);

    const curve = bootstrapHazardCurve(
      xom.tenors,
      xom.proxySpreadsBp.map((s) => s / 10000),
      0.40,
      xom.riskFreeRate
    );
    const m = mertonCalibrate(
      xom.equityUsdB * 1e9,
      xom.equityVol,
      xom.totalDebtUsdB * 1e9,
      xom.riskFreeRate,
      5.0,
      xom.proxySpreadsBp[2] / 10000
    );

    const outScope12 = computeClimateImpact(
      m,
      curve,
      xom.proxySpreadsBp,
      xom.scope1MtCo2,
      xom.scope2MtCo2,
      NGFS_SCENARIOS.net_zero_2050,
      { ...DEFAULT_PARAMS, includeScope3: false, scope3MtCo2: xom.scope3MtCo2 }
    );
    const outScope123 = computeClimateImpact(
      m,
      curve,
      xom.proxySpreadsBp,
      xom.scope1MtCo2,
      xom.scope2MtCo2,
      NGFS_SCENARIOS.net_zero_2050,
      { ...DEFAULT_PARAMS, includeScope3: true, scope3MtCo2: xom.scope3MtCo2 }
    );

    expect(outScope123.totalHaircutUsd).toBeGreaterThan(outScope12.totalHaircutUsd * 5);
    expect(outScope123.scaledDeltaSpreadBp).toBeGreaterThan(outScope12.scaledDeltaSpreadBp);
  });
});


