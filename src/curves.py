r"""
src/curves.py
-------------
Piecewise-constant hazard-rate curve bootstrapping and CDS pricing engine.
Conventions:
  - Spreads in decimals (0.0100 = 100 bp)
  - Time in years
  - Quarterly premium payments (dt = 0.25)
  - Accrual-on-default via half-period approximation
  - Midpoint discounting on protection leg
  - Flat continuous risk-free rate r

Formulas:
  Q(t) = exp( - \int_0^t \lambda(s) ds )
  ProtLeg = (1 - R) \sum_{i} D(t_{mid}) [Q(t_{i-1}) - Q(t_i)]
  RPV01 = \sum_i [ D(t_i) dt Q(t_i) + 0.5 dt D(t_i) (Q(t_{i-1}) - Q(t_i)) ]
  s = ProtLeg / RPV01
"""

from dataclasses import dataclass
from typing import List, Tuple
import numpy as np
from scipy.optimize import brentq


@dataclass
class HazardCurve:
    tenors: List[float]        # e.g. [1.0, 3.0, 5.0, 7.0, 10.0]
    hazard_rates: List[float]  # piecewise-constant rates lambda_k
    recovery: float = 0.40     # standard 40% senior unsecured recovery
    r: float = 0.04            # flat continuous risk-free rate

    def cumulative_hazard(self, t: float) -> float:
        if t <= 0.0:
            return 0.0
        cum = 0.0
        prev_t = 0.0
        for tenor, rate in zip(self.tenors, self.hazard_rates):
            if t <= tenor:
                cum += rate * (t - prev_t)
                return cum
            else:
                cum += rate * (tenor - prev_t)
                prev_t = tenor
        # Extrapolate flat past the last tenor
        cum += self.hazard_rates[-1] * (t - prev_t)
        return cum

    def survival_prob(self, t: float) -> float:
        """Survival probability Q(t) = exp(-Lambda(t))."""
        return float(np.exp(-self.cumulative_hazard(t)))

    def surv(self, t: float) -> float:
        """Convenient alias matching QuantLib / academic conventions."""
        return self.survival_prob(t)


def cds_legs(curve: HazardCurve, tenor: float, dt: float = 0.25) -> Tuple[float, float, float]:
    """
    Computes (protection_leg_pv, rpv01, par_spread).
    Uses quarterly payment grid and half-period accrual on default.
    """
    steps = int(round(tenor / dt))
    prot_leg = 0.0
    rpv01 = 0.0

    prev_q = 1.0
    prev_t = 0.0

    for i in range(1, steps + 1):
        cur_t = i * dt
        mid_t = 0.5 * (prev_t + cur_t)
        cur_q = curve.survival_prob(cur_t)
        dq = prev_q - cur_q

        discount_mid = float(np.exp(-curve.r * mid_t))
        discount_end = float(np.exp(-curve.r * cur_t))

        # Protection leg: payoff upon default
        prot_leg += (1.0 - curve.recovery) * discount_mid * dq

        # Premium leg: regular quarterly coupon + accrual on default
        regular_payment = discount_end * dt * cur_q
        accrual_payment = 0.5 * dt * discount_end * dq
        rpv01 += regular_payment + accrual_payment

        prev_q = cur_q
        prev_t = cur_t

    par_spread = prot_leg / rpv01 if rpv01 > 0 else 0.0
    return float(prot_leg), float(rpv01), float(par_spread)


def bootstrap(
    tenors: List[float],
    spreads: List[float],
    recovery: float = 0.40,
    r: float = 0.04
) -> HazardCurve:
    """
    Sequentially solves for piecewise-constant hazard rates lambda_k such that
    the model par spread equals the input market proxy spread at each tenor.
    Round-trip error is guaranteed < 1e-8.
    Raises ValueError if input spreads imply an inverted curve with negative hazard rate.
    """
    if len(tenors) != len(spreads):
        raise ValueError("Tenors and spreads length mismatch")

    hazard_rates: List[float] = []

    for k in range(len(tenors)):
        target_spread = float(spreads[k])
        cur_tenor = float(tenors[k])

        # Economic check: if hazard rate = 0 on this tenor bucket,
        # what is the minimum achievable par spread given prior buckets?
        zero_trial = HazardCurve(
            tenors=[float(t) for t in tenors[: k + 1]],
            hazard_rates=hazard_rates + [0.0],
            recovery=recovery,
            r=r
        )
        _, _, min_s = cds_legs(zero_trial, cur_tenor)

        # If even with zero hazard rate the par spread exceeds target_spread,
        # then target_spread requires an economically invalid negative forward hazard!
        if min_s - target_spread > 1e-10:
            raise ValueError(
                f"Negative forward hazard implied at tenor {cur_tenor}Y: "
                f"minimum achievable par spread ({min_s*10000:.1f} bp) exceeds target ({target_spread*10000:.1f} bp). "
                f"Spreads fell too steeply from previous tenor."
            )

        def objective(lam: float) -> float:
            trial_curve = HazardCurve(
                tenors=[float(t) for t in tenors[: k + 1]],
                hazard_rates=hazard_rates + [lam],
                recovery=recovery,
                r=r
            )
            _, _, model_s = cds_legs(trial_curve, cur_tenor)
            return model_s - target_spread

        # Initial guess from credit triangle: s approx lambda * (1 - R)
        approx_lam = max(1e-5, target_spread / (1.0 - recovery))
        a, b = 0.0, max(0.5, approx_lam * 4.0)

        fa, fb = objective(a), objective(b)
        if fa * fb > 0:
            if fb < 0:
                b = max(3.0, approx_lam * 15.0)
                fb = objective(b)

        if fa * fb > 0:
            raise ValueError(f"Root not bracketed at tenor {cur_tenor}Y for target spread {target_spread*10000:.1f} bp")

        sol = float(brentq(objective, a, b, xtol=1e-12, rtol=1e-10))
        if sol < -1e-12:
            raise ValueError(f"Bootstrapped hazard rate is negative ({sol:.6f}) at tenor {cur_tenor}Y")

        hazard_rates.append(max(0.0, sol))

    return HazardCurve(tenors=[float(t) for t in tenors], hazard_rates=hazard_rates, recovery=recovery, r=r)


def cds_mtm(curve: HazardCurve, tenor: float, coupon: float, notional: float = 10_000_000.0) -> float:
    """
    Mark-to-market on a protection buyer position:
    MTM = Notional * (Par Spread - Contract Coupon) * RPV01
    """
    _, rpv01, par_s = cds_legs(curve, tenor)
    return float(notional * (par_s - coupon) * rpv01)


def cs01(curve: HazardCurve, tenor: float, notional: float = 10_000_000.0) -> float:
    """
    Spread sensitivity to +1bp parallel shift:
    CS01 approx Notional * RPV01 * 0.0001
    """
    _, rpv01, _ = cds_legs(curve, tenor)
    return float(notional * rpv01 * 0.0001)


def average_hazard_to_maturity(curve: HazardCurve, tenor: float) -> float:
    r"""
    Cumulative average hazard to maturity:
    \bar{\lambda}(0, T) = -ln(Q(T)) / T
    Compares with the Credit Triangle approximation s / (1 - R).
    On an upward-sloping curve, \bar{\lambda}(0, T) is slightly higher than s / (1 - R)
    because par spreads weight early quarters (lower hazard) more heavily.
    """
    q = curve.survival_prob(tenor)
    return float(-np.log(max(1e-12, q)) / tenor)
