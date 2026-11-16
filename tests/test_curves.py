"""
tests/test_curves.py
--------------------
Acceptance tests for src/curves.py
Designed to catch numerical tolerance, economic consistency, and inversion errors.
"""

import pytest
import numpy as np
from src.curves import HazardCurve, bootstrap, cds_legs, cds_mtm, cs01


def test_round_trip_bootstrap():
    """Catches: Inaccurate numerical root-solving by verifying repricing error < 1e-8."""
    tenors = [1.0, 3.0, 5.0, 7.0, 10.0]
    spreads = [0.0050, 0.0075, 0.0100, 0.0125, 0.0150]  # 50bp to 150bp

    curve = bootstrap(tenors, spreads, recovery=0.40, r=0.04)

    for tenor, expected_s in zip(tenors, spreads):
        _, _, repriced_s = cds_legs(curve, tenor)
        assert abs(repriced_s - expected_s) < 1e-8, f"Round-trip failed at {tenor}Y: diff={abs(repriced_s - expected_s)}"


def test_credit_triangle_approximation():
    """Catches: Misformulation of CDS legs or recovery rate misuse by verifying s approx lambda * (1 - R)."""
    tenors = [5.0]
    spreads = [0.0100]  # 100 bp
    recovery = 0.40

    curve = bootstrap(tenors, spreads, recovery=recovery, r=0.04)
    expected_hazard = 0.0100 / (1.0 - recovery)  # 0.016667

    assert abs(curve.hazard_rates[0] - expected_hazard) < 2e-4


def test_survival_prob_monotonic_decay():
    """Catches: Negative hazard rates or time-grid indexing bugs by requiring Q(t) to be monotonically non-increasing."""
    tenors = [1.0, 3.0, 5.0, 7.0, 10.0]
    spreads = [0.0040, 0.0070, 0.0110, 0.0140, 0.0170]
    curve = bootstrap(tenors, spreads, recovery=0.40, r=0.04)

    grid = np.linspace(0.0, 10.0, 41)
    q_vals = [curve.survival_prob(float(t)) for t in grid]

    for i in range(len(q_vals) - 1):
        assert q_vals[i] >= q_vals[i + 1], f"Survival prob not decreasing at index {i}"


def test_cs01_positive_and_magnitude():
    """Catches: Sign convention errors on protection positions (CS01 must equal +Notional * RPV01 * 1bp)."""
    tenors = [1.0, 3.0, 5.0]
    spreads = [0.0060, 0.0090, 0.0120]
    curve = bootstrap(tenors, spreads, recovery=0.40, r=0.04)

    notional = 10_000_000.0
    val = cs01(curve, 5.0, notional=notional)
    _, rpv01, _ = cds_legs(curve, 5.0)

    assert val > 0, "CS01 must be strictly positive for a protection buyer"
    assert abs(val - notional * rpv01 * 0.0001) < 1e-4


def test_negative_forward_hazard_raises():
    """Catches: Silent acceptance of impossible inverted curves; must fail loudly with descriptive ValueError."""
    with pytest.raises(ValueError) as excinfo:
        bootstrap([1.0, 5.0], [0.0200, 0.0010], r=0.04)

    assert "Negative forward hazard" in str(excinfo.value) or "inverted" in str(excinfo.value)


def test_raw_repricing_error_tolerance():
    """Catches: Error masking / false zero display; asserts raw error without truncation < 1e-10."""
    tenors = [1.0, 3.0, 5.0, 7.0, 10.0]
    spreads = [0.0032, 0.0046, 0.0062, 0.0075, 0.0088]
    curve = bootstrap(tenors, spreads, recovery=0.40, r=0.041)

    for tenor, expected_s in zip(tenors, spreads):
        _, _, repriced_s = cds_legs(curve, tenor)
        raw_error = abs(repriced_s - expected_s)
        assert raw_error < 1e-10, f"Raw repricing error {raw_error:e} exceeded 1e-10 at {tenor}Y"
