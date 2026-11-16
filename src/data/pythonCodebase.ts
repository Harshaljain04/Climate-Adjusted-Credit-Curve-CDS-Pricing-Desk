/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Modular Python 3.11 Codebase bundle backed directly by the tested source,
 * test suite, fixture, benchmark, and documentation files on disk.
 */

import initPy from '../__init__.py?raw';
import curvesPy from '../curves.py?raw';
import mertonPy from '../merton.py?raw';
import climatePy from '../climate.py?raw';
import testInitPy from '../../tests/__init__.py?raw';
import testCurvesPy from '../../tests/test_curves.py?raw';
import testMertonPy from '../../tests/test_merton.py?raw';
import testClimatePy from '../../tests/test_climate.py?raw';
import testParityPy from '../../tests/test_parity.py?raw';
import tsReferenceJson from '../../tests/fixtures/ts_reference.json?raw';
import benchmarkQuantlibPy from '../../scripts/benchmark_quantlib.py?raw';
import fetchProxySpreadsPy from '../../scripts/fetch_proxy_spreads.py?raw';
import quantlibBenchmarkJson from '../../data/benchmarks/quantlib_2026-11-15.json?raw';
import emissionsCsv from '../../data/raw/emissions.csv?raw';
import proxySpreadsCsv from '../../data/raw/proxy_spreads.csv?raw';
import requirementsTxt from '../../requirements.txt?raw';
import readmeMd from '../../README.md?raw';
import testResultsTxt from '../../TEST_RESULTS.txt?raw';

export interface PythonFileItem {
  filename: string;
  path: string;
  category: 'core' | 'tests' | 'scripts' | 'data' | 'docs';
  description: string;
  content: string;
}

const AI_LOG_CONTENT = `# AI USE & VERIFICATION LOG

**Project**: Climate-Adjusted Credit Curve & CDS Pricing Desk
**Policy**: Test-First Specification & Numerical Reconciliation

---

## 1. Development Progression & Verification
| Task | Scope | Artifact | Verification Status |
| :--- | :--- | :--- | :--- |
| CDS curve bootstrapping | Piecewise-constant hazard curve & quarterly CDS legs | src/curves.py, tests/test_curves.py | Tested via pytest (round-trip < 1e-8, credit triangle, monotonic survival, inversion raises ValueError) |
| Merton (1974) & CreditGrades (2002) | Coupled 2-equation Brent solver for V and sigma_V + first-passage barrier uncertainty | src/merton.py, tests/test_merton.py | Tested against John Hull worked example (V ~ 12.40, sigma_V ~ 0.2123), residuals < 1e-6, raw unclipped kappa |
| NGFS climate overlay & tenor ramp | DCF carbon cost haircut, logistic tenor ramp g(T), sanity status flags | src/climate.py, tests/test_climate.py | Tested against zero-price, hand-calculated DCF, tenor monotonicity, and insolvency flagging |
| Cross-engine parity | TypeScript vs Python reconciliation | tests/test_parity.py, tests/fixtures/ts_reference.json | Verified across all 9 preset issuers x 3 scenarios in both pytest (56 tests) and Vitest (15 tests) |
| QuantLib 1.44 benchmark | 5-point sloped curve (60-140bp) + convention experiment | scripts/benchmark_quantlib.py, data/benchmarks/quantlib_2026-11-15.json | Output recorded directly from QuantLib 1.44 execution (0.228 pp at 10Y, 98.2% convention-explained) |
`;

