import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, X, GripHorizontal, RefreshCw, Share, Link as LinkIcon, Check, Copy, FileText, Play, Pause, Volume2, Film } from 'lucide-react';
import { formatBytes } from '../lib/utils';
import { FilePayload } from '../types';
import { getOrStoreCache, getCachedBlob } from '../lib/cacheStorage';

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
  const [copiedText, setCopiedText] = useState(false);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isLoadingText, setIsLoadingText] = useState(false);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;
    setTextContent(null);

    if (file) {
      const mime = file.mimeType || file.blob?.type || '';
      const name = file.name.toLowerCase();
      const isPdf = mime === 'application/pdf' || name.endsWith('.pdf');
      const isHtml = mime === 'text/html' || name.endsWith('.html') || name.endsWith('.htm');
      
      const isText = !isPdf && !isHtml && (mime.startsWith('text/') ||
        mime.includes('json') ||
        name.endsWith('.txt') ||
        name.endsWith('.json') ||
        name.endsWith('.md') ||
        name.endsWith('.log') ||
        name.endsWith('.csv') ||
        name.endsWith('.js') ||
        name.endsWith('.ts'));

      if (isText && file.blob) {
        setIsLoadingText(true);
        file.blob.text().then(text => {
          if (active) {
            setTextContent(text);
            setIsLoadingText(false);
          }
        }).catch(err => {
          console.warn("Failed to read text preview:", err);
          if (active) setIsLoadingText(false);
        });
      }

      if (file.cacheUrl) {
        getOrStoreCache(file.cacheUrl, mime || 'application/octet-stream')
          .then(blobUrl => {
            if (active) {
              createdUrl = blobUrl;
              setUrl(blobUrl);
            }
          })
          .catch(err => {
            console.warn("getOrStoreCache preview fallback to blob:", err);
            if (active && file.blob) {
              const objectUrl = URL.createObjectURL(file.blob);
              createdUrl = objectUrl;
              setUrl(objectUrl);
            }
          });
      } else if (file.blob) {
        const objectUrl = URL.createObjectURL(file.blob);
        createdUrl = objectUrl;
        setUrl(objectUrl);
      }
    } else {
      setUrl(null);
    }

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
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

  const handleCopyText = () => {
    if (!textContent) return;
    navigator.clipboard.writeText(textContent).then(() => {
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    });
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

  const mime = (file.mimeType || file.blob?.type || '').toLowerCase();
  const name = file.name.toLowerCase();
  const isPdf = mime === 'application/pdf' || name.endsWith('.pdf');
  const isHtml = mime === 'text/html' || name.endsWith('.html') || name.endsWith('.htm');
  const isImage = !isPdf && !isHtml && (mime.startsWith('image/') || file.name.match(/\.(png|jpe?g|gif|svg|webp|bmp)$/i));
  const isVideo = mime.startsWith('video/') || file.name.match(/\.(mp4|webm|mov|mkv)$/i);
  const isAudio = mime.startsWith('audio/') || file.name.match(/\.(mp3|wav|ogg|m4a)$/i);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-bg/95 backdrop-blur-xl flex flex-col p-3 sm:p-6 md:p-10 overflow-hidden"
    >
      {/* Header */}
      <div className="flex flex-col bg-surface border border-border/80 rounded-2xl p-4 shadow-xl flex-shrink-0 gap-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex flex-col w-full sm:w-auto min-w-0">
            <span className="text-sm font-semibold text-text truncate sm:max-w-md">
              {file.name}
            </span>
            <span className="text-xs text-muted">
              {file.blob?.type || "File"} • {formatBytes(file.size)}
            </span>
          </div>

          <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-end">
            {textContent !== null && (
              <button
                onClick={handleCopyText}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400 text-xs font-semibold transition-colors hover:bg-purple-500/20 cursor-pointer"
              >
                {copiedText ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedText ? 'Copied' : 'Copy Text'}
              </button>
            )}

            {navigator.share && file.blob && (
              <button 
                onClick={handleShare}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-500 text-xs font-semibold transition-colors hover:bg-blue-500/20 cursor-pointer"
              >
                <Share className="w-3.5 h-3.5" /> Share
              </button>
            )}

            <button 
              onClick={handleGenerateBlobLink}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-accent/10 border border-accent/30 text-accent text-xs font-semibold transition-colors hover:bg-accent/20 cursor-pointer"
            >
              {isGeneratingURI ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <LinkIcon className="w-3.5 h-3.5" />}
              Extract Link
            </button>

            {url && (
              <a 
                href={url} 
                download={file.name}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs font-semibold transition-colors hover:bg-emerald-500/20 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </a>
            )}

            <button 
              onClick={onClose}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs font-semibold transition-colors hover:bg-red-500/20 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" /> Close
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
                className="w-full flex gap-2 pt-2 border-t border-border/60 mt-1"
             >
                <textarea 
                  readOnly 
                  value={dataUri} 
                  onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                  className="flex-1 bg-black/40 border border-border/80 p-2 text-xs font-mono text-muted rounded-xl min-w-0 resize-none h-12 scrollbar-hide break-all" 
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
                  className="px-3.5 py-1.5 bg-surface-brighter border border-border/80 rounded-xl text-xs font-semibold text-text hover:bg-white/10 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <LinkIcon className="w-3.5 h-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
             </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden mt-3 border border-border/80 rounded-2xl bg-surface-brighter flex items-center justify-center relative p-3 sm:p-6 md:p-8">
        {!url && !textContent ? (
          <div className="text-muted flex items-center gap-3 animate-pulse">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span className="text-xs font-bold uppercase tracking-widest">Generating Preview Matrix...</span>
          </div>
        ) : (
          <>
            <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-bg px-4 py-1 border border-border rounded-full flex items-center gap-2 text-[9px] text-muted uppercase font-bold tracking-widest z-10 opacity-70">
              <GripHorizontal className="w-3 h-3" /> Draggable Asset
            </div>

            {/* 0. PDF & HTML Explicitly Disabled Preview */}
            {isPdf ? (
              <div className="text-center flex flex-col items-center p-6 md:p-10 bg-surface border border-red-500/20 rounded-2xl shadow-2xl w-full max-w-lg">
                <div className="w-20 h-20 md:w-24 md:h-24 mb-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-500 flex items-center justify-center text-4xl md:text-5xl shadow-inner">
                  📄
                </div>
                <h3 className="text-lg md:text-xl font-bold text-text mb-1 break-all max-w-full">{file.name}</h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-red-500/15 text-red-500 border border-red-500/30 mb-3">
                  PDF Document • Preview Disabled
                </span>
                <p className="text-xs text-muted max-w-sm mb-5 leading-relaxed">
                  Document previews for PDF files are disabled to safeguard system stability and memory limits. Download to view directly in your system PDF reader.
                </p>
                {url && (
                  <a
                    href={url}
                    download={file.name}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white font-semibold text-xs shadow-md hover:bg-accent/90 transition-all cursor-pointer"
                  >
                    <Download className="w-4 h-4" /> Download PDF ({formatBytes(file.size)})
                  </a>
                )}
              </div>
            ) : isHtml ? (
              <div className="text-center flex flex-col items-center p-6 md:p-10 bg-surface border border-amber-500/20 rounded-2xl shadow-2xl w-full max-w-lg">
                <div className="w-20 h-20 md:w-24 md:h-24 mb-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-500 flex items-center justify-center text-4xl md:text-5xl shadow-inner">
                  🌐
                </div>
                <h3 className="text-lg md:text-xl font-bold text-text mb-1 break-all max-w-full">{file.name}</h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30 mb-3">
                  HTML Document • Preview Disabled
                </span>
                <p className="text-xs text-muted max-w-sm mb-5 leading-relaxed">
                  Document previews for HTML files are disabled to prevent script execution and preserve tab stability. Download to inspect or view safely.
                </p>
                {url && (
                  <a
                    href={url}
                    download={file.name}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white font-semibold text-xs shadow-md hover:bg-accent/90 transition-all cursor-pointer"
                  >
                    <Download className="w-4 h-4" /> Download HTML ({formatBytes(file.size)})
                  </a>
                )}
              </div>
            ) : isImage && url ? (
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
                  className="max-w-full max-h-full object-contain cursor-grab active:cursor-grabbing shadow-2xl border border-border rounded-xl"
                />
              </a>
            ) : isVideo && url ? (
              /* 2. Video Preview */
              <div className="w-full max-w-2xl max-h-full flex flex-col items-center justify-center">
                <video
                  src={url}
                  controls
                  autoPlay
                  playsInline
                  className="max-w-full max-h-[70vh] rounded-2xl shadow-2xl border border-border"
                />
              </div>
            ) : isAudio && url ? (
              /* 3. Audio Preview */
              <div className="w-full max-w-md bg-surface p-6 rounded-3xl border border-border shadow-2xl flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/30 text-accent flex items-center justify-center">
                  <Volume2 className="w-8 h-8 animate-pulse" />
                </div>
                <div className="text-center">
                  <h4 className="font-semibold text-text text-sm">{file.name}</h4>
                  <p className="text-xs text-muted mt-0.5">{formatBytes(file.size)}</p>
                </div>
                <audio src={url} controls autoPlay className="w-full mt-2" />
              </div>
            ) : textContent !== null ? (
              /* 4. Text / Code / JSON / Markdown Preview */
              <div className="w-full h-full max-w-4xl bg-slate-950/80 border border-border/80 rounded-2xl p-4 flex flex-col shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10 text-xs font-mono text-muted">
                  <span className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-accent" />
                    <span>Plaintext Preview ({textContent.length} characters)</span>
                  </span>
                  <span className="text-[10px] text-emerald-400 font-bold uppercase">Ready</span>
                </div>
                <pre className="flex-1 overflow-auto p-3 text-xs font-mono text-slate-200 leading-relaxed scrollbar-thin whitespace-pre-wrap break-words selection:bg-accent/30 selection:text-white">
                  {textContent}
                </pre>
              </div>
            ) : (
              /* 5. Fallback Generic Binary File Card */
              <a 
                href={url || '#'} 
                download={file.name}
                draggable={true}
                onDragStart={(e) => {
                  if (url) {
                    e.dataTransfer.setData("DownloadURL", `${file.blob?.type || "application/octet-stream"}:${file.name}:${url}`);
                    e.dataTransfer.setData("text/uri-list", url);
                  }
                }}
                onPointerEnter={() => setIsHovered(true)}
                onPointerLeave={() => setIsHovered(false)}
                className={`text-center flex flex-col items-center p-6 md:p-12 bg-surface border rounded-xl cursor-grab active:cursor-grabbing transition-colors shadow-2xl w-full max-w-lg ${isHovered ? 'bg-surface-brighter border-accent' : 'border-border'}`}
              >
                <div className="w-20 h-20 md:w-32 md:h-32 mb-6 border-2 border-dashed border-accent text-accent rounded-xl flex items-center justify-center text-4xl md:text-6xl shadow-inner bg-bg">
                  {file.name.toLowerCase().endsWith('.pdf') ? '📄' : 
                   file.name.toLowerCase().endsWith('.html') || file.name.toLowerCase().endsWith('.htm') ? '🌐' :
                   file.name.toLowerCase().endsWith('.zip') || file.name.toLowerCase().endsWith('.rar') || file.name.toLowerCase().endsWith('.tar') || file.name.toLowerCase().endsWith('.gz') ? '🗜️' : '📦'}
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

export interface VideoDropZonePreviewProps {
  file: FilePayload;
  className?: string;
}

export const VideoDropZonePreview: React.FC<VideoDropZonePreviewProps> = ({ file, className = '' }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    const loadVideo = async () => {
      try {
        if (file.blob) {
          createdUrl = URL.createObjectURL(file.blob);
          if (active) setVideoUrl(createdUrl);
          return;
        }

        if (file.cacheUrl) {
          const cachedBlob = await getCachedBlob(file.cacheUrl);
          if (cachedBlob && active) {
            createdUrl = URL.createObjectURL(cachedBlob);
            setVideoUrl(createdUrl);
            return;
          }
        }
      } catch (err) {
        console.warn("Failed to load video drop zone preview:", err);
        if (active) setHasError(true);
      }
    };

    loadVideo();

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [file.blob, file.cacheUrl]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const vid = videoRef.current;
    if (!vid) return;

    if (vid.paused) {
      vid.play()
        .then(() => setIsPlaying(true))
        .catch(err => console.warn("Video preview play error:", err));
    } else {
      vid.pause();
      setIsPlaying(false);
    }
  };

  const formatDuration = (secs: number) => {
    if (!isFinite(secs) || isNaN(secs) || secs < 0) return null;
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (hasError || !videoUrl) {
    return (
      <div 
        className={`w-14 h-14 sm:w-16 sm:h-14 rounded-xl bg-purple-500/10 border border-purple-500/25 text-purple-400 flex flex-col items-center justify-center shrink-0 shadow-sm transition-colors hover:bg-purple-500/15 ${className}`}
        title="Video File"
      >
        <Film className="w-5 h-5 mb-0.5 opacity-80" />
        <span className="text-[8px] font-mono font-bold tracking-tight uppercase">Video</span>
      </div>
    );
  }

  return (
    <div 
      className={`relative w-14 h-14 sm:w-16 sm:h-14 rounded-xl overflow-hidden bg-black/90 border border-black/20 dark:border-white/15 shadow-sm group shrink-0 cursor-pointer ${className}`}
      onClick={togglePlay}
      title={isPlaying ? "Click to Pause" : "Click to Play Preview"}
    >
      <video
        ref={videoRef}
        src={videoUrl}
        preload="metadata"
        playsInline
        muted
        className="w-full h-full object-cover"
        onLoadedMetadata={() => {
          if (videoRef.current && isFinite(videoRef.current.duration)) {
            setDuration(videoRef.current.duration);
          }
        }}
        onEnded={() => setIsPlaying(false)}
        onError={() => setHasError(true)}
      />

      {/* Play/Pause Overlay */}
      <div className={`absolute inset-0 bg-black/35 flex items-center justify-center transition-opacity ${isPlaying ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}>
        <div className="w-6 h-6 rounded-full bg-white/90 dark:bg-zinc-900/90 text-zinc-900 dark:text-white flex items-center justify-center shadow-md transition-transform group-hover:scale-110">
          {isPlaying ? (
            <Pause className="w-2.5 h-2.5 fill-current" />
          ) : (
            <Play className="w-2.5 h-2.5 fill-current ml-0.5" />
          )}
        </div>
      </div>

      {/* Video Duration / Tag Badge */}
      <div className="absolute bottom-0.5 right-1 px-1 py-0.2 rounded bg-black/75 backdrop-blur-xs text-[7px] font-mono font-bold text-white/90 flex items-center gap-0.5 pointer-events-none">
        {duration ? formatDuration(duration) : 'VID'}
      </div>
    </div>
  );
};
