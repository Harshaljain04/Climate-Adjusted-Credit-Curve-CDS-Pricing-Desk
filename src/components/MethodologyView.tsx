import React, { useState } from 'react';
import { BookOpen, GraduationCap, AlertTriangle } from 'lucide-react';

export const MethodologyView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'paper' | 'literature'>('paper');

  return (
    <div className="space-y-6">
      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/90 border border-slate-800/80 rounded-xl p-4 shadow-lg">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-emerald-400" />
            Quantitative Methodology, Literature &amp; Structural Assumptions
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Mathematical specification of the ISDA CDS hazard bootstrap, Merton (1974) / CreditGrades (2002) structural bridge, and NGFS Phase IV transition overlay
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setActiveSubTab('paper')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeSubTab === 'paper'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Methodology Paper
          </button>
          <button
            onClick={() => setActiveSubTab('literature')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeSubTab === 'literature'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            Literature &amp; Assumptions
          </button>
        </div>
      </div>

      {/* Sub-Tab 1: Methodology Paper */}
      {activeSubTab === 'paper' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Card 1: Reduced-Form CDS Bootstrap */}
          <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-6 shadow-lg">
            <div className="text-xs font-mono text-emerald-400 uppercase tracking-wider mb-1">
              Module 01 • Reduced-Form Credit Curve
            </div>
            <h3 className="text-base font-bold text-white mb-3">
              ISDA Piecewise-Constant Hazard Rate Bootstrap
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Following <strong>O&apos;Kane &amp; Turnbull (2003)</strong> and the ISDA Standard CDS Model, default time <span className="font-mono">τ</span> is modelled as the first arrival of an inhomogeneous Poisson process with deterministic piecewise-constant hazard intensity <span className="font-mono">λ(t) = λ_k</span> on tenor intervals <span className="font-mono">[T_&#123;k-1&#125;, T_k]</span> for <span className="font-mono">T ∈ &#123;1, 3, 5, 7, 10&#125;</span> years.
            </p>
            <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-3.5 font-mono text-xs text-slate-200 space-y-2 mb-4">
              <div className="text-slate-400 text-[10px]">// Cumulative Survival Probability</div>
              <div>Q(t) = exp( -∫_0^t λ(u) du )</div>
              <div className="text-slate-400 text-[10px] pt-1">// Premium Leg Risky PV01 (with Half-Period Accrual on Default)</div>
              <div>RPV01(T) = Σ_j Δ_j · P(0, t_j) · [ Q(t_j) + 0.5 · (Q(t_&#123;j-1&#125;) - Q(t_j)) ]</div>
              <div className="text-slate-400 text-[10px] pt-1">// Protection Leg PV (Midpoint Integration, N=24 steps/yr)</div>
              <div>V_prot(T) = (1 - R) · Σ_m P(0, t_m*) · [ Q(t_&#123;m-1&#125;) - Q(t_m) ]</div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Sequential root-finding via <strong>Brent&apos;s method</strong> (<span className="font-mono">tol = 1e-12</span>) calibrates each <span className="font-mono">λ_k</span> sequentially so that <span className="font-mono">s_par(T_k) = V_prot(T_k) / RPV01(T_k)</span> matches the input par spread to machine precision (<span className="font-mono">&lt; 10^-8 bp</span>).
            </p>
          </div>

          {/* Card 2: Merton (1974) & CreditGrades (2002) Structural Models */}
          <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-6 shadow-lg">
            <div className="text-xs font-mono text-cyan-400 uppercase tracking-wider mb-1">
              Module 02 • Structural &amp; First-Passage Balance Sheet Models
            </div>
            <h3 className="text-base font-bold text-white mb-3">
              Merton (1974) Calibration &amp; CreditGrades (2002) Barrier Uncertainty
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              In <strong>Merton (1974)</strong>, firm equity <span className="font-mono">E</span> is a European call option on unobservable firm assets <span className="font-mono">V</span> with strike equal to book debt <span className="font-mono">D</span> at horizon <span className="font-mono">T = 5Y</span>. Because pure Gaussian diffusion produces near-zero spreads for low-leverage issuers (the structural credit spread puzzle), we pair Merton with the <strong>CreditGrades (2002)</strong> first-passage model with a random default barrier <span className="font-mono">L · D</span> (<span className="font-mono">L̄ = 0.5, λ = 0.3</span>):
            </p>
            <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-3.5 font-mono text-xs text-slate-200 space-y-2 mb-4">
              <div className="text-slate-400 text-[10px]">// Coupled Merton Calibration System (Solved via Nested Brent&apos;s Method)</div>
              <div>f_1(V, σ_V) = V · N(d_1) - D · e^(-rT) · N(d_2) - E = 0</div>
              <div>f_2(V, σ_V) = N(d_1) · σ_V · V - σ_E · E = 0</div>
              <div className="text-slate-400 text-[10px] pt-1">// CreditGrades (2002) Survival Probability with Barrier Uncertainty λ = 0.3</div>
              <div>d = ((E + L̄·D) / (L̄·D)) · exp(λ²),   A_t = √(σ_V² · t + λ²)</div>
              <div>P(t) = Φ(-A_t/2 + ln(d)/A_t) - d · Φ(-A_t/2 - ln(d)/A_t)</div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              We report the raw unclipped <span className="font-mono">κ = s_proxy(5Y) / s_Merton(5Y)</span> ratio honestly (with no <span className="font-mono">[0.2, 12.0]</span> clip or <span className="font-mono">1.0</span> fallback) and compute the structural spread shift via CreditGrades (2002) where the climate haircut reduces equity <span className="font-mono">E&apos; = max(E - PV_Carbon, $1M)</span>.
            </p>
          </div>

          {/* Card 3: NGFS Phase IV Carbon Haircut & Tenor-Dependent Ramp */}
          <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-6 shadow-lg">
            <div className="text-xs font-mono text-amber-400 uppercase tracking-wider mb-1">
              Module 03 • Climate Transition Transmission Channel
            </div>
            <h3 className="text-base font-bold text-white mb-3">
              NGFS Phase IV Carbon DCF &amp; Logistic Tenor Ramp g(T)
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Under NGFS Phase IV pathways (<em>Net Zero 2050</em>, <em>Delayed Transition</em>, <em>Current Policies</em>), unhedged Scope 1 + Scope 2 (and optional Scope 3) carbon costs erode firm asset value via discounted after-tax cash outflows. Following <strong>Kenyon</strong> and <strong>Forvis Mazars (2023)</strong> on climate CVA hazard-curve stress, we apply a logistic tenor weight <span className="font-mono">g(T)</span> normalised to <span className="font-mono">g(10) = 1</span> so long tenors bear the transition shock while the 1Y tenor moves by &lt;15% of the 10Y shift:
            </p>
            <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-3.5 font-mono text-xs text-slate-200 space-y-2 mb-4">
              <div className="text-slate-400 text-[10px]">// Net Present Value of Carbon Transition Burden</div>
              <div>PV_Carbon = Σ_&#123;t=1&#125;^H [ (1 - α_pass) · E_t · P_carbon(t) · (1 - τ) ] / (1 + WACC)^t</div>
              <div className="text-slate-400 text-[10px] pt-1">// Logistic Tenor Weight g(T) Normalised so g(10) = 1 (Default m = 7Y, w = 2Y)</div>
              <div>g_raw(T) = 1 / (1 + exp(-(T - m) / w)),   g(T) = g_raw(T) / g_raw(10)</div>
              <div>s_adj(T) = s_base(T) + Δs_CG(10Y) · g(T)</div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              When <span className="font-mono">V - PV_Carbon &le; D</span>, the engine flags <span className="font-mono">insolvent_in_scenario</span> and outputs <span className="font-mono">n/a (insolvent in scenario)</span> rather than displaying thousands-of-bp extrapolation as a tradeable price.
            </p>
          </div>

          {/* Card 4: Empirical Validation & Seeded Uncertainty */}
          <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-6 shadow-lg">
            <div className="text-xs font-mono text-purple-400 uppercase tracking-wider mb-1">
              Module 04 • Empirical Validation &amp; Reproducible Uncertainty
            </div>
            <h3 className="text-base font-bold text-white mb-3">
              QuantLib Benchmarking, Unfloored Regression &amp; Seeded Monte Carlo
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              To ensure institutional transparency and reproducibility, every validation output is computed dynamically or loaded from a committed verification artifact:
            </p>
            <ul className="space-y-2 text-xs text-slate-300">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">1.</span>
                <span>
                  <strong>QuantLib 1.44 Benchmark (<span className="font-mono">data/validation/quantlib_2026-11-15.json</span>):</strong> Reports the true 10Y survival gap (<span className="font-mono">0.228 pp / 0.292% rel</span>) and proves via a convention isolation check that <span className="font-mono">98.2%</span> of the difference is explained by ISDA <span className="font-mono">Actual/360 + TwentiethIMM</span> vs. continuous time.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">2.</span>
                <span>
                  <strong>Unfloored Cross-Sectional Check (<span className="font-mono">N=9</span>):</strong> Regresses <span className="font-mono">ln(model)</span> on <span className="font-mono">ln(proxy)</span> without artificial <span className="font-mono">1 bp</span> flooring, handles rank ties via average ranks (<span className="font-mono">scipy.stats.spearmanr</span>), and evaluates DD vs. proxy spread rank correlation (<span className="font-mono">ρ = -0.9000</span>).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">3.</span>
                <span>
                  <strong>Seeded Mulberry32 Monte Carlo (<span className="font-mono">N=2,000</span> draws):</strong> Jointly samples cashflow parameters, senior recovery <span className="font-mono">R</span>, CreditGrades barrier parameters (<span className="font-mono">L̄, λ</span>), and ramp parameters (<span className="font-mono">m, w</span>).
                </span>
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Sub-Tab 2: Academic Literature & Structural Assumptions */}
      {activeSubTab === 'literature' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-6 shadow-lg">
              <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-400 mb-4">
                Foundational Academic &amp; Practitioner References
              </h3>
              <div className="space-y-4 text-xs">
                <div className="pb-3 border-b border-slate-800">
                  <div className="font-bold text-white">
                    O&apos;Kane, D., &amp; Turnbull, S. (2003) — Valuation of Credit Default Swaps
                  </div>
                  <div className="text-slate-400 mt-1">
                    <em>Lehman Brothers Fixed Income Quantitative Credit Research.</em> Standard reference for piecewise-constant hazard rate bootstrapping, premium leg risky annuity (RPV01) with accrual-on-default, and protection leg present value.
                  </div>
                </div>
                <div className="pb-3 border-b border-slate-800">
                  <div className="font-bold text-white">
                    Merton, R. C. (1974) — On the Pricing of Corporate Debt: The Risk Structure of Interest Rates
                  </div>
                  <div className="text-slate-400 mt-1">
                    <em>Journal of Finance, 29(2), 449–470.</em> Establishes the structural contingent-claims framework treating corporate equity as a European call option on firm assets.
                  </div>
                </div>
                <div className="pb-3 border-b border-slate-800">
                  <div className="font-bold text-white">
                    Finkelstein, V., Lardy, J.-P., Pan, G., Ta, T., &amp; Tierney, J. (2002) — CreditGrades Technical Document
                  </div>
                  <div className="text-slate-400 mt-1">
                    <em>RiskMetrics Group / J.P. Morgan, Goldman Sachs &amp; Deutsche Bank.</em> Introduces a first-passage structural model with lognormal default barrier uncertainty (<span className="font-mono">L̄ = 0.5, λ = 0.3</span>), preventing short-dated and low-leverage credit spreads from collapsing to zero.
                  </div>
                </div>
                <div className="pb-3 border-b border-slate-800">
                  <div className="font-bold text-white">
                    Vozian, K., &amp; Costola, M. (2025) — Pricing Climate Transition Risk: Evidence from European Corporate CDS
                  </div>
                  <div className="text-slate-400 mt-1">
                    <em>Energy Economics.</em> Provides empirical estimates of transition-risk effects in traded European corporate CDS spreads (5–150 bp across carbon-intensive buckets), anchoring our empirical plausibility threshold.
                  </div>
                </div>
                <div>
                  <div className="font-bold text-white">
                    Kenyon, C. / Forvis Mazars (2023) &amp; Livieri, Radi &amp; Smaniotto (2023)
                  </div>
                  <div className="text-slate-400 mt-1">
                    <em>Climate CVA Hazard-Curve Stress &amp; Jump-Diffusion Credit Risk (arXiv:2303.12483).</em> Establishes logistic midpoint/width hazard-curve ramps for long-dated climate transition horizons and jump-diffusion extensions.
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-6 shadow-lg">
              <h3 className="text-sm font-bold uppercase tracking-wider text-amber-400 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                In-App Assumptions &amp; Model Limitations
              </h3>
              <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                  <span className="font-bold text-white block mb-0.5">
                    1. Horizon Mismatch (1–10Y CDS vs. 25Y Transition DCF)
                  </span>
                  NGFS carbon price paths run through 2050, whereas liquid CDS contracts trade out to 10Y. Discounting 25 years of future carbon outflows into t=0 firm equity and distributing the spread shift via a logistic ramp g(T) is a scenario stress approximation, not an arbitrage-free multi-period equilibrium.
                </div>
                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                  <span className="font-bold text-white block mb-0.5">
                    2. Scope 3 Emissions Excluded by Default
                  </span>
                  Baseline calculations include Scope 1 and Scope 2 emissions only. For upstream/integrated oil &amp; gas issuers (XOM, TTE), Scope 1+2 understates total value-chain transition exposure; an optional Scope 3 toggle is provided on the Pricing Desk tab.
                </div>
                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                  <span className="font-bold text-white block mb-0.5">
                    3. Single Bullet Debt Structure &amp; Constant Recovery
                  </span>
                  The structural engine aggregates all short- and long-term debt into a single barrier D with constant recovery R (40% baseline) rather than modelling individual bond maturities, covenants, or stochastic recovery-at-default.
                </div>
                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                  <span className="font-bold text-white block mb-0.5">
                    4. Shadow Carbon Prices vs. Enacted Cash Taxes
                  </span>
                  NGFS carbon prices represent shadow marginal abatement costs. Treating them as direct unhedged cash outflows (after pass-through and tax shield) without endogenous capex abatement overstates solvency erosion for firms that can profitably decarbonise.
                </div>
                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                  <span className="font-bold text-white block mb-0.5">
                    5. Continuous Asset Diffusion (No Poisson Jumps) &amp; Rating Proxy Spreads
                  </span>
                  Asset values follow continuous diffusion without Poisson jumps, and baseline spreads are rating-based proxies (<span className="font-mono">data/raw/proxy_spreads.csv</span>), not live dealer CDS quotes.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
