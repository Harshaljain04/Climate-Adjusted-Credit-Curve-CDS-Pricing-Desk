"""
src/merton.py
-------------
Merton (1974) structural model of corporate debt and CreditGrades (2002)
first-passage model with barrier uncertainty.

Solves the simultaneous Merton system:
  1) E = V * N(d1) - D * exp(-r*T) * N(d2)
  2) sigma_E * E = N(d1) * sigma_V * V
Where:
  d1 = [ ln(V/D) + (r + 0.5 * sigma_V^2)*T ] / (sigma_V * sqrt(T))
  d2 = d1 - sigma_V * sqrt(T)
"""

from typing import NamedTuple
import numpy as np
from scipy.stats import norm
from scipy.optimize import brentq


class MertonResult(NamedTuple):
    V: float
    sigma_V: float
    d1: float
    d2: float
    distance_to_default: float
    rn_pd: float
    merton_spread: float
    merton_spread_bp: float
    kappa: float
    credit_grades_spread_5y_bp: float = 0.0
    credit_grades_asset_vol: float = 0.0
    E: float = 0.0
    D: float = 0.0

    def __getitem__(self, item):
        if isinstance(item, str):
            return getattr(self, item)
        return tuple.__getitem__(self, item)


def merton_spread(V: float, sigma_V: float, D: float, r: float, T: float) -> float:
    """
    Continuous credit spread implied by the Merton model:
    s = -(1/T) * ln[ N(d2) + (V / (D * exp(-r*T))) * N(-d1) ]
    """
    if V <= 0 or sigma_V <= 0 or D <= 0 or T <= 0:
        return 0.0
    sqrt_t = float(np.sqrt(T))
    discount = float(np.exp(-r * T))
    d1 = (np.log(V / D) + (r + 0.5 * sigma_V**2) * T) / (sigma_V * sqrt_t)
    d2 = d1 - sigma_V * sqrt_t
    bond_ratio = float(norm.cdf(d2) + (V / (D * discount)) * norm.cdf(-d1))
    if bond_ratio <= 0 or np.isnan(bond_ratio):
        return 0.0
    return float(max(0.0, -(1.0 / T) * np.log(bond_ratio)))


def credit_grades_survival(
    E: float,
    D: float,
    sigma_V: float,
    t: float,
    mean_recovery: float = 0.5,
    barrier_uncertainty: float = 0.3,
) -> float:
    """
    CreditGrades (Finkelstein, Lardy, Pan, Ta & Tierney, RiskMetrics 2002)
    first-passage survival probability with barrier uncertainty.
    """
    if t <= 0:
        return 1.0
    if E <= 0 or D <= 0 or sigma_V <= 0:
        return 0.0
    l_bar_d = mean_recovery * D
    d = ((E + l_bar_d) / l_bar_d) * float(np.exp(barrier_uncertainty**2))
    a_t = float(np.sqrt((sigma_V**2) * t + barrier_uncertainty**2))
    ln_d = float(np.log(d))
    p = float(norm.cdf(-0.5 * a_t + ln_d / a_t) - d * norm.cdf(-0.5 * a_t - ln_d / a_t))
    return float(max(1e-15, min(1.0, p)))


def credit_grades_spread_bp(
    E: float,
    D: float,
    sigma_V: float,
    t: float,
    recovery: float = 0.4,
    mean_recovery: float = 0.5,
    barrier_uncertainty: float = 0.3,
) -> float:
    """
    CreditGrades (2002) model par spread (in basis points) at maturity t:
      hazard(t) = -ln(P(t)) / t
      spread_bp(t) = hazard(t) * (1 - R) * 10000
    """
    if t <= 0:
        return 0.0
    p = credit_grades_survival(E, D, sigma_V, t, mean_recovery, barrier_uncertainty)
    hazard = -float(np.log(p)) / t
    return float(hazard * (1.0 - recovery) * 10000.0)


def _solve_v_given_sigma_v(
    E: float,
    D: float,
    r: float,
    T: float,
    sig_v: float,
) -> float:
    """
    For fixed sigma_V > 0, solves Equation 1:
      f(V) = V * N(d1(V, sig_v)) - D * exp(-rT) * N(d2(V, sig_v)) - E = 0
    """
    discount = float(np.exp(-r * T))
    sqrt_t = float(np.sqrt(T))

    def f_v(v: float) -> float:
        d1 = (np.log(v / D) + (r + 0.5 * sig_v**2) * T) / (sig_v * sqrt_t)
        d2 = d1 - sig_v * sqrt_t
        return float(v * norm.cdf(d1) - D * discount * norm.cdf(d2) - E)

    v_lo = max(1e-12, E * (1.0 - 1e-6))
    v_hi = (E + D * discount) * (1.0 + 1e-6)
    while f_v(v_lo) > 0:
        v_lo *= 0.5
    while f_v(v_hi) < 0:
        v_hi *= 1.5

    xtol = 1e-13 * max(1.0, E)
    return float(brentq(f_v, v_lo, v_hi, xtol=xtol, rtol=1e-13))


