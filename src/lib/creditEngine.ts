/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Climate-Adjusted Credit Curve & CDS Pricing Desk Quantitative Engine
 * Based on O'Kane & Turnbull (2003), Merton (1974), CreditGrades (2002),
 * Kenyon / Forvis Mazars (2023) hazard-curve stress ramp, and NGFS Phase IV Scenarios.
 */

// High-precision complementary error function (Cody 1969, relative error < 1e-15)
function erfcHighPrec(x: number): number {
  const z = Math.abs(x);
  let ans = 0;

  if (z <= 0.46875) {
    const a = [
      3.16112374387056560e00, 1.13864154151050156e02,
      3.77485237685302021e02, 3.20937758913846947e03,
      1.85777706184603153e-01,
    ];
    const b = [
      2.36012909523441209e01, 2.44024637934444173e02,
      1.28261652607737228e03, 2.84423683343917062e03,
    ];
    const y = z * z;
    const xnum = (((a[4] * y + a[0]) * y + a[1]) * y + a[2]) * y + a[3];
    const xden = (((y + b[0]) * y + b[1]) * y + b[2]) * y + b[3];
    const erfVal = z * (xnum / xden);
    ans = x >= 0 ? 1 - erfVal : 1 + erfVal;
    return ans;
  } else if (z <= 4.0) {
    const c = [
      5.64188496988670089e-01, 8.88314979438837594e00,
      6.61191906371416295e01, 2.98635138197400131e02,
      8.81952221241769090e02, 1.71204761263407058e03,
      2.05107837782607147e03, 1.23033935479799725e03,
      2.15311535474403846e-08,
    ];
    const d = [
      1.57449261107098347e01, 1.17693950891312499e02,
      5.37181101862009858e02, 1.62138957456669019e03,
      3.29079923573345963e03, 4.36261909014324716e03,
      3.43936767414372164e03, 1.23033851197997419e03,
    ];
    let xnum = c[8] * z;
    let xden = z;
    for (let i = 0; i < 7; i++) {
      xnum = (xnum + c[i]) * z;
      xden = (xden + d[i]) * z;
    }
    const res = ((xnum + c[7]) / (xden + d[7])) * Math.exp(-z * z);
    return x >= 0 ? res : 2 - res;
  } else {
    if (z >= 26.5) return x >= 0 ? 0 : 2;
    const p = [
      3.05326634961232344e-01, 3.60344899949804439e-01,
      1.25781726111229246e-01, 1.60837851487422766e-02,
      6.58749161529837803e-04, 1.63153871373020978e-02,
    ];
    const q = [
      2.56852019228982231e00, 1.87295284992346047e00,
      5.27905102951428412e-01, 6.05183413124413191e-02,
      2.33520497626869185e-03,
    ];
    const y = 1.0 / (z * z);
    let xnum = p[5] * y;
    let xden = y;
    for (let i = 0; i < 4; i++) {
      xnum = (xnum + p[i]) * y;
      xden = (xden + q[i]) * y;
    }
    const res = Math.exp(-z * z) * (1.0 / Math.sqrt(Math.PI) - y * (xnum + p[4]) / (xden + q[4])) / z;
    return x >= 0 ? Math.max(0, res) : 2 - Math.max(0, res);
  }
}

// Standard normal CDF (machine precision via Cody erfc)
export function normalCdf(x: number): number {
  return 0.5 * erfcHighPrec(-x / Math.SQRT2);
}

// Standard normal PDF
export function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// Inverse standard normal CDF (Acklam rational approximation accurate to < 1.15e-9)
export function invNormalCdf(p: number): number {
  if (p <= 0) return -8.0;
  if (p >= 1) return 8.0;

  const a = [
    -3.969683028665376e+01,
     2.209460984245205e+02,
    -2.759285104469687e+02,
     1.383577518672690e+02,
    -3.066479806614716e+01,
     2.506628277459239e+00,
  ];

  const b = [
    -5.447609879822406e+01,
     1.615858368580409e+02,
    -1.556989798598866e+02,
     6.680131188771972e+01,
    -1.328068155288572e+01,
  ];

  const c = [
    -7.784894002430293e-03,
    -3.223964580411365e-01,
    -2.400758277161838e+00,
    -2.549732539343734e+00,
     4.374664141464968e+00,
     2.938163982698783e+00,
  ];

  const d = [
     7.784695709041462e-03,
     3.224671290700398e-01,
     2.445134137142996e+00,
     3.754408661907416e+00,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) /
           ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1);
  } else if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    return (((((a[0]*r + a[1])*r + a[2])*r + a[3])*r + a[4])*r + a[5]) * q /
           (((((b[0]*r + b[1])*r + b[2])*r + b[3])*r + b[4])*r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) /
            ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1);
  }
}

// Standard 1D Brent root solver
export function brentq(
  f: (x: number) => number,
  x1: number,
  x2: number,
  tol = 1e-10,
  maxIter = 100
): number {
  let a = x1;
  let b = x2;
  let fa = f(a);
  let fb = f(b);

  if (Math.abs(fa) < tol) return a;
  if (Math.abs(fb) < tol) return b;

  if (fa * fb > 0) {
    const step = (x2 - x1) / 10;
    let found = false;
    for (let i = 0; i < 10; i++) {
      const mid = x1 + i * step;
      const fmid = f(mid);
      if (fa * fmid <= 0) {
        b = mid;
        fb = fmid;
        found = true;
        break;
      }
    }
    if (!found) {
      throw new Error(`Root is not bracketed: f(${x1})=${fa}, f(${x2})=${fb}`);
    }
  }

  let c = a;
  let fc = fa;
  let d = b - a;
  let e = d;

  for (let iter = 0; iter < maxIter; iter++) {
    if (fb * fc > 0) {
      c = a;
      fc = fa;
      d = b - a;
      e = d;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b;
      b = c;
      c = a;
      fa = fb;
      fb = fc;
      fc = fa;
    }

    const tolAct = 2 * 2.220446049250313e-16 * Math.abs(b) + 0.5 * tol;
    const newStep = 0.5 * (c - b);

    if (Math.abs(newStep) <= tolAct || Math.abs(fb) < tol) {
      return b;
    }

    if (Math.abs(e) >= tolAct && Math.abs(fa) > Math.abs(fb)) {
      let p: number;
      let q: number;

      if (a === c) {
        p = 2 * newStep * (fb / fa);
        q = 1 - (fb / fa);
      } else {
        q = fa / fc;
        const r = fb / fc;
        const s = fb / fa;
        p = s * (2 * newStep * q * (q - r) - (b - a) * (r - 1));
        q = (q - 1) * (r - 1) * (s - 1);
      }

      if (p > 0) {
        q = -q;
      } else {
        p = -p;
      }

      if (2 * p < Math.min(3 * newStep * q - Math.abs(tolAct * q), Math.abs(e * q))) {
        e = d;
        d = p / q;
      } else {
        d = newStep;
        e = d;
      }
    } else {
      d = newStep;
      e = d;
    }

    a = b;
    fa = fb;

    if (Math.abs(d) > tolAct) {
      b += d;
    } else if (newStep > 0) {
      b += tolAct;
    } else {
      b -= tolAct;
    }

    fb = f(b);
  }

  return b;
}

export interface HazardCurve {
  tenors: number[]; // e.g. [1, 3, 5, 7, 10]
  hazardRates: number[]; // piecewise-constant hazard rates per bucket
  recovery: number; // e.g. 0.40
  r: number; // continuous risk-free rate, e.g. 0.04
}

/**
 * Calculates cumulative hazard rate Lambda(t) = integral_0^t lambda(s) ds
 */
export function cumulativeHazard(curve: HazardCurve, t: number): number {
  if (t <= 0) return 0;
  let cum = 0;
  let prevT = 0;

  for (let i = 0; i < curve.tenors.length; i++) {
    const curT = curve.tenors[i];
    const rate = curve.hazardRates[i];

    if (t <= curT) {
      cum += rate * (t - prevT);
      return cum;
    } else {
      cum += rate * (curT - prevT);
      prevT = curT;
    }
  }

  const lastRate = curve.hazardRates[curve.hazardRates.length - 1];
  cum += lastRate * (t - prevT);
  return cum;
}

/**
 * Calculates survival probability Q(t) = exp(-Lambda(t))
 */
export function survivalProb(curve: HazardCurve, t: number): number {
  return Math.exp(-cumulativeHazard(curve, t));
}

