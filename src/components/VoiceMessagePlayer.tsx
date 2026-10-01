import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, AlertCircle, Download } from 'lucide-react';
import { cn } from '../lib/utils';

interface VoiceMessagePlayerProps {
  id: string;
  audioData: string;
  isMe: boolean;
  senderColor?: string;
}

// Efficient base64 to binary ArrayBuffer conversion
function base64ToArrayBuffer(base64Data: string): { buffer: ArrayBuffer; contentType: string } | null {
  try {
    let base64 = base64Data;
    let contentType = 'audio/webm';
    if (base64Data.startsWith('data:')) {
      const parts = base64Data.split(';base64,');
      contentType = parts[0].replace('data:', '') || 'audio/webm';
      base64 = parts[1] || '';
    }
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return { buffer: bytes.buffer, contentType };
  } catch (e) {
    console.error("Failed to parse base64 audio:", e);
    return null;
  }
}

// Extracts real amplitude peaks from decoded PCM channel data for realistic voice waveform
function extractWaveformFromBuffer(audioBuffer: AudioBuffer, numBars = 24): number[] {
  const channelData = audioBuffer.getChannelData(0);
  const totalSamples = channelData.length;
  const blockSize = Math.floor(totalSamples / numBars);
  const heights: number[] = [];

  for (let i = 0; i < numBars; i++) {
    const start = i * blockSize;
    let sum = 0;
    const count = Math.min(blockSize, totalSamples - start);
    for (let j = 0; j < count; j++) {
      sum += Math.abs(channelData[start + j]);
    }
    const avg = count > 0 ? sum / count : 0;
    // Map average amplitude to percentage (between 25% and 100%)
    const height = Math.min(100, Math.max(25, Math.round(avg * 400)));
    heights.push(height);
  }
  return heights;
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
  const animFrameRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isLoaded, setIsLoaded] = useState(false);

  // Synchronous Blob URL generation on mount so <audio> has src instantly with 0ms delay
  const [blobUrl, setBlobUrl] = useState<string | null>(() => {
    if (!audioData) return null;
    if (audioData.startsWith('blob:') || audioData.startsWith('http')) {
      return audioData;
    }
    const parsed = base64ToArrayBuffer(audioData);
    if (parsed) {
      try {
        const blob = new Blob([parsed.buffer], { type: parsed.contentType });
        return URL.createObjectURL(blob);
      } catch (_) {}
    }
    return audioData; // Fallback to raw data URI
  });

  const [waveHeights, setWaveHeights] = useState<number[]>(() => [
    30, 45, 60, 80, 50, 65, 90, 75, 55, 70, 85, 95, 60, 70, 80, 50, 40, 60, 75, 85, 65, 45, 35, 25
  ]);

  // Decode audio data in memory for realistic waveform amplitude calculation
  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    const analyzeAudio = async () => {
      try {
        let arrayBuf: ArrayBuffer | null = null;
        let mime = 'audio/webm';

        if (audioData.startsWith('blob:') || audioData.startsWith('http')) {
          setBlobUrl(audioData);
          try {
            const resp = await fetch(audioData);
            arrayBuf = await resp.arrayBuffer();
          } catch (_) {}
        } else {
          const parsed = base64ToArrayBuffer(audioData);
          if (parsed) {
            arrayBuf = parsed.buffer;
            mime = parsed.contentType;
            const blob = new Blob([arrayBuf], { type: mime });
            createdUrl = URL.createObjectURL(blob);
            setBlobUrl(createdUrl);
          }
        }

        if (arrayBuf && active) {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtx) {
            try {
              const ctx = new AudioCtx();
              const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
              if (active) {
                if (decoded.duration > 0 && isFinite(decoded.duration)) {
                  setDuration(decoded.duration);
                }
                setWaveHeights(extractWaveformFromBuffer(decoded, 24));
                setIsLoaded(true);
              }
              ctx.close().catch(() => {});
            } catch (decodeErr) {
              // Web Audio decode may fail on WebM without seek headers; native <audio> will still play smoothly
              if (active) setIsLoaded(true);
            }
          }
        }
      } catch (err) {
        if (active) setIsLoaded(true);
      }
    };

    analyzeAudio();

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [audioData]);

  // Smooth playback time tracking via requestAnimationFrame (butter-smooth 60fps waveform progress)
  useEffect(() => {
    let animId: number | null = null;
    if (isPlaying) {
      const loop = () => {
        if (audioRef.current) {
          const t = audioRef.current.currentTime;
          setCurrentTime(t);
          const d = audioRef.current.duration;
          if (isFinite(d) && !isNaN(d) && d > 0 && duration === 0) {
            setDuration(d);
          }
          if (!audioRef.current.paused && !audioRef.current.ended) {
            animId = requestAnimationFrame(loop);
          }
        }
      };
      animId = requestAnimationFrame(loop);
    }
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isPlaying, duration]);

  // Listen for global pause-all event so only one voice note plays at a time
  useEffect(() => {
    const handlePauseAll = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string }>;
      if (customEvent.detail?.id !== id) {
        if (audioRef.current && !audioRef.current.paused) {
          audioRef.current.pause();
          setIsPlaying(false);
        }
      }
    };

    window.addEventListener('quantum-pause-voice-notes', handlePauseAll);
    return () => {
      window.removeEventListener('quantum-pause-voice-notes', handlePauseAll);
    };
  }, [id]);

  // Primary zero-latency playback toggle
  const togglePlay = async () => {
    // Stop any other active voice note across the app
    window.dispatchEvent(
      new CustomEvent('quantum-pause-voice-notes', { detail: { id } })
    );

    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      let startFrom = currentTime;
      if (startFrom >= (duration || audio.duration) && (duration > 0 || isFinite(audio.duration))) {
        startFrom = 0;
        setCurrentTime(0);
      }

      audio.currentTime = startFrom;
      audio.playbackRate = playbackRate;

      try {
        await audio.play();
        setIsPlaying(true);
        setHasError(false);
      } catch (err: any) {
        console.warn("Audio playback failed on first attempt, retrying with reset source:", err);
        try {
          audio.load();
          audio.currentTime = startFrom;
          await audio.play();
          setIsPlaying(true);
          setHasError(false);
        } catch (retryErr) {
          console.error("Audio playback fatal error:", retryErr);
          setHasError(true);
          setIsPlaying(false);
        }
      }
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const effectiveDuration = duration > 0 ? duration : (audio && isFinite(audio.duration) ? audio.duration : 0);
    if (effectiveDuration <= 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clickPos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const newTime = clickPos * effectiveDuration;

    setCurrentTime(newTime);
    if (audio) {
      audio.currentTime = newTime;
    }
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
    const url = blobUrl || audioData;
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `voice-message-${new Date().toISOString().slice(0, 19)}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const effectiveDuration = duration > 0 ? duration : (audioRef.current && isFinite(audioRef.current.duration) ? audioRef.current.duration : 0);
  const progress = effectiveDuration > 0 ? Math.min(1, currentTime / effectiveDuration) : 0;

  return (
    <div className={cn(
      "w-full min-w-[240px] max-w-[320px] rounded-2xl p-2.5 transition-all select-none",
      "bg-black/20 dark:bg-white/10 backdrop-blur-md border border-white/20 shadow-inner"
    )}>
      {blobUrl && (
        <audio
          ref={audioRef}
          src={blobUrl}
          preload="auto"
          onLoadedMetadata={() => {
            if (audioRef.current) {
              const d = audioRef.current.duration;
              if (isFinite(d) && !isNaN(d) && d > 0 && duration === 0) {
                setDuration(d);
              }
              setIsLoaded(true);
            }
          }}
          onDurationChange={() => {
            if (audioRef.current) {
              const d = audioRef.current.duration;
              if (isFinite(d) && !isNaN(d) && d > 0 && duration === 0) {
                setDuration(d);
              }
            }
          }}
          onTimeUpdate={() => {
            if (audioRef.current && !isPlaying) {
              setCurrentTime(audioRef.current.currentTime);
            }
          }}
          onEnded={() => {
            setIsPlaying(false);
            setCurrentTime(effectiveDuration);
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
              <span>{formatTime(isPlaying || currentTime > 0 ? currentTime : effectiveDuration)}</span>
              
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
                  {effectiveDuration > 0 ? formatTime(effectiveDuration) : (isLoaded ? "0:00" : "...")}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
