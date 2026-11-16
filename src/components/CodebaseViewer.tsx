/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Download,
  Copy,
  Check,
  FileCode,
  Folder,
  Terminal,
  Info,
} from 'lucide-react';
import JSZip from 'jszip';
import { PYTHON_CODEBASE, PythonFileItem } from '../data/pythonCodebase';
import testResultsRaw from '../../TEST_RESULTS.txt?raw';

function parseRecordedMetadata(raw: string): { dateStr: string; pythonVersion: string; summaryLine: string } {
  const dateMatch = raw.match(/^#\s*Date:\s*(.+)$/m);
  const pyMatch = raw.match(/^#\s*Python:\s*(.+)$/m);
  const summaryMatch = raw.match(/=+\s*(\d+\s+passed[^=]*)\s*=+/);
  return {
    dateStr: dateMatch ? dateMatch[1].trim() : 'Unknown date',
    pythonVersion: pyMatch ? pyMatch[1].trim() : 'Python 3.11',
    summaryLine: summaryMatch ? summaryMatch[1].trim() : 'See recorded log below',
  };
}

export const CodebaseViewer: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<PythonFileItem>(PYTHON_CODEBASE[1] ?? PYTHON_CODEBASE[0]);
  const [copied, setCopied] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [showRecordedRun, setShowRecordedRun] = useState(true);

  const recordedMeta = parseRecordedMetadata(testResultsRaw);

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadZip = async () => {
    setIsZipping(true);
    try {
      const zip = new JSZip();
      PYTHON_CODEBASE.forEach((file) => {
        zip.file(file.path, file.content);
      });
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
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
            Direct bundle of the Python modules, pytest unit &amp; parity tests, QuantLib benchmark script, fixtures, and recorded test output
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowRecordedRun((prev) => !prev)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg transition-colors"
          >
            <Terminal className="w-3.5 h-3.5 text-cyan-400" />
            {showRecordedRun ? 'Hide Recorded Test Run' : 'Show Recorded Test Run'}
          </button>

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

      {/* Recorded Test Run Panel (Imported from real TEST_RESULTS.txt) */}
      {showRecordedRun && (
        <div className="bg-[#080D1A] border border-slate-800 rounded-xl p-4 font-mono text-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
            <div className="flex items-center gap-2 text-cyan-300 font-semibold text-xs">
              <Terminal className="w-4 h-4" />
              <span>Recorded Test Run (TEST_RESULTS.txt)</span>
            </div>
            <span className="text-[11px] text-emerald-400 font-semibold">
              {recordedMeta.summaryLine}
            </span>
          </div>

          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-700/80 text-[11px] font-sans text-amber-200">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              Recorded output from <strong className="font-mono text-white">{recordedMeta.dateStr}</strong>,{' '}
              <strong className="font-mono text-white">{recordedMeta.pythonVersion}</strong>. Not executed in the browser.
              Run <code className="text-cyan-300 font-mono">pytest -v --cov=src --cov-report=term-missing</code> locally to reproduce.
            </span>
          </div>

          <pre className="text-slate-300 whitespace-pre-wrap leading-relaxed max-h-[380px] overflow-y-auto text-[11px]">
            {testResultsRaw}
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

          {/* Category: Core Modules */}
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 px-2 block">
              Core Modules (src/)
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

          {/* Category: Tests */}
          <div className="space-y-1 pt-2">
            <span className="text-[10px] uppercase font-mono tracking-wider text-emerald-400 px-2 block">
              Test Suite &amp; Parity Fixtures (tests/)
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

          {/* Category: Scripts */}
          <div className="space-y-1 pt-2">
            <span className="text-[10px] uppercase font-mono tracking-wider text-amber-400 px-2 block">
              Benchmark Scripts (scripts/)
            </span>
            {PYTHON_CODEBASE.filter((f) => f.category === 'scripts').map((file) => (
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

          {/* Category: Research Data Pack */}
          <div className="space-y-1 pt-2">
            <span className="text-[10px] uppercase font-mono tracking-wider text-cyan-400 px-2 block">
              Data &amp; Recorded Benchmarks (data/)
            </span>
            {PYTHON_CODEBASE.filter((f) => f.category === 'data').map((file) => (
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

          {/* Category: Documentation */}
          <div className="space-y-1 pt-2">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 px-2 block">
              Documentation &amp; Recorded Logs
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
            <div className="bg-[#080D1A] rounded-lg border border-slate-800/80 p-4 font-mono text-xs text-slate-300 overflow-x-auto max-h-[500px]">
              <pre className="whitespace-pre leading-relaxed">
                {selectedFile.content}
              </pre>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Python 3.11+, PEP 8, SciPy, and NumPy</span>
            <span className="font-mono text-cyan-400">{selectedFile.filename}</span>
          </div>
        </div>

      </div>

    </div>
  );
};
