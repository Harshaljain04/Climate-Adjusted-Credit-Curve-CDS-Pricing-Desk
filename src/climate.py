"""
src/climate.py
--------------
Climate transition overlay engine (Phase 2):
1. Calculates annual carbon cost = (1 - pass_through) * Scope1_2 * Index_t * Price_t * (1 - tax)
2. Discounts extra costs at WACC + optional terminal value to obtain asset haircut
3. Applies CreditGrades (2002) first-passage shock (E' = max(E - haircut, 1e6)) + unclipped Merton diagnostics
4. Applies logistic tenor ramp g(T) normalised so g(10) = 1 (Kenyon / Forvis Mazars 2023)
5. Evaluates explicit sanity flags ('normal', 'severe', 'insolvent_in_scenario', 'uninformative_at_current_leverage')
6. Re-bootstraps adjusted hazard curve and computes carbon-price sensitivity (bp per +$10/tCO2) and real CS01 (EUR/bp)
"""

from typing import List, Dict, Any, Tuple, Union
import numpy as np
from src.curves import HazardCurve, bootstrap, cds_legs
from src.merton import merton_spread, credit_grades_spread_bp


def logistic_tenor_ramp(
    tenor: float,
    midpoint_years: float = 7.0,
    width_years: float = 2.0,
) -> float:
    """
    Logistic tenor weight g(T) = 1 / (1 + exp(-(T - m) / w)) normalised so g(10) = 1.0.
    """
    w = max(0.1, float(width_years))
    raw_t = 1.0 / (1.0 + float(np.exp(-(tenor - midpoint_years) / w)))
    raw_10 = 1.0 / (1.0 + float(np.exp(-(10.0 - midpoint_years) / w)))
    return float(raw_t / raw_10)


def asset_haircut(
    arg1: Union[float, List[float], np.ndarray],
    arg2: Union[float, List[float], np.ndarray] = None,
    arg3: Union[List[float], np.ndarray] = None,
    arg4: float = 0.40,
    arg5: float = 0.08,
    pass_through: float = None,
    wacc: float = None,
    tax_rate: float = 0.25,
    tax: float = None,
    horizon_years: int = 25,
    include_terminal_value: bool = False,
    terminal_growth_rate: float = 0.015,
    g: float = None,
    additional_price_shock: float = 0.0,
) -> Tuple[float, float, List[float]]:
    """
    Computes (total_haircut, terminal_value, annual_costs).
    Supports both flexible calling conventions from tests and desk scripts:
      A) asset_haircut(scope1_2_tco2, carbon_prices, emissions_index, pass_through, wacc)
      B) asset_haircut(carbon_prices, emissions_index, scope1_2_tco2, pass_through, wacc)
    """
    if isinstance(arg1, (int, float)) and not isinstance(arg1, (list, np.ndarray)):
        scope1_2_tco2 = float(arg1)
        carbon_prices = list(arg2) if arg2 is not None else [50.0]
        emissions_index = list(arg3) if arg3 is not None else [1.0] * len(carbon_prices)
        pt = arg4 if pass_through is None else pass_through
        disc = arg5 if wacc is None else wacc
    else:
        carbon_prices = list(arg1)
        emissions_index = list(arg2) if arg2 is not None else [1.0] * len(carbon_prices)
        scope1_2_tco2 = float(arg3) if arg3 is not None else 1e6
        pt = arg4 if pass_through is None else pass_through
        disc = arg5 if wacc is None else wacc

    effective_tax = tax if tax is not None else tax_rate
    effective_g = g if g is not None else terminal_growth_rate

    horizon = min(horizon_years, len(carbon_prices))
    annual_costs = []
    pv_explicit = 0.0

    for t in range(horizon):
        price = max(0.0, float(carbon_prices[t]) + additional_price_shock)
        idx = float(emissions_index[t])
        cost = (1.0 - pt) * scope1_2_tco2 * idx * price * (1.0 - effective_tax)
        annual_costs.append(cost)
        discount_factor = (1.0 + disc) ** (t + 1)
        pv_explicit += cost / discount_factor

    tv = 0.0
    if (include_terminal_value or g is not None) and horizon > 0:
        last_cost = annual_costs[-1]
        denom = max(0.01, disc - effective_g)
        tv = (last_cost * (1.0 + effective_g)) / denom
        tv = tv / ((1.0 + disc) ** horizon)

    total_haircut = pv_explicit + tv
    return float(total_haircut), float(tv), annual_costs


