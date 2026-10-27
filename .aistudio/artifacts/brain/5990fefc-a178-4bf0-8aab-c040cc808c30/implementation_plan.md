# Climate-Adjusted Credit Curve & CDS Pricing Desk

An institutional quantitative credit risk desk and research platform that bootstraps baseline hazard rate curves, models equity-to-asset balance sheet mechanics via a calibrated Merton structural framework, applies Network for Greening the Financial System (NGFS) climate transition pathways, and reprices single-name Credit Default Swaps (CDS) with climate sensitivities (CS01, MTM, and survival probabilities).

## User Review & Critical Decisions

> [!IMPORTANT]
> The implementation aligns with the user's confirmed preferences:
> 1. **Visual Style**: High-density institutional quant terminal with dark slate aesthetic, precision tabular numerals, real-time curve plots, multi-tab layout, and parameter control drawer.
> 2. **Issuer Universe**: Pre-calibrated global panel featuring high-carbon and low-carbon comparators across the US, Europe, and India (ExxonMobil, NextEra Energy, Holcim, TotalEnergies, Tata Steel, NTPC, Microsoft, Pfizer, and SAP), plus historical distress cases (Peabody Energy 2016 and PG&E 2019).
> 3. **Exportable Python Package**: Integrated file-browser and exporter containing the full modular Python 3.11 codebase (`src/curves.py`, `src/merton.py`, `src/climate.py`, `src/pricing.py`, `src/data_loaders.py`), comprehensive `pytest` test suite, `CONTEXT.md`, `SOURCES.md`, and reproducible research notebook.

---

## 1. Overview & Core Concept

- **What It Does**: Bridges climate economics and credit derivatives pricing. It allows quants, portfolio managers, and risk analysts to stress-test corporate debt against orderly (Net Zero 2050), disorderly (Delayed Transition), and hot-house (Current Policies) climate scenarios. It computes the PV asset haircut from direct carbon costs, transmits this shock through a calibrated Merton (1974) structural model to shift default boundaries, and reprices par CDS spreads (1Y, 3Y, 5Y, 7Y, 10Y), MTM on protection positions, and spread sensitivity per $+\$10/\text{tCO}_2$ (Climate CS01).
- **Target Audience / Persona**: Harshal Jain's GrEnFIn (Climate & Business) application portfolio, academic admission committees, and investment banking / credit risk quantitative interviewers.
- **Key Value**: Provides an end-to-end, mathematically rigorous, and transparently validated quantitative tool. It respects the non-negotiable honesty rule: market spreads are documented as rating-based proxies rather than proprietary dealer quotes, every formula is traceable to financial literature, and numerical results match QuantLib benchmarks.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Interactive Desk**:
   - The user selects an issuer from the pre-calibrated global universe (or creates a custom issuer).
   - The user toggles between NGFS transition scenarios (Net Zero 2050, Delayed Transition, Current Policies).
   - Adjusts parameters via high-precision sliders: Recovery Rate ($R \in [0.20, 0.60]$), Pass-Through Fraction ($p \in [0.0, 0.8]$), WACC ($\in [4\%, 14\%]$), Projection Horizon ($10\text{--}30\text{ yr}$), and Terminal Value inclusion.
   - Instantly inspects the baseline vs. climate-adjusted CDS spread curve ($1\text{Y}, 3\text{Y}, 5\text{Y}, 7\text{Y}, 10\text{Y}$), hazard rates $\lambda(t)$, survival probabilities $Q(t)$, $\Delta\text{Spread}$ by tenor, MTM change on a EUR 10M protection position, and Climate CS01.
2. **Structural Merton & Balance Sheet Inspector**:
   - Inspects equity capitalization ($E$), equity volatility ($\sigma_E$), total debt ($D$), risk-free rate ($r$), and time to maturity ($T$).
   - Solves the bivariate non-linear Merton system for unobserved firm asset value ($V$) and asset volatility ($\sigma_V$).
   - Displays the distance-to-default ($\text{DD}$), risk-neutral default probability ($\text{PD}_{\text{RN}}$), and the calibration scaling factor ($\kappa = s_{\text{proxy, 5Y}} / s_{\text{Merton, 5Y}}$).
3. **NGFS Pathways & Haircut Engine**:
   - Compares the trajectory of shadow carbon prices $(\$/\text{tCO}_2)$ and emissions reduction pathways ($E_t / E_0$) from 2025 to 2050 across all 3 scenarios.
   - Shows the annual post-pass-through, post-tax cash outflow waterfall and the resulting present-value haircut to asset value $V$.
4. **Validation & Stress-Testing Suite**:
   - **QuantLib Benchmark**: Direct comparison of piecewise-constant hazard curve survival probabilities against QuantLib's `PiecewiseFlatHazardRate`, detailing convention differences (day-count, settlement, accrual).
   - **Merton vs. Proxy Regression**: Cross-sectional OLS regression $\ln(\text{Proxy 5Y}) \sim \ln(\text{Merton 5Y})$, reporting $R^2$, slope, Spearman rank correlation, and residual outlier detection ($> 1.5\sigma$).
   - **Distress Event Studies**: Historical reconstruction of distance-to-default decay preceding the bankruptcies of Peabody Energy (2016) and PG&E (2019).
   - **Sensitivity & Monte Carlo**: Interactive Tornado diagram showing driver dominance (Pass-through vs. WACC vs. Recovery vs. Horizon) and a 10,000-draw Monte Carlo simulation with 5th, 50th, and 95th percentile uncertainty bands.
