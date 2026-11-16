"""
tests/test_parity.py
--------------------
Cross-engine parity test suite verifying that the Python engine reproduces
the TypeScript engine across all 9 issuers and all 3 NGFS scenarios.
"""

import json
import math
from pathlib import Path
import pytest

from src.curves import bootstrap
from src.merton import merton_calibrate
from src.climate import asset_haircut, climate_adjusted_curve


FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "ts_reference.json"


def _load_fixture():
    with open(FIXTURE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


FIXTURE = _load_fixture()


@pytest.mark.parametrize("issuer", FIXTURE["issuers"], ids=[i["ticker"] for i in FIXTURE["issuers"]])
def test_hazard_and_merton_parity(issuer):
    """Python hazard rates, Merton calibration, and CreditGrades match TypeScript to < 1e-6."""
    tenors = [float(t) for t in issuer["tenors"]]
    spreads_dec = [s / 10000.0 for s in issuer["proxySpreadsBp"]]
    r = issuer["riskFreeRate"]

    py_curve = bootstrap(tenors, spreads_dec, recovery=0.40, r=r)
    for py_lam, ts_lam in zip(py_curve.hazard_rates, issuer["baseHazardRates"]):
        assert abs(py_lam - ts_lam) < 1e-6, (
            f"{issuer['ticker']} hazard mismatch: py={py_lam}, ts={ts_lam}"
        )

    E = issuer["equityUsdB"] * 1e9
    D = issuer["totalDebtUsdB"] * 1e9
    py_merton = merton_calibrate(
        E=E,
        sigma_E=issuer["equityVol"],
        D=D,
        r=r,
        T=5.0,
        proxy_5y_spread=issuer["proxySpreadsBp"][2] / 10000.0,
    )
    ts_m = issuer["merton"]

    assert abs(py_merton.V - ts_m["V"]) / max(1.0, ts_m["V"]) < 1e-6
    assert abs(py_merton.sigma_V - ts_m["sigma_V"]) < 1e-6
    assert abs(py_merton.distance_to_default - ts_m["dd"]) < 1e-6
    assert abs(py_merton.credit_grades_spread_5y_bp - ts_m["creditGradesSpread5yBp"]) < 1e-6
    if ts_m["kappa"] is None:
        assert math.isinf(py_merton.kappa)
    else:
        assert abs(py_merton.kappa - ts_m["kappa"]) / max(1.0, ts_m["kappa"]) < 1e-6


@pytest.mark.parametrize("issuer", FIXTURE["issuers"], ids=[i["ticker"] for i in FIXTURE["issuers"]])
@pytest.mark.parametrize("scenario_id", list(FIXTURE["scenarios"].keys()))
def test_climate_overlay_parity(issuer, scenario_id):
    """Python climate haircut, status, and adjusted spreads match TypeScript across all 9 issuers x 3 scenarios."""
    tenors = [float(t) for t in issuer["tenors"]]
    spreads_bp = [float(s) for s in issuer["proxySpreadsBp"]]
    spreads_dec = [s / 10000.0 for s in spreads_bp]
    r = issuer["riskFreeRate"]
    params = FIXTURE["params"]
    scen = FIXTURE["scenarios"][scenario_id]
    ts_out = issuer["scenarios"][scenario_id]

    py_curve = bootstrap(tenors, spreads_dec, recovery=0.40, r=r)
    E = issuer["equityUsdB"] * 1e9
    D = issuer["totalDebtUsdB"] * 1e9
    py_merton = merton_calibrate(
        E=E,
        sigma_E=issuer["equityVol"],
        D=D,
        r=r,
        T=5.0,
        proxy_5y_spread=spreads_bp[2] / 10000.0,
    )
    scope1_2 = (issuer["scope1MtCo2"] + issuer["scope2MtCo2"]) * 1e6

    haircut, _, _ = asset_haircut(
        scope1_2,
        scen["carbonPrices"],
        scen["emissionsIndex"],
        pass_through=params["passThrough"],
        wacc=params["wacc"],
        tax_rate=params["taxRate"],
        horizon_years=params["horizonYears"],
        include_terminal_value=params["includeTerminalValue"],
        terminal_growth_rate=params["terminalGrowthRate"],
    )
    assert abs(haircut - ts_out["totalHaircutUsd"]) / max(1.0, ts_out["totalHaircutUsd"]) < 1e-6

    py_out = climate_adjusted_curve(
        base_curve=py_curve,
        base_spreads_bp=spreads_bp,
        V=py_merton.V,
        sigma_V=py_merton.sigma_V,
        D=D,
        kappa=py_merton.kappa,
        scope1_2_tco2=scope1_2,
        carbon_prices=scen["carbonPrices"],
        emissions_index=scen["emissionsIndex"],
        pass_through=params["passThrough"],
        wacc=params["wacc"],
        tax_rate=params["taxRate"],
        horizon_years=params["horizonYears"],
        include_terminal_value=params["includeTerminalValue"],
        vol_uplift=params["volUpliftFactor"],
        E=py_merton.E,
        cg_sigma_V=py_merton.credit_grades_asset_vol,
        ramp_midpoint_years=params.get("rampMidpointYears", 7.0),
        ramp_width_years=params.get("rampWidthYears", 2.0),
    )

    assert py_out["status"] == ts_out["status"]
    assert py_out["exceeds_empirical_range"] == ts_out["exceedsEmpiricalRange"]
    assert abs(py_out["scaled_delta_bp"] - ts_out["scaledDeltaSpreadBp"]) <= 1e-4

    for py_s, ts_s in zip(py_out["adjusted_spreads_bp"], ts_out["adjustedSpreadsBp"]):
        assert abs(py_s - ts_s) <= 1e-4, f"{issuer['ticker']} {scenario_id} spread mismatch: py={py_s}, ts={ts_s}"

    for py_h, ts_h in zip(py_out["adjusted_curve"].hazard_rates, ts_out["adjustedHazardRates"]):
        assert abs(py_h - ts_h) < 1e-4, f"{issuer['ticker']} {scenario_id} adj hazard mismatch: py={py_h}, ts={ts_h}"

    assert abs(py_out["cs01_eur_per_bp"] - ts_out["cs01EurPerBp"]) <= 1e-4
    if ts_out["carbonPriceSensitivityBp"] is None:
        assert math.isnan(py_out["carbon_price_sensitivity_bp"])
    else:
        assert abs(py_out["carbon_price_sensitivity_bp"] - ts_out["carbonPriceSensitivityBp"]) <= 1e-4
