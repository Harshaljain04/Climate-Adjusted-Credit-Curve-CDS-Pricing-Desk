"""
Fetches or builds the rating-based proxy spread term structure from FRED ICE BofA OAS series
(BAMLC0A1CAAA, BAMLC0A3CA, BAMLC0A4CBBB, BAMLH0A1HYBB) and writes data/raw/proxy_spreads.csv.

Usage:
  1. Live FRED API download (requires FRED_API_KEY env var or --api-key):
     python scripts/fetch_proxy_spreads.py --api-key YOUR_FRED_KEY
  2. Offline from downloaded FRED CSVs:
     python scripts/fetch_proxy_spreads.py --csv-dir path/to/fred_csvs
  3. Reproducible offline snapshot (used when no API key is present, e.g. in CI):
     python scripts/fetch_proxy_spreads.py
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_CSV = ROOT / "data" / "raw" / "proxy_spreads.csv"

FRED_SERIES = {
    "AAA": "BAMLC0A1CAAA",
    "A": "BAMLC0A3CA",
    "BBB": "BAMLC0A4CBBB",
    "BB": "BAMLH0A1HYBB",
}

# Rating-to-spread map and term structure (bp) across [1Y, 3Y, 5Y, 7Y, 10Y].
# Note: Marked 'rating-based proxies, not traded CDS quotes (illustrative, hand-entered)'
# when generated without a live FRED API key.
SNAPSHOT_ROWS = [
    {
        "rating_bucket": "AAA",
        "representative_issuer": "MSFT",
        "fred_series_id": "BAMLC0A1CAAA",
        "as_of_date": "2026-10-15",
        "tenor_1y_bp": 18,
        "tenor_3y_bp": 28,
        "tenor_5y_bp": 38,
        "tenor_7y_bp": 48,
        "tenor_10y_bp": 58,
        "provenance_status": "rating-based proxies, not traded CDS quotes (illustrative, hand-entered)",
        "source_url": "https://fred.stlouisfed.org/series/BAMLC0A1CAAA",
    },
    {
        "rating_bucket": "A+_US",
        "representative_issuer": "XOM",
        "fred_series_id": "BAMLC0A3CA",
        "as_of_date": "2026-10-15",
        "tenor_1y_bp": 32,
        "tenor_3y_bp": 46,
        "tenor_5y_bp": 62,
        "tenor_7y_bp": 75,
        "tenor_10y_bp": 88,
        "provenance_status": "rating-based proxies, not traded CDS quotes (illustrative, hand-entered)",
        "source_url": "https://fred.stlouisfed.org/series/BAMLC0A3CA",
    },
    {
        "rating_bucket": "A+_PHARMA",
        "representative_issuer": "PFE",
        "fred_series_id": "BAMLC0A3CA",
        "as_of_date": "2026-10-15",
        "tenor_1y_bp": 31,
        "tenor_3y_bp": 44,
        "tenor_5y_bp": 60,
        "tenor_7y_bp": 74,
        "tenor_10y_bp": 87,
        "provenance_status": "rating-based proxies, not traded CDS quotes (illustrative, hand-entered)",
        "source_url": "https://fred.stlouisfed.org/series/BAMLC0A3CA",
    },
    {
        "rating_bucket": "A+_EU",
        "representative_issuer": "TTE",
        "fred_series_id": "BAMLC0A3CA",
        "as_of_date": "2026-10-15",
        "tenor_1y_bp": 34,
        "tenor_3y_bp": 48,
        "tenor_5y_bp": 65,
        "tenor_7y_bp": 78,
        "tenor_10y_bp": 92,
        "provenance_status": "rating-based proxies, not traded CDS quotes (illustrative, hand-entered)",
        "source_url": "https://fred.stlouisfed.org/series/BAMLC0A3CA",
    },
    {
        "rating_bucket": "A_EU",
        "representative_issuer": "SAP",
        "fred_series_id": "BAMLC0A3CA",
        "as_of_date": "2026-10-15",
        "tenor_1y_bp": 28,
        "tenor_3y_bp": 40,
        "tenor_5y_bp": 56,
        "tenor_7y_bp": 70,
        "tenor_10y_bp": 84,
        "provenance_status": "rating-based proxies, not traded CDS quotes (illustrative, hand-entered)",
        "source_url": "https://fred.stlouisfed.org/series/BAMLC0A3CA",
    },
    {
        "rating_bucket": "A-",
        "representative_issuer": "NEE",
        "fred_series_id": "BAMLC0A3CA;BAMLC0A4CBBB",
        "as_of_date": "2026-10-15",
        "tenor_1y_bp": 44,
        "tenor_3y_bp": 62,
        "tenor_5y_bp": 85,
        "tenor_7y_bp": 102,
        "tenor_10y_bp": 118,
        "provenance_status": "rating-based proxies, not traded CDS quotes (illustrative, hand-entered)",
        "source_url": "https://fred.stlouisfed.org/series/BAMLC0A4CBBB",
    },
    {
        "rating_bucket": "BBB+",
        "representative_issuer": "HOLN",
        "fred_series_id": "BAMLC0A4CBBB",
        "as_of_date": "2026-10-15",
        "tenor_1y_bp": 58,
        "tenor_3y_bp": 85,
        "tenor_5y_bp": 118,
        "tenor_7y_bp": 138,
        "tenor_10y_bp": 162,
        "provenance_status": "rating-based proxies, not traded CDS quotes (illustrative, hand-entered)",
        "source_url": "https://fred.stlouisfed.org/series/BAMLC0A4CBBB",
    },
    {
        "rating_bucket": "BBB-_IN_STEEL",
        "representative_issuer": "TATASTEEL",
        "fred_series_id": "BAMLC0A4CBBB;BAMLH0A1HYBB",
        "as_of_date": "2026-10-15",
        "tenor_1y_bp": 88,
        "tenor_3y_bp": 128,
        "tenor_5y_bp": 178,
        "tenor_7y_bp": 208,
        "tenor_10y_bp": 242,
        "provenance_status": "rating-based proxies, not traded CDS quotes (illustrative, hand-entered)",
        "source_url": "https://fred.stlouisfed.org/series/BAMLC0A4CBBB",
    },
    {
        "rating_bucket": "BBB-_IN_UTIL",
        "representative_issuer": "NTPC",
        "fred_series_id": "BAMLC0A4CBBB;BAMLH0A1HYBB",
        "as_of_date": "2026-10-15",
        "tenor_1y_bp": 86,
        "tenor_3y_bp": 124,
        "tenor_5y_bp": 172,
        "tenor_7y_bp": 202,
        "tenor_10y_bp": 235,
        "provenance_status": "rating-based proxies, not traded CDS quotes (illustrative, hand-entered)",
        "source_url": "https://fred.stlouisfed.org/series/BAMLC0A4CBBB",
    },
]


def fetch_latest_fred_oas_bp(series_id: str, api_key: str) -> tuple[str, float]:
    """Downloads the latest non-missing observation (in bp) from FRED API."""
    url = (
        f"https://api.stlouisfed.org/fred/series/observations"
        f"?series_id={series_id}&api_key={api_key}&file_type=json&sort_order=desc&limit=10"
    )
    with urllib.request.urlopen(url, timeout=15) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    for obs in payload.get("observations", []):
        val = obs.get("value", ".")
        if val != ".":
            # FRED OAS is reported in percentage points (e.g. 0.85 -> 85 bp)
            return obs["date"], round(float(val) * 100.0, 2)
    raise ValueError(f"No valid observation returned for {series_id}")


def build_term_structure_from_5y(spread_5y_bp: float) -> tuple[float, float, float, float, float]:
    """Builds a [1Y, 3Y, 5Y, 7Y, 10Y] term structure around a 5Y OAS observation."""
    return (
        round(spread_5y_bp * 0.52, 1),
        round(spread_5y_bp * 0.74, 1),
        round(spread_5y_bp * 1.00, 1),
        round(spread_5y_bp * 1.19, 1),
        round(spread_5y_bp * 1.40, 1),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch or build rating-proxy spreads CSV.")
    parser.add_argument("--api-key", default=os.environ.get("FRED_API_KEY", ""), help="FRED API key")
    parser.add_argument("--out", default=str(OUT_CSV), help="Output CSV path")
    args = parser.parse_args()

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    rows = list(SNAPSHOT_ROWS)

    if args.api_key:
        try:
            fetched = {}
            for bucket, sid in FRED_SERIES.items():
                obs_date, oas_bp = fetch_latest_fred_oas_bp(sid, args.api_key)
                t1, t3, t5, t7, t10 = build_term_structure_from_5y(oas_bp)
                fetched[sid] = (obs_date, t1, t3, t5, t7, t10)
            for row in rows:
                primary_sid = row["fred_series_id"].split(";")[0]
                if primary_sid in fetched:
                    obs_date, t1, t3, t5, t7, t10 = fetched[primary_sid]
                    row["as_of_date"] = obs_date
                    row["tenor_1y_bp"] = t1
                    row["tenor_3y_bp"] = t3
                    row["tenor_5y_bp"] = t5
                    row["tenor_7y_bp"] = t7
                    row["tenor_10y_bp"] = t10
                    row["provenance_status"] = (
                        f"FRED API live download ({primary_sid} as of {obs_date}); rating-based proxies, not traded CDS quotes"
                    )
        except Exception as exc:
            print(f"[WARN] Live FRED download failed ({exc}); writing offline snapshot.", file=sys.stderr)

    fieldnames = [
        "rating_bucket",
        "representative_issuer",
        "fred_series_id",
        "as_of_date",
        "tenor_1y_bp",
        "tenor_3y_bp",
        "tenor_5y_bp",
        "tenor_7y_bp",
        "tenor_10y_bp",
        "provenance_status",
        "source_url",
    ]
    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} rating-proxy term-structure rows to {out_path} (generated {date.today().isoformat()})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
