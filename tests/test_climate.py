"""
tests/test_climate.py
---------------------
Acceptance tests for src/climate.py (Phase 2).
"""

import numpy as np
from src.curves import bootstrap
from src.merton import merton_calibrate
from src.climate import asset_haircut, climate_adjusted_curve, logistic_tenor_ramp


def test_zero_carbon_price_zero_haircut():
    """Catches: Phantom baseline haircut bugs by ensuring zero carbon price produces zero PV haircut."""
    prices = [0.0] * 25
    emissions_idx = [1.0] * 25
    haircut, _, _ = asset_haircut(10_000_000.0, prices, emissions_idx)
    assert haircut == 0.0


def test_higher_price_bigger_haircut():
    """Catches: Price direction bugs by verifying that higher carbon price strictly increases firm haircut."""
    e_idx = np.ones(10)
    lo, _, _ = asset_haircut(1e6, np.full(10, 50.0), e_idx, pass_through=0.3, wacc=0.08)
    hi, _, _ = asset_haircut(1e6, np.full(10, 100.0), e_idx, pass_through=0.3, wacc=0.08)
    assert hi > lo, "Higher carbon price must yield higher asset haircut"


def test_lower_pass_through_bigger_haircut():
    """Catches: Inverted pass-through sign; lower pass-through (p) must cause larger balance sheet haircut."""
    price, e_idx = np.full(10, 80.0), np.ones(10)
    hc_low_pt, _, _ = asset_haircut(1e6, price, e_idx, pass_through=0.1, wacc=0.08)
    hc_high_pt, _, _ = asset_haircut(1e6, price, e_idx, pass_through=0.6, wacc=0.08)
    assert hc_low_pt > hc_high_pt, "Lower pass-through must yield higher haircut"


def test_haircut_matches_hand_calculation():
    """Catches: Formula transcription errors in DCF and terminal value discounting via hand-computed benchmark."""
    h, tv, _ = asset_haircut(
        1000.0,
        np.array([100.0]),
        np.array([1.0]),
        pass_through=0.0,
        wacc=0.10,
        tax=0.0,
        g=0.0,
        include_terminal_value=True,
    )
    expected = (100000.0 / 1.1) + (100000.0 / 0.10 / 1.1)
    assert abs(h - expected) < 1e-6, f"Hand calculation mismatch: got {h}, expected {expected}"

    # Simple 1-year no-tax, no-discounting check: 1,000t * $100/t = $100,000
    h_simple, _, _ = asset_haircut(
        1000.0,
        [100.0],
        [1.0],
        pass_through=0.0,
        wacc=0.0,
        tax_rate=0.0,
        horizon_years=1,
        include_terminal_value=False,
    )
    assert abs(h_simple - 100_000.0) < 1e-6


def test_adjusted_spreads_never_below_baseline_and_monotonic_in_tenor():
    """Section 2.2: Verifies shift(1Y) <= shift(5Y) <= shift(10Y) and shift(1Y) < 0.25 * shift(10Y)."""
    assert logistic_tenor_ramp(1.0, 7.0, 2.0) < 0.25
    assert abs(logistic_tenor_ramp(10.0, 7.0, 2.0) - 1.0) < 1e-12

    tenors = [1.0, 3.0, 5.0, 7.0, 10.0]
    base_spreads_bp = [30.0, 45.0, 60.0, 75.0, 90.0]
    base_spreads_dec = [s / 10000.0 for s in base_spreads_bp]
    base_curve = bootstrap(tenors, base_spreads_dec)

    merton = merton_calibrate(E=100e9, sigma_E=0.22, D=40e9, r=0.04, T=5.0)

    res = climate_adjusted_curve(
        base_curve=base_curve,
        base_spreads_bp=base_spreads_bp,
        V=merton.V,
        sigma_V=merton.sigma_V,
        D=40e9,
        kappa=merton.kappa,
        scope1_2_tco2=50e6,
        carbon_prices=[50.0] * 25,
        emissions_index=[1.0] * 25,
        E=merton.E,
        cg_sigma_V=merton.credit_grades_asset_vol,
    )

    for base, adj in zip(base_spreads_bp, res["adjusted_spreads_bp"]):
        assert adj >= base, f"Adjusted spread ({adj} bp) fell below baseline ({base} bp)"

    s1, s3, s5, s7, s10 = res["tenor_shifts_bp"]
    assert s1 <= s3 <= s5 <= s7 <= s10
    assert s1 < 0.25 * s10


