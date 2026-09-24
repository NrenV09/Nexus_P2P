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
      <div className="p-4 sm:p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-text">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <BadgeCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-text flex items-center gap-2">
                14-Point Legal & Privacy Compliance Passed
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  100% AUDIT READY
                </span>
              </h3>
              <p className="text-xs text-muted">
                Complete protections: Privacy Policy, T&Cs, Zero-Cookie Disclosures, No-Fee Terms, WCAG 2.1 AA, and International Encryption Compliance.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowConsentManager(!showConsentManager)}
              className="px-3 py-1.5 rounded-xl bg-white/20 dark:bg-white/5 border border-white/20 dark:border-white/10 text-xs font-semibold hover:bg-white/30 text-text flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-accent" />
              <span>{showConsentManager ? 'Hide Consent Panel' : 'Storage Consent'}</span>
            </button>

            <button
              onClick={handleCopyLegalSummary}
              className="px-3 py-1.5 rounded-xl bg-white/20 dark:bg-white/5 border border-white/20 dark:border-white/10 text-xs font-semibold hover:bg-white/30 text-text flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Copy all policies as clean text"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-muted" />}
              <span>{copied ? 'Copied!' : 'Copy Legal Bundle'}</span>
            </button>
          </div>
        </div>

        {/* 14-Point Compliance Checklist Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 pt-3 border-t border-emerald-500/20">
          {LEGAL_AUDIT_CHECKLIST.map((item) => (
            <div 
              key={item.id} 
              className="flex items-center gap-1.5 text-[11px] text-text/90 bg-emerald-500/5 px-2 py-1 rounded-lg border border-emerald-500/15"
              title={item.desc}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Storage Consent Manager Panel */}
      {showConsentManager && (
        <div className="p-4 sm:p-5 rounded-2xl bg-white/40 dark:bg-white/5 border border-white/40 dark:border-white/10 space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cookie className="w-4 h-4 text-accent" />
              <h4 className="text-sm font-bold text-text">On-Device Storage & Cookie Consent Preferences</h4>
            </div>
            {consentSavedMsg && (
              <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Preferences Saved!
              </span>
            )}
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Quantum Link uses zero tracking or advertising cookies. The storage categories below are strictly client-side browser mechanisms for storing your custom username and sandboxed files.
          </p>

          <div className="space-y-3 text-xs">
            {/* Essential */}
            <div className="p-3 rounded-xl bg-white/20 dark:bg-white/5 border border-white/10 flex items-center justify-between">
              <div className="space-y-0.5 pr-3">
                <div className="font-semibold text-text flex items-center gap-2">
                  <span>Essential P2P & Session Storage</span>
                  <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-success/15 text-success font-mono">Always Active</span>
                </div>
                <div className="text-muted text-[11px]">
                  Required for WebRTC cryptographic handshakes, nickname memory, and local peer sessions. No personal data is sent externally.
                </div>
              </div>
              <input type="checkbox" checked disabled className="cursor-not-allowed opacity-70" />
            </div>

            {/* CacheStorage */}
            <div className="p-3 rounded-xl bg-white/20 dark:bg-white/5 border border-white/10 flex items-center justify-between">
              <div className="space-y-0.5 pr-3">
                <div className="font-semibold text-text flex items-center gap-2">
                  <span>Drop Zone CacheStorage Sandbox (app-cache-v1)</span>
                  <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-accent/15 text-accent font-mono">Functional</span>
                </div>
                <div className="text-muted text-[11px]">
                  Persists files placed in the file drop zone to your device's browser cache disk storage so transfers don't consume system RAM.
                </div>
              </div>
              <input 
                type="checkbox" 
                checked={cacheStorageEnabled} 
                onChange={(e) => setCacheStorageEnabled(e.target.checked)} 
                className="cursor-pointer text-accent focus:ring-accent rounded"
              />
            </div>

            {/* OPFS */}
            <div className="p-3 rounded-xl bg-white/20 dark:bg-white/5 border border-white/10 flex items-center justify-between">
              <div className="space-y-0.5 pr-3">
                <div className="font-semibold text-text flex items-center gap-2">
                  <span>Origin Private File System (OPFS) Direct Streamer</span>
                  <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-accent/15 text-accent font-mono">High-Speed</span>
                </div>
                <div className="text-muted text-[11px]">
                  Enables multi-gigabyte disk streaming when downloading huge payloads directly to your device disk.
                </div>
              </div>
              <input 
                type="checkbox" 
                checked={opfsEnabled} 
                onChange={(e) => setOpfsEnabled(e.target.checked)} 
                className="cursor-pointer text-accent focus:ring-accent rounded"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={handleSaveConsent}
              className="px-4 py-1.5 rounded-xl bg-accent text-white hover:bg-accent/90 text-xs font-semibold transition-colors cursor-pointer shadow-sm"
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
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search legal & compliance terms..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white/40 dark:bg-white/5 border border-white/40 dark:border-white/10 text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
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
                      ? "bg-accent/15 border-accent text-text shadow-sm"
                      : "bg-white/20 dark:bg-white/5 border-transparent text-muted hover:text-text hover:bg-white/30 dark:hover:bg-white/10"
                  )}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                      isSelected ? "bg-accent text-white" : "bg-black/5 dark:bg-white/5 text-muted"
                    )}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate text-text">{sec.title}</div>
                      <div className="text-[11px] text-muted truncate">{sec.shortDescription}</div>
                    </div>
                  </div>
                  <ChevronRight className={cn(
                    "w-3.5 h-3.5 shrink-0 mt-2 transition-transform",
                    isSelected ? "text-accent translate-x-0.5" : "text-muted opacity-40"
                  )} />
                </button>
              );
            })}

            {filteredSections.length === 0 && (
              <div className="p-4 text-center text-xs text-muted">
                No policy sections match "{searchQuery}"
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Active Policy Content View */}
        <div className="lg:col-span-8 p-5 rounded-2xl bg-white/40 dark:bg-white/5 border border-white/40 dark:border-white/10 space-y-5">
          <div className="border-b border-white/10 pb-4">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center shrink-0">
                  <ActiveIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-text">{activeSection.title}</h3>
                  <div className="text-xs text-muted">{activeSection.shortDescription}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/25">
                  {activeSection.badge}
                </span>
                <span className="text-[10px] text-muted">
                  Updated: {activeSection.lastUpdated}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-6 text-xs leading-relaxed text-text/90">
            {activeSection.content.map((block, idx) => (
              <div key={idx} className="space-y-2">
                <h4 className="text-sm font-bold text-text flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block" />
                  {block.heading}
                </h4>
                {block.paragraphs.map((p, pIdx) => (
                  <p key={pIdx} className="text-text/80 leading-relaxed">
                    {p}
                  </p>
                ))}

                {block.subsections && block.subsections.map((sub, sIdx) => (
                  <div key={sIdx} className="p-3.5 rounded-xl bg-black/5 dark:bg-white/5 border border-white/10 space-y-2 mt-2">
                    <div className="font-semibold text-text">{sub.title}</div>
                    <ul className="space-y-1.5 list-disc pl-4 text-muted">
                      {sub.items.map((item, iIdx) => (
                        <li key={iIdx} className="leading-relaxed">
                          <strong className="text-text font-medium">{item.split(':')[0]}:</strong>
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
          <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted">
            <div>
              Maintainer: <strong className="text-text">Quantum Link Development Collective</strong> • legal@quantumlink.dev
            </div>
            <div className="flex items-center gap-1.5 text-accent font-semibold">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Client-Side P2P Verified</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
