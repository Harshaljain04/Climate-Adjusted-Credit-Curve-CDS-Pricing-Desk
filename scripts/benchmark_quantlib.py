"""
scripts/benchmark_quantlib.py
-----------------------------
Independent validation benchmark comparing our piecewise hazard curve bootstrapping
against QuantLib (ql.PiecewiseFlatHazardRate) on a sloped 5-point curve (60-140bp),
plus a convention attribution experiment isolating day-count and IMM date generation.

Usage:
  python scripts/benchmark_quantlib.py
"""

import json
import sys
from datetime import date
from pathlib import Path

# Allow running directly without PYTHONPATH=.
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

try:
    import QuantLib as ql
except ImportError:
    print("QuantLib is not installed. Install via: pip install QuantLib")
    sys.exit(1)

from src.curves import bootstrap


def _build_ql_curve(today, tenors, spreads, r, recovery, day_count, date_gen, settlement_days=0):
    yts = ql.YieldTermStructureHandle(ql.FlatForward(today, r, ql.Actual365Fixed()))
    helpers = [
        ql.SpreadCdsHelper(
            s,
            ql.Period(int(T), ql.Years),
            settlement_days,
            ql.TARGET(),
            ql.Quarterly,
            ql.Following,
            date_gen,
            day_count,
            recovery,
            yts,
        )
        for T, s in zip(tenors, spreads)
    ]
    return ql.PiecewiseFlatHazardRate(today, helpers, ql.Actual365Fixed())


def _measure_gaps(our_curve, ql_curve, tenors):
    rows = []
    max_abs = 0.0
    max_rel = 0.0
    max_tenor = tenors[0]
    for T in tenors:
        our_q = our_curve.survival_prob(float(T))
        ql_q = float(ql_curve.survivalProbability(float(T)))
        abs_diff = abs(our_q - ql_q)
        rel_diff_pct = (abs_diff / ql_q) * 100.0 if ql_q > 0 else 0.0
        if abs_diff > max_abs:
            max_abs = abs_diff
            max_rel = rel_diff_pct
            max_tenor = T
        rows.append({
            "tenorYears": T,
            "ourSurvivalProb": round(our_q, 6),
            "quantLibSurvivalProb": round(ql_q, 6),
            "absDiff": round(abs_diff, 6),
            "relDiffPct": round(rel_diff_pct, 4),
        })
    return rows, max_abs, max_rel, max_tenor