export interface CdsLegs {
  protectionLeg: number;
  premiumLeg: number; // with coupon = 1, i.e. RPV01
  rpv01: number;
  parSpread: number; // in decimals (e.g. 0.0100 for 100 bp)
  parSpreadBp: number; // in basis points (e.g. 100)
}

/**
 * Computes CDS protection and premium legs using quarterly grid and half-period accrual.
 * Frequency: dt = 0.25 (quarterly)
 * Formula:
 * Protection Leg = (1 - R) * sum_{i} D(t_mid) * [Q(t_{i-1}) - Q(t_i)]
 * Premium Leg (RPV01) = sum_{i} [ D(t_i) * dt * Q(t_i) + 0.5 * dt * D(t_i) * (Q(t_{i-1}) - Q(t_i)) ]
 */
export function computeCdsLegs(
  curve: HazardCurve,
  tenor: number,
  dt = 0.25
): CdsLegs {
  const steps = Math.round(tenor / dt);
  let protLeg = 0;
  let rpv01 = 0;

  let prevQ = 1.0;
  let prevT = 0.0;

  for (let i = 1; i <= steps; i++) {
    const curT = i * dt;
    const midT = 0.5 * (prevT + curT);
    const curQ = survivalProb(curve, curT);
    const dQ = prevQ - curQ;

    const discountMid = Math.exp(-curve.r * midT);
    const discountEnd = Math.exp(-curve.r * curT);

    protLeg += (1 - curve.recovery) * discountMid * dQ;

    const regularPayment = discountEnd * dt * curQ;
    const accrualPayment = 0.5 * dt * discountEnd * dQ;
    rpv01 += regularPayment + accrualPayment;

    prevQ = curQ;
    prevT = curT;
  }

  const parSpread = rpv01 > 0 ? protLeg / rpv01 : 0;

  return {
    protectionLeg: protLeg,
    premiumLeg: rpv01,
    rpv01,
    parSpread,
    parSpreadBp: parSpread * 10000,
  };
}

/**
 * Bootstraps a piecewise-constant hazard rate curve from market proxy spreads.
 * Guaranteed round-trip repricing error below 1e-8.
 * Throws a descriptive error if an inverted curve implies a negative forward hazard rate
 * or cannot be bracketed (Section 2.6).
 */
export function bootstrapHazardCurve(
  tenors: number[],
  spreadsDecimals: number[],
  recovery = 0.4,
  r = 0.04
): HazardCurve {
  if (tenors.length !== spreadsDecimals.length || tenors.length === 0) {
    throw new Error('Tenors and spreads arrays must be non-empty and of equal length.');
  }
  if (recovery < 0 || recovery >= 1) {
    throw new Error(`Invalid recovery rate: ${recovery}. Must be in [0, 1).`);
  }

  const n = tenors.length;
  const hazardRates: number[] = [];

  for (let k = 0; k < n; k++) {
    const curTenor = tenors[k];
    const targetSpread = spreadsDecimals[k];
    if (targetSpread < 0) {
      throw new Error(`Negative spread (${targetSpread}) not allowed at tenor ${curTenor}Y.`);
    }

    const obj = (lambdaCandidate: number): number => {
      const trialCurve: HazardCurve = {
        tenors: tenors.slice(0, k + 1),
        hazardRates: [...hazardRates, lambdaCandidate],
        recovery,
        r,
      };
      const legs = computeCdsLegs(trialCurve, curTenor);
      return legs.parSpread - targetSpread;
    };

    // Check minimum achievable par spread at lambda_k = 0 (detects steep curve inversion)
    const minSpread = obj(0.0) + targetSpread;
    if (minSpread - targetSpread > 1e-10) {
      throw new Error(
        `Negative forward hazard rate implied at tenor ${curTenor}Y: target spread ${(targetSpread * 10000).toFixed(2)} bp is below minimum achievable spread ${(minSpread * 10000).toFixed(2)} bp from prior tenors.`
      );
    }

    const approxLambda = Math.max(1e-5, targetSpread / (1 - recovery));
    let lower = 0.0;
    let upper = Math.max(0.5, approxLambda * 4.0);

    const fLower = obj(lower);
    let fUpper = obj(upper);
    while (fUpper < 0 && upper < 50.0) {
      upper *= 2.0;
      fUpper = obj(upper);
    }

    if (fLower * fUpper > 0) {
      throw new Error(
        `Hazard rate root not bracketed at tenor ${curTenor}Y: f(0)=${fLower.toExponential(3)}, f(${upper})=${fUpper.toExponential(3)}`
      );
    }

    const solvedLambda = brentq(obj, lower, upper, 1e-12);
    if (solvedLambda < -1e-9) {
      throw new Error(`Negative hazard rate solved at tenor ${curTenor}Y: ${solvedLambda}`);
    }
    hazardRates.push(Math.max(0.0, solvedLambda));
  }

  return {
    tenors: [...tenors],
    hazardRates,
    recovery,
    r,
  };
}

/**
 * Computes Mark-to-Market (MTM) on a protection buyer position.
 * MTM = Notional * (Current Spread - Contract Coupon) * RPV01
 */
export function computeCdsMtm(
  curve: HazardCurve,
  tenor: number,
  contractCouponDecimals: number,
  notionalEur = 10_000_000
): { mtm: number; rpv01: number; currentSpreadBp: number } {
  const legs = computeCdsLegs(curve, tenor);
  const mtm = notionalEur * (legs.parSpread - contractCouponDecimals) * legs.rpv01;
  return {
    mtm,
    rpv01: legs.rpv01,
    currentSpreadBp: legs.parSpreadBp,
  };
}

/**
 * Computes CS01: Spread sensitivity in EUR per 1 bp parallel shift in spread curve.
 * CS01 = Notional * RPV01 * 0.0001
 */
export function computeCs01(
  curve: HazardCurve,
  tenor: number,
  notionalEur = 10_000_000
): number {
  const legs = computeCdsLegs(curve, tenor);
  return notionalEur * legs.rpv01 * 0.0001;
}

// ============================================================================
// Merton (1974) Structural Model & CreditGrades (2002) First-Passage Engine
// ============================================================================

export interface MertonResult {
  assetValue: number; // V ($)
  assetVol: number; // sigma_V (annualized)
  d1: number;
  d2: number;
  distanceToDefault: number; // DD
  riskNeutralPd: number; // N(-d2)
  modelSpread: number; // decimal
  modelSpreadBp: number; // basis points
  kappa: number; // Raw unclipped 5Y ratio: proxy / merton (Infinity if mertonSpread == 0)
  creditGradesSpread5yBp: number; // CreditGrades (2002) 5Y spread in bp (unscaled)
  creditGradesAssetVol: number; // CreditGrades calibrated asset vol sigma_V = sigma_E * E / (E + L_bar * D)
  equityValue: number;
  debtValue: number;
  eq1Residual: number; // Absolute residual of E = V*N(d1) - D*exp(-rT)*N(d2)
  eq2Residual: number; // Absolute residual of sigma_E*E = N(d1)*sigma_V*V
}

/**
 * Computes Merton model credit spread:
 * s = -(1/T) * ln[ N(d2) + (V / (D * exp(-rT))) * N(-d1) ]
 */
export function mertonSpread(
  V: number,
  sigmaV: number,
  D: number,
  r: number,
  T: number
): number {
  if (V <= 0 || sigmaV <= 0 || D <= 0 || T <= 0) return 0;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(V / D) + (r + 0.5 * sigmaV * sigmaV) * T) / (sigmaV * sqrtT);
  const d2 = d1 - sigmaV * sqrtT;

  const discount = Math.exp(-r * T);
  const bondPriceRatio = normalCdf(d2) + (V / (D * discount)) * normalCdf(-d1);

  if (bondPriceRatio <= 0 || isNaN(bondPriceRatio)) return 0;
  const spread = -(1 / T) * Math.log(bondPriceRatio);
  return Math.max(0, spread);
}

/**
 * CreditGrades (Finkelstein, Lardy, Pan, Ta & Tierney, RiskMetrics 2002)
 * first-passage survival probability with barrier uncertainty.
 * Published parameterisation:
 *   meanRecovery (L_bar) = 0.5
 *   barrierUncertainty (lambda) = 0.3
 *   d = ((E + L_bar * D) / (L_bar * D)) * exp(lambda^2)
 *   A_t = sqrt(sigma_V^2 * t + lambda^2)
 *   P(t) = Phi(-A_t / 2 + ln(d) / A_t) - d * Phi(-A_t / 2 - ln(d) / A_t)
 */
