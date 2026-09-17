import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Monitor, FileText, XCircle, Zap } from 'lucide-react';
import { cn } from '../lib/utils';
import { TransferProgress } from '../types';

interface PacketTransferAnimationProps {
  transfer: TransferProgress;
  myUsername: string;
  onCancel?: () => void;
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export function PacketTransferAnimation({ transfer, myUsername, onCancel }: PacketTransferAnimationProps) {
  const isSending = transfer.type === 'sending';
  const actualSizeTransferred = formatBytes(transfer.transferredBytes || 0);
  const totalSize = formatBytes(transfer.totalBytes || 0);

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full py-6 flex flex-col items-center justify-center gap-4 relative overflow-hidden bg-white/40 dark:bg-zinc-900/40 backdrop-blur-md border border-white/60 dark:border-white/10 rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.05)]"
      >
        <div className="flex items-center justify-between w-full px-6 sm:px-10 relative z-10">
          
          {/* Device 1 (Me) */}
          <div className="flex flex-col items-center gap-3 z-20">
            <div className={cn(
              "w-14 h-14 rounded-2xl flex items-center justify-center border shadow-sm relative bg-white/80 dark:bg-zinc-800 backdrop-blur-md transition-all duration-300",
              isSending ? "border-accent text-accent shadow-[0_0_20px_rgba(0,122,255,0.3)]" : "border-white/60 dark:border-white/10 text-text"
            )}>
              <Monitor className="w-7 h-7" />
              {isSending && (
                <motion.div 
                  animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0, 0.6] }}
                  transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                  className="absolute inset-0 rounded-2xl border-2 border-accent"
                />
              )}
            </div>
            <span className="text-xs font-bold text-text max-w-[80px] truncate tracking-wide" title={myUsername}>
              {myUsername}
            </span>
          </div>

          {/* Transfer Path / Packets */}
          <div className="flex-1 relative h-16 flex items-center justify-center -mx-4">
            {/* Glowing Track */}
            <div className="absolute left-4 right-4 h-1.5 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden shadow-inner flex items-center">
              <motion.div 
                className={cn("h-full w-full absolute box-border", isSending ? "bg-accent" : "bg-success")}
                style={{ scaleX: transfer.progress / 100, transformOrigin: isSending ? "left" : "right" }}
                initial={false}
                animate={{ transition: { ease: "linear", duration: 0.2 } }}
              />
              {/* Scanline overlay on the progress bar */}
              <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.3)_50%,transparent_100%)] w-[200%] animate-[scan_2s_linear_infinite]" />
            </div>
            
            {/* Animated Packet */}
            <div className="absolute left-6 right-6 h-full flex items-center overflow-visible pointer-events-none">
                <motion.div
                  animate={{
                    left: isSending ? ['0%', '100%'] : ['100%', '0%']
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: 1.5,
                    ease: "linear"
                  }}
                  className="absolute z-10 -ml-4 pointer-events-auto"
                >
                  <div className={cn(
                    "w-8 h-8 rounded-xl flex items-center justify-center shadow-lg border backdrop-blur-md",
                    isSending ? "bg-accent/90 border-accent text-white" : "bg-success/90 border-success text-white"
                  )}>
                    <FileText className="w-4 h-4" />
                  </div>
                </motion.div>
            </div>
          </div>

          {/* Device 2 (Peer) */}
          <div className="flex flex-col items-center gap-3 z-20">
            <div className={cn(
              "w-14 h-14 rounded-2xl flex items-center justify-center border shadow-sm relative bg-white/80 dark:bg-zinc-800 backdrop-blur-md transition-all duration-300",
              !isSending ? "border-success text-success shadow-[0_0_20px_rgba(52,199,89,0.3)]" : "border-white/60 dark:border-white/10 text-text"
            )}>
              <Monitor className="w-7 h-7" />
              {!isSending && (
                <motion.div 
                  animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0, 0.6] }}
                  transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                  className="absolute inset-0 rounded-2xl border-2 border-success"
                />
              )}
            </div>
            <span className="text-xs font-bold text-text max-w-[80px] truncate tracking-wide" title={transfer.peerUsername || "Peer Node"}>
              {transfer.peerUsername || "Peer Node"}
            </span>
          </div>
        </div>
        
        {/* Transfer Info */}
        <div className="flex flex-col items-center justify-center w-full px-6 relative mt-2">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-4 h-4 text-muted" />
            <div className="text-sm font-bold text-text truncate max-w-xs md:max-w-md">
              {transfer.name}
            </div>
          </div>
          
          <div className="flex items-center gap-3 text-xs mt-1 bg-white/50 dark:bg-zinc-800/50 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/50 dark:border-white/5 shadow-inner">
            {transfer.isWaitingForReceiver ? (
              <span className="font-bold flex items-center gap-1.5 text-amber-500 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block animate-ping" />
                Waiting for receiver to click download...
              </span>
            ) : (
              <>
                <span className={cn("font-bold flex items-center gap-1", isSending ? "text-accent" : "text-success")}>
                  <Zap className="w-3 h-3" />
                  {isSending ? "Transmitting" : "Receiving"}
                </span>
                <div className="h-3 w-px bg-black/10 dark:bg-white/10" />
                <span className="text-text font-mono tracking-tight font-medium">
                  {transfer.progress}% <span className="text-muted text-[10px] ml-1">({actualSizeTransferred} / {totalSize})</span>
                </span>
              </>
            )}
          </div>
          
          {transfer.isWaitingForReceiver && (
            <div className="text-[11px] text-muted text-center max-w-sm px-4 pt-1 animate-pulse">
              Direct disk stream active. Chunks will begin transmitting as soon as the receiver accepts the download prompt on their browser.
            </div>
          )}

          {onCancel && (
            <button 
              onClick={onCancel}
              className="mt-4 flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white text-xs font-bold transition-all border border-red-500/20 shadow-sm"
            >
              <XCircle className="w-3.5 h-3.5" />
              Abort Transceiver
            </button>
          )}
        </div>

      </motion.div>
    </AnimatePresence>
  );
}
