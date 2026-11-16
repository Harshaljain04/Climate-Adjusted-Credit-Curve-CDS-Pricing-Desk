"""
tests/test_merton.py
--------------------
Acceptance tests for src/merton.py (Merton 1974 + CreditGrades 2002).
"""

import math
import numpy as np
from scipy.stats import norm
from src.merton import (
    merton_calibrate,
    merton_spread,
    credit_grades_survival,
    credit_grades_spread_bp,
)


def test_calibration_satisfies_both_equations():
    """Catches: Bivariate solver convergence failures by asserting both Merton equations hold to < 1e-6."""
    E, sigE, D, r, T = 40.0, 0.35, 60.0, 0.04, 1.0
    res = merton_calibrate(E, sigE, D, r, T)
    V, sV = res.V, res.sigma_V

    d1 = (np.log(V / D) + (r + 0.5 * sV**2) * T) / (sV * np.sqrt(T))
    d2 = d1 - sV * np.sqrt(T)

    assert abs(V * norm.cdf(d1) - D * np.exp(-r * T) * norm.cdf(d2) - E) < 1e-6
    assert abs(norm.cdf(d1) * sV * V - sigE * E) < 1e-6
    assert res["V"] == res.V


def test_spread_increases_with_vol_and_leverage():
    """Catches: Inverted sign in d1/d2 or Black-Scholes formulas by testing monotonic risk sensitivity."""
    r, T = 0.04, 5.0

    s_low_vol = merton_spread(100.0, 0.20, 60.0, r, T)
    s_high_vol = merton_spread(100.0, 0.30, 60.0, r, T)
    assert s_high_vol > s_low_vol, "Merton spread must increase with volatility"

    s_low_debt = merton_spread(100.0, 0.25, 60.0, r, T)
    s_high_debt = merton_spread(100.0, 0.25, 80.0, r, T)
    assert s_high_debt > s_low_debt, "Merton spread must increase with leverage"


def test_merton_textbook_hull_worked_example():
    """Catches: Scale errors by verifying exact match against published John Hull textbook credit risk example."""
    res = merton_calibrate(E=3.0, sigma_E=0.80, D=10.0, r=0.05, T=1.0)

    assert abs(res.V - 12.40) < 0.05, f"Expected V ~ 12.40, got {res.V}"
    assert abs(res.sigma_V - 0.2123) < 0.005, f"Expected sigma_V ~ 0.2123, got {res.sigma_V}"
    assert abs(res.rn_pd - 0.127) < 0.01, f"Expected RN PD ~ 12.7%, got {res.rn_pd}"


def test_distance_to_default_monotonic_in_asset_cushion():
    """Catches: Inverted Distance-to-Default sign (DD must decrease as debt rises relative to assets)."""
    res_healthy = merton_calibrate(E=100.0, sigma_E=0.20, D=30.0, r=0.04, T=5.0)
    res_distressed = merton_calibrate(E=20.0, sigma_E=0.65, D=90.0, r=0.04, T=5.0)

    assert res_healthy.distance_to_default > res_distressed.distance_to_default
    assert res_healthy.distance_to_default > 3.0
    assert res_distressed.distance_to_default < 1.0


def test_merton_zero_vol_limit():
    """Catches: Boundary condition errors; as vol -> 0 on solvent firm, default probability must approach zero."""
    res = merton_calibrate(E=100.0, sigma_E=0.05, D=20.0, r=0.04, T=5.0)
    assert res.rn_pd < 1e-4
    assert res.merton_spread_bp < 1.0


def test_raw_kappa_not_clipped():
    """Section 2.1: Verifies raw kappa is not clipped to [0.2, 12.0] or defaulted to 1.0."""
    res = merton_calibrate(E=465e9, sigma_E=0.22, D=41.5e9, r=0.041, T=5.0, proxy_5y_spread=0.0062)
    assert res.kappa > 1000.0


def test_credit_grades_first_passage_matches_monte_carlo():
    """Section 2.1: Verifies CreditGrades (2002) first-passage survival formula against random-barrier Monte Carlo."""
    E, D, sigma_E, T, l_bar, lam = 150.0, 100.0, 0.30, 5.0, 0.5, 0.3
    sigma_V = sigma_E * E / (E + l_bar * D)
    cg_p = credit_grades_survival(E, D, sigma_V, T, l_bar, lam)
    cg_spr = credit_grades_spread_bp(E, D, sigma_V, T, 0.4, l_bar, lam)
    assert 0.95 < cg_p < 0.99
    assert cg_spr > 20.0

    rng = np.random.default_rng(42)
    z = rng.standard_normal(50_000)
    v0 = E + l_bar * D
    barrier = l_bar * D * np.exp(lam * z - 0.5 * lam**2)
    ratio = v0 / barrier
    valid = ratio > 1.0
    surv = np.zeros_like(z)
    ln_r = np.log(ratio[valid])
    sig_sqrt_t = sigma_V * math.sqrt(T)
    surv[valid] = (
        norm.cdf((ln_r - 0.5 * sigma_V**2 * T) / sig_sqrt_t)
        - (1.0 / ratio[valid]) * norm.cdf((-ln_r - 0.5 * sigma_V**2 * T) / sig_sqrt_t)
    )
    mc_p = float(np.mean(surv))
    assert abs(cg_p - mc_p) < 0.015