export const PYTHON_CODEBASE: PythonFileItem[] = [
  {
    filename: '__init__.py',
    path: 'src/__init__.py',
    category: 'core',
    description: 'Package marker enabling root-level pytest and script imports',
    content: initPy,
  },
  {
    filename: 'curves.py',
    path: 'src/curves.py',
    category: 'core',
    description: 'Piecewise-constant hazard rate bootstrapping, par spread solver, MTM, and CS01',
    content: curvesPy,
  },
  {
    filename: 'merton.py',
    path: 'src/merton.py',
    category: 'core',
    description: 'Merton (1974) structural credit model calibration, CreditGrades (2002), and spread calculation',
    content: mertonPy,
  },
  {
    filename: 'climate.py',
    path: 'src/climate.py',
    category: 'core',
    description: 'NGFS climate scenario cost projection, DCF haircut, logistic tenor ramp g(T), and sanity flags',
    content: climatePy,
  },
  {
    filename: 'requirements.txt',
    path: 'requirements.txt',
    category: 'core',
    description: 'Python dependencies for local execution',
    content: requirementsTxt,
  },
  {
    filename: '__init__.py',
    path: 'tests/__init__.py',
    category: 'tests',
    description: 'Test package marker',
    content: testInitPy,
  },
  {
    filename: 'test_curves.py',
    path: 'tests/test_curves.py',
    category: 'tests',
    description: 'Pytest suite for bootstrap round-trip, credit triangle, monotonic survival, and negative hazard handling',
    content: testCurvesPy,
  },
  {
    filename: 'test_merton.py',
    path: 'tests/test_merton.py',
    category: 'tests',
    description: 'Pytest suite for Merton calibration residuals, monotonicity, CreditGrades, and Hull textbook case',
    content: testMertonPy,
  },
  {
    filename: 'test_climate.py',
    path: 'tests/test_climate.py',
    category: 'tests',
    description: 'Pytest suite for DCF haircut hand-calculation, price/pass-through monotonicity, and tenor ramp',
    content: testClimatePy,
  },
  {
    filename: 'test_parity.py',
    path: 'tests/test_parity.py',
    category: 'tests',
    description: 'Cross-engine parity tests comparing Python vs TypeScript fixture across 9 issuers x 3 scenarios',
    content: testParityPy,
  },
  {
    filename: 'ts_reference.json',
    path: 'tests/fixtures/ts_reference.json',
    category: 'tests',
    description: 'Reference outputs generated from TypeScript creditEngine.ts for cross-engine parity testing',
    content: tsReferenceJson,
  },
  {
    filename: 'benchmark_quantlib.py',
    path: 'scripts/benchmark_quantlib.py',
    category: 'scripts',
    description: 'Standalone script comparing piecewise hazard rates against QuantLib Python API and testing conventions',
    content: benchmarkQuantlibPy,
  },
  {
    filename: 'fetch_proxy_spreads.py',
    path: 'scripts/fetch_proxy_spreads.py',
    category: 'scripts',
    description: 'Downloads FRED ICE BofA OAS series (or writes proxy_spreads.csv offline) with provenance metadata',
    content: fetchProxySpreadsPy,
  },
  {
    filename: 'quantlib_2026-11-15.json',
    path: 'data/benchmarks/quantlib_2026-11-15.json',
    category: 'data',
    description: 'Generated QuantLib 1.44 benchmark and convention-experiment output JSON',
    content: quantlibBenchmarkJson,
  },
  {
    filename: 'emissions.csv',
    path: 'data/raw/emissions.csv',
    category: 'data',
    description: 'Corporate GHG Scope 1 & 2 emissions inputs and revenues',
    content: emissionsCsv,
  },
  {
    filename: 'proxy_spreads.csv',
    path: 'data/raw/proxy_spreads.csv',
    category: 'data',
    description: 'Rating-to-spread proxy term structure mapping generated by scripts/fetch_proxy_spreads.py',
    content: proxySpreadsCsv,
  },
  {
    filename: 'TEST_RESULTS.txt',
    path: 'TEST_RESULTS.txt',
    category: 'docs',
    description: 'Recorded local pytest, coverage, and deliberate mutation check output',
    content: testResultsTxt,
  },
  {
    filename: 'AI_LOG.md',
    path: 'AI_LOG.md',
    category: 'docs',
    description: 'Record of AI assistance, development milestones, and verification',
    content: AI_LOG_CONTENT,
  },
  {
    filename: 'README.md',
    path: 'README.md',
    category: 'docs',
    description: 'Project documentation, methodology flow diagram, limitations, and reproduction guide',
    content: readmeMd,
  },
];