export function creditGradesSurvival(
  E: number,
  D: number,
  sigmaV: number,
  t: number,
  meanRecovery = 0.5,
  barrierUncertainty = 0.3
): number {
  if (t <= 0) return 1.0;
  if (E <= 0 || D <= 0 || sigmaV <= 0) return 0.0;
  const lBarD = meanRecovery * D;
  const d = ((E + lBarD) / lBarD) * Math.exp(barrierUncertainty * barrierUncertainty);
  const A = Math.sqrt(sigmaV * sigmaV * t + barrierUncertainty * barrierUncertainty);
  const lnD = Math.log(d);
  const p = normalCdf(-0.5 * A + lnD / A) - d * normalCdf(-0.5 * A - lnD / A);
  return Math.max(1e-15, Math.min(1.0, p));
}

/**
 * CreditGrades (2002) model par spread (in basis points) at maturity t:
 *   hazard(t) = -ln(P(t)) / t
 *   spreadBp(t) = hazard(t) * (1 - R) * 10000
 */
export function creditGradesSpreadBp(
  E: number,
  D: number,
  sigmaV: number,
  t: number,
  recovery = 0.4,
  meanRecovery = 0.5,
  barrierUncertainty = 0.3
): number {
  if (t <= 0) return 0.0;
  const p = creditGradesSurvival(E, D, sigmaV, t, meanRecovery, barrierUncertainty);
  const hazard = -Math.log(p) / t;
  return hazard * (1.0 - recovery) * 10000.0;
}

function solveVGivenSigmaV(
  E: number,
  D: number,
  r: number,
  T: number,
  sigV: number
): number {
  const discount = Math.exp(-r * T);
  const sqrtT = Math.sqrt(T);

  const fV = (v: number): number => {
    const d1 = (Math.log(v / D) + (r + 0.5 * sigV * sigV) * T) / (sigV * sqrtT);
    const d2 = d1 - sigV * sqrtT;
    return v * normalCdf(d1) - D * discount * normalCdf(d2) - E;
  };

  let vLo = Math.max(1e-12, E * (1.0 - 1e-6));
  let vHi = (E + D * discount) * (1.0 + 1e-6);
  while (fV(vLo) > 0) vLo *= 0.5;
  while (fV(vHi) < 0) vHi *= 1.5;

  const tol = 1e-13 * Math.max(1.0, E);
  return brentq(fV, vLo, vHi, tol, 150);
}

/**
 * Calibrates Merton asset value V and asset volatility sigma_V
 * from observable Equity E, Equity Volatility sigma_E, Debt D, risk-free r, and maturity T.
 *
 * Equations:
 * 1. E = V * N(d1) - D * exp(-rT) * N(d2)
 * 2. sigma_E * E = N(d1) * sigma_V * V
 *
 * Section 2.1: Removes hardcoded kappa bounds [0.2, 12.0] and 1.0 fallback.
 * Reports raw unclipped kappa = proxy5y / merton5y (or Infinity when merton5y == 0)
 * alongside CreditGrades (2002) first-passage metrics.
 */
export function mertonCalibrate(
  E: number,
  sigmaE: number,
  D: number,
  r = 0.04,
  T = 5.0,
  proxy5ySpreadDecimals = 0.0120
): MertonResult {
  if (E <= 0 || sigmaE <= 0 || D <= 0 || T <= 0) {
    throw new Error(`Invalid Merton inputs: E=${E}, sigmaE=${sigmaE}, D=${D}, T=${T}`);
  }

  const discount = Math.exp(-r * T);
  const sqrtT = Math.sqrt(T);

  const obj = (sigV: number): number => {
    const v = solveVGivenSigmaV(E, D, r, T, sigV);
    const d1 = (Math.log(v / D) + (r + 0.5 * sigV * sigV) * T) / (sigV * sqrtT);
    return normalCdf(d1) * sigV * v - sigmaE * E;
  };

  let low = Math.max(1e-6, sigmaE * 1e-3);
  let high = Math.max(2.0, sigmaE * 3.0);
  while (obj(low) > 0 && low > 1e-10) low *= 0.1;
  while (obj(high) < 0 && high < 20.0) high *= 2.0;

  const sigmaV = brentq(obj, low, high, 1e-13, 150);
  const V = solveVGivenSigmaV(E, D, r, T, sigmaV);

  const d1 = (Math.log(V / D) + (r + 0.5 * sigmaV * sigmaV) * T) / (sigmaV * sqrtT);
  const d2 = d1 - sigmaV * sqrtT;

  const eq1Res = Math.abs(V * normalCdf(d1) - D * discount * normalCdf(d2) - E);
  const eq2Res = Math.abs(normalCdf(d1) * sigmaV * V - sigmaE * E);
  if (eq1Res > 1e-6 * Math.max(1.0, E) || eq2Res > 1e-6 * Math.max(1.0, sigmaE * E)) {
    throw new Error(`Merton calibration residuals exceeded tolerance: eq1=${eq1Res}, eq2=${eq2Res}`);
  }

  const dd = (Math.log(V / D) + (r - 0.5 * sigmaV * sigmaV) * T) / (sigmaV * sqrtT);
  const rnPd = normalCdf(-d2);
  const modelSpr = mertonSpread(V, sigmaV, D, r, T);

  // Raw unclipped kappa (no [0.2, 12.0] clip and no 1.0 fallback)
  const kappa = modelSpr > 0 ? proxy5ySpreadDecimals / modelSpr : Number.POSITIVE_INFINITY;

  // CreditGrades (2002) published parameterisation: L_bar = 0.5, lambda = 0.3
  const cgAssetVol = sigmaE * (E / (E + 0.5 * D));
  const cgSpread5yBp = creditGradesSpreadBp(E, D, cgAssetVol, T, 0.4, 0.5, 0.3);

  return {
    assetValue: V,
    assetVol: sigmaV,
    d1,
    d2,
    distanceToDefault: dd,
    riskNeutralPd: rnPd,
    modelSpread: modelSpr,
    modelSpreadBp: modelSpr * 10000,
    kappa,
    creditGradesSpread5yBp: cgSpread5yBp,
    creditGradesAssetVol: cgAssetVol,
    equityValue: E,
    debtValue: D,
    eq1Residual: eq1Res,
    eq2Residual: eq2Res,
  };
}

// ============================================================================
// NGFS Climate Transition Scenarios & Haircut Engine
// ============================================================================

export interface ClimateScenarioDef {
  id: 'net_zero_2050' | 'delayed_transition' | 'current_policies';
  name: string;
  type: 'Orderly' | 'Disorderly' | 'Hot House World';
  description: string;
  carbonPrices: number[];
  emissionsIndex: number[];
}

export const NGFS_SCENARIOS: Record<string, ClimateScenarioDef> = {
  net_zero_2050: {
    id: 'net_zero_2050',
    name: 'Net Zero 2050 (Orderly)',
    type: 'Orderly',
    description: 'Ambitious climate policies introduced immediately. Carbon prices rise steadily to ~$280/tCO2 by 2050 with accelerated technological decarbonization.',
    carbonPrices: [
      35, 42, 50, 60, 72, 85, 100, 116, 134, 152, 170, 186, 202, 216, 230, 242, 252, 260, 268, 274, 278, 282, 285, 288, 290, 292
    ],
    emissionsIndex: [
      1.00, 0.96, 0.92, 0.88, 0.83, 0.78, 0.73, 0.68, 0.63, 0.58, 0.53, 0.48, 0.43, 0.38, 0.34, 0.30, 0.27, 0.24, 0.21, 0.19, 0.17, 0.15, 0.14, 0.13, 0.12, 0.11
    ],
  },
  delayed_transition: {
    id: 'delayed_transition',
    name: 'Delayed Transition (Disorderly)',
    type: 'Disorderly',
    description: 'Annual carbon price remains subdued until 2030, followed by abrupt disruptive regulatory intervention surging to ~$380/tCO2 by 2045.',
    carbonPrices: [
      15, 17, 19, 21, 25, 30, 75, 125, 185, 240, 290, 330, 360, 380, 395, 405, 410, 412, 415, 415, 415, 415, 415, 415, 415, 415
    ],
    emissionsIndex: [
      1.00, 1.01, 1.01, 1.00, 0.99, 0.98, 0.91, 0.82, 0.72, 0.62, 0.52, 0.44, 0.38, 0.33, 0.29, 0.26, 0.23, 0.21, 0.19, 0.18, 0.17, 0.16, 0.15, 0.14, 0.13, 0.12
    ],
  },
  current_policies: {
    id: 'current_policies',
    name: 'Current Policies (Hot House World)',
    type: 'Hot House World',
    description: 'No new transition policies. Carbon prices remain low ($10-$35/tCO2) while emissions stay near current peak levels.',
    carbonPrices: [
      10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 24, 26, 28, 30, 31, 32, 33, 34, 35, 36, 37, 37, 38, 38
    ],
    emissionsIndex: [
      1.00, 1.01, 1.02, 1.02, 1.02, 1.01, 1.01, 1.00, 0.99, 0.98, 0.97, 0.96, 0.96, 0.95, 0.94, 0.93, 0.92, 0.92, 0.91, 0.90, 0.90, 0.89, 0.89, 0.88, 0.88, 0.87
    ],
  },
};

