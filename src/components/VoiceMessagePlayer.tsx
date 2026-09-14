import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, AlertCircle, Download, RotateCcw } from 'lucide-react';
import { cn } from '../lib/utils';

interface VoiceMessagePlayerProps {
  id: string;
  audioData: string;
  isMe: boolean;
  senderColor?: string;
}

// Convert base64 data URL to a clean Blob
function base64ToBlob(base64Data: string): Blob | null {
  try {
    if (base64Data.startsWith('blob:')) {
      return null; // Already a blob URL
    }
    const parts = base64Data.split(';base64,');
    if (parts.length < 2) {
      // Might be plain base64 without prefix
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      return new Blob([new Uint8Array(byteNumbers)], { type: 'audio/webm' });
    }
    const contentType = parts[0].replace('data:', '') || 'audio/webm';
    const byteCharacters = atob(parts[1]);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    return new Blob([new Uint8Array(byteNumbers)], { type: contentType });
  } catch (err) {
    console.error("Failed to convert base64 to blob:", err);
    return null;
  }
}

// Formats seconds into mm:ss
function formatTime(seconds: number): string {
  if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const VoiceMessagePlayer: React.FC<VoiceMessagePlayerProps> = ({
  id,
  audioData,
  isMe,
  senderColor
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isLoaded, setIsLoaded] = useState(false);

  // Derive stable pseudo-waveform based on audio data hash
  const waveHeights = useMemo(() => {
    const bars = 24;
    const heights: number[] = [];
    let hash = 0;
    for (let i = 0; i < Math.min(audioData.length, 200); i++) {
      hash = (hash << 5) - hash + audioData.charCodeAt(i);
      hash |= 0;
    }
    for (let i = 0; i < bars; i++) {
      const pseudo = Math.abs(Math.sin(hash + i * 1.7));
      // height between 25% and 100%
      heights.push(Math.max(25, Math.round(pseudo * 100)));
    }
    return heights;
  }, [audioData]);

  // Convert base64 to Blob URL to bypass browser data URL limits and improve playback
  useEffect(() => {
    let url: string;
    let isCreated = false;

    if (audioData.startsWith('blob:')) {
      url = audioData;
      setBlobUrl(url);
    } else {
      const blob = base64ToBlob(audioData);
      if (blob) {
        url = URL.createObjectURL(blob);
        isCreated = true;
        setBlobUrl(url);
      } else {
        // Fallback to data URL
        url = audioData;
        setBlobUrl(url);
      }
    }

    return () => {
      if (isCreated && url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [audioData]);

  // Listen for global pause-all event so only one voice note plays at a time
  useEffect(() => {
    const handlePauseAll = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string }>;
      if (customEvent.detail?.id !== id && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    };

    window.addEventListener('quantum-pause-voice-notes', handlePauseAll);
    return () => {
      window.removeEventListener('quantum-pause-voice-notes', handlePauseAll);
    };
  }, [id]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      // Stop any other active voice note
      window.dispatchEvent(
        new CustomEvent('quantum-pause-voice-notes', { detail: { id } })
      );

      // Reset to start if finished
      if (currentTime >= duration && duration > 0) {
        audio.currentTime = 0;
        setCurrentTime(0);
      }

      audio.play().then(() => {
        setIsPlaying(true);
        setHasError(false);
      }).catch(err => {
        console.warn("Audio playback failed:", err);
        setHasError(true);
        setIsPlaying(false);
      });
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || duration <= 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clickPos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const newTime = clickPos * duration;
    
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const cycleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextSpeed = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const downloadAudio = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `voice-message-${new Date().toISOString().slice(0, 19)}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  return (
    <div className={cn(
      "w-full min-w-[240px] max-w-[320px] rounded-2xl p-2.5 transition-all select-none",
      "bg-black/20 dark:bg-white/10 backdrop-blur-md border border-white/20 shadow-inner"
    )}>
      {blobUrl && (
        <audio
          ref={audioRef}
          src={blobUrl}
          preload="metadata"
          onLoadedMetadata={() => {
            if (audioRef.current) {
              const d = audioRef.current.duration;
              if (isFinite(d) && !isNaN(d)) {
                setDuration(d);
              }
              setIsLoaded(true);
            }
          }}
          onDurationChange={() => {
            if (audioRef.current) {
              const d = audioRef.current.duration;
              if (isFinite(d) && !isNaN(d)) {
                setDuration(d);
              }
            }
          }}
          onTimeUpdate={() => {
            if (audioRef.current) {
              setCurrentTime(audioRef.current.currentTime);
              // Handle WebM infinite duration issue dynamically
              if (!isFinite(duration) || duration <= 0) {
                if (audioRef.current.duration && isFinite(audioRef.current.duration)) {
                  setDuration(audioRef.current.duration);
                }
              }
            }
          }}
          onEnded={() => {
            setIsPlaying(false);
            setCurrentTime(duration);
          }}
          onError={(e) => {
            console.warn("Audio element error on playback:", e);
            setHasError(true);
            setIsPlaying(false);
          }}
        />
      )}

      {hasError ? (
        <div className="flex items-center justify-between text-xs text-red-200 py-1 px-1">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 text-red-300 shrink-0" />
            <span className="font-medium text-[11px]">Audio codec issue</span>
          </div>
          <button
            onClick={downloadAudio}
            className="flex items-center gap-1 bg-white/20 hover:bg-white/30 text-white px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer"
            title="Download Audio File"
          >
            <Download className="w-3 h-3" />
            <span>Download</span>
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          {/* Play/Pause Button */}
          <button
            type="button"
            onClick={togglePlay}
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-md transition-all active:scale-95 cursor-pointer",
              isPlaying 
                ? "bg-white text-zinc-900 shadow-white/20" 
                : "bg-white/90 text-zinc-900 hover:bg-white hover:scale-105"
            )}
            title={isPlaying ? "Pause voice message" : "Play voice message"}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>

          {/* Waveform & Scrubber Area */}
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
            <div 
              onClick={handleSeek}
              className="h-7 flex items-center gap-[2.5px] cursor-pointer group py-1"
              title="Click or drag to seek"
            >
              {waveHeights.map((height, i) => {
                const barProgress = i / waveHeights.length;
                const isPassed = barProgress <= progress;
                return (
                  <div
                    key={i}
                    style={{ height: `${height}%` }}
                    className={cn(
                      "flex-1 rounded-full transition-all duration-75 min-w-[2px]",
                      isPassed
                        ? "bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)]"
                        : "bg-white/30 group-hover:bg-white/50"
                    )}
                  />
                );
              })}
            </div>

            {/* Timers & Speed Control */}
            <div className="flex items-center justify-between text-[10px] text-white/80 font-mono font-medium leading-none px-0.5">
              <span>{formatTime(isPlaying || currentTime > 0 ? currentTime : duration)}</span>
              
              <div className="flex items-center gap-2">
                {/* Speed toggle */}
                <button
                  type="button"
                  onClick={cycleSpeed}
                  className="px-1.5 py-0.5 rounded bg-white/20 hover:bg-white/30 text-white font-bold transition-colors cursor-pointer text-[9px]"
                  title="Cycle playback speed"
                >
                  {playbackRate}x
                </button>
                
                {/* Duration */}
                <span className="text-white/60">
                  {duration > 0 ? formatTime(duration) : (isLoaded ? "0:00" : "...")}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
