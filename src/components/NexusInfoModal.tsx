import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Info, 
  X, 
  Wifi, 
  QrCode, 
  Send, 
  HardDrive, 
  ShieldCheck, 
  Radio, 
  Video, 
  MessageSquare, 
  Sparkles, 
  CheckCircle2, 
  Layers, 
  ArrowRight, 
  ChevronDown, 
  ChevronUp, 
  Lock, 
  EyeOff, 
  Cpu
} from 'lucide-react';
import { cn } from '../lib/utils';
import { LegalComplianceView } from './LegalComplianceView';

interface NexusInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'guide' | 'dictionary' | 'offline' | 'legal';
}

export const NexusInfoModal: React.FC<NexusInfoModalProps> = ({ 
  isOpen, 
  onClose, 
  initialTab = 'guide' 
}) => {
  // Normalize initial tab into 3 simple sections
  const getNormalizedTab = (tab: string): 'guide' | 'features' | 'privacy' => {
    if (tab === 'legal') return 'privacy';
    if (tab === 'dictionary' || tab === 'offline') return 'features';
    return 'guide';
  };

  const [activeTab, setActiveTab] = useState<'guide' | 'features' | 'privacy'>(() => 
    getNormalizedTab(initialTab)
  );
  const [showFullLegalAudit, setShowFullLegalAudit] = useState(initialTab === 'legal');

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[260] flex items-center justify-center p-3 sm:p-5 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.96, y: 12, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.96, y: 12, opacity: 0 }}
          transition={{ type: "spring", damping: 28, stiffness: 350 }}
          className="relative w-full max-w-2xl max-h-[88vh] flex flex-col bg-white dark:bg-[#12141a] border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden text-gray-900 dark:text-white"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-white/10 bg-gray-50/90 dark:bg-white/[0.03] backdrop-blur flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                <Info className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
                  Quantum Link Guide
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25">
                    P2P Mesh
                  </span>
                </h2>
                <p className="text-xs text-gray-600 dark:text-zinc-400">
                  Direct peer-to-peer file transfer, voice, video & chat with zero servers
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors border border-gray-200 dark:border-white/10 cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Simple Segmented Navigation */}
          <div className="flex items-center gap-1.5 px-5 py-2.5 border-b border-gray-200 dark:border-white/10 bg-gray-100/80 dark:bg-black/20 flex-shrink-0">
            <button
              onClick={() => setActiveTab('guide')}
              className={cn(
                "flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                activeTab === 'guide'
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white hover:bg-white dark:hover:bg-white/5"
              )}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>How It Works</span>
            </button>

            <button
              onClick={() => setActiveTab('features')}
              className={cn(
                "flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                activeTab === 'features'
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white hover:bg-white dark:hover:bg-white/5"
              )}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Features</span>
            </button>

            <button
              onClick={() => setActiveTab('privacy')}
              className={cn(
                "flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                activeTab === 'privacy'
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white hover:bg-white dark:hover:bg-white/5"
              )}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Privacy & Legal</span>
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
            
            {/* TAB 1: HOW IT WORKS */}
            {activeTab === 'guide' && (
              <div className="space-y-4">
                {/* 3 Step Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Step 1 */}
                  <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/10 flex flex-col justify-between">
                    <div>
                      <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs font-bold mb-2.5 shadow-sm">
                        1
                      </div>
                      <h4 className="text-xs font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-1.5">
                        <Wifi className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        Host Room
                      </h4>
                      <p className="text-[11px] text-gray-600 dark:text-zinc-300 leading-relaxed">
                        Device A clicks <strong className="text-gray-900 dark:text-white font-semibold">Host Mesh Room</strong> to generate a room QR code and Offer token.
                      </p>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/10 flex flex-col justify-between">
                    <div>
                      <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs font-bold mb-2.5 shadow-sm">
                        2
                      </div>
                      <h4 className="text-xs font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-1.5">
                        <QrCode className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        Join & Scan
                      </h4>
                      <p className="text-[11px] text-gray-600 dark:text-zinc-300 leading-relaxed">
                        Device B clicks <strong className="text-gray-900 dark:text-white font-semibold">Join Mesh Room</strong>, scans the QR code, and shows the Answer token.
                      </p>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/10 flex flex-col justify-between">
                    <div>
                      <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-xs font-bold mb-2.5 shadow-sm">
                        3
                      </div>
                      <h4 className="text-xs font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        Connected!
                      </h4>
                      <p className="text-[11px] text-gray-600 dark:text-zinc-300 leading-relaxed">
                        Device A scans the Answer. The connection is live. You can now drop files, chat, and call!
                      </p>
                    </div>
                  </div>
                </div>

                {/* Direct Disk Stream Feature */}
                <div className="p-4 rounded-xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0 mt-0.5">
                    <HardDrive className="w-4 h-4" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-sky-950 dark:text-sky-200">Direct Disk Downloads (No File Size Limits)</div>
                    <p className="text-[11px] text-sky-900/90 dark:text-sky-300 leading-relaxed">
                      Files stream chunk-by-chunk straight to your device’s storage instead of buffering into browser memory. This lets you transfer 5GB+ videos, archives, and files without crashing or running out of RAM.
                    </p>
                  </div>
                </div>

                {/* Offline Wi-Fi Highlight */}
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Radio className="w-4 h-4" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-emerald-950 dark:text-emerald-200">Works Completely Offline on Local Wi-Fi</div>
                    <p className="text-[11px] text-emerald-900/90 dark:text-emerald-300 leading-relaxed">
                      No internet? Connect both devices to the same local Wi-Fi router or mobile hotspot. Devices establish direct LAN connections with zero external server dependencies and blazing local speeds.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: FEATURES */}
            {activeTab === 'features' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/10 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-900 dark:text-white">
                    <div className="w-7 h-7 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                      <Send className="w-3.5 h-3.5" />
                    </div>
                    <span>Drag & Drop File Transfer</span>
                  </div>
                  <p className="text-[11px] text-gray-600 dark:text-zinc-300 leading-relaxed">
                    Drop any file into the file zone. Transfers directly via encrypted peer-to-peer WebRTC data channels.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/10 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-900 dark:text-white">
                    <div className="w-7 h-7 rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                      <HardDrive className="w-3.5 h-3.5" />
                    </div>
                    <span>Direct Disk Streaming</span>
                  </div>
                  <p className="text-[11px] text-gray-600 dark:text-zinc-300 leading-relaxed">
                    Bypasses browser memory limits so gigabyte-sized transfers save directly to your storage disk.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/10 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-900 dark:text-white">
                    <div className="w-7 h-7 rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                      <Video className="w-3.5 h-3.5" />
                    </div>
                    <span>Voice & Video Calls</span>
                  </div>
                  <p className="text-[11px] text-gray-600 dark:text-zinc-300 leading-relaxed">
                    Start live camera, microphone, or screen share sessions directly with connected peers.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/10 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-900 dark:text-white">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                      <MessageSquare className="w-3.5 h-3.5" />
                    </div>
                    <span>Encrypted Mesh Chat</span>
                  </div>
                  <p className="text-[11px] text-gray-600 dark:text-zinc-300 leading-relaxed">
                    Real-time direct messaging with zero server logging. Everything disappears when you close the tab.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/10 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-900 dark:text-white">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <Lock className="w-3.5 h-3.5" />
                    </div>
                    <span>Zero Servers & DTLS Encryption</span>
                  </div>
                  <p className="text-[11px] text-gray-600 dark:text-zinc-300 leading-relaxed">
                    All packets are end-to-end encrypted with DTLS-SRTP. No central database holds your data.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/10 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-900 dark:text-white">
                    <div className="w-7 h-7 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                      <Cpu className="w-3.5 h-3.5" />
                    </div>
                    <span>Local Storage Purge</span>
                  </div>
                  <p className="text-[11px] text-gray-600 dark:text-zinc-300 leading-relaxed">
                    Clear local browser cache, cookies, or saved nickname profiles at any time with one click.
                  </p>
                </div>
              </div>
            )}

            {/* TAB 3: PRIVACY & LEGAL */}
            {activeTab === 'privacy' && (
              <div className="space-y-4">
                {/* 4 Simple Guarantees */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/10 flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                      <EyeOff className="w-3.5 h-3.5" />
                    </div>
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-bold text-gray-900 dark:text-white">No Tracking or Ads</h4>
                      <p className="text-[11px] text-gray-600 dark:text-zinc-300">Zero analytics, zero tracking cookies, and zero fingerprinting.</p>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/10 flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                      <ShieldCheck className="w-3.5 h-3.5" />
                    </div>
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-bold text-gray-900 dark:text-white">Zero Cloud Storage</h4>
                      <p className="text-[11px] text-gray-600 dark:text-zinc-300">Files travel directly between devices and never touch a server.</p>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/10 flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                      <Lock className="w-3.5 h-3.5" />
                    </div>
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-bold text-gray-900 dark:text-white">No Accounts Required</h4>
                      <p className="text-[11px] text-gray-600 dark:text-zinc-300">No emails, passwords, or phone numbers needed to connect.</p>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/10 flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </div>
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-bold text-gray-900 dark:text-white">100% Free & Open Source</h4>
                      <p className="text-[11px] text-gray-600 dark:text-zinc-300">Licensed under MIT. Zero fees, subscriptions, or hidden paywalls.</p>
                    </div>
                  </div>
                </div>

                {/* Collapsible Full Legal Audit */}
                <div className="pt-2 border-t border-gray-200 dark:border-white/10">
                  <button
                    onClick={() => setShowFullLegalAudit(prev => !prev)}
                    className="w-full py-2.5 px-4 rounded-xl bg-gray-100 hover:bg-gray-200/80 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] border border-gray-200 dark:border-white/10 text-xs font-semibold text-gray-800 dark:text-zinc-200 flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      {showFullLegalAudit 
                        ? "Hide Detailed Legal & Compliance Audit" 
                        : "Show Detailed Legal, Privacy & Compliance Audit (14 Points)"}
                    </span>
                    {showFullLegalAudit ? (
                      <ChevronUp className="w-4 h-4 text-gray-500 dark:text-zinc-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-500 dark:text-zinc-400" />
                    )}
                  </button>

                  {showFullLegalAudit && (
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-white/10">
                      <LegalComplianceView />
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* Clean Footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 dark:border-white/10 bg-gray-50/90 dark:bg-white/[0.03] text-[11px] text-gray-600 dark:text-zinc-400 flex-shrink-0">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Direct device-to-device • Zero servers
            </span>

            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors text-xs font-semibold cursor-pointer shadow-sm"
            >
              Got it
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