export interface ClimateOverlayParams {
  passThrough: number; // e.g. 0.40 (40% passed to customers)
  wacc: number; // e.g. 0.08 (8%)
  taxRate: number; // e.g. 0.25 (25%)
  horizonYears: number; // e.g. 25
  includeTerminalValue: boolean;
  terminalGrowthRate: number; // e.g. 0.015
  volUpliftFactor: number; // e.g. 0.5 (vol rises as haircut increases)
  rampMidpointYears?: number; // Section 2.2 logistic tenor ramp midpoint m (default 7)
  rampWidthYears?: number; // Section 2.2 logistic tenor ramp width w (default 2)
  additionalCarbonShockUsd?: number; // e.g. 10 for carbon-price sensitivity
  includeScope3?: boolean; // Section 4.5 optional toggle for oil & gas issuers (default false)
  scope3MtCo2?: number; // Optional Scope 3 emissions in MtCO2e
}

export type ClimateScenarioStatus =
  | 'normal'
  | 'severe'
  | 'insolvent_in_scenario'
  | 'uninformative_at_current_leverage';

export interface ClimateOutput {
  scenarioId: string;
  status: ClimateScenarioStatus;
  statusExplanation: string;
  exceedsEmpiricalRange: boolean; // True when 5Y adjusted shift > 300 bp or insolvent
  annualCostsUsd: number[]; // 2025 to 2050
  discountedCostsUsd: number[];
  explicitHaircutUsd: number;
  terminalValueUsd: number;
  totalHaircutUsd: number;
  haircutPctV: number;
  baseAssetValue: number;
  shockedAssetValue: number; // Raw V - totalHaircut (no 1.01 * D floor)
  baseAssetVol: number;
  shockedAssetVol: number;
  baseMertonSpreadBp: number;
  shockedMertonSpreadBp: number;
  deltaMertonSpreadBp: number; // Raw shocked - base (no Math.max(0, ...) floor)
  creditGradesBase5yBp: number;
  creditGradesShocked5yBp: number;
  creditGradesDelta5yBp: number;
  creditGradesDelta10yBp: number;
  scaledDeltaSpreadBp: number; // 5Y spread shift applied to curve
  tenorShiftsBp: number[]; // Per-tenor spread shift (1, 3, 5, 7, 10Y)
  adjustedSpreadsBp: number[];
  adjustedHazardRates: number[];
  adjustedSurvivalProbs: number[];
  mtmProtectionImpactEur: number;
  carbonPriceSensitivityBp: number; // Spread change (bp) per +$10/tCO2
  climateCs01Bp: number; // Alias of carbonPriceSensitivityBp for backwards compatibility
  cs01EurPerBp: number; // Real CS01: EUR per 1bp = notional * RPV01 * 0.0001
  base5ySurvivalProb: number;
  adj5ySurvivalProb: number;
}

/**
 * Logistic tenor weight g(T) = 1 / (1 + exp(-(T - m) / w)) normalised so g(10) = 1.
 * Follows the hazard-curve stress approach with midpoint and width in climate CVA
 * (Kenyon; Forvis Mazars 2023).
 */
export function logisticTenorRamp(
  tenor: number,
  midpointYears = 7.0,
  widthYears = 2.0
): number {
  const w = Math.max(0.1, widthYears);
  const rawT = 1.0 / (1.0 + Math.exp(-(tenor - midpointYears) / w));
  const raw10 = 1.0 / (1.0 + Math.exp(-(10.0 - midpointYears) / w));
  return rawT / raw10;
}

/**
 * Computes the full climate transition overlay:
 * 1. Annual cash outflow from carbon costs: (1 - p) * Emissions * Index * CarbonPrice * (1 - Tax)
 * 2. DCF present value haircut + optional terminal value
 * 3. CreditGrades (2002) first-passage structural shift (E' = max(E - haircut, 1e6)) + unclipped Merton diagnostics
 * 4. Tenor-dependent logistic ramp g(T) normalized to g(10) = 1 (Section 2.2)
 * 5. Explicit sanity states ('normal' | 'severe' | 'insolvent_in_scenario' | 'uninformative_at_current_leverage')
 * 6. MTM impact on EUR 10M protection, real CS01 (EUR/bp), and Carbon-price sensitivity (bp per +$10/tCO2)
 */
