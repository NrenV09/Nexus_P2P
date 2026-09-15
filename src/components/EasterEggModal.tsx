import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Terminal, 
  Cpu, 
  ShieldCheck, 
  Radio, 
  Zap, 
  Check, 
  Copy, 
  Volume2, 
  Code2,
  Lock,
  Sparkles
} from 'lucide-react';
import { cn } from '../lib/utils';

interface EasterEggModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Synthesize pleasant sci-fi harmonic chime
export function playQuantumChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    
    // Harmonic arpeggiated chord: C5, E5, G5, B5, C6
    const notes = [523.25, 659.25, 783.99, 987.77, 1046.50];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.07);
      
      gain.gain.setValueAtTime(0.0001, now + idx * 0.07);
      gain.gain.linearRampToValueAtTime(0.08, now + idx * 0.07 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.07 + 1.2);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + 1.25);
    });
  } catch (e) {
    console.debug("Audio play skipped:", e);
  }
}

// Gentle tap feedback tick
export function playTapTick(pitch = 1) {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(650 + pitch * 65, now);
    
    gain.gain.setValueAtTime(0.03, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.05);
  } catch (e) {}
}

const TYPING_MESSAGE = "Created By Naman Verma as a fun project";

export const EasterEggModal: React.FC<EasterEggModalProps> = ({ isOpen, onClose }) => {
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

    playQuantumChime();
    setTypedText("");
    setTypingDone(false);

    let idx = 0;
    const interval = setInterval(() => {
      idx++;
      if (idx <= TYPING_MESSAGE.length) {
        setTypedText(TYPING_MESSAGE.slice(0, idx));
        playTapTick(idx % 5);
      } else {
        setTypingDone(true);
        clearInterval(interval);
      }
    }, 45);

    return () => clearInterval(interval);
  }, [isOpen]);

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

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[250] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md"
          onClick={onClose}
        >
          {/* Subtle Cyber Grid Background */}
          <div className="absolute inset-0 pointer-events-none opacity-20 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:20px_20px]" />
          
          {/* Green Ambient Terminal Glow */}
          <div className="absolute w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Terminal Window */}
          <motion.div
            initial={{ scale: 0.9, y: 15, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 15, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={cn(
              "relative w-full max-w-lg rounded-2xl overflow-hidden",
              "bg-black/95 text-emerald-400 font-mono",
              "border-2 border-emerald-500/60 shadow-[0_0_40px_rgba(16,185,129,0.3)]",
              "p-0 select-text"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Terminal Top Window Bar */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-950/50 border-b border-emerald-500/30 select-none">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500/80 inline-block" />
                <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
                <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
                <span className="text-xs text-emerald-400/80 font-mono ml-2 flex items-center gap-1">
                  <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                  quantum-terminal://tty1
                </span>
              </div>

              {/* Close Button on Top Right */}
              <button
                onClick={onClose}
                className="p-1 rounded-md text-emerald-400/70 hover:text-emerald-200 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                title="Close terminal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Terminal Body */}
            <div className="p-5 sm:p-6 space-y-4 text-xs sm:text-sm">
              {/* Terminal command execution header */}
              <div className="space-y-1 text-emerald-500/70 text-xs">
                <div>[SYSTEM INITIALIZED] Quantum Link Node v7.8.4</div>
                <div>[AUTH] Ephemeral Key Verified (AES-GCM-256)</div>
                <div className="text-emerald-400 flex items-center gap-1.5 pt-1">
                  <span className="text-emerald-300 font-bold">naman@quantum-mesh:~$</span>
                  <span className="text-emerald-200">./attribution.sh --dynamic</span>
                </div>
              </div>

              {/* The Typed Creator Tribute Message */}
              <div className="py-4 px-4 rounded-xl bg-emerald-950/40 border border-emerald-500/30 shadow-inner min-h-[72px] flex items-center">
                <div className="text-sm sm:text-base md:text-lg font-bold text-emerald-300 tracking-wide flex items-center flex-wrap gap-1 leading-relaxed">
                  <span>{typedText}</span>
                  <span className="inline-block w-2.5 h-5 bg-emerald-400 animate-pulse ml-0.5" />
                </div>
              </div>

              {/* Terminal Details & Specifications */}
              <AnimatePresence>
                {typingDone && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-3 pt-2"
                  >
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-emerald-400/80 border-t border-emerald-500/20 pt-3">
                      <div className="flex items-center gap-1.5">
                        <Radio className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Mesh: WebRTC P2P</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Direct Disk Writes: Active</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Memory: Zero RAM Leaks</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Failover: Deterministic</span>
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-emerald-500/20">
                      <button
                        onClick={playQuantumChime}
                        className="px-3 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 hover:text-white text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>Chime</span>
                      </button>

                      <button
                        onClick={handleCopy}
                        className="px-3 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 hover:text-white text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        {copied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-300" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Share Link</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={onClose}
                        className="px-4 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-200 text-xs font-bold transition-colors cursor-pointer ml-auto"
                      >
                        [ESC] Exit
                      </button>
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

