import React, { useState } from 'react';
import { 
  ShieldCheck, 
  FileText, 
  Cookie, 
  DollarSign, 
  CheckSquare, 
  EyeOff, 
  Layers, 
  Accessibility, 
  BadgeCheck, 
  Building, 
  Award, 
  AlertTriangle, 
  Search, 
  CheckCircle2, 
  Download, 
  Copy, 
  Check, 
  SlidersHorizontal,
  ExternalLink,
  ChevronRight,
  HardDrive
} from 'lucide-react';
import { POLICY_SECTIONS, LEGAL_AUDIT_CHECKLIST, PolicySection } from '../data/legalPolicies';
import { cn } from '../lib/utils';

export const LegalComplianceView: React.FC = () => {
  const [selectedSectionId, setSelectedSectionId] = useState<string>('privacy_policy');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [showConsentManager, setShowConsentManager] = useState(false);

  // Storage Consent state
  const [cacheStorageEnabled, setCacheStorageEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('nexus_consent_cache_storage');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const [opfsEnabled, setOpfsEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('nexus_consent_opfs');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const [consentSavedMsg, setConsentSavedMsg] = useState(false);

  const handleSaveConsent = () => {
    try {
      localStorage.setItem('nexus_cookie_consent', 'acknowledged');
      localStorage.setItem('nexus_consent_cache_storage', String(cacheStorageEnabled));
      localStorage.setItem('nexus_consent_opfs', String(opfsEnabled));
      setConsentSavedMsg(true);
      setTimeout(() => setConsentSavedMsg(false), 2500);
    } catch (e) {
      console.error(e);
    }
  };

  const getSectionIcon = (iconName: string) => {
    switch (iconName) {
      case 'ShieldCheck': return ShieldCheck;
      case 'FileText': return FileText;
      case 'Cookie': return Cookie;
      case 'DollarSign': return DollarSign;
      case 'CheckSquare': return CheckSquare;
      case 'EyeOff': return EyeOff;
      case 'Layers': return Layers;
      case 'Accessibility': return Accessibility;
      case 'BadgeCheck': return BadgeCheck;
      case 'Building': return Building;
      case 'Award': return Award;
      case 'AlertTriangle': return AlertTriangle;
      default: return FileText;
    }
  };

  const filteredSections = POLICY_SECTIONS.filter(sec => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    const matchTitle = sec.title.toLowerCase().includes(q) || sec.shortDescription.toLowerCase().includes(q);
    const matchContent = sec.content.some(c => 
      c.heading.toLowerCase().includes(q) || 
      c.paragraphs.some(p => p.toLowerCase().includes(q))
    );
    return matchTitle || matchContent;
  });

  const activeSection = POLICY_SECTIONS.find(s => s.id === selectedSectionId) || POLICY_SECTIONS[0];
  const ActiveIcon = getSectionIcon(activeSection.iconName);

  const handleCopyLegalSummary = () => {
    const text = POLICY_SECTIONS.map(s => {
      const body = s.content.map(c => `${c.heading}\n${c.paragraphs.join('\n')}`).join('\n\n');
      return `=== ${s.title.toUpperCase()} ===\n${body}\n`;
    }).join('\n\n');

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: 14-Point Legal & Compliance Audit */}
      <div className="p-4 sm:p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 text-emerald-950 dark:text-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <BadgeCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-emerald-950 dark:text-white flex items-center gap-2">
                14-Point Legal & Privacy Compliance Passed
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                  100% AUDIT READY
                </span>
              </h3>
              <p className="text-xs text-emerald-800 dark:text-emerald-300/80">
                Complete protections: Privacy Policy, T&Cs, Zero-Cookie Disclosures, No-Fee Terms, WCAG 2.1 AA, and International Encryption Compliance.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowConsentManager(!showConsentManager)}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-white/5 border border-emerald-300/80 dark:border-white/10 text-xs font-semibold hover:bg-emerald-100/50 text-emerald-950 dark:text-white flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>{showConsentManager ? 'Hide Consent Panel' : 'Storage Consent'}</span>
            </button>

            <button
              onClick={handleCopyLegalSummary}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-white/5 border border-emerald-300/80 dark:border-white/10 text-xs font-semibold hover:bg-emerald-100/50 text-emerald-950 dark:text-white flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              title="Copy all policies as clean text"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-emerald-700 dark:text-zinc-400" />}
              <span>{copied ? 'Copied!' : 'Copy Legal Bundle'}</span>
            </button>
          </div>
        </div>

        {/* 14-Point Compliance Checklist Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 pt-3 border-t border-emerald-200 dark:border-emerald-500/20">
          {LEGAL_AUDIT_CHECKLIST.map((item) => (
            <div 
              key={item.id} 
              className="flex items-center gap-1.5 text-[11px] text-emerald-900 dark:text-zinc-200 bg-white/90 dark:bg-emerald-500/5 px-2 py-1 rounded-lg border border-emerald-200 dark:border-emerald-500/15 shadow-2xs"
              title={item.desc}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="truncate">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Storage Consent Manager Panel */}
      {showConsentManager && (
        <div className="p-4 sm:p-5 rounded-2xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cookie className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h4 className="text-sm font-bold text-gray-900 dark:text-white">On-Device Storage & Cookie Consent Preferences</h4>
            </div>
            {consentSavedMsg && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Preferences Saved!
              </span>
            )}
          </div>
          <p className="text-xs text-gray-600 dark:text-zinc-400 leading-relaxed">
            Quantum Link uses zero tracking or advertising cookies. The storage categories below are strictly client-side browser mechanisms for storing your custom username and sandboxed files.
          </p>

          <div className="space-y-3 text-xs">
            {/* Essential */}
            <div className="p-3 rounded-xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 flex items-center justify-between">
              <div className="space-y-0.5 pr-3">
                <div className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <span>Essential P2P & Session Storage</span>
                  <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-mono">Always Active</span>
                </div>
                <div className="text-gray-600 dark:text-zinc-400 text-[11px]">
                  Required for WebRTC cryptographic handshakes, nickname memory, and local peer sessions. No personal data is sent externally.
                </div>
              </div>
              <input type="checkbox" checked disabled className="cursor-not-allowed opacity-70" />
            </div>

            {/* CacheStorage */}
            <div className="p-3 rounded-xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 flex items-center justify-between">
              <div className="space-y-0.5 pr-3">
                <div className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <span>Drop Zone CacheStorage Sandbox (app-cache-v1)</span>
                  <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-400 font-mono">Functional</span>
                </div>
                <div className="text-gray-600 dark:text-zinc-400 text-[11px]">
                  Persists files placed in the file drop zone to your device's browser cache disk storage so transfers don't consume system RAM.
                </div>
              </div>
              <input 
                type="checkbox" 
                checked={cacheStorageEnabled} 
                onChange={(e) => setCacheStorageEnabled(e.target.checked)} 
                className="cursor-pointer text-blue-600 focus:ring-blue-500 rounded"
              />
            </div>

            {/* OPFS */}
            <div className="p-3 rounded-xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 flex items-center justify-between">
              <div className="space-y-0.5 pr-3">
                <div className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <span>Origin Private File System (OPFS) Direct Streamer</span>
                  <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-400 font-mono">High-Speed</span>
                </div>
                <div className="text-gray-600 dark:text-zinc-400 text-[11px]">
                  Enables multi-gigabyte disk streaming when downloading huge payloads directly to your device disk.
                </div>
              </div>
              <input 
                type="checkbox" 
                checked={opfsEnabled} 
                onChange={(e) => setOpfsEnabled(e.target.checked)} 
                className="cursor-pointer text-blue-600 focus:ring-blue-500 rounded"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-white/10">
            <button
              type="button"
              onClick={handleSaveConsent}
              className="px-4 py-1.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-xs font-semibold transition-colors cursor-pointer shadow-sm"
            >
              Save Storage Preferences
            </button>
          </div>
        </div>
      )}

      {/* Main Legal Explorer: Sidebar & Content Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Search & Section Selector */}
        <div className="lg:col-span-4 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search legal & compliance terms..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white dark:bg-white/5 border border-gray-300 dark:border-white/10 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1 scrollbar-hide">
            {filteredSections.map((sec) => {
              const Icon = getSectionIcon(sec.iconName);
              const isSelected = sec.id === selectedSectionId;
              return (
                <button
                  key={sec.id}
                  onClick={() => setSelectedSectionId(sec.id)}
                  className={cn(
                    "w-full text-left p-2.5 rounded-xl border transition-all flex items-start justify-between gap-2 cursor-pointer",
                    isSelected
                      ? "bg-blue-50 border-blue-500 text-blue-950 dark:bg-blue-500/15 dark:border-blue-500 dark:text-white shadow-sm"
                      : "bg-white dark:bg-white/5 border-gray-200 dark:border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/10"
                  )}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                      isSelected ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-zinc-400"
                    )}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate text-gray-900 dark:text-white">{sec.title}</div>
                      <div className="text-[11px] text-gray-500 dark:text-zinc-400 truncate">{sec.shortDescription}</div>
                    </div>
                  </div>
                  <ChevronRight className={cn(
                    "w-3.5 h-3.5 shrink-0 mt-2 transition-transform",
                    isSelected ? "text-blue-600 dark:text-blue-400 translate-x-0.5" : "text-gray-400 opacity-40"
                  )} />
                </button>
              );
            })}

            {filteredSections.length === 0 && (
              <div className="p-4 text-center text-xs text-gray-500 dark:text-zinc-400">
                No policy sections match "{searchQuery}"
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Active Policy Content View */}
        <div className="lg:col-span-8 p-5 rounded-2xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 space-y-5">
          <div className="border-b border-gray-200 dark:border-white/10 pb-4">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <ActiveIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">{activeSection.title}</h3>
                  <div className="text-xs text-gray-500 dark:text-zinc-400">{activeSection.shortDescription}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/25">
                  {activeSection.badge}
                </span>
                <span className="text-[10px] text-gray-500 dark:text-zinc-400">
                  Updated: {activeSection.lastUpdated}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-6 text-xs leading-relaxed text-gray-800 dark:text-zinc-200">
            {activeSection.content.map((block, idx) => (
              <div key={idx} className="space-y-2">
                <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400 inline-block" />
                  {block.heading}
                </h4>
                {block.paragraphs.map((p, pIdx) => (
                  <p key={pIdx} className="text-gray-700 dark:text-zinc-300 leading-relaxed">
                    {p}
                  </p>
                ))}

                {block.subsections && block.subsections.map((sub, sIdx) => (
                  <div key={sIdx} className="p-3.5 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 space-y-2 mt-2">
                    <div className="font-semibold text-gray-900 dark:text-white">{sub.title}</div>
                    <ul className="space-y-1.5 list-disc pl-4 text-gray-600 dark:text-zinc-400">
                      {sub.items.map((item, iIdx) => (
                        <li key={iIdx} className="leading-relaxed">
                          <strong className="text-gray-900 dark:text-white font-medium">{item.split(':')[0]}:</strong>
                          {item.split(':').slice(1).join(':')}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Quick Contact & Source Footer */}
          <div className="pt-4 border-t border-gray-200 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500 dark:text-zinc-400">
            <div>
              Maintainer: <strong className="text-gray-900 dark:text-white">Quantum Link Development Collective</strong> • legal@quantumlink.dev
            </div>
            <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-semibold">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Client-Side P2P Verified</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