export function computeClimateImpact(
  merton: MertonResult,
  baseCurve: HazardCurve,
  baseSpreadsBp: number[],
  scope1MtCo2: number,
  scope2MtCo2: number,
  scenarioDef: ClimateScenarioDef,
  params: ClimateOverlayParams,
  notionalEur = 10_000_000
): ClimateOutput {
  const scope3ActiveMt = params.includeScope3 ? (params.scope3MtCo2 || 0) : 0;
  const totalEmissionsTons = (scope1MtCo2 + scope2MtCo2 + scope3ActiveMt) * 1_000_000;
  const horizon = Math.min(params.horizonYears, scenarioDef.carbonPrices.length);

  const annualCostsUsd: number[] = [];
  const discountedCostsUsd: number[] = [];
  let explicitHaircut = 0;

  for (let t = 0; t < horizon; t++) {
    const rawPrice = scenarioDef.carbonPrices[t] + (params.additionalCarbonShockUsd || 0);
    const carbonPrice = Math.max(0, rawPrice);
    const emissionsIdx = scenarioDef.emissionsIndex[t];

    const cost = (1 - params.passThrough) * totalEmissionsTons * emissionsIdx * carbonPrice * (1 - params.taxRate);
    annualCostsUsd.push(cost);

    const discountFactor = Math.pow(1 + params.wacc, t + 1);
    const pvCost = cost / discountFactor;
    discountedCostsUsd.push(pvCost);
    explicitHaircut += pvCost;
  }

  let terminalValue = 0;
  if (params.includeTerminalValue && horizon > 0) {
    const lastCost = annualCostsUsd[horizon - 1];
    const denom = Math.max(0.01, params.wacc - params.terminalGrowthRate);
    terminalValue = (lastCost * (1 + params.terminalGrowthRate)) / denom;
    terminalValue = terminalValue / Math.pow(1 + params.wacc, horizon);
  }

  const totalHaircut = explicitHaircut + terminalValue;
  const haircutRatio = merton.assetValue > 0 ? totalHaircut / merton.assetValue : 0;
  const haircutPctV = haircutRatio * 100;

  // Section 2.3: Raw shocked asset value without the artificial 1.01 * D floor
  const shockedV = merton.assetValue - totalHaircut;
  const isInsolvent = shockedV <= merton.debtValue;
  const isSevere = !isInsolvent && haircutRatio >= 0.5;

  // Volatility uplift
  const volMultiplier = Math.min(2.5, Math.max(1.0, 1 + params.volUpliftFactor * haircutRatio));
  const shockedVol = merton.assetVol * volMultiplier;

  // Merton (1974) unclipped diagnostics (no Math.max(0, ...) floor)
  const baseMertonBp = merton.modelSpreadBp;
  const shockedMertonDecimal = isInsolvent
    ? Number.NaN
    : mertonSpread(shockedV, shockedVol, merton.debtValue, baseCurve.r, 5.0);
  const shockedMertonBp = isInsolvent ? Number.NaN : shockedMertonDecimal * 10000;
  const deltaMertonBp = isInsolvent ? Number.NaN : shockedMertonBp - baseMertonBp;

  // Section 2.1: CreditGrades (2002) first-passage model with barrier uncertainty
  // Apply climate shock as one-for-one reduction of equity: E' = max(E - haircut, 1e6)
  const E0 = merton.equityValue;
  const D = merton.debtValue;
  const cgSigmaV0 = merton.creditGradesAssetVol;
  const cgSigmaVShocked = cgSigmaV0 * volMultiplier;
  const shockedEquity = Math.max(1e6, E0 - totalHaircut);

  const cgBase5yBp = creditGradesSpreadBp(E0, D, cgSigmaV0, 5.0, baseCurve.recovery, 0.5, 0.3);
  const cgShocked5yBp = creditGradesSpreadBp(shockedEquity, D, cgSigmaVShocked, 5.0, baseCurve.recovery, 0.5, 0.3);
  const cgDelta5yBp = cgShocked5yBp - cgBase5yBp;

  const cgBase10yBp = creditGradesSpreadBp(E0, D, cgSigmaV0, 10.0, baseCurve.recovery, 0.5, 0.3);
  const cgShocked10yBp = creditGradesSpreadBp(shockedEquity, D, cgSigmaVShocked, 10.0, baseCurve.recovery, 0.5, 0.3);
  const cgDelta10yBp = totalHaircut <= 0 ? 0.0 : cgShocked10yBp - cgBase10yBp;

  // Section 2.2: Tenor-dependent shift via logistic weight g(T) normalised so g(10) = 1
  const midpoint = params.rampMidpointYears ?? 7.0;
  const width = params.rampWidthYears ?? 2.0;

  const tenorShiftsBp: number[] = [];
  const adjustedSpreadsBp: number[] = [];

  for (let idx = 0; idx < baseCurve.tenors.length; idx++) {
    const tenor = baseCurve.tenors[idx];
    const baseBp = baseSpreadsBp[idx];
    const weight = logisticTenorRamp(tenor, midpoint, width);
    const shiftBp = totalHaircut <= 0 ? 0.0 : cgDelta10yBp * weight;
    tenorShiftsBp.push(shiftBp);
    adjustedSpreadsBp.push(baseBp + shiftBp);
  }

  const fiveYearIdx = baseCurve.tenors.indexOf(5) !== -1 ? baseCurve.tenors.indexOf(5) : 2;
  const scaledDeltaBp = tenorShiftsBp[fiveYearIdx];

  // Determine explicit status flag (Sections 2.1 & 2.3)
  const isUninformative =
    !isInsolvent &&
    !isSevere &&
    merton.modelSpreadBp < 5.0 &&
    merton.kappa > 3.0 &&
    cgBase5yBp < 0.5 &&
    Math.abs(scaledDeltaBp) < 0.5;

  let status: ClimateScenarioStatus = 'normal';
  let statusExplanation = 'Structural model and hazard bootstrap within normal operating bounds.';

  if (isInsolvent) {
    status = 'insolvent_in_scenario';
    statusExplanation = `Insolvent in scenario: PV carbon haircut ($${(totalHaircut / 1e9).toFixed(2)}B, ${haircutPctV.toFixed(1)}% of V) reduces firm asset value below book debt ($${(D / 1e9).toFixed(2)}B).`;
  } else if (isSevere) {
    status = 'severe';
    statusExplanation = `Severe transition stress: PV carbon haircut consumes ${haircutPctV.toFixed(1)}% of baseline firm assets (>= 50% threshold).`;
  } else if (isUninformative) {
    status = 'uninformative_at_current_leverage';
    statusExplanation = `Structural model uninformative at current leverage: Debt/Equity is ${(D / E0 * 100).toFixed(1)}%, yielding Merton 5Y = ${merton.modelSpreadBp.toExponential(2)} bp (raw κ = ${Number.isFinite(merton.kappa) ? merton.kappa.toFixed(1) : '∞'}) and CreditGrades 5Y = ${cgBase5yBp.toFixed(3)} bp.`;
  }

  const exceedsEmpiricalRange = isInsolvent || scaledDeltaBp > 300.0;

  const adjustedSpreadsDecimals = adjustedSpreadsBp.map((s) => Math.max(1e-7, s / 10000));

  // Re-bootstrap adjusted hazard curve
  let adjustedCurve: HazardCurve;
  try {
    adjustedCurve = bootstrapHazardCurve(
      baseCurve.tenors,
      adjustedSpreadsDecimals,
      baseCurve.recovery,
      baseCurve.r
    );
  } catch {
    adjustedCurve = baseCurve;
  }

  const base5ySurvival = survivalProb(baseCurve, 5.0);
  const adj5ySurvival = isInsolvent ? 0.0 : survivalProb(adjustedCurve, 5.0);

  const baseLegs5y = computeCdsLegs(baseCurve, 5.0);
  const adjLegs5y = computeCdsLegs(adjustedCurve, 5.0);
  const cs01EurPerBp = notionalEur * baseLegs5y.rpv01 * 0.0001;
  const mtmProtectionImpact = isInsolvent
    ? notionalEur * (1 - baseCurve.recovery)
    : notionalEur * (scaledDeltaBp / 10000) * adjLegs5y.rpv01;

  // Section 2.4: Carbon-price sensitivity (bp per +$10/tCO2) — no Math.max(0, ...) floor
  let carbonPriceSensitivityBp = 0;
  if (!params.additionalCarbonShockUsd) {
    const bumped = computeClimateImpact(
      merton,
      baseCurve,
      baseSpreadsBp,
      scope1MtCo2,
      scope2MtCo2,
      scenarioDef,
      { ...params, additionalCarbonShockUsd: 10 },
      notionalEur
    );
    carbonPriceSensitivityBp = isInsolvent
      ? Number.NaN
      : bumped.scaledDeltaSpreadBp - scaledDeltaBp;
  }

  const sampleSurvival: number[] = [];
  for (let y = 1; y <= 10; y++) {
    sampleSurvival.push(isInsolvent ? 0.0 : survivalProb(adjustedCurve, y));
  }

  return {
    scenarioId: scenarioDef.id,
    status,
    statusExplanation,
    exceedsEmpiricalRange,
    annualCostsUsd,
    discountedCostsUsd,
    explicitHaircutUsd: explicitHaircut,
    terminalValueUsd: terminalValue,
    totalHaircutUsd: totalHaircut,
    haircutPctV,
    baseAssetValue: merton.assetValue,
    shockedAssetValue: shockedV,
    baseAssetVol: merton.assetVol,
    shockedAssetVol: shockedVol,
    baseMertonSpreadBp: baseMertonBp,
    shockedMertonSpreadBp: shockedMertonBp,
    deltaMertonSpreadBp: deltaMertonBp,
    creditGradesBase5yBp: cgBase5yBp,
    creditGradesShocked5yBp: cgShocked5yBp,
    creditGradesDelta5yBp: cgDelta5yBp,
    creditGradesDelta10yBp: cgDelta10yBp,
    scaledDeltaSpreadBp: scaledDeltaBp,
    tenorShiftsBp,
    adjustedSpreadsBp,
    adjustedHazardRates: adjustedCurve.hazardRates,
    adjustedSurvivalProbs: sampleSurvival,
    mtmProtectionImpactEur: mtmProtectionImpact,
    carbonPriceSensitivityBp,
    climateCs01Bp: carbonPriceSensitivityBp,
    cs01EurPerBp,
    base5ySurvivalProb: base5ySurvival,
    adj5ySurvivalProb: adj5ySurvival,
  };
}

// ============================================================================
// Sensitivity Tornado & Monte Carlo Uncertainty Simulators
// ============================================================================

export interface TornadoItem {
  parameter: string;
  lowValue: string;
  highValue: string;
  lowSpreadDeltaBp: number;
  highSpreadDeltaBp: number;
  swingBp: number;
}