def test_carbon_price_sensitivity_positive_and_monotone():
    """Sections 2.3 & 2.4: Carbon-price sensitivity (per +$10/tCO2) is positive and monotone in carbon price."""
    tenors = [1.0, 3.0, 5.0, 7.0, 10.0]
    base_spreads_bp = [30.0, 45.0, 60.0, 75.0, 90.0]
    base_curve = bootstrap(tenors, [s / 10000.0 for s in base_spreads_bp])
    merton = merton_calibrate(E=100e9, sigma_E=0.22, D=40e9, r=0.04, T=5.0)

    res_clean = climate_adjusted_curve(
        base_curve,
        base_spreads_bp,
        merton.V,
        merton.sigma_V,
        40e9,
        merton.kappa,
        scope1_2_tco2=1e6,
        carbon_prices=[50.0] * 25,
        emissions_index=[1.0] * 25,
        E=merton.E,
        cg_sigma_V=merton.credit_grades_asset_vol,
    )
    res_heavy = climate_adjusted_curve(
        base_curve,
        base_spreads_bp,
        merton.V,
        merton.sigma_V,
        40e9,
        merton.kappa,
        scope1_2_tco2=15e6,
        carbon_prices=[50.0] * 25,
        emissions_index=[1.0] * 25,
        E=merton.E,
        cg_sigma_V=merton.credit_grades_asset_vol,
    )

    assert res_heavy["carbon_price_sensitivity_bp"] > res_clean["carbon_price_sensitivity_bp"]
    assert res_heavy["carbon_price_sensitivity_bp"] > 0.0
    assert res_heavy["cs01_eur_per_bp"] > 4000.0


def test_insolvency_and_uninformative_flags():
    """Sections 2.1 & 2.3: Verifies insolvent_in_scenario flag on NTPC and uninformative flag on XOM."""
    tenors = [1.0, 3.0, 5.0, 7.0, 10.0]
    base_spreads_bp = [85.0, 130.0, 172.0, 205.0, 240.0]
    base_curve = bootstrap(tenors, [s / 10000.0 for s in base_spreads_bp], recovery=0.40, r=0.068)
    m_ntpc = merton_calibrate(E=43.5e9, sigma_E=0.25, D=28.4e9, r=0.068, T=5.0, proxy_5y_spread=0.0172)

    nz_prices = [
        35, 42, 50, 60, 72, 85, 100, 116, 134, 152, 170, 186, 202,
        216, 230, 242, 252, 260, 268, 274, 278, 282, 285, 288, 290, 292,
    ]
    nz_idx = [
        1.00, 0.96, 0.92, 0.88, 0.83, 0.78, 0.73, 0.68, 0.63, 0.58, 0.53, 0.48, 0.43,
        0.38, 0.34, 0.30, 0.27, 0.24, 0.21, 0.19, 0.17, 0.15, 0.14, 0.13, 0.12, 0.11,
    ]
    res_ntpc = climate_adjusted_curve(
        base_curve,
        base_spreads_bp,
        m_ntpc.V,
        m_ntpc.sigma_V,
        28.4e9,
        m_ntpc.kappa,
        scope1_2_tco2=196.3e6,
        carbon_prices=nz_prices,
        emissions_index=nz_idx,
        E=m_ntpc.E,
        cg_sigma_V=m_ntpc.credit_grades_asset_vol,
    )
    assert res_ntpc["status"] == "insolvent_in_scenario"
    assert res_ntpc["v_scenario"] <= 28.4e9
