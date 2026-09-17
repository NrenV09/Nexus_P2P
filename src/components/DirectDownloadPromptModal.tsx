import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HardDrive, Download, X, ShieldCheck, User, Smartphone, Monitor } from 'lucide-react';
import { cn } from '../lib/utils';
import { getDiskStreamSupport } from '../lib/diskStreamer';

interface DirectDownloadPromptModalProps {
  isOpen: boolean;
  fileName: string;
  fileSize: number;
  senderName: string;
  onAccept: () => void;
  onDecline: () => void;
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export const DirectDownloadPromptModal: React.FC<DirectDownloadPromptModalProps> = ({
  isOpen,
  fileName,
  fileSize,
  senderName,
  onAccept,
  onDecline
}) => {
  const streamSupport = getDiskStreamSupport();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[270] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.92, y: 15, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, y: 15, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 360 }}
            className="relative w-full max-w-md bg-card border-2 border-accent/40 rounded-3xl p-6 shadow-2xl overflow-hidden text-text flex flex-col gap-4"
          >
            {/* Header Badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-accent/15 border border-accent/30 text-accent text-xs font-semibold">
                <HardDrive className="w-3.5 h-3.5" />
                <span>Bypass RAM • Direct Streaming</span>
              </div>

              <button
                onClick={onDecline}
                className="p-1 rounded-lg text-muted hover:text-text hover:bg-white/10 transition-colors"
                title="Decline download"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Prompt Content */}
            <div className="space-y-3">
              <div className="text-base sm:text-lg font-bold text-text leading-snug">
                Incoming Direct Disk Transfer
              </div>

              <div className="p-4 rounded-2xl bg-white/40 dark:bg-white/5 border border-white/40 dark:border-white/10 space-y-2">
                <div className="font-semibold text-sm text-text break-all">
                  {fileName}
                </div>
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>Size: <strong className="text-text font-mono">{formatBytes(fileSize)}</strong></span>
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3 text-accent" />
                    <span>From: <strong className="text-text">{senderName}</strong></span>
                  </span>
                </div>
              </div>

              {/* Platform Engine Status */}
              <div className="p-3 rounded-xl bg-accent/10 border border-accent/20 flex items-start gap-2.5 text-xs text-muted leading-relaxed">
                {streamSupport.isIOS ? (
                  <Smartphone className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                ) : (
                  <Monitor className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-semibold text-text text-xs flex items-center gap-1.5">
                    <span>{streamSupport.label}</span>
                    <span className="px-1.5 py-0.2 bg-accent/20 text-accent rounded text-[10px] uppercase font-bold">Active</span>
                  </div>
                  <div className="text-[11px] text-muted mt-0.5">
                    {streamSupport.hasNativePicker
                      ? "Direct streaming to selected local file. Browser RAM heap bypassed."
                      : streamSupport.hasOPFS
                      ? "Origin Private File System (OPFS) direct disk pipeline active. Protects iOS/mobile tabs from memory crashes."
                      : "Memory-guarded stream active. Protected against mobile memory termination."}
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted leading-relaxed">
                The sender is currently <strong className="text-accent">waiting for you to accept</strong> this transfer. Click download below to initiate the direct stream.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={onDecline}
                className="flex-1 py-2.5 px-4 rounded-xl border border-white/30 dark:border-white/10 bg-white/20 dark:bg-white/5 hover:bg-white/30 dark:hover:bg-white/10 text-xs font-semibold text-text transition-colors cursor-pointer"
              >
                Decline
              </button>

              <button
                onClick={onAccept}
                className="flex-2 py-2.5 px-4 rounded-xl bg-accent hover:bg-accent/90 text-white text-xs font-bold transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>{streamSupport.isIOS ? "Download to Device" : "Download to Computer"}</span>
              </button>
            </div>

            <div className="text-[11px] text-muted text-center flex items-center justify-center gap-1.5 pt-1">
              <ShieldCheck className="w-3.5 h-3.5 text-success" />
              <span>Zero-RAM Disk Pipeline • Anti-Crash Guard Engaged</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