export function runTornadoAnalysis(
  merton: MertonResult,
  baseCurve: HazardCurve,
  baseSpreadsBp: number[],
  scope1MtCo2: number,
  scope2MtCo2: number,
  scenarioDef: ClimateScenarioDef,
  baseParams: ClimateOverlayParams
): TornadoItem[] {
  const runWith = (p: Partial<ClimateOverlayParams>): number => {
    const out = computeClimateImpact(
      merton,
      baseCurve,
      baseSpreadsBp,
      scope1MtCo2,
      scope2MtCo2,
      scenarioDef,
      { ...baseParams, ...p }
    );
    return out.scaledDeltaSpreadBp;
  };

  const results: TornadoItem[] = [];

  const ptLow = runWith({ passThrough: 0.8 });
  const ptHigh = runWith({ passThrough: 0.0 });
  results.push({
    parameter: 'Cost Pass-Through',
    lowValue: '80%',
    highValue: '0%',
    lowSpreadDeltaBp: ptLow,
    highSpreadDeltaBp: ptHigh,
    swingBp: Math.abs(ptHigh - ptLow),
  });

  const waccLow = runWith({ wacc: 0.12 });
  const waccHigh = runWith({ wacc: 0.06 });
  results.push({
    parameter: 'Discount Rate (WACC)',
    lowValue: '12%',
    highValue: '6%',
    lowSpreadDeltaBp: waccLow,
    highSpreadDeltaBp: waccHigh,
    swingBp: Math.abs(waccHigh - waccLow),
  });

  const horLow = runWith({ horizonYears: 15 });
  const horHigh = runWith({ horizonYears: 30 });
  results.push({
    parameter: 'Projection Horizon',
    lowValue: '15 Yrs',
    highValue: '30 Yrs',
    lowSpreadDeltaBp: horLow,
    highSpreadDeltaBp: horHigh,
    swingBp: Math.abs(horHigh - horLow),
  });

  const tvLow = runWith({ includeTerminalValue: false });
  const tvHigh = runWith({ includeTerminalValue: true });
  results.push({
    parameter: 'Terminal Value',
    lowValue: 'Excluded',
    highValue: 'Included',
    lowSpreadDeltaBp: tvLow,
    highSpreadDeltaBp: tvHigh,
    swingBp: Math.abs(tvHigh - tvLow),
  });

  const volLow = runWith({ volUpliftFactor: 0.0 });
  const volHigh = runWith({ volUpliftFactor: 0.8 });
  results.push({
    parameter: 'Asset Vol Uplift',
    lowValue: '0.0x',
    highValue: '0.8x',
    lowSpreadDeltaBp: volLow,
    highSpreadDeltaBp: volHigh,
    swingBp: Math.abs(volHigh - volLow),
  });

  return results.sort((a, b) => b.swingBp - a.swingBp);
}

// ============================================================================
// Phase 3: Seeded PRNG, Cross-Sectional Validation, Distress & Monte Carlo
// ============================================================================

/**
 * Shared constant for Monte Carlo draw count across code, UI buttons, and README (Section 3.3).
 */
export const MONTE_CARLO_DEFAULT_DRAWS = 2000;

/**
 * Default reproducible PRNG seed for Monte Carlo uncertainty analysis (Section 3.3).
 */
export const DEFAULT_MC_SEED = 20261115;

/**
 * Mulberry32 deterministic 32-bit seeded PRNG returning uniform [0, 1) floats (Section 3.3).
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function (): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Assigns 1-based average ranks with tie handling matching scipy.stats.rankdata(method='average')
 * and scipy.stats.spearmanr (Section 3.1).
 */
export function computeAverageRanks(values: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  const indexed = values.map((v, idx) => ({ v, idx }));
  indexed.sort((a, b) => a.v - b.v);

  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && Math.abs(indexed[j + 1].v - indexed[i].v) <= 1e-12) {
      j++;
    }
    // 1-based average rank for tied group [i..j]
    const avgRank = (i + 1 + (j + 1)) / 2.0;
    for (let k = i; k <= j; k++) {
      ranks[indexed[k].idx] = avgRank;
    }
    i = j + 1;
  }
  return ranks;
}

/**
 * Computes Spearman rank correlation coefficient (rho) with average ranks for ties,
 * matching scipy.stats.spearmanr (Pearson correlation on average rank vectors, Section 3.1).
 */
export function spearmanRankCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0;
  const rx = computeAverageRanks(x);
  const ry = computeAverageRanks(y);
  const n = x.length;
  const meanX = rx.reduce((acc, v) => acc + v, 0) / n;
  const meanY = ry.reduce((acc, v) => acc + v, 0) / n;

  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = rx[i] - meanX;
    const dy = ry[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  const denom = Math.sqrt(varX * varY);
  if (denom <= 1e-15) return 0;
  return cov / denom;
}

export interface CrossSectionalIssuerPoint {
  issuer: string;
  ticker: string;
  rating: string;
  sector: string;
  isHighCarbon: boolean;
  proxyBp: number;
  mertonBp: number;
  creditGradesBp: number;
  selectedModelBp: number;
  distanceToDefault: number;
  excludedFromLogRegression: boolean;
  exclusionReason?: string;
  proxyLog: number;
  modelLog: number;
  rankModel: number;
  rankProxy: number;
  rankDd: number;
  rankProxyAll: number;
  predModelLog: number;
  residual: number;
  zScore: number;
  isOutlier: boolean;
}

export interface CrossSectionalValidationResult {
  modelType: 'creditGrades' | 'merton';
  nTotal: number;
  nIncluded: number;
  excludedTickers: string[];
  allPoints: CrossSectionalIssuerPoint[];
  includedPoints: CrossSectionalIssuerPoint[];
  // OLS: ln(model spread) = alpha + beta * ln(proxy spread) (Section 3.1)
  alpha: number;
  beta: number;
  // Inverse OLS: ln(proxy spread) = alphaInv + betaInv * ln(model spread)
  alphaInv: number;
  betaInv: number;
  rSquared: number;
  stdRes: number;
  spearmanSpreadIncludedRho: number;
  spearmanSpreadAllRho: number;
  spearmanDdVsProxyRho: number;
  verdictSentence: string;
}

/**
 * Section 3.1: Unfloored cross-sectional check.
 * - Removes Math.max(1, mertonBp) flooring.
 * - Regresses ln(model spread) on ln(proxy spread) without flooring; excludes any issuer
 *   whose model spread <= 0 and records it explicitly.
 * - Computes Spearman rank correlation with average ranks for ties.
 * - Computes rank correlation between Distance-to-Default (DD) and proxy 5Y spread across all issuers.
 * - Generates the verdict sentence dynamically from computed statistics.
 */