def _climate_adjusted_core(
    base_curve: HazardCurve,
    base_spreads_bp: List[float],
    V: float,
    sigma_V: float,
    D: float,
    kappa: float,
    scope1_2_tco2: float,
    carbon_prices: List[float],
    emissions_index: List[float],
    pass_through: float = 0.40,
    wacc: float = 0.08,
    tax_rate: float = 0.25,
    horizon_years: int = 25,
    include_terminal_value: bool = False,
    terminal_growth_rate: float = 0.015,
    vol_uplift: float = 0.50,
    notional: float = 10_000_000.0,
    additional_price_shock: float = 0.0,
    E: float = None,
    cg_sigma_V: float = None,
    ramp_midpoint_years: float = 7.0,
    ramp_width_years: float = 2.0,
) -> Dict[str, Any]:
    haircut, tv, annual_costs = asset_haircut(
        scope1_2_tco2,
        carbon_prices,
        emissions_index,
        pass_through=pass_through,
        wacc=wacc,
        tax_rate=tax_rate,
        horizon_years=horizon_years,
        include_terminal_value=include_terminal_value,
        terminal_growth_rate=terminal_growth_rate,
        additional_price_shock=additional_price_shock,
    )

    # Raw shocked asset value without 1.01 * D floor (Section 2.3)
    v_scen = float(V - haircut)
    haircut_ratio = haircut / V if V > 0 else 0.0
    haircut_pct_v = haircut_ratio * 100.0
    is_insolvent = v_scen <= D
    is_severe = (not is_insolvent) and (haircut_ratio >= 0.5)

    vol_mult = min(2.5, max(1.0, 1.0 + vol_uplift * haircut_ratio))
    sig_v_scen = sigma_V * vol_mult

    base_merton_bp = merton_spread(V, sigma_V, D, base_curve.r, 5.0) * 10000.0
    if is_insolvent:
        scen_merton_bp = float("nan")
        delta_merton_bp = float("nan")
    else:
        scen_merton_bp = merton_spread(v_scen, sig_v_scen, D, base_curve.r, 5.0) * 10000.0
        delta_merton_bp = float(scen_merton_bp - base_merton_bp)

    # CreditGrades (2002) first-passage inputs
    e_0 = float(E) if E is not None else max(1e6, float(V - D * np.exp(-base_curve.r * 5.0)))
    cg_sig_0 = float(cg_sigma_V) if cg_sigma_V is not None else float(sigma_V)
    cg_sig_scen = cg_sig_0 * vol_mult
    shocked_equity = max(1e6, e_0 - haircut)

    cg_base_5y_bp = credit_grades_spread_bp(e_0, D, cg_sig_0, 5.0, base_curve.recovery, 0.5, 0.3)
    cg_shocked_5y_bp = credit_grades_spread_bp(shocked_equity, D, cg_sig_scen, 5.0, base_curve.recovery, 0.5, 0.3)
    cg_delta_5y_bp = cg_shocked_5y_bp - cg_base_5y_bp

    cg_base_10y_bp = credit_grades_spread_bp(e_0, D, cg_sig_0, 10.0, base_curve.recovery, 0.5, 0.3)
    cg_shocked_10y_bp = credit_grades_spread_bp(shocked_equity, D, cg_sig_scen, 10.0, base_curve.recovery, 0.5, 0.3)
    cg_delta_10y_bp = 0.0 if haircut <= 0 else (cg_shocked_10y_bp - cg_base_10y_bp)

    tenor_shifts_bp: List[float] = []
    adjusted_spreads_bp: List[float] = []
    for tenor, base_bp in zip(base_curve.tenors, base_spreads_bp):
        w = logistic_tenor_ramp(float(tenor), ramp_midpoint_years, ramp_width_years)
        shift_bp = 0.0 if haircut <= 0 else float(cg_delta_10y_bp * w)
        tenor_shifts_bp.append(shift_bp)
        adjusted_spreads_bp.append(float(base_bp + shift_bp))

    tenors_list = list(base_curve.tenors)
    five_y_idx = tenors_list.index(5.0) if 5.0 in tenors_list else 2
    scaled_delta_bp = float(tenor_shifts_bp[five_y_idx])

    is_uninformative = (
        (not is_insolvent)
        and (not is_severe)
        and (base_merton_bp < 5.0)
        and (kappa > 3.0)
        and (cg_base_5y_bp < 0.5)
        and (abs(scaled_delta_bp) < 0.5)
    )

    if is_insolvent:
        status = "insolvent_in_scenario"
    elif is_severe:
        status = "severe"
    elif is_uninformative:
        status = "uninformative_at_current_leverage"
    else:
        status = "normal"

    adjusted_spreads_dec = [max(1e-7, s / 10000.0) for s in adjusted_spreads_bp]
    try:
        adjusted_curve = bootstrap(
            base_curve.tenors, adjusted_spreads_dec, recovery=base_curve.recovery, r=base_curve.r
        )
    except ValueError:
        adjusted_curve = base_curve

    _, base_rpv01, _ = cds_legs(base_curve, 5.0)
    _, adj_rpv01, _ = cds_legs(adjusted_curve, 5.0)
    cs01_eur_per_bp = float(notional * base_rpv01 * 0.0001)
    mtm_impact = (
        float(notional * (1.0 - base_curve.recovery))
        if is_insolvent
        else float(notional * (scaled_delta_bp / 10000.0) * adj_rpv01)
    )

    return {
        "status": status,
        "exceeds_empirical_range": bool(is_insolvent or scaled_delta_bp > 300.0),
        "haircut": haircut,
        "terminal_value": tv,
        "haircut_pct_v": haircut_pct_v,
        "v_scenario": v_scen,
        "base_merton_bp": base_merton_bp,
        "shocked_merton_bp": scen_merton_bp,
        "delta_merton_bp": delta_merton_bp,
        "cg_base_5y_bp": cg_base_5y_bp,
        "cg_shocked_5y_bp": cg_shocked_5y_bp,
        "cg_delta_5y_bp": cg_delta_5y_bp,
        "cg_delta_10y_bp": cg_delta_10y_bp,
        "scaled_delta_bp": scaled_delta_bp,
        "tenor_shifts_bp": tenor_shifts_bp,
        "adjusted_spreads_bp": adjusted_spreads_bp,
        "adjusted_curve": adjusted_curve,
        "mtm_impact_eur": mtm_impact,
        "cs01_eur_per_bp": cs01_eur_per_bp,
        "annual_costs": annual_costs,
    }


