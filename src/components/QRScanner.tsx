import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X } from 'lucide-react';

interface QRScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (data: string) => void;
}

export const QRScanner: React.FC<QRScannerProps> = ({ isOpen, onClose, onScan }) => {
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "qr-reader-container";

  useEffect(() => {
    if (isOpen) {
      setError(null);
      const html5QrCode = new Html5Qrcode(containerId);
      scannerRef.current = html5QrCode;

      const config = { 
        fps: 10,
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE]
      };

      html5QrCode.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
          onScan(decodedText);
          stopScanner();
        },
        () => {
          // ignore scan failures
        }
      ).catch((err) => {
        setError("Camera access failed. Check permissions.");
        console.error(err);
      });
    }

    return () => {
      stopScanner();
    };
  }, [isOpen]);

  const stopScanner = () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      scannerRef.current.stop().then(() => {
        scannerRef.current?.clear();
      }).catch(console.error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <div className="relative w-full max-w-md bg-white/10 dark:bg-transparent border border-white/20 dark:border-transparent dark:border-white/10 dark:border-transparent rounded-3xl overflow-hidden aspect-square shadow-2xl backdrop-blur-2xl">
        <div id={containerId} className="w-full h-full [&>video]:object-cover" />
        
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
          <div className="w-64 h-64 border-2 border-white/50 rounded-3xl shadow-[0_0_30px_rgba(255,255,255,0.2)] animate-pulse" />
          <div className="mt-8 text-white font-bold text-xs tracking-widest uppercase bg-black/40 backdrop-blur-md px-6 py-2.5 rounded-full shadow-xl border border-white/10">
            Scanning Code...
          </div>
        </div>

        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2.5 rounded-full bg-black/20 hover:bg-black/40 text-white backdrop-blur-md transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {error && (
          <div className="absolute bottom-4 inset-x-4 bg-red-100 backdrop-blur-sm text-red-600 font-medium p-4 rounded-2xl text-center text-sm shadow-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};
