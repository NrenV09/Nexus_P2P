import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, SwitchCamera, Flashlight, FlashlightOff, ImagePlus, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { OfflineQRFrameDecoder, decodeQRFromFile, QRPoint } from '../lib/qrDecoder';

interface QRScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (data: string) => void;
  title?: string;
}

type FacingMode = 'environment' | 'user';

export const QRScanner: React.FC<QRScannerProps> = ({ isOpen, onClose, onScan, title }) => {
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string>('Initializing camera...');
  const [cameraReady, setCameraReady] = useState(false);
  const [facingMode, setFacingMode] = useState<FacingMode>('environment');
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceIndex, setActiveDeviceIndex] = useState<number>(-1);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [scanSuccess, setScanSuccess] = useState(false);
  const [detectedCorners, setDetectedCorners] = useState<[QRPoint, QRPoint, QRPoint, QRPoint] | null>(null);
  const [isDecodingImage, setIsDecodingImage] = useState(false);
  const [restartToken, setRestartToken] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const decoderRef = useRef<OfflineQRFrameDecoder | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const onScanRef = useRef(onScan);
  const hasScannedRef = useRef(false);
  const isDecodingFrameRef = useRef(false);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore track stop error
        }
      });
      streamRef.current = null;
    }

    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      } catch {
        // ignore video reset error
      }
    }

    setCameraReady(false);
    setTorchSupported(false);
    setTorchOn(false);
  }, []);

  const projectCornersToSquareCover = useCallback(
    (corners: [QRPoint, QRPoint, QRPoint, QRPoint]): [QRPoint, QRPoint, QRPoint, QRPoint] => {
      const video = videoRef.current;
      if (!video || !video.videoWidth || !video.videoHeight) return corners;
      const vw = video.videoWidth;
      const vh = video.videoHeight;

      const mapPoint = (p: QRPoint): QRPoint => {
        if (vw > vh) {
          const offsetX = (vw - vh) / 2;
          return {
            x: (p.x * vw - offsetX) / vh,
            y: p.y,
          };
        }
        if (vh > vw) {
          const offsetY = (vh - vw) / 2;
          return {
            x: p.x,
            y: (p.y * vh - offsetY) / vw,
          };
        }
        return p;
      };

      return [
        mapPoint(corners[0]),
        mapPoint(corners[1]),
        mapPoint(corners[2]),
        mapPoint(corners[3]),
      ];
    },
    []
  );

  const deliverScanResult = useCallback(
    (decodedText: string, corners?: [QRPoint, QRPoint, QRPoint, QRPoint]) => {
      if (hasScannedRef.current) return;
      hasScannedRef.current = true;
      setScanSuccess(true);
      if (corners) {
        setDetectedCorners(projectCornersToSquareCover(corners));
      }
      setStatusText('QR Code Locked');

      try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(75);
        }
      } catch {
        // ignore vibration error
      }

      // Brief visual lock confirmation before closing/handing off
      window.setTimeout(() => {
        stopCamera();
        onScanRef.current(decodedText);
      }, 180);
    },
    [stopCamera]
  );

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setError(null);
      setScanSuccess(false);
      setDetectedCorners(null);
      hasScannedRef.current = false;
      return;
    }

    let cancelled = false;
    hasScannedRef.current = false;
    isDecodingFrameRef.current = false;
    setError(null);
    setScanSuccess(false);
    setDetectedCorners(null);
    setCameraReady(false);
    setStatusText('Opening offline camera...');

    if (!decoderRef.current) {
      decoderRef.current = new OfflineQRFrameDecoder();
    }

    const startCamera = async () => {
      // Check secure context / MediaDevices availability
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== 'function'
      ) {
        if (!cancelled) {
          setError(
            'Live camera requires HTTPS or localhost in this browser. Tap "Scan Image" below to take a photo or pick a QR screenshot offline.'
          );
          setStatusText('Camera unavailable');
        }
        return;
      }

      // Build progressive constraint fallback list so desktop, Android, and iOS/iPadOS all succeed
      const selectedDevice =
        activeDeviceIndex >= 0 && videoDevices[activeDeviceIndex]
          ? videoDevices[activeDeviceIndex]
          : null;

      const constraintAttempts: MediaStreamConstraints[] = [];

      if (selectedDevice) {
        constraintAttempts.push({
          audio: false,
          video: {
            deviceId: { exact: selectedDevice.deviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
      }

      constraintAttempts.push(
        {
          audio: false,
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        {
          audio: false,
          video: {
            facingMode,
          },
        },
        {
          audio: false,
          video: true,
        }
      );

      let stream: MediaStream | null = null;
      let lastErr: unknown = null;

      for (const constraints of constraintAttempts) {
        if (cancelled) return;
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (stream) break;
        } catch (err) {
          lastErr = err;
        }
      }

      if (cancelled) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }

      if (!stream) {
        const errName = (lastErr as { name?: string })?.name || '';
        if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
          setError(
            'Camera permission was denied. Allow camera access or use "Scan Image" below to scan offline from a photo.'
          );
        } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
          setError(
            'No camera detected on this device. Use "Scan Image" below to decode a QR screenshot or photo offline.'
          );
        } else {
          setError(
            'Unable to start live camera. Retry or tap "Scan Image" below to decode a QR photo offline.'
          );
        }
        setStatusText('Camera unavailable');
        return;
      }

      streamRef.current = stream;

      // Inspect camera capabilities (autofocus + torch)
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          const capabilities =
            typeof videoTrack.getCapabilities === 'function'
              ? (videoTrack.getCapabilities() as MediaTrackCapabilities & {
                  torch?: boolean;
                  focusMode?: string[];
                })
              : null;

          if (capabilities?.torch) {
            setTorchSupported(true);
          }

          if (
            capabilities?.focusMode &&
            capabilities.focusMode.includes('continuous') &&
            typeof videoTrack.applyConstraints === 'function'
          ) {
            await videoTrack
              .applyConstraints({
                advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
              })
              .catch(() => {});
          }
        } catch {
          // Ignore unsupported camera constraints
        }
      }

      // Enumerate cameras once permission is granted (so labels/devices are populated)
      if (navigator.mediaDevices.enumerateDevices) {
        navigator.mediaDevices
          .enumerateDevices()
          .then((devices) => {
            if (cancelled) return;
            const cams = devices.filter((d) => d.kind === 'videoinput');
            setVideoDevices(cams);
          })
          .catch(() => {});
      }

      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('muted', 'true');
      video.muted = true;

      try {
        await video.play();
      } catch (playErr) {
        console.warn('Video autoplay warning:', playErr);
      }

      if (cancelled) {
        stopCamera();
        return;
      }

      setCameraReady(true);
      setStatusText('Align QR code in frame');

      // Start offline decoding loop (~12-15fps throttled so mobile CPUs stay cool and smooth)
      let lastDecodeAt = 0;
      const MIN_INTERVAL_MS = 75;

      const scanLoop = (now: number) => {
        if (cancelled || hasScannedRef.current) return;

        if (
          !isDecodingFrameRef.current &&
          now - lastDecodeAt >= MIN_INTERVAL_MS &&
          videoRef.current &&
          videoRef.current.readyState >= 2 &&
          videoRef.current.videoWidth > 0 &&
          decoderRef.current
        ) {
          isDecodingFrameRef.current = true;
          lastDecodeAt = now;

          decoderRef.current
            .decodeVideoFrame(videoRef.current)
            .then((result) => {
              if (!cancelled && result?.data && !hasScannedRef.current) {
                deliverScanResult(result.data, result.corners);
              }
            })
            .catch(() => {
              // ignore individual frame decode failures
            })
            .finally(() => {
              isDecodingFrameRef.current = false;
            });
        }

        if (!cancelled && !hasScannedRef.current) {
          rafRef.current = requestAnimationFrame(scanLoop);
        }
      };

      rafRef.current = requestAnimationFrame(scanLoop);
    };

    startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [isOpen, facingMode, activeDeviceIndex, restartToken, stopCamera, deliverScanResult]);

  const handleToggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || typeof track.applyConstraints !== 'function') return;
    const nextState = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: nextState } as MediaTrackConstraintSet],
      });
      setTorchOn(nextState);
    } catch {
      setTorchSupported(false);
    }
  };

  const handleSwitchCamera = () => {
    if (videoDevices.length > 1) {
      setActiveDeviceIndex((prev) => {
        const next = prev < 0 ? 1 : (prev + 1) % videoDevices.length;
        return next;
      });
    } else {
      setActiveDeviceIndex(-1);
      setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset input so selecting the same image again still fires onChange
    e.target.value = '';
    if (!file) return;

    setIsDecodingImage(true);
    setError(null);
    setStatusText('Decoding image offline...');

    try {
      const result = await decodeQRFromFile(file);
      if (result?.data) {
        deliverScanResult(result.data);
      } else {
        setError(
          'No QR code found in that image. Make sure the full QR code and white border are clearly visible and well-lit.'
        );
        setStatusText(cameraReady ? 'Align QR code in frame' : 'Ready to scan image');
      }
    } catch {
      setError('Could not read the selected image file. Try a PNG or JPG screenshot/photo.');
      setStatusText(cameraReady ? 'Align QR code in frame' : 'Ready to scan image');
    } finally {
      setIsDecodingImage(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Offline QR Scanner'}
    >
      <div className="relative w-full max-w-md bg-zinc-950 border border-white/15 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-black/70 border-b border-white/10 z-20">
          <div className="flex items-center gap-2.5">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                scanSuccess
                  ? 'bg-emerald-400 shadow-[0_0_10px_#34d399]'
                  : cameraReady
                    ? 'bg-cyan-400 animate-pulse'
                    : 'bg-amber-400'
              }`}
            />
            <span className="text-xs font-semibold tracking-wider uppercase text-white/90">
              {title || 'Offline QR Scanner'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {torchSupported && (
              <button
                type="button"
                onClick={handleToggleTorch}
                title={torchOn ? 'Turn off flashlight' : 'Turn on flashlight'}
                className={`p-2 rounded-full transition-colors cursor-pointer ${
                  torchOn
                    ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                    : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
              >
                {torchOn ? <FlashlightOff className="w-4 h-4" /> : <Flashlight className="w-4 h-4" />}
              </button>
            )}

            <button
              type="button"
              onClick={handleSwitchCamera}
              title="Switch camera"
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            >
              <SwitchCamera className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onClose}
              title="Close scanner"
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Camera viewport */}
        <div className="relative w-full aspect-square bg-black overflow-hidden">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full h-full object-cover"
          />

          {/* Detected QR polygon highlight */}
          {detectedCorners && (
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 w-full h-full pointer-events-none z-10"
            >
              <polygon
                points={detectedCorners
                  .map((p) => `${(p.x * 100).toFixed(2)},${(p.y * 100).toFixed(2)}`)
                  .join(' ')}
                fill="rgba(16, 185, 129, 0.22)"
                stroke="#34d399"
                strokeWidth="1.2"
              />
            </svg>
          )}

          {/* Viewfinder reticle overlay */}
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10">
            <div
              className={`relative w-60 h-60 sm:w-64 sm:h-64 rounded-3xl transition-all duration-150 ${
                scanSuccess
                  ? 'border-2 border-emerald-400 bg-emerald-500/15 shadow-[0_0_40px_rgba(52,211,153,0.45)]'
                  : 'border border-white/25 shadow-[0_0_0_9999px_rgba(0,0,0,0.42)]'
              }`}
            >
              {/* Crisp corner brackets */}
              <span className={`absolute -top-0.5 -left-0.5 w-7 h-7 border-t-[3px] border-l-[3px] rounded-tl-2xl ${scanSuccess ? 'border-emerald-400' : 'border-cyan-400'}`} />
              <span className={`absolute -top-0.5 -right-0.5 w-7 h-7 border-t-[3px] border-r-[3px] rounded-tr-2xl ${scanSuccess ? 'border-emerald-400' : 'border-cyan-400'}`} />
              <span className={`absolute -bottom-0.5 -left-0.5 w-7 h-7 border-b-[3px] border-l-[3px] rounded-bl-2xl ${scanSuccess ? 'border-emerald-400' : 'border-cyan-400'}`} />
              <span className={`absolute -bottom-0.5 -right-0.5 w-7 h-7 border-b-[3px] border-r-[3px] rounded-br-2xl ${scanSuccess ? 'border-emerald-400' : 'border-cyan-400'}`} />

              {/* Animated laser scan line while active */}
              {cameraReady && !scanSuccess && (
                <div className="absolute inset-x-3 h-0.5 bg-cyan-400/90 shadow-[0_0_12px_#22d3ee] animate-[scan_1.8s_ease-in-out_infinite]" />
              )}

              {scanSuccess && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <CheckCircle2 className="w-14 h-14 text-emerald-400 drop-shadow-lg" />
                </div>
              )}
            </div>

            <div className="mt-5 px-4 py-1.5 rounded-full bg-black/70 border border-white/15 backdrop-blur-md text-[11px] font-semibold tracking-widest uppercase text-white/90">
              {statusText}
            </div>
          </div>

          {/* Error banner overlay */}
          {error && (
            <div className="absolute inset-x-3 bottom-3 z-20 bg-zinc-950/95 border border-red-500/40 text-red-200 p-3.5 rounded-2xl text-xs leading-relaxed shadow-xl flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">{error}</div>
            </div>
          )}
        </div>

        {/* Bottom offline controls bar */}
        <div className="p-3.5 bg-zinc-950 border-t border-white/10 flex items-center gap-2.5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />

          <button
            type="button"
            disabled={isDecodingImage}
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 active:scale-[0.99] border border-white/15 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            <ImagePlus className="w-4 h-4 text-cyan-400" />
            <span>{isDecodingImage ? 'Decoding Image...' : 'Scan from Photo / Image'}</span>
          </button>

          {error && (
            <button
              type="button"
              onClick={() => setRestartToken((t) => t + 1)}
              title="Retry camera"
              className="py-2.5 px-3.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/30 text-cyan-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