export function computeCrossSectionalValidation(
  issuers: {
    name: string;
    ticker: string;
    rating: string;
    sector: string;
    carbonIntensityCategory: string;
    equityUsdB: number;
    equityVol: number;
    totalDebtUsdB: number;
    riskFreeRate: number;
    proxySpreadsBp: number[];
  }[],
  modelType: 'creditGrades' | 'merton' = 'creditGrades'
): CrossSectionalValidationResult {
  const rawPoints = issuers.map((iss) => {
    const m = mertonCalibrate(
      iss.equityUsdB * 1e9,
      iss.equityVol,
      iss.totalDebtUsdB * 1e9,
      iss.riskFreeRate,
      5.0,
      iss.proxySpreadsBp[2] / 10000
    );
    const proxyBp = iss.proxySpreadsBp[2];
    const mertonBp = m.modelSpreadBp;
    const creditGradesBp = m.creditGradesSpread5yBp;
    const selectedModelBp = modelType === 'creditGrades' ? creditGradesBp : mertonBp;
    const excluded = !(selectedModelBp > 0 && Number.isFinite(selectedModelBp));
    return {
      issuer: iss.name,
      ticker: iss.ticker,
      rating: iss.rating,
      sector: iss.sector,
      isHighCarbon: iss.carbonIntensityCategory.includes('High Carbon'),
      proxyBp,
      mertonBp,
      creditGradesBp,
      selectedModelBp,
      distanceToDefault: m.distanceToDefault,
      excludedFromLogRegression: excluded,
      exclusionReason: excluded
        ? `${iss.ticker} excluded: ${modelType === 'creditGrades' ? 'CreditGrades' : 'Merton'} 5Y spread = 0.00 bp (non-positive under IEEE-754 double precision at E/D = ${(iss.equityUsdB / iss.totalDebtUsdB).toFixed(1)}x)`
        : undefined,
      proxyLog: Math.log(proxyBp),
      modelLog: excluded ? Number.NaN : Math.log(selectedModelBp),
    };
  });

  const includedRaw = rawPoints.filter((p) => !p.excludedFromLogRegression);
  const excludedTickers = rawPoints.filter((p) => p.excludedFromLogRegression).map((p) => p.ticker);

  const nInc = includedRaw.length;
  // Section 3.1: Regress ln(model spread) on ln(proxy spread): y = ln(model), x = ln(proxy)
  const meanProxyLog = nInc > 0 ? includedRaw.reduce((acc, p) => acc + p.proxyLog, 0) / nInc : 0;
  const meanModelLog = nInc > 0 ? includedRaw.reduce((acc, p) => acc + p.modelLog, 0) / nInc : 0;

  let covXY = 0;
  let varProxy = 0;
  let varModel = 0;
  for (const p of includedRaw) {
    const dx = p.proxyLog - meanProxyLog;
    const dy = p.modelLog - meanModelLog;
    covXY += dx * dy;
    varProxy += dx * dx;
    varModel += dy * dy;
  }

  const beta = varProxy > 0 ? covXY / varProxy : 0;
  const alpha = meanModelLog - beta * meanProxyLog;

  const betaInv = varModel > 0 ? covXY / varModel : 0;
  const alphaInv = meanProxyLog - betaInv * meanModelLog;

  let ssRes = 0;
  for (const p of includedRaw) {
    const pred = alpha + beta * p.proxyLog;
    ssRes += Math.pow(p.modelLog - pred, 2);
  }
  const rSquared = varModel > 0 ? Math.max(0, 1 - ssRes / varModel) : 0;
  const stdRes = nInc > 2 ? Math.sqrt(ssRes / (nInc - 2)) : 0;

  // Ranks on included points
  const incRanksModel = computeAverageRanks(includedRaw.map((p) => p.selectedModelBp));
  const incRanksProxy = computeAverageRanks(includedRaw.map((p) => p.proxyBp));
  const spearmanSpreadIncludedRho = spearmanRankCorrelation(
    includedRaw.map((p) => p.selectedModelBp),
    includedRaw.map((p) => p.proxyBp)
  );

  // Ranks on all N points
  const allRanksDd = computeAverageRanks(rawPoints.map((p) => p.distanceToDefault));
  const allRanksProxy = computeAverageRanks(rawPoints.map((p) => p.proxyBp));
  const spearmanSpreadAllRho = spearmanRankCorrelation(
    rawPoints.map((p) => p.selectedModelBp),
    rawPoints.map((p) => p.proxyBp)
  );
  const spearmanDdVsProxyRho = spearmanRankCorrelation(
    rawPoints.map((p) => p.distanceToDefault),
    rawPoints.map((p) => p.proxyBp)
  );

  let incCursor = 0;
  const allPoints: CrossSectionalIssuerPoint[] = rawPoints.map((p, idx) => {
    if (p.excludedFromLogRegression) {
      return {
        ...p,
        rankModel: Number.NaN,
        rankProxy: Number.NaN,
        rankDd: allRanksDd[idx],
        rankProxyAll: allRanksProxy[idx],
        predModelLog: Number.NaN,
        residual: Number.NaN,
        zScore: 0,
        isOutlier: false,
      };
    }
    const rM = incRanksModel[incCursor];
    const rP = incRanksProxy[incCursor];
    incCursor++;
    const pred = alpha + beta * p.proxyLog;
    const res = p.modelLog - pred;
    const zScore = stdRes > 0 ? res / stdRes : 0;
    return {
      ...p,
      rankModel: rM,
      rankProxy: rP,
      rankDd: allRanksDd[idx],
      rankProxyAll: allRanksProxy[idx],
      predModelLog: pred,
      residual: res,
      zScore,
      isOutlier: Math.abs(zScore) > 1.5,
    };
  });

  const includedPoints = allPoints.filter((p) => !p.excludedFromLogRegression);
  const modelLabel = modelType === 'creditGrades' ? 'CreditGrades (2002)' : 'Merton (1974)';
  const exclText =
    excludedTickers.length > 0
      ? `Excluding non-positive spread issuer(s) [${excludedTickers.join(', ')}] (N=${nInc} of ${rawPoints.length}), `
      : `Across all N=${nInc} issuers, `;

  const verdictSentence = `Exploratory, no statistical inference (N=${rawPoints.length}): ${exclText}unfloored OLS regression of ln(${modelLabel} 5Y spread) on ln(Proxy 5Y spread) yields R² = ${(rSquared * 100).toFixed(1)}% (slope β = ${beta.toFixed(2)}) and tie-aware Spearman ρ = ${spearmanSpreadIncludedRho.toFixed(3)}. Across all N=${rawPoints.length} issuers, Distance-to-Default vs. Proxy 5Y spread rank correlation is ρ = ${spearmanDdVsProxyRho.toFixed(3)} (higher DD corresponds to lower credit spread).`;

  return {
    modelType,
    nTotal: rawPoints.length,
    nIncluded: nInc,
    excludedTickers,
    allPoints,
    includedPoints,
    alpha,
    beta,
    alphaInv,
    betaInv,
    rSquared,
    stdRes,
    spearmanSpreadIncludedRho,
    spearmanSpreadAllRho,
    spearmanDdVsProxyRho,
    verdictSentence,
  };
}

export interface ComputedDistressPoint {
  quarter: string;
  asOfDate: string;
  equityUsdB: number;
  debtUsdB: number;
  equityVol: number;
  sourceNote: string;
  eventNote?: string;
  computedDd5y: number;
  computedDd1y: number;
  naiveBookDd1y: number;
  computedAssetValueB: number;
  computedAssetVol: number;
  computedPd5yPct: number;
  computedCreditGrades5yBp: number;
}

/**
 * Section 3.2: Computes Distance-to-Default dynamically on load for each distress study quarter
 * from (equityUsdB, debtUsdB, equityVol) using documented risk-free rate r and horizons T=5Y and T=1Y.
 * No DD value is typed into issuers.ts.
 */
export function computeDistressStudySeries(study: {
  documentedRiskFreeRate: number;
  documentedHorizonYears: number;
  timeSeries: {
    quarter: string;
    asOfDate: string;
    equityUsdB: number;
    debtUsdB: number;
    equityVol: number;
    sourceNote: string;
    eventNote?: string;
  }[];
}): {
  rows: ComputedDistressPoint[];
  computedSummaryNote: string;
} {
  const r = study.documentedRiskFreeRate;
  const rows: ComputedDistressPoint[] = study.timeSeries.map((pt) => {
    const E = pt.equityUsdB * 1e9;
    const D = pt.debtUsdB * 1e9;
    const m5 = mertonCalibrate(E, pt.equityVol, D, r, 5.0);
    const m1 = mertonCalibrate(E, pt.equityVol, D, r, 1.0);
    // Naive book-value DD formula at T=1Y: (ln((E+D)/D) + (r - 0.5*sigmaE^2)*1) / sigmaE
    const naiveBookDd1y =
      (Math.log((E + D) / D) + (r - 0.5 * pt.equityVol * pt.equityVol) * 1.0) / pt.equityVol;

    return {
      quarter: pt.quarter,
      asOfDate: pt.asOfDate,
      equityUsdB: pt.equityUsdB,
      debtUsdB: pt.debtUsdB,
      equityVol: pt.equityVol,
      sourceNote: pt.sourceNote,
      eventNote: pt.eventNote,
      computedDd5y: m5.distanceToDefault,
      computedDd1y: m1.distanceToDefault,
      naiveBookDd1y,
      computedAssetValueB: m5.assetValue / 1e9,
      computedAssetVol: m5.assetVol,
      computedPd5yPct: m5.riskNeutralPd * 100,
      computedCreditGrades5yBp: m5.creditGradesSpread5yBp,
    };
  });

  const first = rows[0];
  const last = rows[rows.length - 1];
  const computedSummaryNote =
    first && last
      ? `Computed dynamically from listed (E, D, σ_E) at documented r = ${(r * 100).toFixed(1)}%: Merton DD (T=5Y) deteriorated from ${first.computedDd5y.toFixed(2)} σ (${first.quarter}) to ${last.computedDd5y.toFixed(2)} σ (${last.quarter}), while 1Y Merton DD fell from ${first.computedDd1y.toFixed(2)} σ to ${last.computedDd1y.toFixed(2)} σ (naive book-value 1Y proxy: ${first.naiveBookDd1y.toFixed(2)} σ → ${last.naiveBookDd1y.toFixed(2)} σ).`
      : '';

  return { rows, computedSummaryNote };
}

export interface MonteCarloTenorBand {
  tenor: number;
  baseBp: number;
  deltaP5Bp: number;
  deltaMedianBp: number;
  deltaP95Bp: number;
  spreadP5Bp: number;
  spreadMedianBp: number;
  spreadP95Bp: number;
}

export interface MonteCarloResult {
  seed: number;
  numDraws: number;
  insolventCount: number;
  draws: number[];
  p5: number;
  median: number;
  p95: number;
  mean: number;
  stdDev: number;
  histogram: { binStart: number; binEnd: number; count: number }[];
  tenorBands: MonteCarloTenorBand[];
}

