import React from 'react';
import { Activity, ShieldAlert, BookOpen, Code2, Download, CheckCircle2 } from 'lucide-react';
import { IssuerProfile, PRESET_ISSUERS } from '../data/issuers';

export type ActiveTab = 'desk' | 'merton' | 'validation' | 'methodology' | 'codebase';

interface HeaderProps {
  selectedIssuer: IssuerProfile;
  onSelectIssuer: (issuer: IssuerProfile) => void;
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onExportCsv: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  selectedIssuer,
  onSelectIssuer,
  activeTab,
  onSelectTab,
  onExportCsv,
}) => {
  const navItems: { id: ActiveTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: 'desk', label: 'Pricing & Climate Desk', icon: <Activity className="w-4 h-4" /> },
    { id: 'merton', label: 'Merton & NGFS Inspector', icon: <ShieldAlert className="w-4 h-4" /> },
    { id: 'validation', label: 'Empirical Validation', icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />, badge: 'Audit' },
    { id: 'methodology', label: 'Methodology', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'codebase', label: 'Python Engine & Tests', icon: <Code2 className="w-4 h-4" /> },
  ];

  return (
    <header className="border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6">
        {/* Top Row: Brand & Issuer Selector */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between py-3 gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/40 flex items-center justify-center shadow-inner">
              <Activity className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-white">
                  Climate-Adjusted Credit Curve &amp; CDS Pricing Desk
                </h1>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  ISDA / CreditGrades / NGFS v1.1
                </span>
              </div>
              <p className="text-xs text-slate-400">
                ISDA Hazard Rate Bootstrapping • Merton (1974) &amp; CreditGrades (2002) Structural Bridge • NGFS Phase IV Transition Risk
              </p>
            </div>
          </div>

          {/* Right Controls: Global Issuer Selector & Export */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-1.5">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                Reference Entity:
              </span>
              <select
                value={selectedIssuer.id}
                onChange={(e) => {
                  const found = PRESET_ISSUERS.find((i) => i.id === e.target.value);
                  if (found) onSelectIssuer(found);
                }}
                className="bg-transparent text-xs sm:text-sm font-semibold text-white focus:outline-none cursor-pointer pr-2"
              >
                <optgroup label="High Carbon / Transition-Exposed Issuers" className="bg-slate-900 text-amber-400">
                  {PRESET_ISSUERS.filter((i) => i.carbonIntensityCategory.includes('High')).map((issuer) => (
                    <option key={issuer.id} value={issuer.id} className="bg-slate-900 text-white">
                      {issuer.ticker} — {issuer.name} ({issuer.region} | {issuer.rating})
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Low Carbon / Sector Comparators (Validation Controls)" className="bg-slate-900 text-emerald-400">
                  {PRESET_ISSUERS.filter((i) => i.carbonIntensityCategory.includes('Low')).map((issuer) => (
                    <option key={issuer.id} value={issuer.id} className="bg-slate-900 text-white">
                      {issuer.ticker} — {issuer.name} ({issuer.region} | {issuer.rating})
                    </option>
                  ))}
                </optgroup>
              </select>
              <span
                className={`px-1.5 py-0.5 text-[10px] font-mono rounded border ${
                  selectedIssuer.carbonIntensityCategory.includes('High')
                    ? 'bg-amber-950/60 text-amber-300 border-amber-500/30'
                    : 'bg-emerald-950/60 text-emerald-300 border-emerald-500/30'
                }`}
              >
                {selectedIssuer.sector}
              </span>
            </div>

            <button
              onClick={onExportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700/80 text-xs font-medium transition-colors cursor-pointer"
              title="Download Current Credit Curve & Climate Overlay CSV"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Bottom Row: Navigation Tabs */}
        <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar pt-1">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'border-emerald-400 text-emerald-400 bg-emerald-500/5'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badge && (
                  <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