5. **Methodology & Interview Readiness**:
   - Formal 10-section methodology document with LaTeX equations, parameter tables, and literature benchmarks (Bolton & Kacperczyk 2021, Seltzer et al. 2022, Battiston et al. 2017).
   - Interview talking-points trainer addressing tough quant questions (e.g., Merton short-end spread under-prediction, physical vs. risk-neutral default probability, horizon mismatch).
   - Tailored CV bullet generator populated with real computational findings.
6. **Codebase & Artifact Exporter**:
   - Direct tab to browse, review, and export the entire Python 3.11 package (`src/`, `tests/`, `notebooks/`, `README.md`, `CONTEXT.md`, `SOURCES.md`).

### Visual Identity & Theme
- **Aesthetic Direction**: High-density institutional quantitative workstation (inspired by Bloomberg Terminal, FactSet, and MSCI ESG RiskManager).
- **Color Palette**:
  - Neutral Canvas: Dark slate `#090D16` and deep carbon `#0F172A`
  - Structural Panels: Slate navy `#162033` with hairline borders `#1E293B`
  - Accents: Electric cyan `#06B6D4` (baseline curves), Emerald `#10B981` (Net Zero 2050), Amber `#F59E0B` (Delayed Transition), Rose/Coral `#F43F5E` (Current Policies / Distress)
  - Data Display: Crisp white `#F8FAFC` and muted pewter `#94A3B8`
- **Typography & Hierarchy**:
  - Display & Headings: `Plus Jakarta Sans` (weights 600, 700)
  - Body & Labels: `Public Sans` / `Plus Jakarta Sans` (weights 400, 500)
  - Financial Data & Telemetry: `JetBrains Mono` / `tabular-nums` for all spreads, basis points, probabilities, and matrix cells
- **Spatial Composition**:
  - 1440px wide viewport with structured header, top metric ribbon, sidebar control drawer, interactive multi-tab workstation, and high-contrast SVG / Canvas charting.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Dual Execution Architecture (TypeScript Client Engine + Python Modular Package)**
  - *Chosen Approach*: Implement the mathematical pricing and simulation engines directly in client-side TypeScript (zero network latency, real-time slider reactivity) while also packaging, bundling, and validating the identical Python 3.11 package (with `pytest` suite and notebooks) inside the workspace for download and terminal execution.
  - *Why*: The web app delivers instant, fluid interaction during an interview or demo without backend timeouts, while the bundled Python codebase guarantees academic verification and repository completeness.
- **Decision 2: Explicit Proxy-Spread Nomenclature**
  - *Chosen Approach*: Label all spreads explicitly as "CDS-equivalent spreads calibrated to rating-based proxies" derived from FRED ICE BofA OAS and Damodaran tables.
  - *Why*: Fulfills the project brief's non-negotiable honesty rule and demonstrates professional integrity.
- **Decision 3: Kappa Scaling Factor for Merton Calibration**
  - *Chosen Approach*: Calibrate structural asset value $V$ and volatility $\sigma_V$, calculate the Merton theoretical 5Y spread, and compute the scaling factor $\kappa = s_{\text{proxy, 5Y}} / s_{\text{Merton, 5Y}}$ to bridge the well-known structural short-end spread under-prediction.
  - *Why*: Merton models systematically underestimate short-dated spreads due to continuous Brownian paths without jumps; $\kappa$ scaling provides an empirical bridge while keeping transition risk transmission proportional.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CDS Pricing Desk Architecture                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
┌───────────────┐              ┌───────────────┐              ┌───────────────┐
│ Issuer Data   │              │ NGFS Scenarios│              │ Market Curve  │
│ - Market Cap  │              │ - Net Zero    │              │ - Risk-free r │
│ - Debt (ST/LT)│              │ - Delayed     │              │ - Proxy OAS   │
│ - Volatility  │              │ - Current Pol │              │ - Recovery R  │
│ - Scope 1 & 2 │              │ - Carbon Price│              │ - Tenor Grid  │
└───────┬───────┘              └───────┬───────┘              └───────┬───────┘
        │                              │                              │
        ▼                              │                              │
┌───────────────────────────┐          │                              │
│ 1. Merton Calibration     │          │                              │
│   E = V·N(d1) - D·e⁻ʳᵀN(d2)│          │                              │
│   σ_E·E = N(d1)·σ_V·V     │          │                              │
│   -> Solve for V, σ_V     │          │                              │
└─────────────┬─────────────┘          │                              │
              │                        │                              │
              ▼                        ▼                              │