/**
 * Section 3.3: Reproducible seeded Monte Carlo uncertainty simulation.
 * - Uses mulberry32(seed) instead of Math.random.
 * - Uses MONTE_CARLO_DEFAULT_DRAWS (2,000) consistently across code, UI buttons, and README.
 * - Samples recovery rate R and model parameters (CreditGrades L_bar, barrier uncertainty lambda,
 *   logistic ramp midpoint m and width w) in addition to pass-through, WACC, horizon, vol uplift,
 *   and the terminal-value Bernoulli draw.
 * - Reports P5 / Median / P95 across all tenors (1, 3, 5, 7, 10Y) for spread chart uncertainty bands.
 */
export function runMonteCarloSimulation(
  merton: MertonResult,
  baseCurve: HazardCurve,
  baseSpreadsBp: number[],
  scope1MtCo2: number,
  scope2MtCo2: number,
  scenarioDef: ClimateScenarioDef,
  numSimulations = MONTE_CARLO_DEFAULT_DRAWS,
  seed = DEFAULT_MC_SEED,
  scope3MtCo2 = 0
): MonteCarloResult {
  const rng = mulberry32(seed);
  const draws: number[] = [];
  const perTenorDraws: number[][] = baseCurve.tenors.map(() => []);
  let insolventCount = 0;

  const totalEmissionsTons = (scope1MtCo2 + scope2MtCo2 + scope3MtCo2) * 1_000_000;
  const E0 = merton.equityValue;
  const D = merton.debtValue;
  // Recover observable equity vol sigma_E from CreditGrades calibrated asset vol: sigma_E = cgAssetVol * (E + 0.5*D) / E
  const sigmaE = E0 > 0 ? merton.creditGradesAssetVol * ((E0 + 0.5 * D) / E0) : 0.25;
  const fiveYearIdx = baseCurve.tenors.indexOf(5) !== -1 ? baseCurve.tenors.indexOf(5) : 2;

  for (let i = 0; i < numSimulations; i++) {
    // 1. Sample scenario / cashflow parameters
    const passThrough = 0.10 + rng() * 0.60; // U(0.10, 0.70)
    const wacc = 0.05 + rng() * 0.06; // U(0.05, 0.11)
    const horizonYears = Math.min(
      scenarioDef.carbonPrices.length,
      Math.round(15 + rng() * 11) // Discrete U(15, 26) capped at scenario length
    );
    const volUpliftFactor = rng() * 0.80; // U(0.00, 0.80)
    const includeTerminalValue = rng() > 0.5; // Bernoulli(0.5)
    const taxRate = 0.25;
    const terminalGrowthRate = 0.015;

    // 2. Sample recovery rate R and structural / ramp model parameters (Section 3.3)
    const sampledRecovery = 0.25 + rng() * 0.30; // U(0.25, 0.55)
    const sampledMeanRecovery = 0.40 + rng() * 0.20; // CreditGrades L_bar ~ U(0.40, 0.60)
    const sampledBarrierUncertainty = 0.20 + rng() * 0.20; // CreditGrades lambda ~ U(0.20, 0.40)
    const sampledMidpoint = 5.0 + rng() * 4.0; // Logistic midpoint m ~ U(5.0Y, 9.0Y)
    const sampledWidth = 1.0 + rng() * 2.5; // Logistic width w ~ U(1.0Y, 3.5Y)

    // 3. Compute DCF carbon haircut for this draw
    let explicitHaircut = 0;
    let lastCost = 0;
    for (let t = 0; t < horizonYears; t++) {
      const carbonPrice = Math.max(0, scenarioDef.carbonPrices[t]);
      const emissionsIdx = scenarioDef.emissionsIndex[t];
      const cost = (1 - passThrough) * totalEmissionsTons * emissionsIdx * carbonPrice * (1 - taxRate);
      lastCost = cost;
      explicitHaircut += cost / Math.pow(1 + wacc, t + 1);
    }

    let terminalValue = 0;
    if (includeTerminalValue && horizonYears > 0) {
      const denom = Math.max(0.01, wacc - terminalGrowthRate);
      terminalValue = ((lastCost * (1 + terminalGrowthRate)) / denom) / Math.pow(1 + wacc, horizonYears);
    }

    const totalHaircut = explicitHaircut + terminalValue;
    const shockedV = merton.assetValue - totalHaircut;
    if (shockedV <= D) {
      insolventCount++;
    }

    const haircutRatio = merton.assetValue > 0 ? totalHaircut / merton.assetValue : 0;
    const volMultiplier = Math.min(2.5, Math.max(1.0, 1 + volUpliftFactor * haircutRatio));

    // 4. CreditGrades (2002) with sampled recovery and barrier parameters
    const cgSigmaV0 = sigmaE * (E0 / (E0 + sampledMeanRecovery * D));
    const cgSigmaVShocked = cgSigmaV0 * volMultiplier;
    const shockedEquity = Math.max(1e6, E0 - totalHaircut);

    const cgBase10yBp = creditGradesSpreadBp(
      E0,
      D,
      cgSigmaV0,
      10.0,
      sampledRecovery,
      sampledMeanRecovery,
      sampledBarrierUncertainty
    );
    const cgShocked10yBp = creditGradesSpreadBp(
      shockedEquity,
      D,
      cgSigmaVShocked,
      10.0,
      sampledRecovery,
      sampledMeanRecovery,
      sampledBarrierUncertainty
    );
    const cgDelta10yBp = totalHaircut <= 0 ? 0.0 : cgShocked10yBp - cgBase10yBp;

    for (let idx = 0; idx < baseCurve.tenors.length; idx++) {
      const tenor = baseCurve.tenors[idx];
      const weight = logisticTenorRamp(tenor, sampledMidpoint, sampledWidth);
      const shiftBp = totalHaircut <= 0 ? 0.0 : cgDelta10yBp * weight;
      perTenorDraws[idx].push(shiftBp);
    }

    const fiveYearShift = perTenorDraws[fiveYearIdx][i];
    draws.push(fiveYearShift);
  }

  draws.sort((a, b) => a - b);

  const getPercentile = (sorted: number[], q: number): number => {
    if (sorted.length === 0) return 0;
    const pos = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * q)));
    return sorted[pos];
  };

  const p5 = getPercentile(draws, 0.05);
  const median = getPercentile(draws, 0.50);
  const p95 = getPercentile(draws, 0.95);

  const sum = draws.reduce((acc, v) => acc + v, 0);
  const mean = draws.length > 0 ? sum / draws.length : 0;
  const variance = draws.length > 0 ? draws.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / draws.length : 0;
  const stdDev = Math.sqrt(variance);

  const minVal = draws.length > 0 ? draws[0] : 0;
  const maxVal = draws.length > 0 ? draws[draws.length - 1] : 1;
  const binCount = 15;
  const span = Math.max(1e-6, maxVal - minVal);
  const binWidth = span / binCount;

  const histogram: { binStart: number; binEnd: number; count: number }[] = [];
  for (let b = 0; b < binCount; b++) {
    const binStart = minVal + b * binWidth;
    const binEnd = binStart + binWidth;
    histogram.push({ binStart, binEnd, count: 0 });
  }

  for (const val of draws) {
    for (const bin of histogram) {
      if (val >= bin.binStart && (val < bin.binEnd || bin === histogram[histogram.length - 1])) {
        bin.count++;
        break;
      }
    }
  }

  const tenorBands: MonteCarloTenorBand[] = baseCurve.tenors.map((tenor, idx) => {
    const sortedTenor = [...perTenorDraws[idx]].sort((a, b) => a - b);
    const baseBp = baseSpreadsBp[idx];
    const deltaP5Bp = getPercentile(sortedTenor, 0.05);
    const deltaMedianBp = getPercentile(sortedTenor, 0.50);
    const deltaP95Bp = getPercentile(sortedTenor, 0.95);
    return {
      tenor,
      baseBp,
      deltaP5Bp,
      deltaMedianBp,
      deltaP95Bp,
      spreadP5Bp: baseBp + deltaP5Bp,
      spreadMedianBp: baseBp + deltaMedianBp,
      spreadP95Bp: baseBp + deltaP95Bp,
    };
  });

  return {
    seed,
    numDraws: numSimulations,
    insolventCount,
    draws,
    p5,
    median,
    p95,
    mean,
    stdDev,
    histogram,
    tenorBands,
  };
}