def run_benchmark():
    tenors = [1, 3, 5, 7, 10]
    spreads = [0.0060, 0.0085, 0.0110, 0.0125, 0.0140]  # 60bp to 140bp
    r = 0.04
    R = 0.40

    today = ql.Date(27, 10, 2026)
    ql.Settings.instance().evaluationDate = today

    our_curve = bootstrap([float(t) for t in tenors], spreads, recovery=R, r=r)

    # 1. Baseline ISDA standard conventions: Actual/360 + TwentiethIMM
    ql_isda = _build_ql_curve(
        today, tenors, spreads, r, R, ql.Actual360(), ql.DateGeneration.TwentiethIMM
    )
    rows_isda, max_abs_isda, max_rel_isda, max_tenor_isda = _measure_gaps(our_curve, ql_isda, tenors)
    for row, s in zip(rows_isda, spreads):
        row["parSpreadBp"] = round(s * 10000)

    # 2. Convention Experiment A: Switch SpreadCdsHelper day count to Actual/365 Fixed, keep TwentiethIMM
    ql_act365_imm = _build_ql_curve(
        today, tenors, spreads, r, R, ql.Actual365Fixed(), ql.DateGeneration.TwentiethIMM
    )
    rows_exp_a, max_abs_exp_a, max_rel_exp_a, _ = _measure_gaps(our_curve, ql_act365_imm, tenors)

    # 3. Convention Experiment B: Actual/365 Fixed + DateGeneration.Forward (remove IMM roll)
    ql_act365_fwd = _build_ql_curve(
        today, tenors, spreads, r, R, ql.Actual365Fixed(), ql.DateGeneration.Forward
    )
    rows_exp_b, max_abs_exp_b, max_rel_exp_b, _ = _measure_gaps(our_curve, ql_act365_fwd, tenors)

    reduction_act365_pct = ((max_abs_isda - max_abs_exp_a) / max_abs_isda * 100.0) if max_abs_isda > 0 else 0.0
    reduction_both_pct = ((max_abs_isda - max_abs_exp_b) / max_abs_isda * 100.0) if max_abs_isda > 0 else 0.0

    residual_explained = max_abs_exp_b < 1e-5
    if residual_explained:
        attribution_summary = (
            f"Aligning day count to Actual/365 and removing IMM date generation reduces the max survival gap "
            f"from {max_abs_isda:.5f} to {max_abs_exp_b:.5f} ({reduction_both_pct:.1f}% reduction), accounting for the discrepancy."
        )
    else:
        attribution_summary = (
            f"Aligning day count to Actual/365 and removing TwentiethIMM generation reduces the max survival gap "
            f"from {max_abs_isda:.5f} to {max_abs_exp_b:.5f} ({reduction_both_pct:.1f}% reduction). "
            f"A residual gap of {max_abs_exp_b:.5f} ({max_rel_exp_b:.3f}%) remains unexplained by these two settings alone "
            f"(reflecting QuantLib's exact business-day schedule, midpoint protection evaluation, and up-front/accrual integration)."
        )

    payload = {
        "generatedAt": date.today().isoformat(),
        "quantLibVersion": ql.__version__,
        "evaluationDate": "2026-10-27",
        "inputs": {
            "tenorsYears": tenors,
            "spreadsBp": [round(s * 10000) for s in spreads],
            "riskFreeRate": r,
            "recoveryRate": R,
            "ourConventions": "Continuous r=0.04, quarterly dt=0.25 grid, half-period accrual, midpoint protection leg",
            "qlConventions": "Actual/360 CDS helper, DateGeneration.TwentiethIMM, TARGET calendar, FlatForward Actual/365",
        },
        "summary": {
            "maxAbsDiff": round(max_abs_isda, 6),
            "maxAbsDiffPctPoints": round(max_abs_isda * 100.0, 4),
            "maxRelDiffPct": round(max_rel_isda, 4),
            "maxDiffTenorYears": max_tenor_isda,
        },
        "rows": rows_isda,
        "conventionExperiment": {
            "baselineIsda": {
                "label": "Actual/360 + TwentiethIMM",
                "maxAbsDiff": round(max_abs_isda, 6),
                "maxRelDiffPct": round(max_rel_isda, 4),
                "rows": rows_isda,
            },
            "actual365WithImm": {
                "label": "Actual/365 Fixed + TwentiethIMM",
                "maxAbsDiff": round(max_abs_exp_a, 6),
                "maxRelDiffPct": round(max_rel_exp_a, 4),
                "gapReductionPct": round(reduction_act365_pct, 2),
                "rows": rows_exp_a,
            },
            "actual365WithoutImm": {
                "label": "Actual/365 Fixed + DateGeneration.Forward (No IMM)",
                "maxAbsDiff": round(max_abs_exp_b, 6),
                "maxRelDiffPct": round(max_rel_exp_b, 4),
                "gapReductionPct": round(reduction_both_pct, 2),
                "rows": rows_exp_b,
            },
            "fullyExplained": residual_explained,
            "summary": attribution_summary,
        },
    }

    out_dir = REPO_ROOT / "data" / "benchmarks"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / f"quantlib_{date.today().isoformat()}.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
        f.write("\n")

    print(f"QuantLib version: {ql.__version__}")
    print(f"{'Tenor (Y)':<10} | {'Our Q(t)':<14} | {'QuantLib Q(t)':<14} | {'Abs Diff':<12} | {'Rel Diff (%)':<12}")
    print("-" * 70)
    for row in rows_isda:
        print(
            f"{row['tenorYears']:<10} | {row['ourSurvivalProb']:<14.6f} | "
            f"{row['quantLibSurvivalProb']:<14.6f} | {row['absDiff']:<12.6f} | {row['relDiffPct']:<11.3f}%"
        )
    print("-" * 70)
    print(f"Max abs diff (ISDA Actual/360 + TwentiethIMM): {max_abs_isda:.5f} ({max_abs_isda*100:.3f} pp, {max_rel_isda:.3f}% rel) at {max_tenor_isda}Y")
    print(f"Exp A (Actual/365 + TwentiethIMM): max abs diff = {max_abs_exp_a:.5f} ({reduction_act365_pct:.1f}% change)")
    print(f"Exp B (Actual/365 + Forward, no IMM): max abs diff = {max_abs_exp_b:.5f} ({reduction_both_pct:.1f}% change)")
    print(f"Attribution: {attribution_summary}")
    print(f"Saved JSON fixture: {out_file}")


if __name__ == "__main__":
    run_benchmark()
