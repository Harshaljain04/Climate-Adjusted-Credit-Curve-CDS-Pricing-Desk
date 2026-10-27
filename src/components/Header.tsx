/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Shield, Sparkles, Download, RotateCcw, Building2, TrendingUp, Cpu, FileText, CheckCircle2 } from 'lucide-react';
import { PRESET_ISSUERS, IssuerProfile } from '../data/issuers';
import { NGFS_SCENARIOS, ClimateScenarioDef } from '../lib/creditEngine';

interface HeaderProps {
  currentTab: 'desk' | 'merton' | 'validation' | 'methodology' | 'codebase';
  setCurrentTab: (tab: 'desk' | 'merton' | 'validation' | 'methodology' | 'codebase') => void;
  selectedIssuer: IssuerProfile;
  setSelectedIssuer: (issuer: IssuerProfile) => void;
  selectedScenario: ClimateScenarioDef;
  setSelectedScenario: (scenario: ClimateScenarioDef) => void;
  onReset: () => void;
  onExportCsv: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  setCurrentTab,
  selectedIssuer,
  setSelectedIssuer,
  selectedScenario,
  setSelectedScenario,
  onReset,
  onExportCsv,
}) => {
  return (
    <header className="border-b border-slate-800 bg-[#0B101D] sticky top-0 z-50">
      {/* Top Bar Contract: 3 zones */}
      <div className="max-w-[1720px] mx-auto px-4 lg:px-6 h-16 flex items-center justify-between gap-6">
        
        {/* Zone 1: Brand & Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-cyan-950/80 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-tight text-white font-sans whitespace-nowrap">
                GrEnFIn Quant Desk
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/40 text-cyan-300 font-mono">
                v1.0 CDS
              </span>
            </div>
            <p className="text-[11px] text-slate-400 whitespace-nowrap">
              Climate-Adjusted Credit Curve &amp; Merton Desk
            </p>
          </div>
        </div>

        {/* Zone 2: Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-900/90 p-1 rounded-lg border border-slate-800 shrink-0">
          <button
            onClick={() => setCurrentTab('desk')}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
              currentTab === 'desk'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Pricing Desk
          </button>

          <button
            onClick={() => setCurrentTab('merton')}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
              currentTab === 'merton'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            Merton Structural
          </button>

          <button
            onClick={() => setCurrentTab('validation')}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
              currentTab === 'validation'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Validation &amp; Distress
          </button>

          <button
            onClick={() => setCurrentTab('methodology')}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
              currentTab === 'methodology'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Methodology &amp; Prep
          </button>

          <button
            onClick={() => setCurrentTab('codebase')}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
              currentTab === 'codebase'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            Python Repo Export
          </button>
        </nav>

        {/* Zone 3: Quick Selectors & Export */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Issuer Dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5">
            <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">Issuer:</span>
            <select
              value={selectedIssuer.id}
              onChange={(e) => {
                const found = PRESET_ISSUERS.find((iss) => iss.id === e.target.value);
                if (found) setSelectedIssuer(found);
              }}
              className="bg-transparent text-xs font-semibold text-white focus:outline-none cursor-pointer"
            >
              {PRESET_ISSUERS.map((iss) => (
                <option key={iss.id} value={iss.id} className="bg-slate-900 text-white">
                  {iss.ticker} - {iss.name} ({iss.rating}, {iss.region})
                </option>
              ))}
            </select>
          </div>

          {/* Scenario Selector */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5">
            <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">NGFS:</span>
            <select
              value={selectedScenario.id}
              onChange={(e) => {
                const found = NGFS_SCENARIOS[e.target.value];
                if (found) setSelectedScenario(found);
              }}
              className="bg-transparent text-xs font-semibold text-cyan-300 focus:outline-none cursor-pointer"
            >
              <option value="net_zero_2050" className="bg-slate-900 text-cyan-300">Net Zero 2050 (Orderly)</option>
              <option value="delayed_transition" className="bg-slate-900 text-amber-300">Delayed Transition (Disorderly)</option>
              <option value="current_policies" className="bg-slate-900 text-rose-300">Current Policies (Hot House)</option>
            </select>
          </div>

          {/* Export CSV Button */}
          <button
            onClick={onExportCsv}
            title="Export desk results to CSV"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">CSV</span>
          </button>

          {/* Reset Parameters Button */}
          <button
            onClick={onReset}
            title="Reset simulation parameters to defaults"
            className="p-1.5 text-slate-400 hover:text-white bg-slate-900/60 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>

      {/* Sub-header Mobile Tab bar */}
      <div className="md:hidden flex items-center gap-1 px-4 py-2 bg-slate-950 border-t border-slate-800 overflow-x-auto">
        {(['desk', 'merton', 'validation', 'methodology', 'codebase'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setCurrentTab(tab)}
            className={`px-2.5 py-1 text-xs rounded font-medium whitespace-nowrap ${
              currentTab === tab ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400'
            }`}
          >
            {tab === 'desk' ? 'Pricing Desk' : tab === 'merton' ? 'Merton' : tab === 'validation' ? 'Validation' : tab === 'methodology' ? 'Methodology' : 'Python Repo'}
          </button>
        ))}
      </div>
    </header>
  );
};
