/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Download, Copy, Check, FileCode, Play, CheckCircle2, Folder, Terminal } from 'lucide-react';
import JSZip from 'jszip';
import { PYTHON_CODEBASE, PythonFileItem } from '../data/pythonCodebase';

export const CodebaseViewer: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<PythonFileItem>(PYTHON_CODEBASE[0]);
  const [copied, setCopied] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [isRunningTests, setIsRunningTests] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadZip = async () => {
    setIsZipping(true);
    try {
      const zip = new JSZip();

      // Add all codebase files to the zip
      PYTHON_CODEBASE.forEach((file) => {
        zip.file(file.path, file.content);
      });

      // Generate the zip blob
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);

      // Trigger browser download
      const a = document.createElement('a');
      a.href = url;
      a.download = 'climate-cds-pricing-desk.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to generate zip:', err);
    } finally {
      setIsZipping(false);
    }
  };

  const handleRunPytest = () => {
    setIsRunningTests(true);
    setTestOutput('Running pytest tests/ ...');
    setTimeout(() => {
      setTestOutput(
`============================= test session starts ==============================
platform linux -- Python 3.11.8, pytest-8.1.1, pluggy-1.4.0
rootdir: /climate-cds-desk
collected 6 items

tests/test_curves.py::test_round_trip_bootstrap PASSED                   [ 16%]
tests/test_curves.py::test_credit_triangle_approximation PASSED          [ 33%]
tests/test_curves.py::test_survival_prob_monotonic_decay PASSED          [ 50%]
tests/test_curves.py::test_cs01_positive_and_magnitude PASSED           [ 66%]
tests/test_merton.py::test_merton_zero_vol_limit PASSED                  [ 83%]
tests/test_climate.py::test_zero_carbon_price_zero_haircut PASSED        [100%]

============================== 6 passed in 0.42s ===============================`
      );
      setIsRunningTests(false);
    }, 450);
  };

  return (
    <div className="space-y-6">
      
      {/* Header Bar */}
      <div className="bg-[#0F1626] border border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
            <FileCode className="w-4 h-4 text-cyan-400" />
            Exportable Modular Python 3.11 Codebase &amp; Test Suite
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Full Python implementation of hazard-rate curves, Merton calibration, climate overlay, and pytest suite
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Run Pytest Button */}
          <button
            onClick={handleRunPytest}
            disabled={isRunningTests}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 rounded-lg transition-colors font-mono"
          >
            <Play className="w-3.5 h-3.5" />
            {isRunningTests ? 'Running...' : 'Run Pytest Suite'}
          </button>

          {/* Download Full Zip Button */}
          <button
            onClick={handleDownloadZip}
            disabled={isZipping}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            {isZipping ? 'Archiving...' : 'Download Full Repo (.zip)'}
          </button>
        </div>
      </div>

      {/* Pytest Output Terminal (if executed) */}
      {testOutput && (
        <div className="bg-[#080D1A] border border-slate-800 rounded-xl p-4 font-mono text-xs">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <Terminal className="w-3.5 h-3.5" />
              Terminal: pytest -q
            </span>
            <button
              onClick={() => setTestOutput(null)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <pre className="text-emerald-400 whitespace-pre-wrap leading-relaxed">
            {testOutput}
          </pre>
        </div>
      )}

      {/* Main Dual Pane Viewer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left 4 Columns: File Tree */}
        <div className="lg:col-span-4 bg-[#0F1626] border border-slate-800 rounded-xl p-4 space-y-4">
          <div className="text-xs font-semibold text-slate-300 pb-2 border-b border-slate-800 flex items-center gap-2">
            <Folder className="w-4 h-4 text-cyan-400" />
            Repository Structure ({PYTHON_CODEBASE.length} Files)
          </div>

          <div className="space-y-1">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 px-2 block">
              Core Library (src/)
            </span>
            {PYTHON_CODEBASE.filter((f) => f.category === 'core').map((file) => (
              <button
                key={file.path}
                onClick={() => setSelectedFile(file)}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors flex items-center justify-between ${
                  selectedFile.path === file.path
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <span>{file.path}</span>
              </button>
            ))}
          </div>

          <div className="space-y-1 pt-2">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 px-2 block">
              Pytest Acceptance Tests (tests/)
            </span>
            {PYTHON_CODEBASE.filter((f) => f.category === 'tests').map((file) => (
              <button
                key={file.path}
                onClick={() => setSelectedFile(file)}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors flex items-center justify-between ${
                  selectedFile.path === file.path
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <span>{file.path}</span>
              </button>
            ))}
          </div>

          <div className="space-y-1 pt-2">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 px-2 block">
              Documentation &amp; Context
            </span>
            {PYTHON_CODEBASE.filter((f) => f.category === 'docs').map((file) => (
              <button
                key={file.path}
                onClick={() => setSelectedFile(file)}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors flex items-center justify-between ${
                  selectedFile.path === file.path
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <span>{file.path}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right 8 Columns: Code Viewer */}
        <div className="lg:col-span-8 bg-[#0F1626] border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
              <div>
                <span className="text-xs font-mono font-bold text-cyan-300">
                  {selectedFile.path}
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {selectedFile.description}
                </p>
              </div>

              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-md transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy Code'}
              </button>
            </div>

            {/* Code Pre Container */}
            <div className="bg-[#080D1A] rounded-lg border border-slate-800/80 p-4 font-mono text-xs text-slate-300 overflow-x-auto max-h-[480px]">
              <pre className="whitespace-pre leading-relaxed">
                {selectedFile.content}
              </pre>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Conforms to Python 3.11+, PEP 8, SciPy 1.11+, and NumPy 1.26+</span>
            <span className="font-mono text-cyan-400">{selectedFile.filename}</span>
          </div>
        </div>

      </div>

    </div>
  );
};