def climate_adjusted_curve(
    base_curve: HazardCurve,
    base_spreads_bp: List[float],
    V: float,
    sigma_V: float,
    D: float,
    kappa: float,
    scope1_2_tco2: float,
    carbon_prices: List[float],
    emissions_index: List[float],
    pass_through: float = 0.40,
    wacc: float = 0.08,
    tax_rate: float = 0.25,
    horizon_years: int = 25,
    include_terminal_value: bool = False,
    vol_uplift: float = 0.50,
    notional: float = 10_000_000.0,
    E: float = None,
    cg_sigma_V: float = None,
    ramp_midpoint_years: float = 7.0,
    ramp_width_years: float = 2.0,
) -> Dict[str, Any]:
    res = _climate_adjusted_core(
        base_curve=base_curve,
        base_spreads_bp=base_spreads_bp,
        V=V,
        sigma_V=sigma_V,
        D=D,
        kappa=kappa,
        scope1_2_tco2=scope1_2_tco2,
        carbon_prices=carbon_prices,
        emissions_index=emissions_index,
        pass_through=pass_through,
        wacc=wacc,
        tax_rate=tax_rate,
        horizon_years=horizon_years,
        include_terminal_value=include_terminal_value,
        vol_uplift=vol_uplift,
        notional=notional,
        additional_price_shock=0.0,
        E=E,
        cg_sigma_V=cg_sigma_V,
        ramp_midpoint_years=ramp_midpoint_years,
        ramp_width_years=ramp_width_years,
    )

    bumped = _climate_adjusted_core(
        base_curve=base_curve,
        base_spreads_bp=base_spreads_bp,
        V=V,
        sigma_V=sigma_V,
        D=D,
        kappa=kappa,
        scope1_2_tco2=scope1_2_tco2,
        carbon_prices=carbon_prices,
        emissions_index=emissions_index,
        pass_through=pass_through,
        wacc=wacc,
        tax_rate=tax_rate,
        horizon_years=horizon_years,
        include_terminal_value=include_terminal_value,
        vol_uplift=vol_uplift,
        notional=notional,
        additional_price_shock=10.0,
        E=E,
        cg_sigma_V=cg_sigma_V,
        ramp_midpoint_years=ramp_midpoint_years,
        ramp_width_years=ramp_width_years,
    )

    sens_bp = (
        float("nan")
        if res["status"] == "insolvent_in_scenario"
        else float(bumped["scaled_delta_bp"] - res["scaled_delta_bp"])
    )
    res["carbon_price_sensitivity_bp"] = sens_bp
    res["climate_cs01_bp"] = sens_bp
    return res
