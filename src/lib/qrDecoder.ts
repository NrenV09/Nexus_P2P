import jsQR from 'jsqr';

export interface QRPoint {
  x: number;
  y: number;
}

export interface QRDecodeResult {
  data: string;
  engine: 'jsqr' | 'barcode-detector';
  /** Normalized corner coordinates (0..1) relative to the source video/image dimensions */
  corners?: [QRPoint, QRPoint, QRPoint, QRPoint];
}

interface NativeBarcodeResult {
  rawValue?: string;
  cornerPoints?: Array<{ x: number; y: number }>;
}

interface NativeBarcodeDetector {
  detect(source: ImageBitmapSource): Promise<NativeBarcodeResult[]>;
}

interface NativeBarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): NativeBarcodeDetector;
  getSupportedFormats?: () => Promise<string[]>;
}

let nativeDetectorPromise: Promise<NativeBarcodeDetector | null> | null = null;
let nativeDetectorDisabled = false;

/**
 * Safely initializes the browser's native BarcodeDetector ONLY if supported.
 * If it fails at runtime (e.g. offline MLKit module missing on Android Chrome),
 * it is automatically disabled and scanning continues seamlessly with pure-JS jsQR.
 */
async function getNativeDetector(): Promise<NativeBarcodeDetector | null> {
  if (nativeDetectorDisabled || typeof window === 'undefined') return null;
  if (nativeDetectorPromise) return nativeDetectorPromise;

  nativeDetectorPromise = (async () => {
    try {
      const DetectorCtor = (window as unknown as { BarcodeDetector?: NativeBarcodeDetectorConstructor }).BarcodeDetector;
      if (!DetectorCtor) return null;

      if (typeof DetectorCtor.getSupportedFormats === 'function') {
        const formats = await DetectorCtor.getSupportedFormats();
        if (!formats.includes('qr_code')) {
          return null;
        }
      }

      return new DetectorCtor({ formats: ['qr_code'] });
    } catch {
      nativeDetectorDisabled = true;
      return null;
    }
  })();

  return nativeDetectorPromise;
}

/**
 * Applies lightweight contrast stretching in-place on an RGBA ImageData buffer
 * to improve decoding of screen-to-screen QR codes with glare or dim lighting.
 */
function enhanceContrastInPlace(data: Uint8ClampedArray): void {
  let minLuma = 255;
  let maxLuma = 0;

  // Sample every 4th pixel for fast histogram bounds
  for (let i = 0; i < data.length; i += 16) {
    const luma = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    if (luma < minLuma) minLuma = luma;
    if (luma > maxLuma) maxLuma = luma;
  }

  const range = maxLuma - minLuma;
  if (range < 16) return;

  // Stretch contrast slightly beyond bounds for crisp dark/light module separation
  const low = minLuma + range * 0.08;
  const high = maxLuma - range * 0.08;
  const scale = 255 / Math.max(1, high - low);

  for (let i = 0; i < data.length; i += 4) {
    const luma = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    const stretched = Math.max(0, Math.min(255, ((luma - low) * scale) | 0));
    data[i] = stretched;
    data[i + 1] = stretched;
    data[i + 2] = stretched;
  }
}

function normalizeJsQRCorners(
  loc: {
    topLeftCorner: QRPoint;
    topRightCorner: QRPoint;
    bottomRightCorner: QRPoint;
    bottomLeftCorner: QRPoint;
  },
  cropX: number,
  cropY: number,
  scaleX: number,
  scaleY: number,
  srcW: number,
  srcH: number
): [QRPoint, QRPoint, QRPoint, QRPoint] {
  const mapPt = (pt: QRPoint): QRPoint => ({
    x: (cropX + pt.x * scaleX) / srcW,
    y: (cropY + pt.y * scaleY) / srcH,
  });

  return [
    mapPt(loc.topLeftCorner),
    mapPt(loc.topRightCorner),
    mapPt(loc.bottomRightCorner),
    mapPt(loc.bottomLeftCorner),
  ];
}

/**
 * Reusable offscreen canvas holder to avoid allocating canvases on every animation frame.
 */
export class OfflineQRFrameDecoder {
  private fullCanvas: HTMLCanvasElement;
  private fullCtx: CanvasRenderingContext2D | null;
  private cropCanvas: HTMLCanvasElement;
  private cropCtx: CanvasRenderingContext2D | null;
  private frameCounter = 0;

