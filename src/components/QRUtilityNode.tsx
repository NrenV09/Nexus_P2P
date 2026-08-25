import React, { useState, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { motion } from 'motion/react';
import { Type, Maximize2, RefreshCw, Copy, Check, Eye, Download, X, GripHorizontal } from 'lucide-react';
import { cn } from '../lib/utils';

export const QRUtilityNode: React.FC = () => {
  const [data, setData] = useState("https://nexus.p2p");
  const [copied, setCopied] = useState(false);
  const [size, setSize] = useState(256);
  const qrRef = useRef<SVGSVGElement>(null);
  const [preview, setPreview] = useState<{ url: string; type: string; filename: string } | null>(null);

  const generatePreview = (type: 'png' | 'svg') => {
    const svg = qrRef.current;
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const fileName = `nexus_qr_${Date.now()}.${type}`;

    if (type === 'svg') {
      const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      setPreview({ url, type: 'svg', filename: fileName });
    } else {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        canvas.width = size;
        canvas.height = size;
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            setPreview({ url, type: 'png', filename: fileName });
          }
        });
      };
      img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(data);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="grid grid-cols-12 gap-6 h-full overflow-y-auto pb-20 lg:pb-0 relative"
    >
      <div className="col-span-12 lg:col-span-5 flex flex-col gap-6">
        {/* Source Data Input */}
        <div className="glass-panel p-6 flex flex-col shadow-sm">
          <div className="flex items-center gap-2 mb-4 text-text">
            <Type className="w-5 h-5 text-accent" />
            <h3 className="text-sm font-semibold">Source Data</h3>
          </div>
          
          <textarea 
            value={data}
            onChange={(e) => setData(e.target.value)}
            placeholder="Enter URL or text to encode..."
            className="w-full bg-white/40 dark:bg-transparent border border-white/50 dark:border-transparent dark:border-white/10 dark:border-transparent text-text p-4 rounded-2xl min-h-[120px] outline-none focus:border-accent resize-none placeholder:text-muted/70 mb-4 shadow-inner"
          />

          <div className="flex justify-between items-center bg-white/30 dark:bg-transparent p-2.5 rounded-xl border border-white/40 dark:border-transparent dark:border-white/10 dark:border-transparent ">
            <span className="text-xs text-muted ml-2 font-medium">Length: {data.length} characters</span>
            <button 
              onClick={() => setData("")}
              className="text-xs text-red-500 hover:text-red-600 transition-colors flex items-center gap-1 font-medium bg-red-50/50 hover:bg-red-50 px-3 py-1.5 rounded-lg"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Clear
            </button>
          </div>
        </div>

        {/* Config Panel */}
        <div className="glass-panel p-6 flex-1 flex flex-col shadow-sm">
          <div className="flex items-center gap-2 mb-6 text-text">
            <Maximize2 className="w-5 h-5 text-muted" />
            <h3 className="text-sm font-semibold">Configuration</h3>
          </div>

          <div className="space-y-6">
            <div>
              <div className="flex justify-between text-xs font-medium text-muted mb-3">
                <span>Output Dimension</span>
                <span className="text-accent">{size}px</span>
              </div>
              <input 
                type="range"
                min="128"
                max="1024"
                step="32"
                value={size}
                onChange={(e) => setSize(parseInt(e.target.value))}
                className="w-full accent-accent bg-black/10 dark:bg-white/20 h-2 rounded-full cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <button 
                onClick={copyToClipboard}
                className="flex flex-col items-center justify-center gap-2 py-4 rounded-2xl bg-white/40 dark:bg-transparent border border-white/50 dark:border-transparent dark:border-white/10 dark:border-transparent hover:bg-white/60 dark:bg-transparent hover:text-accent transition-all text-xs font-semibold text-text shadow-sm"
              >
                {copied ? <Check className="w-5 h-5 text-success" /> : <Copy className="w-5 h-5" />}
                Copy Raw
              </button>
              <button 
                onClick={() => generatePreview('png')}
                className="flex flex-col items-center justify-center gap-2 py-4 rounded-2xl bg-white/40 dark:bg-transparent border border-white/50 dark:border-transparent dark:border-white/10 dark:border-transparent hover:bg-white/60 dark:bg-transparent transition-all text-xs font-semibold text-text shadow-sm"
              >
                <Eye className="w-5 h-5 text-accent" />
                PNG Export
              </button>
              <button 
                onClick={() => generatePreview('svg')}
                className="flex flex-col items-center justify-center gap-2 py-4 rounded-2xl bg-white/40 dark:bg-transparent border border-white/50 dark:border-transparent dark:border-white/10 dark:border-transparent hover:bg-white/60 dark:bg-transparent transition-all text-xs font-semibold text-text shadow-sm"
              >
                <Eye className="w-5 h-5 text-success" />
                SVG Export
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Viewport */}
      <div className="col-span-12 lg:col-span-7 glass-panel relative flex items-center justify-center overflow-hidden p-12 min-h-[400px] shadow-sm">
        <div className="absolute top-6 left-6 text-xs text-muted flex items-center gap-2 font-medium">
          <div className="h-2.5 w-2.5 rounded-full bg-success animate-pulse" />
          Live Preview
        </div>

        <div className="bg-white dark:bg-white p-4 sm:p-6 rounded-3xl relative shadow-[0_12px_48px_rgba(0,0,0,0.1)] group transition-transform hover:scale-[1.02] w-fit max-w-full flex items-center justify-center aspect-square mx-auto">
          <QRCodeSVG 
            ref={qrRef}
            value={data || " "}
            size={size}
            level="H"
            includeMargin={false}
            style={{ width: '100%', height: '100%', maxWidth: `${size}px`, maxHeight: `${size}px` }}
          />
        </div>
      </div>

      {/* Preview Overlay */}
      {preview && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 z-50 bg-white dark:bg-zinc-950 flex flex-col p-4 sm:p-8 border border-white/50 dark:border-white/10 shadow-2xl rounded-3xl overflow-y-auto"
        >
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0 mb-6 border-b border-white/30 dark:border-transparent dark:border-white/10 dark:border-transparent pb-6">
            <div className="flex flex-col">
              <h2 className="text-xl sm:text-2xl font-bold text-text">QR Export Preview</h2>
              <p className="text-xs sm:text-sm text-muted mt-1 font-medium">
                Drag image to save • Format: {preview.type.toUpperCase()}
              </p>
            </div>

            <div className="flex flex-wrap sm:flex-nowrap gap-3 w-full sm:w-auto">
              <a 
                href={preview.url} 
                download={preview.filename}
                className="flex-1 sm:flex-none justify-center flex items-center gap-2 py-2 px-4 sm:py-2.5 sm:px-6 rounded-2xl bg-success text-white font-semibold text-sm hover:bg-green-600 transition-colors shadow-sm"
              >
                <Download className="w-4 h-4" /> Download
              </a>
              <button 
                onClick={() => setPreview(null)}
                className="flex-1 sm:flex-none justify-center flex items-center gap-2 py-2 px-4 sm:py-2.5 sm:px-6 rounded-2xl bg-white dark:bg-transparent border border-white/50 dark:border-transparent dark:border-white/10 dark:border-transparent text-text font-semibold text-sm hover:bg-gray-50 transition-colors shadow-sm"
              >
                <X className="w-4 h-4" /> Close
              </button>
            </div>
          </div>

          <div className="flex-1 border border-white/40 dark:border-transparent dark:border-white/10 dark:border-transparent bg-black/5 rounded-3xl flex items-center justify-center relative overflow-hidden group">
            <div className="absolute top-6 p-4 left-1/2 -translate-x-1/2 bg-white/80 dark:bg-transparent backdrop-blur-md border border-white px-5 py-2.5 rounded-full flex gap-2 items-center text-xs text-text font-semibold shadow-sm z-10 opacity-0 group-hover:opacity-100 transition-opacity">
              <GripHorizontal className="w-4 h-4" /> Drag to Desktop
            </div>
            <img 
              src={preview.url} 
              alt="QR Preview" 
              draggable={true}
              onDragStart={(e) => {
                e.dataTransfer.setData("DownloadURL", `image/${preview.type}:${preview.filename}:${preview.url}`);
              }}
              className="max-w-full max-h-full object-contain cursor-grab active:cursor-grabbing rounded-lg shadow-xl"
            />
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};