┌──────────────────────────────────────────────┐                      │
│ 2. Climate Overlay & PV Haircut              │                      │
│   Cost_t = (1-p)·Emissions·Index·Price·(1-t) │                      │
│   Haircut = PV(Costs, WACC) + PV(TV)         │                      │
│   V_scenario = max(V - Haircut, 1.01·D)      │                      │
│   Δs_Merton = s_Merton(V_scen) - s_Merton(V) │                      │
│   Δs_adj = κ · Δs_Merton                     │                      │
└──────────────────────┬───────────────────────┘                      │
                       │                                              │
                       ▼                                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. Baseline & Adjusted CDS Curve Bootstrapping                              │
│   Q(t) = exp(-∫ λ(u) du)                                                    │
│   Protection Leg = (1 - R) · ∑ D(t_mid) · [Q(t_{i-1}) - Q(t_i)]             │
│   RPV01 = ∑ D(t_i)·dt·Q(t_i) + 0.5·dt·D(t_i)·[Q(t_{i-1}) - Q(t_i)]         │
│   Solve par spread: s = Protection / RPV01  (Round-trip tolerance < 1e-8)  │
│   MTM = Notional · (s_adj - s_base) · RPV01                                 │
│   CS01 = MTM shock per +1bp; Climate CS01 = Δs per +$10/tCO2                │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
┌───────────────┐              ┌───────────────┐              ┌───────────────┐
│ Desk UI View  │              │ Validation &  │              │ Methodology & │
│ - Curve Plots │              │ Monte Carlo   │              │ Python Export │
│ - Tenor Table │              │ - QuantLib Gap│              │ - Full Code   │
│ - Sliders/MTM │              │ - Tornado     │              │ - Unit Tests  │
│ - Stress Test │              │ - Event Study │              │ - LaTeX Notes │
└───────────────┘              └───────────────┘              └───────────────┘
```

### Data Model & Entities
- **IssuerProfile**: `id`, `name`, `ticker`, `region` (US, EU, India), `sector`, `rating`, `equity_usd`, `equity_vol`, `debt_usd`, `risk_free_r`, `scope1_mt`, `scope2_mt`, `revenue_usd`, `proxy_spreads_bp` ($[1, 3, 5, 7, 10]$ years).
- **NGFSScenario**: `scenarioId` (`net_zero_2050`, `delayed_transition`, `current_policies`), `name`, `carbon_prices` (annual $\$0\text{--}\$350/\text{tCO}_2$ path to 2050), `emissions_indices` ($E_t/E_0$).
- **PricingOutputs**: `tenors`, `base_spreads`, `adj_spreads`, `delta_spreads`, `base_hazard_rates`, `adj_hazard_rates`, `base_survival_probs`, `adj_survival_probs`, `haircut_usd`, `haircut_pct_v`, `merton_v`, `merton_sigv`, `kappa`, `mtm_eur_10m`, `climate_cs01_bp`.
- **ValidationArtifacts**: QuantLib comparison table with convention attribution, OLS regression statistics ($R^2$, slope, $p$-value, Spearman $\rho$), distress historical timelines (Peabody, PG&E), Tornado sensitivity array, and Monte Carlo histogram distribution.

---

## 5. Phased Implementation Roadmap

1. **Step 1: Quantitative Core & Mathematical Engines**
   - Bootstrap engine with quarterly discretization, accrual-on-default, and analytical root-finding.
   - Bivariate Newton-Raphson/Brent solver for Merton $(V, \sigma_V)$.
   - NGFS trajectory interpolation, DCF haircut calculator with pass-through, WACC, and terminal value.
   - Sensitivity and Monte Carlo simulation routines (10,000 runs).
2. **Step 2: Pre-Calibrated Data Store & Validation Benchmarks**
   - 9 global issuers (XOM, NEE, HOLN, TTE, TATASTEEL, NTPC, MSFT, PFE, SAP) with real-world balance sheets, emissions, and rating proxies.
   - 2 distress cases (Peabody Energy 2016, PG&E 2019) with time-series default paths.
   - QuantLib benchmark data points and convention delta notes.
3. **Step 3: High-Density Institutional Desk Interface**
   - Top Bar contract with breadcrumb navigation and action controls.
   - Workspace mode tabs: **Pricing Desk**, **Merton Inspector**, **Validation Suite**, **Methodology & Interview**, **Python Code & Notebooks**.
   - Interactive SVG/Canvas charts for CDS term structures, hazard rates, carbon paths, Tornado bars, and Monte Carlo histograms.
   - Parameter drawer with sliders for recovery, pass-through, WACC, horizon, and shock increments.
4. **Step 4: Python Package & Test Suite Export Engine**
   - Generate complete Python modules (`src/curves.py`, `src/merton.py`, `src/climate.py`, `src/pricing.py`, `src/data_loaders.py`), unit tests (`test_curves.py`, `test_merton.py`, etc.), `CONTEXT.md`, and `README.md` with in-browser syntax viewer and one-click ZIP/file download.
5. **Step 5: Verification & Build**
   - Run compilation check, verify numeric precision, and ensure zero-warning TypeScript compilation.
