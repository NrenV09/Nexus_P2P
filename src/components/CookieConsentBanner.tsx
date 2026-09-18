import React, { useState, useEffect } from 'react';
import { Cookie, ShieldCheck, X, Check, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CookieConsentBannerProps {
  onOpenLegal: () => void;
}

export const CookieConsentBanner: React.FC<CookieConsentBannerProps> = ({ onOpenLegal }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    try {
      const consent = localStorage.getItem('nexus_cookie_consent');
      if (!consent) {
        // Small delay to prevent layout pop
        const timer = setTimeout(() => setIsVisible(true), 1200);
        return () => clearTimeout(timer);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleAcceptAll = () => {
    try {
      localStorage.setItem('nexus_cookie_consent', 'accepted_all');
      localStorage.setItem('nexus_consent_cache_storage', 'true');
      localStorage.setItem('nexus_consent_opfs', 'true');
      setIsVisible(false);
    } catch {
      setIsVisible(false);
    }
  };

  const handleEssentialOnly = () => {
    try {
      localStorage.setItem('nexus_cookie_consent', 'essential_only');
      localStorage.setItem('nexus_consent_cache_storage', 'false');
      localStorage.setItem('nexus_consent_opfs', 'false');
      setIsVisible(false);
    } catch {
      setIsVisible(false);
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-[200]"
        >
          <div className="p-4 sm:p-5 rounded-2xl bg-card/95 border border-white/40 dark:border-white/10 shadow-2xl backdrop-blur-xl text-text space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-accent/15 text-accent flex items-center justify-center shrink-0">
                  <Cookie className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-text flex items-center gap-1.5">
                    Zero-Tracking & Storage Notice
                    <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-success/15 text-success">
                      No Trackers
                    </span>
                  </h4>
                  <p className="text-[11px] text-muted">
                    We do not use advertising or tracking cookies.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsVisible(false)}
                className="text-muted hover:text-text p-1 rounded-lg hover:bg-white/10 transition-colors"
                title="Dismiss banner"
                aria-label="Dismiss cookie notice"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-text/80 leading-relaxed">
              Quantum Link stores essential connection parameters and offline sandbox file cache directly on your device disk. No personal data ever touches a remote server.
            </p>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                onClick={onOpenLegal}
                className="text-[11px] text-accent hover:underline flex items-center gap-1 cursor-pointer font-medium"
              >
                <span>Review Full Legal & Privacy Hub</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleEssentialOnly}
                  className="px-3 py-1.5 rounded-xl bg-white/20 dark:bg-white/5 hover:bg-white/30 text-text text-xs font-semibold border border-white/20 dark:border-white/10 transition-colors cursor-pointer"
                >
                  Essential Only
                </button>
                <button
                  type="button"
                  onClick={handleAcceptAll}
                  className="px-3.5 py-1.5 rounded-xl bg-accent text-white hover:bg-accent/90 text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  Accept All
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