  constructor() {
    this.fullCanvas = document.createElement('canvas');
    this.fullCtx = this.fullCanvas.getContext('2d', { willReadFrequently: true });
    this.cropCanvas = document.createElement('canvas');
    this.cropCtx = this.cropCanvas.getContext('2d', { willReadFrequently: true });
  }

  /**
   * Decodes a QR code directly from a live HTMLVideoElement using 100% offline decoding.
   * Preserves native aspect ratio and runs both full-frame and high-res center-ROI passes.
   */
  async decodeVideoFrame(video: HTMLVideoElement): Promise<QRDecodeResult | null> {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh || video.readyState < 2) return null;

    this.frameCounter++;

    // Pass 0 (optional fast hardware path): Native BarcodeDetector if available and healthy
    if (!nativeDetectorDisabled && this.frameCounter % 2 === 1) {
      const detector = await getNativeDetector();
      if (detector) {
        try {
          const barcodes = await detector.detect(video);
          if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
            const pts = barcodes[0].cornerPoints;
            const corners: [QRPoint, QRPoint, QRPoint, QRPoint] | undefined =
              pts && pts.length >= 4
                ? [
                    { x: pts[0].x / vw, y: pts[0].y / vh },
                    { x: pts[1].x / vw, y: pts[1].y / vh },
                    { x: pts[2].x / vw, y: pts[2].y / vh },
                    { x: pts[3].x / vw, y: pts[3].y / vh },
                  ]
                : undefined;

            return {
              data: barcodes[0].rawValue,
              engine: 'barcode-detector',
              corners,
            };
          }
        } catch {
          // Disable native detector for this session so offline scanning never stalls
          nativeDetectorDisabled = true;
        }
      }
    }

    // Pass 1: Center high-res square ROI at native resolution (ideal for dense WebRTC SDP QR codes)
    if (this.cropCtx) {
      const minDim = Math.min(vw, vh);
      const cropSize = Math.floor(minDim * 0.78);
      const sx = Math.floor((vw - cropSize) / 2);
      const sy = Math.floor((vh - cropSize) / 2);
      const targetSize = Math.min(cropSize, 960);

      if (this.cropCanvas.width !== targetSize || this.cropCanvas.height !== targetSize) {
        this.cropCanvas.width = targetSize;
        this.cropCanvas.height = targetSize;
      }

      this.cropCtx.drawImage(video, sx, sy, cropSize, cropSize, 0, 0, targetSize, targetSize);
      const cropImg = this.cropCtx.getImageData(0, 0, targetSize, targetSize);

      const cropHit = jsQR(cropImg.data, targetSize, targetSize, {
        inversionAttempts: 'attemptBoth',
      });
      if (cropHit?.data) {
        const scale = cropSize / targetSize;
        return {
          data: cropHit.data,
          engine: 'jsqr',
          corners: normalizeJsQRCorners(cropHit.location, sx, sy, scale, scale, vw, vh),
        };
      }

      // Contrast-boosted center pass on alternate frames (defeats screen glare / dim light)
      if (this.frameCounter % 2 === 0) {
        enhanceContrastInPlace(cropImg.data);
        const boostedHit = jsQR(cropImg.data, targetSize, targetSize, {
          inversionAttempts: 'attemptBoth',
        });
        if (boostedHit?.data) {
          const scale = cropSize / targetSize;
          return {
            data: boostedHit.data,
            engine: 'jsqr',
            corners: normalizeJsQRCorners(boostedHit.location, sx, sy, scale, scale, vw, vh),
          };
        }
      }
    }

    // Pass 2: Full frame pass preserving exact aspect ratio (catches QR codes not perfectly centered)
    if (this.fullCtx) {
      const maxDim = 960;
      const scaleDown = Math.min(1, maxDim / Math.max(vw, vh));
      const dw = Math.max(1, Math.round(vw * scaleDown));
      const dh = Math.max(1, Math.round(vh * scaleDown));

      if (this.fullCanvas.width !== dw || this.fullCanvas.height !== dh) {
        this.fullCanvas.width = dw;
        this.fullCanvas.height = dh;
      }

      this.fullCtx.drawImage(video, 0, 0, vw, vh, 0, 0, dw, dh);
      const fullImg = this.fullCtx.getImageData(0, 0, dw, dh);

      const fullHit = jsQR(fullImg.data, dw, dh, {
        inversionAttempts: 'attemptBoth',
      });
      if (fullHit?.data) {
        return {
          data: fullHit.data,
          engine: 'jsqr',
          corners: normalizeJsQRCorners(
            fullHit.location,
            0,
            0,
            vw / dw,
            vh / dh,
            vw,
            vh
          ),
        };
      }
    }

    return null;
  }
}

