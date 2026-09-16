import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Terminal, 
  Cpu, 
  ShieldCheck, 
  Radio, 
  Check, 
  Copy, 
  Lock,
  Minus,
  Square,
  Sparkles
} from 'lucide-react';
import { cn } from '../lib/utils';

interface EasterEggModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Gentle keyboard tap feedback tick
export function playTapTick(pitch = 1) {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(580 + pitch * 50, now);
    
    gain.gain.setValueAtTime(0.02, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.04);
  } catch (e) {}
}

const TYPING_MESSAGE = "Created By Naman Verma as a fun project";

export const EasterEggModal: React.FC<EasterEggModalProps> = ({ isOpen, onClose }) => {
  const [shellMode, setShellMode] = useState<'powershell' | 'cmd'>('cmd');
  const [typedText, setTypedText] = useState("");
  const [typingDone, setTypingDone] = useState(false);
  const [copied, setCopied] = useState(false);

  // Dynamic typing effect
  useEffect(() => {
    if (!isOpen) {
      setTypedText("");
      setTypingDone(false);
      return;
    }

    setTypedText("");
    setTypingDone(false);

    let idx = 0;
    const interval = setInterval(() => {
      idx++;
      if (idx <= TYPING_MESSAGE.length) {
        setTypedText(TYPING_MESSAGE.slice(0, idx));
        playTapTick(idx % 4);
      } else {
        setTypingDone(true);
        clearInterval(interval);
      }
    }, 40);

    return () => clearInterval(interval);
  }, [isOpen, shellMode]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleCopy = () => {
    navigator.clipboard?.writeText?.(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isCmd = shellMode === 'cmd';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[250] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm"
          onClick={onClose}
        >
          {/* Windows Terminal Box */}
          <motion.div
            initial={{ scale: 0.94, y: 12, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.94, y: 12, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 350 }}
            className={cn(
              "relative w-full max-w-xl rounded-xl overflow-hidden shadow-2xl border select-text transition-colors duration-200",
              isCmd 
                ? "bg-[#0c0c0c] text-[#cccccc] border-[#333333] shadow-[0_0_50px_rgba(0,0,0,0.9)]" 
                : "bg-[#012456] text-[#eeedf0] border-[#1f4b82] shadow-[0_0_50px_rgba(1,36,86,0.6)]"
            )}
            onClick={(e) => e.stopPropagation()}
            style={{ fontFamily: 'Consolas, "Cascadia Code", "Lucida Console", Courier, monospace' }}
          >
            {/* Windows Title Bar & Terminal Tabs */}
            <div className={cn(
              "flex items-center justify-between px-2 pt-1.5 pb-0 select-none border-b",
              isCmd 
                ? "bg-[#181818] border-[#2d2d2d]" 
                : "bg-[#0c1b33] border-[#1a365d]"
            )}>
              {/* Tab Navigation: Command Prompt vs PowerShell */}
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide text-xs">
                {/* CMD Tab */}
                <button
                  onClick={() => setShellMode('cmd')}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg transition-all text-left font-sans cursor-pointer text-xs font-medium",
                    isCmd 
                      ? "bg-[#0c0c0c] text-white border-t-2 border-t-neutral-400 border-x border-x-[#2d2d2d]" 
                      : "text-neutral-400 hover:text-neutral-200 hover:bg-white/5"
                  )}
                  title="Switch to Command Prompt (cmd.exe)"
                >
                  <span className="font-mono font-bold text-[10px] px-1 py-0.2 rounded bg-neutral-800 text-neutral-200">
                    C:\
                  </span>
                  <span>Command Prompt</span>
                </button>

                {/* PowerShell Tab */}
                <button
                  onClick={() => setShellMode('powershell')}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg transition-all text-left font-sans cursor-pointer text-xs font-medium",
                    !isCmd 
                      ? "bg-[#012456] text-white border-t-2 border-t-sky-400 border-x border-x-[#1a365d]" 
                      : "text-neutral-400 hover:text-neutral-200 hover:bg-white/5"
                  )}
                  title="Switch to Windows PowerShell (pwsh.exe)"
                >
                  <span className="font-mono font-bold text-[10px] px-1 py-0.2 rounded bg-blue-900 text-sky-200">
                    PS
                  </span>
                  <span>Windows PowerShell</span>
                </button>
              </div>

              {/* Windows Window Control Buttons (Minimize & Maximize, no close button) */}
              <div className="flex items-center gap-2 px-2 pb-1.5 text-neutral-400">
                <button 
                  className="p-1 hover:bg-white/10 rounded transition cursor-default opacity-60" 
                  tabIndex={-1}
                  title="Minimize"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button 
                  className="p-1 hover:bg-white/10 rounded transition cursor-default opacity-60" 
                  tabIndex={-1}
                  title="Maximize"
                >
                  <Square className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Console Screen Buffer */}
            <div className="p-4 sm:p-5 space-y-3.5 text-xs sm:text-[13px] leading-relaxed">
              {/* Authentic OS Shell Banner */}
              {isCmd ? (
                <div className="text-neutral-400 space-y-0.5 select-text">
                  <div>Microsoft Windows [Version 10.0.26100.1]</div>
                  <div>(c) Microsoft Corporation. All rights reserved.</div>
                </div>
              ) : (
                <div className="text-neutral-300 space-y-0.5 select-text">
                  <div>Windows PowerShell</div>
                  <div>Copyright (C) Microsoft Corporation. All rights reserved.</div>
                  <div className="text-sky-300/80 text-[11px] pt-0.5">
                    Install the latest PowerShell for new features: <span className="underline">https://aka.ms/PSWindows</span>
                  </div>
                </div>
              )}

              {/* Shell Command Execution Line */}
              <div className="pt-1">
                {isCmd ? (
                  <div className="flex items-center gap-1 text-neutral-300 font-semibold">
                    <span className="text-neutral-400">C:\Users\Naman\QuantumMesh&gt;</span>
                    <span className="text-white">attribution.bat</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 font-semibold">
                    <span className="text-sky-300">PS C:\Users\Naman\QuantumMesh&gt;</span>
                    <span className="text-yellow-300">.\Get-Attribution.ps1</span>
                    <span className="text-sky-200">-Verbose</span>
                  </div>
                )}
              </div>

              {/* The Typed Tribute Output */}
              <div className={cn(
                "p-3 rounded border select-text transition-colors",
                isCmd 
                  ? "bg-black border-[#222222] text-[#00ff66]" 
                  : "bg-[#001737] border-[#103b71] text-cyan-200"
              )}>
                <div className="flex items-center gap-1.5 flex-wrap font-bold text-sm sm:text-base tracking-wide">
                  <span>{typedText}</span>
                  <span className={cn(
                    "inline-block w-2.5 h-4 ml-0.5 animate-pulse",
                    isCmd ? "bg-[#00ff66]" : "bg-cyan-300"
                  )} />
                </div>
              </div>

              {/* Diagnostic Properties / Systeminfo format */}
              <AnimatePresence>
                {typingDone && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-3 pt-1"
                  >
                    {isCmd ? (
                      /* CMD Style key-value output */
                      <div className="border border-[#222222] bg-[#000000] p-3 rounded text-[11px] sm:text-xs text-neutral-300 space-y-1 select-text">
                        <div className="text-neutral-500 pb-1 border-b border-[#222222] uppercase tracking-wider font-bold text-[10px]">
                          [NETWORK SPECIFICATION DUMP]
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 pt-1">
                          <div>Topology       : WebRTC P2P Mesh</div>
                          <div>Host Failover  : Deterministic Heir</div>
                          <div>Disk IO Buffer : Direct IndexedDB Stream</div>
                          <div>Memory Status  : 0 Leak Clean Heap</div>
                        </div>
                      </div>
                    ) : (
                      /* PowerShell Style format-list output */
                      <div className="border border-[#14396b] bg-[#001633] p-3 rounded text-[11px] sm:text-xs text-cyan-100 space-y-1 select-text">
                        <div className="text-sky-400 pb-1 border-b border-[#14396b] uppercase tracking-wider font-bold text-[10px]">
                          VERBOSE: Node properties enumerated successfully.
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 pt-1 font-mono">
                          <div><span className="text-sky-300">MeshProtocol</span>   : WebRTC DataChannel</div>
                          <div><span className="text-sky-300">FailoverRanks</span>  : Deterministic Quorum</div>
                          <div><span className="text-sky-300">FileSystemSync</span> : Active Disk Write</div>
                          <div><span className="text-sky-300">MemoryGuard</span>   : Leak-Proof Verified</div>
                        </div>
                      </div>
                    )}

                    {/* Terminal Footer Bar */}
                    <div className={cn(
                      "flex items-center justify-between gap-2 pt-2 border-t",
                      isCmd ? "border-[#222222]" : "border-[#14396b]"
                    )}>
                      <button
                        onClick={handleCopy}
                        className={cn(
                          "px-3 py-1.5 rounded transition-all text-xs flex items-center gap-1.5 cursor-pointer font-sans",
                          isCmd 
                            ? "bg-[#1f1f1f] hover:bg-[#2a2a2a] text-neutral-200 border border-[#333333]" 
                            : "bg-[#0d3468] hover:bg-[#154687] text-white border border-[#21579d]"
                        )}
                        title="Copy application URL"
                      >
                        {copied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Copied to Clipboard</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy App Link</span>
                          </>
                        )}
                      </button>

                      <div className="flex items-center gap-2 ml-auto">
                        <span className="text-[11px] text-neutral-500 font-mono hidden sm:inline">
                          Press ESC to return
                        </span>
                        <button
                          onClick={onClose}
                          className={cn(
                            "px-4 py-1.5 rounded transition-all text-xs font-bold cursor-pointer font-sans",
                            isCmd 
                              ? "bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-600" 
                              : "bg-sky-600 hover:bg-sky-500 text-white border border-sky-400"
                          )}
                        >
                          [ESC] Exit
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};


