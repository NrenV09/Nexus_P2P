import React, { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  PhoneOff, 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  MonitorUp,
  Users,
  Volume2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { UserProfile } from '../types';

function useAudioActivity(stream: MediaStream | null, isMuted: boolean = false) {
  const [speaking, setSpeaking] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);

  useEffect(() => {
    if (!stream || isMuted) {
      setSpeaking(false);
      setVolumeLevel(0);
      return;
    }
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0 || !audioTracks.some(t => t.enabled && t.readyState === 'live')) {
      setSpeaking(false);
      setVolumeLevel(0);
      return;
    }

    let animId: number;
    let audioCtx: AudioContext | null = null;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      audioCtx = new AudioCtx();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const check = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        setVolumeLevel(avg);
        setSpeaking(avg > 14);
        animId = requestAnimationFrame(check);
      };
      check();
    } catch (e) {
      // AudioContext may be restricted in some iframe contexts
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {});
      }
    };
  }, [stream, isMuted]);

  return { speaking, volumeLevel };
}

export function CallOverlay({
  active,
  type,
  localStream,
  remoteStreams,
  peerProfiles,
  peerTrackStates,
  getPeerName,
  onEndCall,
  onToggleTrack,
  onRequestAddTrack
}: {
  active: boolean;
  type: 'audio' | 'video' | null;
  localStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  peerProfiles?: Record<string, UserProfile>;
  peerTrackStates?: Record<string, { video?: boolean; audio?: boolean }>;
  getPeerName?: (peerId: string) => string;
  onEndCall: () => void;
  onToggleTrack?: (kind: 'audio' | 'video', enabled: boolean) => void;
  onRequestAddTrack?: (track: MediaStreamTrack) => void;
}) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(type === 'audio');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  const { speaking: isLocalSpeaking } = useAudioActivity(localStream, isMicMuted);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hasActiveVideoTrack = localStream 
    ? localStream.getVideoTracks().some(t => t.readyState === 'live')
    : false;

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      if (localVideoRef.current.srcObject !== localStream) {
        localVideoRef.current.srcObject = localStream;
      }
      if (!isVideoOff) {
        localVideoRef.current.play().catch(e => console.warn("Local preview play error:", e));
      }
    }
  }, [localStream, active, isVideoOff]);

  useEffect(() => {
    setIsVideoOff(type === 'audio');
  }, [type]);

  const toggleMic = () => {
    if (!localStream) return;
    const audioTracks = localStream.getAudioTracks();
    const nextState = !isMicMuted;
    const newEnabled = !nextState;
    audioTracks.forEach(track => {
      track.enabled = newEnabled;
    });
    setIsMicMuted(nextState);
    onToggleTrack?.('audio', newEnabled);
  };

  const toggleVideo = async () => {
    if (!localStream) return;
    const videoTracks = localStream.getVideoTracks();

    // If no video tracks currently exist (e.g. started as audio call)
    if (videoTracks.length === 0) {
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const newTrack = camStream.getVideoTracks()[0];
        if (newTrack) {
          localStream.addTrack(newTrack);
          setIsVideoOff(false);
          onRequestAddTrack?.(newTrack);
          onToggleTrack?.('video', true);
        }
      } catch (err) {
        console.warn("Could not acquire camera track:", err);
      }
      return;
    }

    const nextState = !isVideoOff;
    const newEnabled = !nextState;
    videoTracks.forEach(track => {
      track.enabled = newEnabled;
    });
    setIsVideoOff(nextState);

    if (newEnabled && localVideoRef.current) {
      localVideoRef.current.play().catch(e => console.warn("Local preview play error:", e));
    }
    onToggleTrack?.('video', newEnabled);
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      if (screenTrackRef.current) {
        screenTrackRef.current.stop();
        screenTrackRef.current = null;
      }
      setIsScreenSharing(false);
      // Resume camera track
      if (localStream) {
        const camTrack = localStream.getVideoTracks().find(t => t !== screenTrackRef.current && t.readyState === 'live');
        if (camTrack) {
          camTrack.enabled = true;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = localStream;
            localVideoRef.current.play().catch(() => {});
          }
          onRequestAddTrack?.(camTrack);
        }
      }
      return;
    }

    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        console.warn("Screen sharing not supported on this device/browser.");
        return;
      }
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) return;

      screenTrackRef.current = screenTrack;
      setIsScreenSharing(true);
      setIsVideoOff(false);

      if (localStream) {
        localStream.addTrack(screenTrack);
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = new MediaStream([screenTrack]);
        localVideoRef.current.play().catch(() => {});
      }

      onRequestAddTrack?.(screenTrack);
      onToggleTrack?.('video', true);

      screenTrack.onended = () => {
        setIsScreenSharing(false);
        screenTrackRef.current = null;
        if (localStream) {
          localStream.removeTrack(screenTrack);
          const camTrack = localStream.getVideoTracks().find(t => t.readyState === 'live');
          if (camTrack) {
            camTrack.enabled = true;
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = localStream;
              localVideoRef.current.play().catch(() => {});
            }
            onRequestAddTrack?.(camTrack);
          }
        }
      };
    } catch (err) {
      console.warn("Screen share request cancelled or failed:", err);
    }
  };

  // Google Meet layout logic
  const remoteEntries = Object.entries(remoteStreams);
  const totalParticipants = 1 + remoteEntries.length;

  let gridCols = "grid-cols-1";
  if (totalParticipants === 2) gridCols = "grid-cols-1 md:grid-cols-2";
  else if (totalParticipants >= 3 && totalParticipants <= 4) gridCols = "grid-cols-2";
  else if (totalParticipants > 4) gridCols = "grid-cols-2 md:grid-cols-3";

  return (
    <AnimatePresence>
      {active && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] bg-[#202124] text-white flex flex-col font-sans select-none"
        >
          {/* Main Content - Video Grid */}
          <div className="flex-1 p-3 md:p-6 flex items-center justify-center overflow-hidden">
            <div className={cn("w-full h-full max-w-6xl max-h-[85vh] grid gap-3 md:gap-4 place-content-center", gridCols)}>
              
              {/* Local Participant Tile */}
              <div className={cn(
                "relative group bg-[#3c4043] rounded-2xl overflow-hidden shadow-md h-full min-h-[200px] flex items-center justify-center border transition-all duration-300",
                isLocalSpeaking ? "border-emerald-500 ring-2 ring-emerald-500/40" : "border-white/10"
              )}>
                {/* Keep video element permanently mounted to prevent decoder pipeline restart */}
                <video 
                  ref={localVideoRef}
                  autoPlay 
                  playsInline 
                  muted 
                  className={cn(
                    "w-full h-full object-cover transition-opacity duration-150",
                    isScreenSharing ? "transform-none" : "transform -scale-x-100",
                    (isVideoOff || !hasActiveVideoTrack) ? "opacity-0 pointer-events-none absolute inset-0" : "opacity-100"
                  )}
                />

                {/* Avatar Fallback for audio or camera off */}
                {(isVideoOff || !hasActiveVideoTrack) && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#28292c]">
                    <div className={cn(
                      "w-24 h-24 rounded-full bg-blue-600/30 border-2 flex items-center justify-center text-3xl text-blue-200 font-bold uppercase shadow-inner transition-all",
                      isLocalSpeaking ? "border-emerald-400 ring-4 ring-emerald-500/30 scale-105" : "border-blue-400/40"
                    )}>
                      You
                    </div>
                    {isVideoOff && (
                      <span className="text-xs text-white/50 mt-2 font-medium">Camera is off</span>
                    )}
                  </div>
                )}
                
                {/* Overlay Name & Status */}
                <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg text-xs font-medium text-white shadow z-10">
                  {isMicMuted ? (
                    <MicOff className="w-3.5 h-3.5 text-red-400" />
                  ) : isLocalSpeaking ? (
                    <div className="flex items-center gap-0.5 h-3">
                      <span className="w-1 h-3 bg-emerald-400 rounded-full animate-pulse" />
                      <span className="w-1 h-2 bg-emerald-400 rounded-full animate-pulse delay-75" />
                      <span className="w-1 h-2.5 bg-emerald-400 rounded-full animate-pulse delay-150" />
                    </div>
                  ) : (
                    <Mic className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  <span>You {isScreenSharing ? '(Sharing Screen)' : '(Local)'}</span>
                </div>
              </div>

              {/* Remote Participants */}
              {remoteEntries.map(([id, stream]) => {
                const resolvedName = getPeerName?.(id) || peerProfiles?.[id]?.username || 'Remote Node';
                const trackState = peerTrackStates?.[id];
                return (
                  <StreamView 
                    key={id} 
                    id={id} 
                    name={resolvedName}
                    stream={stream} 
                    isRemoteVideoOff={trackState?.video === false || (type === 'audio' && trackState?.video !== true)}
                    isRemoteAudioMuted={trackState?.audio === false}
                  />
                );
              })}

              {/* Waiting state when alone in call */}
              {remoteEntries.length === 0 && (
                <div className="relative group bg-[#28292c] rounded-2xl overflow-hidden shadow-md h-full min-h-[200px] flex flex-col items-center justify-center p-6 text-center border border-white/10 border-dashed">
                  <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center text-white/40 mb-3 animate-pulse">
                    <Users className="w-7 h-7" />
                  </div>
                  <h4 className="text-sm font-semibold text-white/80 mb-1">
                    Waiting for peer to connect...
                  </h4>
                  <p className="text-xs text-white/40 max-w-xs">
                    The call invite has been transmitted over the Quantum Link tunnel.
                  </p>
                </div>
              )}

            </div>
          </div>

          {/* Bottom Control Bar (Google Meet Style) */}
          <div className="h-20 bg-[#202124] border-t border-white/10 flex items-center justify-between px-4 md:px-8 flex-shrink-0">
            {/* Left side: Time & Status */}
            <div className="hidden md:flex items-center text-xs font-medium text-white/80 w-1/4">
              <span className="font-mono text-sm">
                {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="mx-3 text-white/30">|</span>
              <span className="truncate text-white/60">Quantum Link • E2EE</span>
            </div>

            {/* Center: Controls */}
            <div className="flex items-center justify-center gap-3 w-full md:w-2/4">
              {/* Mic Toggle */}
              <button 
                onClick={toggleMic}
                className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center transition-transform active:scale-95 cursor-pointer shadow-md",
                  isMicMuted 
                    ? "bg-[#ea4335] text-white hover:bg-[#d93025]" 
                    : "bg-[#3c4043] text-white hover:bg-[#4a4d51]"
                )}
                title={isMicMuted ? "Turn on microphone" : "Turn off microphone"}
              >
                {isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              {/* Video Toggle */}
              <button 
                onClick={toggleVideo}
                className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center transition-transform active:scale-95 cursor-pointer shadow-md",
                  (isVideoOff || !hasActiveVideoTrack)
                    ? "bg-[#ea4335] text-white hover:bg-[#d93025]" 
                    : "bg-[#3c4043] text-white hover:bg-[#4a4d51]"
                )}
                title={isVideoOff ? "Turn on camera" : "Turn off camera"}
              >
                {(isVideoOff || !hasActiveVideoTrack) ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              </button>

              {/* Screen Share Toggle */}
              <button 
                onClick={toggleScreenShare}
                className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center transition-transform active:scale-95 cursor-pointer shadow-md",
                  isScreenSharing
                    ? "bg-blue-600 text-white hover:bg-blue-700 ring-2 ring-blue-400/50" 
                    : "bg-[#3c4043] text-white hover:bg-[#4a4d51]"
                )}
                title={isScreenSharing ? "Stop sharing screen" : "Share screen"}
              >
                <MonitorUp className="w-5 h-5" />
              </button>

              {/* End Call Button */}
              <button 
                onClick={onEndCall} 
                className="w-16 h-12 rounded-full bg-[#ea4335] text-white flex items-center justify-center hover:bg-[#d93025] transition-transform active:scale-95 cursor-pointer ml-2 shadow-lg"
                title="Leave call"
              >
                <PhoneOff className="w-5 h-5" />
              </button>
            </div>

            {/* Right side: Participant info */}
            <div className="hidden md:flex items-center justify-end gap-3 w-1/4 text-white/80">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#3c4043] text-xs font-medium">
                <Users className="w-3.5 h-3.5 text-white/70" />
                <span>{totalParticipants} in call</span>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StreamView({ 
  stream, 
  id, 
  name,
  isRemoteVideoOff,
  isRemoteAudioMuted
}: { 
  key?: string;
  stream: MediaStream; 
  id: string; 
  name: string; 
  isRemoteVideoOff?: boolean;
  isRemoteAudioMuted?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [hasVideoTrack, setHasVideoTrack] = useState(false);

  const { speaking: isRemoteSpeaking } = useAudioActivity(stream, isRemoteAudioMuted);

  useEffect(() => {
    const checkTracks = () => {
      const vTracks = stream.getVideoTracks();
      const hasLive = vTracks.length > 0 && vTracks.some(t => t.readyState === 'live');
      setHasVideoTrack(hasLive);
    };

    checkTracks();
    stream.addEventListener('addtrack', checkTracks);
    stream.addEventListener('removetrack', checkTracks);

    if (videoRef.current && videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(e => console.warn("Remote video play error:", e));
    }
    if (audioRef.current && audioRef.current.srcObject !== stream) {
      audioRef.current.srcObject = stream;
      audioRef.current.play().catch(e => console.warn("Remote audio play error:", e));
    }

    return () => {
      stream.removeEventListener('addtrack', checkTracks);
      stream.removeEventListener('removetrack', checkTracks);
    };
  }, [stream]);

  // When remote video is toggled back on, ensure playback resumes smoothly
  useEffect(() => {
    if (!isRemoteVideoOff && videoRef.current && hasVideoTrack) {
      videoRef.current.play().catch(e => console.warn("Remote video resume play error:", e));
    }
  }, [isRemoteVideoOff, hasVideoTrack]);

  const initials = (name || id || "Node").substring(0, 2).toUpperCase();
  const showVideo = hasVideoTrack && !isRemoteVideoOff;

  return (
    <div className={cn(
      "relative group bg-[#3c4043] rounded-2xl overflow-hidden shadow-md h-full min-h-[200px] flex items-center justify-center border transition-all duration-300",
      isRemoteSpeaking ? "border-emerald-500 ring-2 ring-emerald-500/40" : "border-white/10"
    )}>
      {/* Dedicated audio element: handles ALL remote audio playback reliably */}
      <audio ref={audioRef} autoPlay playsInline />

      {/* Video Element: MUTED so audio doesn't play twice/echo! */}
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted
        className={cn(
          "w-full h-full object-cover transition-opacity duration-150",
          !showVideo ? "opacity-0 pointer-events-none absolute inset-0" : "opacity-100"
        )}
      />

      {/* Avatar Fallback for audio calls or when camera is off */}
      {!showVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#28292c]">
          <div className={cn(
            "w-24 h-24 rounded-full bg-emerald-600/30 border-2 flex items-center justify-center text-3xl text-emerald-200 font-bold uppercase shadow-inner transition-all",
            isRemoteSpeaking ? "border-emerald-400 ring-4 ring-emerald-500/30 scale-105" : "border-emerald-400/40"
          )}>
            {initials}
          </div>
          {isRemoteVideoOff && (
            <p className="text-xs text-white/50 mt-2 font-medium">Camera turned off</p>
          )}
        </div>
      )}

      {/* Participant Name Badge */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg text-xs font-medium text-white shadow z-10">
        {isRemoteAudioMuted ? (
          <MicOff className="w-3.5 h-3.5 text-red-400" />
        ) : isRemoteSpeaking ? (
          <div className="flex items-center gap-0.5 h-3">
            <span className="w-1 h-3 bg-emerald-400 rounded-full animate-pulse" />
            <span className="w-1 h-2 bg-emerald-400 rounded-full animate-pulse delay-75" />
            <span className="w-1 h-2.5 bg-emerald-400 rounded-full animate-pulse delay-150" />
          </div>
        ) : (
          <Volume2 className="w-3.5 h-3.5 text-white/70" />
        )}
        <span>{name}</span>
      </div>
    </div>
  );
}
