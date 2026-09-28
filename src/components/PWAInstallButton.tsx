import React, { useState } from 'react';
import { DownloadCloud, CheckCircle2, Share, X, Smartphone, HardDrive, WifiOff } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { cn } from '../lib/utils';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isOfflineReady, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  const handleClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) {
        // User cancelled prompt or platform refused
      }
    } else {
      setShowGuideModal(true);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        className={cn(
          "relative w-8 h-8 md:w-9 md:h-9 lg:w-10 lg:h-10 flex items-center justify-center transition-all border rounded-xl lg:rounded-2xl shadow-sm cursor-pointer flex-shrink-0 group",
          isInstalled
            ? "text-emerald-500 hover:text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20"
            : isInstallable
            ? "text-cyan-400 hover:text-cyan-300 border-cyan-500/40 bg-cyan-500/15 hover:bg-cyan-500/25 animate-pulse"
            : "text-muted hover:text-text border-white/40 dark:border-white/10 bg-white/30 dark:bg-transparent hover:bg-white/50 dark:hover:bg-white/10 backdrop-blur"
        )}
        title={
          isInstalled 
            ? "Quantum Link is installed & saved for offline use" 
            : isInstallable 
            ? "Save App for Offline Use (Install PWA)" 
            : "PWA Offline Status & Saving Info"
        }
        aria-label="PWA Offline Saving & Installation"
      >
        {isInstalled ? (
          <CheckCircle2 className="w-4 h-4 lg:w-5 lg:h-5 text-emerald-400" />
        ) : (
          <DownloadCloud className="w-4 h-4 lg:w-5 lg:h-5 group-hover:scale-110 transition-transform" />
        )}

        {/* Small glowing indicator if service worker cached offline */}
        {isOfflineReady && (
          <span 
            className={cn(
              "absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full",
              isInstalled ? "bg-emerald-400" : "bg-cyan-400 animate-ping"
            )} 
          />
        )}
      </button>

      {/* Offline Saving & PWA Guide Modal */}
      {showGuideModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-700/80 p-6 shadow-2xl text-white relative">
            <button
              onClick={() => setShowGuideModal(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  Offline Saving & PWA
                </h3>
                <p className="text-xs text-zinc-400">
                  {isInstalled ? "App is running in Standalone Mode" : "Install for instant offline usage"}
                </p>
              </div>
            </div>

            {/* Offline Status Card */}
            <div className="p-3.5 rounded-xl bg-zinc-800/80 border border-zinc-700 mb-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <WifiOff className="w-4 h-4" />
              </div>
              <div className="text-xs">
                <p className="font-semibold text-emerald-400">100% Offline Capable</p>
                <p className="text-zinc-400 text-[11px]">
                  WebRTC P2P direct transfers, QR scans, and audio/video work without external internet.
                </p>
              </div>
            </div>

            {isIOS ? (
              <div className="space-y-3 text-xs text-zinc-300">
                <p className="font-medium text-white flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-sky-400" />
                  How to Save / Install on iPhone or iPad:
                </p>
                <ol className="list-decimal list-inside space-y-2 bg-zinc-950/60 p-3 rounded-xl border border-zinc-800">
                  <li>
                    Tap the <strong className="text-white inline-flex items-center gap-1"><Share className="w-3.5 h-3.5" /> Share</strong> icon in the Safari toolbar.
                  </li>
                  <li>
                    Scroll down and select <strong className="text-white">Add to Home Screen</strong>.
                  </li>
                  <li>
                    Tap <strong className="text-cyan-400">Add</strong>. Quantum Link will now launch directly from your home screen offline.
                  </li>
                </ol>
              </div>
            ) : isInstallable ? (
              <div className="space-y-3">
                <p className="text-xs text-zinc-300">
                  Click the button below to install Quantum Link as a native standalone app on your device for instant offline access.
                </p>
                <button
                  onClick={async () => {
                    await install();
                    setShowGuideModal(false);
                  }}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-semibold text-xs transition shadow-lg flex items-center justify-center gap-2"
                >
                  <DownloadCloud className="w-4 h-4" />
                  Install Quantum Link
                </button>
              </div>
            ) : isInstalled ? (
              <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800 text-xs text-zinc-300">
                <p className="text-emerald-400 font-semibold mb-1">✓ App Installed</p>
                <p className="text-[11px] text-zinc-400">
                  You are already running Quantum Link as an installed standalone application. All assets are cached locally for full offline operation.
                </p>
              </div>
            ) : (
              <div className="space-y-3 text-xs text-zinc-300">
                <p>
                  To save Quantum Link offline on Chrome/Edge/Firefox:
                </p>
                <ul className="list-disc list-inside space-y-1.5 bg-zinc-950/60 p-3 rounded-xl border border-zinc-800 text-[11px]">
                  <li>Click the <strong>Install</strong> icon in the address bar, or</li>
                  <li>Open browser menu (⋮) $\rightarrow$ <strong>Install Quantum Link</strong> or <strong>Save to Home Screen</strong>.</li>
                  <li>All scripts, styles, and icons are cached via Service Worker for complete offline resilience.</li>
                </ul>
              </div>
            )}

            <button
              onClick={() => setShowGuideModal(false)}
              className="mt-4 w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-medium transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
};
