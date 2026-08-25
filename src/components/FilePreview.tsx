import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, X, GripHorizontal, RefreshCw, Share, Link as LinkIcon, Check } from 'lucide-react';
import { formatBytes } from '../lib/utils';
import { FilePayload } from '../types';

interface FilePreviewProps {
  file: FilePayload | null;
  onClose: () => void;
}

export const FilePreview: React.FC<FilePreviewProps> = ({ file, onClose }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [dataUri, setDataUri] = useState<string | null>(null);
  const [isGeneratingURI, setIsGeneratingURI] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (file && file.blob) {
      const objectUrl = URL.createObjectURL(file.blob);
      setUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    } else {
      setUrl(null);
    }
  }, [file]);

  const handleGenerateBlobLink = () => {
    if (!file || !file.blob || isGeneratingURI) return;
    setIsGeneratingURI(true);
    const reader = new FileReader();
    reader.onload = () => {
      setDataUri(reader.result as string);
      setIsGeneratingURI(false);
    };
    reader.onerror = () => {
      setIsGeneratingURI(false);
    };
    reader.readAsDataURL(file.blob);
  };

  const handleShare = () => {
    if (!file || !file.blob || !navigator.share) return;
    const shareFile = new File([file.blob], file.name, { type: file.blob.type || "application/octet-stream" });
    if (navigator.canShare && navigator.canShare({ files: [shareFile] })) {
      navigator.share({
        title: file.name,
        files: [shareFile]
      }).catch(err => console.error("Share failed:", err));
    }
  };

  if (!file) return null;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-bg/95 backdrop-blur-xl flex flex-col p-4 md:p-12 overflow-hidden"
    >
      {/* Header */}
      <div className="flex flex-col bg-surface border border-border p-4 shadow-xl flex-shrink-0 gap-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex flex-col w-full sm:w-auto">
            <span className="text-[12px] font-bold text-accent uppercase tracking-widest truncate sm:max-w-md">
              {file.name}
            </span>
            <span className="text-[10px] text-muted tracking-wide">
              {file.blob?.type || "Unknown Type"} • Drag image/asset to extract
            </span>
          </div>

          <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-end">
            {navigator.share && file.blob && (
                <button 
                  onClick={handleShare}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500 text-blue-500 text-[10px] font-bold uppercase transition-colors hover:bg-blue-500/20"
                >
                  <Share className="w-4 h-4" /> Share
                </button>
            )}
            <button 
              onClick={handleGenerateBlobLink}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-accent/10 border border-accent text-accent text-[10px] font-bold uppercase transition-colors hover:bg-accent/20"
            >
              {isGeneratingURI ? <RefreshCw className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
              Extract Link
            </button>
            {url && (
              <a 
                href={url} 
                download={file.name}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-success/10 border border-success text-success text-[10px] font-bold uppercase transition-colors hover:bg-success/20"
              >
                <Download className="w-4 h-4" /> Download
              </a>
            )}
            <button 
              onClick={onClose}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500 text-red-500 text-[10px] font-bold uppercase transition-colors hover:bg-red-500/20"
            >
              <X className="w-4 h-4" /> Close
            </button>
          </div>
        </div>
        
        {/* Data URI Result Box */}
        <AnimatePresence>
          {dataUri && (
             <motion.div 
                initial={{ opacity: 0, height: 0 }} 
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="w-full flex gap-2 pt-2 border-t border-border mt-2"
             >
                <textarea 
                  readOnly 
                  value={dataUri} 
                  onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                  className="flex-1 bg-black/50 border border-border p-2 text-[10px] font-mono text-muted rounded min-w-0 resize-none h-12 scrollbar-hide break-all" 
                  placeholder="Blob URL..."
                />
                <button 
                  onClick={() => {
                     try {
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                           navigator.clipboard.writeText(dataUri);
                        } else {
                           const textArea = document.createElement("textarea");
                           textArea.value = dataUri;
                           textArea.style.position = "fixed";
                           textArea.style.left = "-999999px";
                           textArea.style.top = "-999999px";
                           document.body.appendChild(textArea);
                           textArea.focus();
                           textArea.select();
                           document.execCommand("copy");
                           textArea.remove();
                        }
                     } catch(e) {
                        console.error("Copy failed", e);
                     }
                     setCopied(true);
                     setTimeout(() => setCopied(false), 2000);
                  }}
                  className="px-4 py-2 bg-surface-brighter border border-border text-[10px] font-bold uppercase text-white hover:bg-white/10 transition-colors flex items-center gap-2"
                >
                  {copied ? <Check className="w-3 h-3 text-success" /> : <LinkIcon className="w-3 h-3" />}
                  {copied ? "Copied" : "Copy"}
                </button>
             </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden mt-4 border border-border bg-surface-brighter flex items-center justify-center relative p-4 md:p-8">
        {!url ? (
          <div className="text-muted flex items-center gap-3 animate-pulse">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span className="text-xs font-bold uppercase tracking-widest">Generating Preview Matrix...</span>
          </div>
        ) : (
          <>
            <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-bg px-4 py-1 border border-border rounded-full flex items-center gap-2 text-[9px] text-muted uppercase font-bold tracking-widest z-10 opacity-70">
              <GripHorizontal className="w-3 h-3" /> Draggable Asset
            </div>

            {file.blob?.type.startsWith('image/') ? (
              <a 
                href={url} 
                download={file.name} 
                className="contents" 
                style={{ WebkitTouchCallout: 'default' }}
              >
                <img 
                  src={url} 
                  alt={file.name} 
                  draggable={true}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("DownloadURL", `${file.blob?.type || "application/octet-stream"}:${file.name}:${url}`);
                    e.dataTransfer.setData("text/uri-list", url);
                  }}
                  className="max-w-full max-h-full object-contain cursor-grab active:cursor-grabbing shadow-2xl border border-border"
                />
              </a>
            ) : (
              <a 
                href={url} 
                download={file.name}
                draggable={true}
                onDragStart={(e) => {
                  e.dataTransfer.setData("DownloadURL", `${file.blob?.type || "application/octet-stream"}:${file.name}:${url}`);
                  e.dataTransfer.setData("text/uri-list", url);
                }}
                onPointerEnter={() => setIsHovered(true)}
                onPointerLeave={() => setIsHovered(false)}
                className={`text-center flex flex-col items-center p-6 md:p-12 bg-surface border rounded-xl cursor-grab active:cursor-grabbing transition-colors shadow-2xl w-full max-w-lg ${isHovered ? 'bg-surface-brighter border-accent' : 'border-border'}`}
              >
                <div className="w-20 h-20 md:w-32 md:h-32 mb-6 border-2 border-dashed border-accent text-accent rounded-xl flex items-center justify-center text-4xl md:text-6xl shadow-inner bg-bg">
                  {file.name.toLowerCase().endsWith('.pdf') ? '📄' : 
                   file.name.toLowerCase().endsWith('.html') || file.name.toLowerCase().endsWith('.htm') ? '🌐' :
                   file.name.toLowerCase().endsWith('.zip') || file.name.toLowerCase().endsWith('.rar') || file.name.toLowerCase().endsWith('.tar') || file.name.toLowerCase().endsWith('.gz') ? '🗜️' :
                   file.blob?.type.startsWith('video/') || file.name.toLowerCase().endsWith('.mp4') || file.name.toLowerCase().endsWith('.mov') ? '🎥' : '📦'}
                </div>
                <h3 className="text-lg md:text-2xl font-black text-white mb-2 break-all max-w-full">{file.name}</h3>
                <p className="text-[10px] md:text-[12px] text-muted tracking-widest uppercase font-bold mb-4">
                  {file.blob?.type || "Unknown Format"} • {formatBytes(file.size)}
                </p>
                <div className="text-[9px] md:text-[10px] bg-accent/20 text-accent px-4 py-2 rounded-full font-bold uppercase tracking-widest animate-pulse border border-accent/50">
                  Hold & Drag to extract file
                </div>
              </a>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
};