def merton_calibrate(
    E: float,
    sigma_E: float,
    D: float,
    r: float = 0.04,
    T: float = 5.0,
    proxy_5y_spread: float = 0.0120,
) -> MertonResult:
    """
    Calibrates unobservable asset value V and asset volatility sigma_V
    from equity capitalization E, equity volatility sigma_E, and book debt D.
    Solves both Merton (1974) equations jointly and verifies residuals < 1e-6.
    Computes raw unclipped kappa = proxy_5y_spread / merton_5y (Section 2.1).
    """
    if E <= 0 or sigma_E <= 0 or D <= 0 or T <= 0:
        raise ValueError(f"Invalid Merton inputs: E={E}, sigma_E={sigma_E}, D={D}, T={T}")

    sqrt_t = float(np.sqrt(T))
    discount = float(np.exp(-r * T))

    def objective_sig_v(sig_v: float) -> float:
        v = _solve_v_given_sigma_v(E, D, r, T, sig_v)
        d1 = (np.log(v / D) + (r + 0.5 * sig_v**2) * T) / (sig_v * sqrt_t)
        return float(norm.cdf(d1) * sig_v * v - sigma_E * E)

    low = max(1e-6, sigma_E * 1e-3)
    high = max(2.0, sigma_E * 3.0)

    f_low = objective_sig_v(low)
    while f_low > 0 and low > 1e-10:
        low *= 0.1
        f_low = objective_sig_v(low)

    f_high = objective_sig_v(high)
    while f_high < 0 and high < 20.0:
        high *= 2.0
        f_high = objective_sig_v(high)

    if f_low * f_high > 0:
        raise ValueError(
            f"Merton sigma_V root not bracketed on [{low:.3e}, {high:.3e}]: "
            f"f(low)={f_low:.3e}, f(high)={f_high:.3e}"
        )

    sig_v = float(brentq(objective_sig_v, low, high, xtol=1e-13, rtol=1e-13))
    V = _solve_v_given_sigma_v(E, D, r, T, sig_v)

    d1 = float((np.log(V / D) + (r + 0.5 * sig_v**2) * T) / (sig_v * sqrt_t))
    d2 = float(d1 - sig_v * sqrt_t)

    eq1_res = abs(V * float(norm.cdf(d1)) - D * discount * float(norm.cdf(d2)) - E)
    eq2_res = abs(float(norm.cdf(d1)) * sig_v * V - sigma_E * E)
    eq1_tol = 1e-6 * max(1.0, E)
    eq2_tol = 1e-6 * max(1.0, sigma_E * E)
    if eq1_res > eq1_tol or eq2_res > eq2_tol:
        raise ValueError(
            f"Merton calibration failed residual check: "
            f"eq1_res={eq1_res:.3e} (tol={eq1_tol:.3e}), "
            f"eq2_res={eq2_res:.3e} (tol={eq2_tol:.3e})"
        )

    dd = float((np.log(V / D) + (r - 0.5 * sig_v**2) * T) / (sig_v * sqrt_t))
    rn_pd = float(norm.cdf(-d2))
    merton_5y = merton_spread(V, sig_v, D, r, T)

    # Raw unclipped kappa (no [0.2, 12.0] clip and no 1.0 fallback)
    kappa = float(proxy_5y_spread / merton_5y) if merton_5y > 0 else float("inf")

    cg_asset_vol = float(sigma_E * (E / (E + 0.5 * D)))
    cg_spread_5y_bp = credit_grades_spread_bp(E, D, cg_asset_vol, T, 0.4, 0.5, 0.3)

    return MertonResult(
        V=float(V),
        sigma_V=float(sig_v),
        d1=d1,
        d2=d2,
        distance_to_default=dd,
        rn_pd=rn_pd,
        merton_spread=float(merton_5y),
        merton_spread_bp=float(merton_5y * 10000.0),
        kappa=kappa,
        credit_grades_spread_5y_bp=cg_spread_5y_bp,
        credit_grades_asset_vol=cg_asset_vol,
        E=float(E),
        D=float(D),
    )