/**
 * Loads an image File/Blob completely offline into an HTMLImageElement or ImageBitmap.
 */
async function loadOfflineImage(file: Blob): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fallback to ObjectURL + Image below
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({
        source: img,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        cleanup: () => URL.revokeObjectURL(url),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Unable to decode image file.'));
    };
    img.src = url;
  });
}

/**
 * 100% offline QR code decoder for uploaded photos, camera captures, or screenshots.
 * Tries multiple scales, center crop, and contrast enhancement for maximum reliability.
 */
export async function decodeQRFromFile(file: Blob): Promise<QRDecodeResult | null> {
  const loaded = await loadOfflineImage(file);

  try {
    const { source, width, height } = loaded;
    if (!width || !height) return null;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    // 1. Try native BarcodeDetector first if supported
    const detector = await getNativeDetector();
    if (detector) {
      try {
        const barcodes = await detector.detect(source as ImageBitmapSource);
        if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
          return {
            data: barcodes[0].rawValue,
            engine: 'barcode-detector',
          };
        }
      } catch {
        nativeDetectorDisabled = true;
      }
    }

    // 2. Multi-scale jsQR passes (native/high-res, medium, and downscaled for noisy phone photos)
    const maxDims = [Math.min(Math.max(width, height), 1800), 1200, 800, 500];
    const seenDims = new Set<string>();

    for (const maxDim of maxDims) {
      const scale = Math.min(1, maxDim / Math.max(width, height));
      const dw = Math.max(1, Math.round(width * scale));
      const dh = Math.max(1, Math.round(height * scale));
      const key = `${dw}x${dh}`;
      if (seenDims.has(key)) continue;
      seenDims.add(key);

      canvas.width = dw;
      canvas.height = dh;
      // Paint white background first in case the image is a transparent PNG/SVG
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, dw, dh);
      ctx.drawImage(source, 0, 0, width, height, 0, 0, dw, dh);

      const imageData = ctx.getImageData(0, 0, dw, dh);
      const hit = jsQR(imageData.data, dw, dh, { inversionAttempts: 'attemptBoth' });
      if (hit?.data) {
        return { data: hit.data, engine: 'jsqr' };
      }

      // Contrast-boosted pass on the same buffer
      enhanceContrastInPlace(imageData.data);
      const boostedHit = jsQR(imageData.data, dw, dh, { inversionAttempts: 'attemptBoth' });
      if (boostedHit?.data) {
        return { data: boostedHit.data, engine: 'jsqr' };
      }
    }

    // 3. Center square crop pass for photos taken from further away
    const minDim = Math.min(width, height);
    const cropSize = Math.floor(minDim * 0.72);
    const sx = Math.floor((width - cropSize) / 2);
    const sy = Math.floor((height - cropSize) / 2);
    const targetSize = Math.min(cropSize, 1200);

    if (targetSize >= 64) {
      canvas.width = targetSize;
      canvas.height = targetSize;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, targetSize, targetSize);
      ctx.drawImage(source, sx, sy, cropSize, cropSize, 0, 0, targetSize, targetSize);

      const cropData = ctx.getImageData(0, 0, targetSize, targetSize);
      const cropHit = jsQR(cropData.data, targetSize, targetSize, { inversionAttempts: 'attemptBoth' });
      if (cropHit?.data) {
        return { data: cropHit.data, engine: 'jsqr' };
      }

      enhanceContrastInPlace(cropData.data);
      const boostedCropHit = jsQR(cropData.data, targetSize, targetSize, { inversionAttempts: 'attemptBoth' });
      if (boostedCropHit?.data) {
        return { data: boostedCropHit.data, engine: 'jsqr' };
      }
    }

    return null;
  } finally {
    loaded.cleanup();
  }
}
