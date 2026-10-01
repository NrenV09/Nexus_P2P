import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Film } from 'lucide-react';
import { FilePayload } from '../types';
import { getCachedBlob } from '../lib/cacheStorage';

interface VideoDropZonePreviewProps {
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
      <div className={`w-28 sm:w-36 h-20 rounded-xl bg-black/10 dark:bg-white/5 border border-black/10 dark:border-white/10 flex flex-col items-center justify-center text-muted shrink-0 ${className}`}>
        <Film className="w-6 h-6 mb-1 opacity-60 animate-pulse" />
        <span className="text-[10px] font-mono">Video File</span>
      </div>
    );
  }

  return (
    <div 
      className={`relative w-28 sm:w-36 h-20 rounded-xl overflow-hidden bg-black/80 border border-black/20 dark:border-white/15 shadow-sm group shrink-0 ${className}`}
      onClick={togglePlay}
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
      <div className={`absolute inset-0 bg-black/30 flex items-center justify-center transition-opacity ${isPlaying ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}>
        <div className="w-8 h-8 rounded-full bg-white/90 dark:bg-zinc-900/90 text-zinc-900 dark:text-white flex items-center justify-center shadow-lg transition-transform group-hover:scale-110">
          {isPlaying ? (
            <Pause className="w-3.5 h-3.5 fill-current" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
          )}
        </div>
      </div>

      {/* Video Tag & Duration Badge */}
      <div className="absolute bottom-1 right-1.5 px-1.5 py-0.2 rounded bg-black/70 backdrop-blur-xs text-[9px] font-mono font-bold text-white flex items-center gap-1 pointer-events-none">
        {duration ? formatDuration(duration) : 'VIDEO'}
      </div>
    </div>
  );
};
