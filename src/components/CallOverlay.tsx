import React, { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  PhoneOff, 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  Monitor,
  MonitorUp,
  Users,
  Volume2,
  Pin,
  PinOff,
  Sparkles,
  LayoutGrid,
  Maximize2,
  Minimize2,
  GripHorizontal,
  ShieldCheck,
  Radio,
  Activity,
  FlipHorizontal
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

// Persistent audio sink for every remote participant:
// Keeps audio playing continuously in background even when switching tabs or minimized in PiP!
function RemoteAudioSink({ stream, isMuted = false }: { stream: MediaStream; isMuted?: boolean; key?: React.Key }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (audioRef.current && audioRef.current.srcObject !== stream) {
      audioRef.current.srcObject = stream;
      audioRef.current.play().catch(e => console.warn("Remote audio sink play error:", e));
    }
  }, [stream]);

  return <audio ref={audioRef} autoPlay playsInline muted={isMuted} />;
}

export function CallOverlay({
  active,
  type,
  localStream,
  remoteStreams,
  peerProfiles,
  peerTrackStates,
  screenSharingPeers,
  getPeerName,
  onEndCall,
  onToggleTrack,
  onRequestAddTrack,
  onToggleScreenShare,
  isMinimized = false,
  onToggleMinimize
}: {
  active: boolean;
  type: 'audio' | 'video' | null;
  localStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  peerProfiles?: Record<string, UserProfile>;
  peerTrackStates?: Record<string, { video?: boolean; audio?: boolean }>;
  screenSharingPeers?: Record<string, boolean>;
  getPeerName?: (peerId: string) => string;
  onEndCall: () => void;
  onToggleTrack?: (kind: 'audio' | 'video', enabled: boolean) => void;
  onRequestAddTrack?: (track: MediaStreamTrack) => void;
  onToggleScreenShare?: (sharing: boolean) => void;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
}) {
  const [screenTrack, setScreenTrack] = useState<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(type === 'audio');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const pipConstraintsRef = useRef<HTMLDivElement>(null);

  // Internal minimize fallback
  const [internalMinimized, setInternalMinimized] = useState(false);
  const minimized = isMinimized !== undefined ? isMinimized : internalMinimized;
  const toggleMinimize = () => {
    if (onToggleMinimize) onToggleMinimize();
    else setInternalMinimized(prev => !prev);
  };

  // Spotlight & Layout State
  const [viewMode, setViewMode] = useState<'grid' | 'spotlight'>('grid');
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  
  // Fit modes per tile ('contain' for non-cropped full landscape, 'cover' for zoomed fill)
  const [tileFitModes, setTileFitModes] = useState<Record<string, 'contain' | 'cover'>>({
    local: 'contain'
  });

  const { speaking: isLocalSpeaking } = useAudioActivity(localStream, isMicMuted);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setIsVideoOff(type === 'audio');
  }, [type]);

  // Clean up screen sharing on unmount or when call becomes inactive
  useEffect(() => {
    if (!active) {
      if (screenTrackRef.current) {
        screenTrackRef.current.stop();
        screenTrackRef.current = null;
      }
      setScreenTrack(null);
      setIsScreenSharing(false);
    }
    return () => {
      if (screenTrackRef.current) {
        screenTrackRef.current.stop();
        screenTrackRef.current = null;
      }
    };
  }, [active]);

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
      if (track !== screenTrackRef.current) {
        track.enabled = newEnabled;
      }
    });
    setIsVideoOff(nextState);
    onToggleTrack?.('video', newEnabled);
  };

  // Auto-spotlight peer when they start sharing screen and enforce contain mode
  useEffect(() => {
    if (!screenSharingPeers) return;
    const activeSharer = Object.keys(screenSharingPeers).find(id => screenSharingPeers[id]);
    if (activeSharer) {
      setViewMode('spotlight');
      setSpotlightId(activeSharer);
      setTileFitModes(prev => ({ ...prev, [activeSharer]: 'contain' }));
    } else if (spotlightId && spotlightId !== 'local' && !screenSharingPeers[spotlightId]) {
      // Revert to grid when screen share ends
      setViewMode('grid');
      setSpotlightId(null);
    }
  }, [screenSharingPeers]);

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      if (screenTrackRef.current) {
        screenTrackRef.current.stop();
        screenTrackRef.current = null;
      }
      setScreenTrack(null);
      setIsScreenSharing(false);
      onToggleScreenShare?.(false);
      if (spotlightId === 'local') {
        setViewMode('grid');
        setSpotlightId(null);
      }
      // Resume camera track
      if (localStream) {
        const camTrack = localStream.getVideoTracks().find(t => t !== screenTrackRef.current && t.readyState === 'live');
        if (camTrack) {
          camTrack.enabled = true;
          onRequestAddTrack?.(camTrack);
          onToggleTrack?.('video', true);
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
      const newTrack = displayStream.getVideoTracks()[0];
      if (!newTrack) return;
      newTrack.contentHint = 'detail';

      screenTrackRef.current = newTrack;
      setScreenTrack(newTrack);
      setIsScreenSharing(true);
      setIsVideoOff(false);

      // When starting screen sharing, automatically spotlight self and set contain mode (preserves landscape orientation)
      setTileFitModes(prev => ({ ...prev, local: 'contain' }));
      setViewMode('spotlight');
      setSpotlightId('local');

      if (localStream) {
        localStream.addTrack(newTrack);
      }

      onToggleScreenShare?.(true);
      onRequestAddTrack?.(newTrack);
      onToggleTrack?.('video', true);

      newTrack.onended = () => {
        setIsScreenSharing(false);
        setScreenTrack(null);
        screenTrackRef.current = null;
        onToggleScreenShare?.(false);
        if (spotlightId === 'local') {
          setViewMode('grid');
          setSpotlightId(null);
        }
        if (localStream) {
          try {
            localStream.removeTrack(newTrack);
          } catch (_) {}
          const camTrack = localStream.getVideoTracks().find(t => t.readyState === 'live');
          if (camTrack) {
            camTrack.enabled = true;
            onRequestAddTrack?.(camTrack);
            onToggleTrack?.('video', true);
          }
        }
      };
    } catch (err) {
      console.warn("Screen share request cancelled or failed:", err);
    }
  };

  const toggleTileFit = (id: string) => {
    setTileFitModes(prev => {
      const current = prev[id] || 'contain';
      return { ...prev, [id]: current === 'contain' ? 'cover' : 'contain' };
    });
  };

  const handleSpotlight = (id: string) => {
    if (spotlightId === id && viewMode === 'spotlight') {
      // Toggle off spotlight
      setViewMode('grid');
      setSpotlightId(null);
    } else {
      setViewMode('spotlight');
      setSpotlightId(id);
    }
  };

  // Participant list setup
  const remoteEntries = Object.entries(remoteStreams);
  const totalParticipants = 1 + remoteEntries.length;

  // Resolve effective spotlight participant
  const effectiveSpotlightId = useMemo(() => {
    if (viewMode !== 'spotlight') return null;
    if (spotlightId) {
      if (spotlightId === 'local' || remoteStreams[spotlightId]) {
        return spotlightId;
      }
    }
    // Default fallback to first remote peer, or local if alone
    if (remoteEntries.length > 0) return remoteEntries[0][0];
    return 'local';
  }, [viewMode, spotlightId, remoteStreams, remoteEntries]);

  // Grid column calculation for grid mode
  let gridCols = "grid-cols-1";
  if (totalParticipants === 2) gridCols = "grid-cols-1 md:grid-cols-2";
  else if (totalParticipants >= 3 && totalParticipants <= 4) gridCols = "grid-cols-2";
  else if (totalParticipants > 4) gridCols = "grid-cols-2 md:grid-cols-3";

  // Participant names resolver
  const resolveParticipantName = (id: string) => {
    if (id === 'local') return 'You';
    return getPeerName?.(id) || peerProfiles?.[id]?.username || 'Remote Node';
  };

  // Find primary participant to display when minimized in Picture-in-Picture
  const pipPrimaryId = useMemo(() => {
    if (effectiveSpotlightId) return effectiveSpotlightId;
    if (remoteEntries.length > 0) return remoteEntries[0][0];
    return 'local';
  }, [effectiveSpotlightId, remoteEntries]);

  return (
    <AnimatePresence>
      {active && (
        <>
          {/* Continuous Audio Sinks: ensures 100% uninterrupted audio across all peers in both full & PiP modes */}
          <div className="hidden" aria-hidden="true">
            {remoteEntries.map(([id, st]) => (
              <RemoteAudioSink 
                key={`audio-sink-${id}`} 
                stream={st} 
                isMuted={peerTrackStates?.[id]?.audio === false} 
              />
            ))}
          </div>

          {/* ------------------------------------------------------------- */}
          {/* MINIMIZED (PICTURE-IN-PICTURE) MODE WIDGET                     */}
          {/* Allows using Secure Chat and File Transfer simultaneously      */}
          {/* ------------------------------------------------------------- */}
          {minimized ? (
            <>
              {/* Viewport Drag Boundary */}
              <div 
                ref={pipConstraintsRef} 
                className="fixed inset-3 sm:inset-5 pointer-events-none z-[94]" 
                aria-hidden="true" 
              />

              <motion.div
                key="call-overlay-pip"
                drag
                dragConstraints={pipConstraintsRef}
                dragElastic={0.08}
                dragMomentum={false}
                whileDrag={{ scale: 1.02, cursor: "grabbing" }}
                initial={{ opacity: 0, scale: 0.85, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.85, y: 20 }}
                transition={{
                  opacity: { duration: 0.18 },
                  scale: { type: "spring", stiffness: 380, damping: 28 },
                  y: { type: "spring", stiffness: 380, damping: 28 }
                }}
                className="fixed bottom-5 right-5 z-[95] w-72 sm:w-80 md:w-88 rounded-2xl shadow-[0_24px_50px_rgba(0,0,0,0.7)] border border-white/[0.12] bg-[#121418]/95 backdrop-blur-2xl overflow-hidden select-none text-white font-sans ring-1 ring-white/5 transition-shadow duration-200 touch-none cursor-grab active:cursor-grabbing"
              >
                {/* Mini Header: Drag bar + Status + Maximize button */}
                <div 
                  className="h-10 px-3 bg-[#181a20]/95 border-b border-white/[0.08] flex items-center justify-between flex-shrink-0 cursor-grab active:cursor-grabbing select-none"
                  title="Drag to move PIP box"
                >
                  <div className="flex items-center gap-2 overflow-hidden pointer-events-none">
                    <GripHorizontal className="w-3.5 h-3.5 text-white/40 flex-shrink-0" />
                    <span className="relative flex h-2 w-2 flex-shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    <span className="text-xs font-semibold text-white/90 truncate">
                      {pipPrimaryId === 'local' ? (isScreenSharing ? 'Your Screen' : 'You') : resolveParticipantName(pipPrimaryId)}
                    </span>
                    <span className="text-[10px] text-white/40 font-mono hidden sm:inline">
                      {currentTime.toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>

                  <div className="flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
                    {/* Maximize Button */}
                    <button
                      onClick={toggleMinimize}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
                      title="Maximize meeting to full screen"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Mini Video Feed (Aspect-preserved with object-contain) */}
                <div 
                  onClick={toggleMinimize}
                  className="w-full h-44 sm:h-48 bg-[#0b0c0f] relative overflow-hidden cursor-grab active:cursor-grabbing group flex items-center justify-center"
                  title="Click to maximize meeting, drag to move"
                >
                {pipPrimaryId === 'local' ? (
                  <LocalVideoTile 
                    stream={localStream}
                    screenTrack={screenTrack}
                    isVideoOff={isVideoOff}
                    isScreenSharing={isScreenSharing}
                    isLocalSpeaking={isLocalSpeaking}
                    isMicMuted={isMicMuted}
                    fitMode="contain"
                    isThumbnail={true}
                  />
                ) : (
                  remoteStreams[pipPrimaryId] && (
                    <RemoteVideoTile 
                      id={pipPrimaryId}
                      name={resolveParticipantName(pipPrimaryId)}
                      stream={remoteStreams[pipPrimaryId]}
                      isRemoteVideoOff={peerTrackStates?.[pipPrimaryId]?.video === false || (type === 'audio' && peerTrackStates?.[pipPrimaryId]?.video !== true)}
                      isRemoteAudioMuted={peerTrackStates?.[pipPrimaryId]?.audio === false}
                      fitMode="contain"
                      isThumbnail={true}
                    />
                  )
                )}

                {/* Hover Overlay: Click to Maximize */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[3px] z-20">
                  <span className="text-xs font-semibold bg-white/20 border border-white/20 px-3 py-1.5 rounded-full text-white flex items-center gap-1.5 shadow-lg backdrop-blur-md">
                    <Maximize2 className="w-3.5 h-3.5" />
                    Maximize Meeting
                  </span>
                </div>

                {/* Multiple participant badge if > 1 remote */}
                {totalParticipants > 2 && (
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/70 border border-white/10 text-[10px] font-medium text-white/90 backdrop-blur-md z-10 shadow">
                    +{totalParticipants - 1} peers
                  </div>
                )}
              </div>

              {/* Mini Control Strip */}
              <div 
                onPointerDown={(e) => e.stopPropagation()}
                className="h-12 px-3 bg-[#15171d]/95 border-t border-white/[0.08] flex items-center justify-between flex-shrink-0"
              >
                <div className="flex items-center gap-2">
                  {/* Mic Toggle */}
                  <button 
                    onClick={toggleMic}
                    className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow",
                      isMicMuted ? "bg-rose-600 text-white" : "bg-white/10 hover:bg-white/20 text-emerald-400"
                    )}
                    title={isMicMuted ? "Unmute mic" : "Mute mic"}
                  >
                    {isMicMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  </button>

                  {/* Video Toggle */}
                  <button 
                    onClick={toggleVideo}
                    className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow",
                      (isVideoOff && !isScreenSharing) ? "bg-rose-600 text-white" : "bg-white/10 hover:bg-white/20 text-white"
                    )}
                    title={isVideoOff ? "Turn on camera" : "Turn off camera"}
                  >
                    {(isVideoOff && !isScreenSharing) ? <VideoOff className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {/* Maximize Button */}
                  <button
                    onClick={toggleMinimize}
                    className="px-2.5 py-1 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-300 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow"
                    title="Maximize meeting to full screen"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Expand</span>
                  </button>

                  {/* End Call */}
                  <button 
                    onClick={onEndCall}
                    className="w-8 h-8 rounded-xl bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow shadow-rose-600/30"
                    title="Leave call"
                  >
                    <PhoneOff className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          </>
          ) : (
            /* ------------------------------------------------------------- */
            /* FULL-SCREEN MEETING MODE                                      */
            /* ------------------------------------------------------------- */
            <motion.div
              key="call-overlay-fullscreen"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-[110] bg-[#090a0d] w-full h-full max-h-screen overflow-hidden flex flex-col cursor-default select-none text-white font-sans"
            >
              <div className="w-full h-full flex flex-col overflow-hidden relative bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#181a22]/70 via-[#0d0f14] to-[#08080a]">
                
                {/* Top Bar: View Mode Switcher, Call Info & Quick Actions */}
                <div className="h-14 px-3 sm:px-6 flex items-center justify-between border-b border-white/[0.08] bg-[#121419]/90 backdrop-blur-xl flex-shrink-0 z-20">
                  <div className="flex items-center gap-2 sm:gap-3 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono text-emerald-300 shadow-sm">
                      <span className="relative flex h-2 w-2 flex-shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                      </span>
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 hidden xs:inline" />
                      <span className="font-semibold tracking-wider text-[11px] sm:text-xs">QUANTUM LINK</span>
                      <span className="text-emerald-500/40">•</span>
                      <span className="text-zinc-400 truncate hidden sm:inline">
                        E2EE {type === 'video' ? 'Video' : 'Audio'}
                      </span>
                    </div>

                    {viewMode === 'spotlight' && (
                      <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-medium animate-fadeIn">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span className="truncate max-w-[160px]">Spotlight: {resolveParticipantName(effectiveSpotlightId || '')}</span>
                      </div>
                    )}
                  </div>

                  {/* View Mode & Quick Actions Controls */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* View Mode (Grid vs Spotlight) Segmented Switcher */}
                    <div className="flex items-center p-0.5 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                      <button
                        onClick={() => {
                          setViewMode('grid');
                          setSpotlightId(null);
                        }}
                        className={cn(
                          "px-2.5 sm:px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer",
                          viewMode === 'grid'
                            ? "bg-white/15 text-white shadow-sm font-semibold"
                            : "text-zinc-400 hover:text-white"
                        )}
                        title="Grid View: See all participants equally"
                      >
                        <LayoutGrid className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Grid</span>
                      </button>

                      <button
                        onClick={() => {
                          setViewMode('spotlight');
                          setSpotlightId(remoteEntries.length > 0 ? remoteEntries[0][0] : 'local');
                        }}
                        className={cn(
                          "px-2.5 sm:px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer",
                          viewMode === 'spotlight'
                            ? "bg-amber-500 text-zinc-950 shadow-sm font-bold"
                            : "text-zinc-400 hover:text-white"
                        )}
                        title="Spotlight: Focus on active speaker or shared screen"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Spotlight</span>
                      </button>
                    </div>

                    {/* Minimize Button: Return to chat / file transfer while call stays on */}
                    <button
                      onClick={toggleMinimize}
                      className="px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer border bg-white/[0.05] text-zinc-300 border-white/[0.08] hover:bg-white/[0.1] hover:text-white"
                      title="Minimize to Picture-in-Picture to use Secure Chat and File Transfer"
                    >
                      <Minimize2 className="w-3.5 h-3.5 text-blue-400" />
                      <span className="hidden md:inline">Minimize</span>
                    </button>

                    {/* Quick Leave in header */}
                    <button
                      onClick={onEndCall}
                      className="px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/30"
                      title="Leave call"
                    >
                      <PhoneOff className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Leave</span>
                    </button>
                  </div>
                </div>

                {/* Main Meeting Stage Area */}
                <div className="flex-1 min-h-0 w-full p-2 sm:p-3 md:p-4 flex flex-col items-center justify-center overflow-hidden relative">
                  
                  {/* 1. SPOTLIGHT MODE LAYOUT */}
                  {viewMode === 'spotlight' && (
                    <div className="w-full h-full flex flex-col md:flex-row gap-2.5 sm:gap-3.5 overflow-hidden min-h-0">
                      
                      {/* Spotlight Main Stage (Hero Area) */}
                      <div className="flex-1 min-h-0 h-full flex items-center justify-center relative bg-[#0e1014] rounded-2xl sm:rounded-3xl overflow-hidden border border-white/[0.1] shadow-2xl ring-1 ring-white/5">
                        {effectiveSpotlightId === 'local' ? (
                          <LocalVideoTile 
                            stream={localStream}
                            screenTrack={screenTrack}
                            isVideoOff={isVideoOff}
                            isScreenSharing={isScreenSharing}
                            isLocalSpeaking={isLocalSpeaking}
                            isMicMuted={isMicMuted}
                            fitMode={tileFitModes['local'] || 'contain'}
                            isSpotlightStage={true}
                            onToggleFit={() => toggleTileFit('local')}
                            onUnspotlight={() => { setViewMode('grid'); setSpotlightId(null); }}
                          />
                        ) : (
                          effectiveSpotlightId && remoteStreams[effectiveSpotlightId] && (
                            <RemoteVideoTile 
                              id={effectiveSpotlightId}
                              name={resolveParticipantName(effectiveSpotlightId)}
                              stream={remoteStreams[effectiveSpotlightId]}
                              isRemoteVideoOff={peerTrackStates?.[effectiveSpotlightId]?.video === false || (type === 'audio' && peerTrackStates?.[effectiveSpotlightId]?.video !== true)}
                              isRemoteAudioMuted={peerTrackStates?.[effectiveSpotlightId]?.audio === false}
                              isScreenSharing={!!screenSharingPeers?.[effectiveSpotlightId]}
                              fitMode={tileFitModes[effectiveSpotlightId] || 'contain'}
                              isSpotlightStage={true}
                              onToggleFit={() => toggleTileFit(effectiveSpotlightId)}
                              onUnspotlight={() => { setViewMode('grid'); setSpotlightId(null); }}
                            />
                          )
                        )}
                      </div>

                      {/* Filmstrip (Thumbnails of other participants) */}
                      <div className="h-24 sm:h-28 md:h-full md:w-56 lg:w-64 flex flex-row md:flex-col gap-2 sm:gap-2.5 overflow-x-auto md:overflow-y-auto p-1 flex-shrink-0 min-h-0 scrollbar-thin">
                        {/* Local Thumbnail in filmstrip if not spotlighted */}
                        {effectiveSpotlightId !== 'local' && (
                          <div 
                            onClick={() => handleSpotlight('local')}
                            className="relative min-w-[125px] sm:min-w-[145px] md:min-w-0 md:w-full h-full md:h-34 rounded-xl sm:rounded-2xl overflow-hidden cursor-pointer group border border-white/10 hover:border-amber-400/60 transition-all shadow-lg bg-[#15171d] flex-shrink-0"
                            title="Click to spotlight your video"
                          >
                            <LocalVideoTile 
                              stream={localStream}
                              screenTrack={screenTrack}
                              isVideoOff={isVideoOff}
                              isScreenSharing={isScreenSharing}
                              isLocalSpeaking={isLocalSpeaking}
                              isMicMuted={isMicMuted}
                              fitMode={tileFitModes['local'] || 'contain'}
                              isThumbnail={true}
                            />
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleSpotlight('local'); }}
                                className="p-1.5 rounded-lg bg-black/70 hover:bg-amber-500 text-white text-xs shadow-md cursor-pointer transition-colors"
                                title="Spotlight You"
                              >
                                <Pin className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Remote Thumbnails in filmstrip */}
                        {remoteEntries.map(([id, stream]) => {
                          if (id === effectiveSpotlightId) return null;
                          const resolvedName = resolveParticipantName(id);
                          const trackState = peerTrackStates?.[id];
                          return (
                            <div 
                              key={id}
                              onClick={() => handleSpotlight(id)}
                              className="relative min-w-[125px] sm:min-w-[145px] md:min-w-0 md:w-full h-full md:h-34 rounded-xl sm:rounded-2xl overflow-hidden cursor-pointer group border border-white/10 hover:border-amber-400/60 transition-all shadow-lg bg-[#15171d] flex-shrink-0"
                              title={`Click to spotlight ${resolvedName}`}
                            >
                              <RemoteVideoTile 
                                id={id}
                                name={resolvedName}
                                stream={stream}
                                isRemoteVideoOff={trackState?.video === false || (type === 'audio' && trackState?.video !== true)}
                                isRemoteAudioMuted={trackState?.audio === false}
                                isScreenSharing={!!screenSharingPeers?.[id]}
                                fitMode={tileFitModes[id] || 'contain'}
                                isThumbnail={true}
                              />
                              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleSpotlight(id); }}
                                  className="p-1.5 rounded-lg bg-black/70 hover:bg-amber-500 text-white text-xs shadow-md cursor-pointer transition-colors"
                                  title={`Spotlight ${resolvedName}`}
                                >
                                  <Pin className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 2. BALANCED GRID MODE LAYOUT */}
                  {viewMode === 'grid' && (
                    <div className={cn("w-full h-full max-w-7xl flex-1 min-h-0 grid gap-2.5 sm:gap-3.5 md:gap-4 place-content-center p-1 sm:p-2", gridCols)}>
                      
                      {/* Local Participant Tile */}
                      <div className={cn(
                        "relative group bg-[#13151b] rounded-2xl sm:rounded-3xl overflow-hidden shadow-xl w-full h-full min-h-0 flex items-center justify-center border transition-all duration-300",
                        isLocalSpeaking 
                          ? "border-emerald-500/80 ring-2 ring-emerald-500/40 shadow-[0_0_24px_rgba(16,185,129,0.25)]" 
                          : "border-white/[0.08] hover:border-white/20"
                      )}>
                        <LocalVideoTile 
                          stream={localStream}
                          screenTrack={screenTrack}
                          isVideoOff={isVideoOff}
                          isScreenSharing={isScreenSharing}
                          isLocalSpeaking={isLocalSpeaking}
                          isMicMuted={isMicMuted}
                          fitMode={tileFitModes['local'] || (isScreenSharing ? 'contain' : 'contain')}
                          onToggleFit={() => toggleTileFit('local')}
                          onSpotlight={() => handleSpotlight('local')}
                        />
                      </div>

                      {/* Remote Participants */}
                      {remoteEntries.map(([id, stream]) => {
                        const resolvedName = resolveParticipantName(id);
                        const trackState = peerTrackStates?.[id];
                        return (
                          <div 
                            key={id}
                            className="relative group bg-[#13151b] rounded-2xl sm:rounded-3xl overflow-hidden shadow-xl w-full h-full min-h-0 flex items-center justify-center border transition-all duration-300 border-white/[0.08] hover:border-white/20"
                          >
                            <RemoteVideoTile 
                              id={id}
                              name={resolvedName}
                              stream={stream}
                              isRemoteVideoOff={trackState?.video === false || (type === 'audio' && trackState?.video !== true)}
                              isRemoteAudioMuted={trackState?.audio === false}
                              isScreenSharing={!!screenSharingPeers?.[id]}
                              fitMode={tileFitModes[id] || 'contain'}
                              onToggleFit={() => toggleTileFit(id)}
                              onSpotlight={() => handleSpotlight(id)}
                            />
                          </div>
                        );
                      })}

                      {/* Waiting state when alone in call */}
                      {remoteEntries.length === 0 && (
                        <div className="relative group bg-[#121419]/80 rounded-2xl sm:rounded-3xl overflow-hidden shadow-xl w-full h-full min-h-0 flex flex-col items-center justify-center p-4 sm:p-6 text-center border border-white/[0.08] border-dashed">
                          <div className="relative flex items-center justify-center mb-3">
                            <span className="animate-ping absolute inline-flex h-16 w-16 rounded-full bg-emerald-500/20" />
                            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 relative z-10 shadow-inner">
                              <Users className="w-6 h-6 sm:w-7 sm:h-7" />
                            </div>
                          </div>
                          <h4 className="text-xs sm:text-sm font-semibold text-zinc-200 mb-1">
                            Waiting for peer to connect...
                          </h4>
                          <p className="text-[11px] sm:text-xs text-zinc-400 max-w-xs">
                            The encrypted Quantum Link channel is standing by for the remote peer.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                </div>

                {/* Bottom Control Bar (Modern Elevated Island Dock) */}
                <div className="h-16 sm:h-20 bg-[#121419]/95 backdrop-blur-2xl border-t border-white/[0.08] flex items-center justify-between px-3 sm:px-6 md:px-8 flex-shrink-0 z-30 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
                  {/* Left side: Time & Status */}
                  <div className="hidden md:flex items-center text-xs font-medium text-zinc-300 w-1/4">
                    <span className="font-mono text-sm tracking-wide text-zinc-200">
                      {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span className="mx-3 text-white/20">|</span>
                    <span className="truncate text-zinc-400 text-xs flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      E2EE Direct P2P
                    </span>
                  </div>

                  {/* Center: Controls */}
                  <div className="flex items-center justify-center gap-2 sm:gap-3 md:gap-3.5 w-full md:w-auto">
                    {/* Mic Toggle */}
                    <button 
                      onClick={toggleMic}
                      className={cn(
                        "w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 rounded-2xl flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-md",
                        isMicMuted 
                          ? "bg-rose-600 text-white hover:bg-rose-500 shadow-rose-600/30 border border-rose-400/40" 
                          : "bg-white/[0.08] text-emerald-400 hover:bg-white/[0.14] border border-white/[0.08] hover:border-emerald-500/40"
                      )}
                      title={isMicMuted ? "Turn on microphone" : "Turn off microphone"}
                    >
                      {isMicMuted ? <MicOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Mic className="w-4 h-4 sm:w-5 sm:h-5" />}
                    </button>

                    {/* Video Toggle */}
                    <button 
                      onClick={toggleVideo}
                      className={cn(
                        "w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 rounded-2xl flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-md",
                        isVideoOff
                          ? "bg-rose-600 text-white hover:bg-rose-500 shadow-rose-600/30 border border-rose-400/40" 
                          : "bg-white/[0.08] text-zinc-200 hover:bg-white/[0.14] border border-white/[0.08]"
                      )}
                      title={isVideoOff ? "Turn on camera" : "Turn off camera"}
                    >
                      {isVideoOff ? <VideoOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Video className="w-4 h-4 sm:w-5 sm:h-5" />}
                    </button>

                    {/* Screen Share Toggle */}
                    <button 
                      onClick={toggleScreenShare}
                      className={cn(
                        "w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 rounded-2xl flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-md",
                        isScreenSharing
                          ? "bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-600/40 ring-2 ring-blue-400/50 border border-blue-400/50" 
                          : "bg-white/[0.08] text-zinc-200 hover:bg-white/[0.14] border border-white/[0.08] hover:border-blue-400/40"
                      )}
                      title={isScreenSharing ? "Stop sharing screen" : "Share screen (iPad / Desktop)"}
                    >
                      <MonitorUp className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>

                    {/* View Mode (Grid vs Spotlight) Toggle */}
                    <button 
                      onClick={() => {
                        if (viewMode === 'spotlight') {
                          setViewMode('grid');
                          setSpotlightId(null);
                        } else {
                          setViewMode('spotlight');
                          setSpotlightId(remoteEntries.length > 0 ? remoteEntries[0][0] : 'local');
                        }
                      }}
                      className={cn(
                        "w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 rounded-2xl flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-md",
                        viewMode === 'spotlight'
                          ? "bg-amber-500 text-zinc-950 font-bold shadow-amber-500/30 border border-amber-300"
                          : "bg-white/[0.08] text-zinc-200 hover:bg-white/[0.14] border border-white/[0.08] hover:border-amber-400/40"
                      )}
                      title={viewMode === 'spotlight' ? "Exit Spotlight mode" : "Spotlight mode"}
                    >
                      {viewMode === 'spotlight' ? <PinOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />}
                    </button>

                    {/* Minimize to PiP Toggle */}
                    <button
                      onClick={toggleMinimize}
                      className="w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 rounded-2xl flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-md bg-white/[0.08] text-zinc-200 hover:bg-white/[0.14] border border-white/[0.08]"
                      title="Minimize to Picture-in-Picture (use chat & file transfer)"
                    >
                      <Minimize2 className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
                    </button>

                    {/* End Call Button */}
                    <button 
                      onClick={onEndCall} 
                      className="h-10 sm:h-11 md:h-12 px-4 sm:px-6 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-medium flex items-center justify-center gap-2 shadow-lg shadow-rose-600/30 transition-all active:scale-95 cursor-pointer ml-1 sm:ml-2 border border-rose-400/30"
                      title="Leave call"
                    >
                      <PhoneOff className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span className="text-xs sm:text-sm font-semibold tracking-wide hidden sm:inline">Leave</span>
                    </button>
                  </div>

                  {/* Right side: Participant info */}
                  <div className="hidden md:flex items-center justify-end gap-3 w-1/4 text-zinc-300">
                    <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-xs font-medium text-zinc-300">
                      <Users className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{totalParticipants} participant{totalParticipants > 1 ? 's' : ''}</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}

// -------------------------------------------------------------
// LOCAL VIDEO TILE
// -------------------------------------------------------------
interface LocalVideoTileProps {
  stream: MediaStream | null;
  screenTrack: MediaStreamTrack | null;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  isLocalSpeaking: boolean;
  isMicMuted: boolean;
  fitMode?: 'contain' | 'cover';
  isSpotlightStage?: boolean;
  isThumbnail?: boolean;
  onToggleFit?: () => void;
  onSpotlight?: () => void;
  onUnspotlight?: () => void;
}

function LocalVideoTile({
  stream,
  screenTrack,
  isVideoOff,
  isScreenSharing,
  isLocalSpeaking,
  isMicMuted,
  fitMode = 'contain',
  isSpotlightStage = false,
  isThumbnail = false,
  onToggleFit,
  onSpotlight,
  onUnspotlight
}: LocalVideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [aspectLandscape, setAspectLandscape] = useState(false);
  const [manualMirror, setManualMirror] = useState<boolean | null>(null);

  // Check if camera has a live video track
  const hasActiveCameraTrack = Boolean(
    stream && stream.getVideoTracks().some(t => t.readyState === 'live')
  );

  // Check if screen sharing track is active and live
  const hasActiveScreenTrack = Boolean(
    isScreenSharing && screenTrack && screenTrack.readyState === 'live'
  );

  // Media stream to display in this video element:
  // When screen sharing is on, display screenTrack!
  // Otherwise, if camera is enabled, display stream.
  const displayStream = useMemo(() => {
    if (hasActiveScreenTrack && screenTrack) {
      return new MediaStream([screenTrack]);
    }
    if (!isVideoOff && stream && hasActiveCameraTrack) {
      return stream;
    }
    return null;
  }, [hasActiveScreenTrack, screenTrack, isVideoOff, stream, hasActiveCameraTrack]);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    if (displayStream) {
      if (vid.srcObject !== displayStream) {
        vid.srcObject = displayStream;
      }
      vid.play().catch(e => console.warn("Local video play error:", e));
    } else {
      vid.srcObject = null;
    }
  }, [displayStream]);

  const handleMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const vid = e.currentTarget;
    if (vid.videoWidth && vid.videoHeight) {
      setAspectLandscape(vid.videoWidth / vid.videoHeight >= 1.15);
    }
  };

  const showVideo = hasActiveScreenTrack || (!isVideoOff && hasActiveCameraTrack);

  return (
    <div className={cn(
      "w-full h-full flex items-center justify-center relative overflow-hidden bg-[#0d0e12]",
      isLocalSpeaking && !isThumbnail && "ring-2 ring-emerald-400/80 shadow-[0_0_24px_rgba(52,211,153,0.3)]"
    )}>
      {/* Video Element: uses object-contain so landscape iPad screen shares are NEVER cropped into portrait */}
      <video 
        ref={videoRef}
        autoPlay 
        playsInline 
        muted 
        onLoadedMetadata={handleMetadata}
        className={cn(
          "w-full h-full transition-all duration-150",
          fitMode === 'contain' ? "object-contain" : "object-cover",
          (hasActiveScreenTrack ? false : (manualMirror !== null ? manualMirror : true)) 
            ? "transform -scale-x-100" 
            : "transform-none",
          showVideo ? "opacity-100" : "opacity-0 pointer-events-none absolute inset-0"
        )}
      />

      {/* Subtle Vignette Gradient for badge & control legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/40 pointer-events-none" />

      {/* Avatar Fallback for audio or camera off */}
      {!showVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#181a22] to-[#0f1116]">
          <div className={cn(
            "rounded-full bg-blue-600/20 border flex items-center justify-center text-blue-200 font-bold uppercase shadow-2xl transition-all",
            isThumbnail ? "w-12 h-12 text-sm" : "w-22 h-22 sm:w-26 sm:h-26 text-2xl sm:text-3xl",
            isLocalSpeaking 
              ? "border-emerald-400 ring-4 ring-emerald-500/30 scale-105 shadow-[0_0_25px_rgba(16,185,129,0.35)]" 
              : "border-blue-500/30 shadow-inner"
          )}>
            You
          </div>
          {!isThumbnail && isVideoOff && !hasActiveScreenTrack && (
            <span className="text-xs text-zinc-400 mt-3 font-medium bg-black/40 px-3 py-1 rounded-full border border-white/5">
              Camera is turned off
            </span>
          )}
        </div>
      )}

      {/* Top Controls Overlay: Spotlight / Fit / Aspect info */}
      {!isThumbnail && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Flip / Mirror Camera button */}
          {!hasActiveScreenTrack && showVideo && (
            <button
              onClick={(e) => { 
                e.stopPropagation(); 
                setManualMirror(prev => (prev === null ? false : !prev)); 
              }}
              className="px-2.5 py-1.5 rounded-xl bg-black/60 hover:bg-black/85 text-xs font-medium text-white/90 backdrop-blur-xl border border-white/10 flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
              title="Mirror / Flip camera view"
            >
              <FlipHorizontal className="w-3.5 h-3.5 text-zinc-300" />
              <span className="text-[11px]">Flip</span>
            </button>
          )}

          {/* Fit / Fill toggle button */}
          {onToggleFit && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleFit(); }}
              className="px-2.5 py-1.5 rounded-xl bg-black/60 hover:bg-black/85 text-xs font-medium text-white/90 backdrop-blur-xl border border-white/10 flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
              title={fitMode === 'contain' ? "Switch to Fill (zoom to edge)" : "Switch to Fit (show entire screen without cropping)"}
            >
              {fitMode === 'contain' ? <Maximize2 className="w-3.5 h-3.5 text-zinc-300" /> : <Minimize2 className="w-3.5 h-3.5 text-zinc-300" />}
              <span className="text-[11px]">{fitMode === 'contain' ? 'Fit (Full)' : 'Fill'}</span>
            </button>
          )}

          {/* Spotlight / Unspotlight button */}
          {isSpotlightStage && onUnspotlight ? (
            <button
              onClick={(e) => { e.stopPropagation(); onUnspotlight(); }}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-xs font-bold text-zinc-950 backdrop-blur-xl flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
              title="Exit Spotlight Mode"
            >
              <PinOff className="w-3.5 h-3.5" />
              <span>Unpin</span>
            </button>
          ) : onSpotlight ? (
            <button
              onClick={(e) => { e.stopPropagation(); onSpotlight(); }}
              className="p-2 rounded-xl bg-black/60 hover:bg-amber-500 hover:text-zinc-950 text-white backdrop-blur-xl border border-white/10 shadow-md cursor-pointer transition-all"
              title="Spotlight your video"
            >
              <Pin className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
      )}

      {/* Spotlight Badge on Stage */}
      {isSpotlightStage && (
        <div className="absolute top-3 left-3 flex items-center gap-2 bg-amber-500 text-zinc-950 px-3 py-1.5 rounded-xl text-xs font-bold shadow-lg z-20 backdrop-blur-md">
          <Sparkles className="w-3.5 h-3.5" />
          <span>SPOTLIGHT • YOU</span>
          {hasActiveScreenTrack && <span className="bg-black/20 px-1.5 py-0.5 rounded-md text-[10px]">SCREEN</span>}
        </div>
      )}

      {/* Bottom Name & Audio Status Overlay */}
      <div className={cn(
        "absolute bottom-2.5 left-2.5 flex items-center gap-2 bg-black/60 backdrop-blur-xl border border-white/10 rounded-xl text-xs font-medium text-white shadow-lg z-10",
        isThumbnail ? "px-2 py-0.5 text-[10px]" : "px-3 py-1.5"
      )}>
        {isMicMuted ? (
          <MicOff className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
        ) : isLocalSpeaking ? (
          <div className="flex items-center gap-0.5 h-3">
            <span className="w-1 h-3 bg-emerald-400 rounded-full animate-pulse" />
            <span className="w-1 h-4 bg-emerald-400 rounded-full animate-pulse delay-75" />
            <span className="w-1 h-2 bg-emerald-400 rounded-full animate-pulse delay-150" />
          </div>
        ) : (
          <Mic className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
        )}
        <span className="truncate max-w-[120px]">
          You {hasActiveScreenTrack ? '(Screen)' : ''}
        </span>
        {aspectLandscape && hasActiveScreenTrack && !isThumbnail && (
          <span className="text-[10px] text-amber-300 bg-amber-400/20 px-1.5 py-0.5 rounded-md font-mono border border-amber-400/30">
            Landscape
          </span>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// REMOTE VIDEO TILE
// -------------------------------------------------------------
function RemoteVideoTile({ 
  stream, 
  id, 
  name,
  isRemoteVideoOff,
  isRemoteAudioMuted,
  isScreenSharing = false,
  fitMode = 'contain',
  isSpotlightStage = false,
  isThumbnail = false,
  onToggleFit,
  onSpotlight,
  onUnspotlight
}: { 
  stream: MediaStream; 
  id: string; 
  name: string; 
  isRemoteVideoOff?: boolean;
  isRemoteAudioMuted?: boolean;
  isScreenSharing?: boolean;
  fitMode?: 'contain' | 'cover';
  isSpotlightStage?: boolean;
  isThumbnail?: boolean;
  onToggleFit?: () => void;
  onSpotlight?: () => void;
  onUnspotlight?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasVideoTrack, setHasVideoTrack] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);

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

    return () => {
      stream.removeEventListener('addtrack', checkTracks);
      stream.removeEventListener('removetrack', checkTracks);
    };
  }, [stream]);

  useEffect(() => {
    if ((!isRemoteVideoOff || isScreenSharing) && videoRef.current) {
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
      }
      videoRef.current.play().catch(e => console.warn("Remote video resume play error:", e));
    }
  }, [isRemoteVideoOff, hasVideoTrack, isScreenSharing, stream]);

  const handleMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const vid = e.currentTarget;
    if (vid.videoWidth && vid.videoHeight) {
      const ratio = vid.videoWidth / vid.videoHeight;
      setIsLandscape(ratio >= 1.15);
    }
  };

  const initials = (name || id || "Node").substring(0, 2).toUpperCase();
  const showVideo = (hasVideoTrack && !isRemoteVideoOff) || isScreenSharing;

  return (
    <div className={cn(
      "w-full h-full flex items-center justify-center relative overflow-hidden bg-[#0d0e12]",
      isRemoteSpeaking && !isThumbnail && "ring-2 ring-emerald-400/80 shadow-[0_0_24px_rgba(52,211,153,0.3)]"
    )}>
      {/* Screen Sharing Badge */}
      {isScreenSharing && !isThumbnail && (
        <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-600/90 backdrop-blur-md text-white text-[11px] font-semibold border border-blue-400/40 shadow-lg">
          <Monitor className="w-3.5 h-3.5" />
          <span>{name}'s Screen</span>
        </div>
      )}

      {/* Video Element: uses object-contain by default so landscape iPad screen shares never crop */}
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted
        onLoadedMetadata={handleMetadata}
        className={cn(
          "w-full h-full transition-all duration-150",
          fitMode === 'contain' ? "object-contain" : "object-cover",
          !showVideo ? "opacity-0 pointer-events-none absolute inset-0" : "opacity-100"
        )}
      />

      {/* Subtle Vignette Gradient for badge & control legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/40 pointer-events-none" />

      {/* Avatar Fallback for audio calls or when camera is off */}
      {!showVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#181a22] to-[#0f1116]">
          <div className={cn(
            "rounded-full bg-emerald-600/20 border flex items-center justify-center text-emerald-200 font-bold uppercase shadow-2xl transition-all",
            isThumbnail ? "w-12 h-12 text-sm" : "w-22 h-22 sm:w-26 sm:h-26 text-2xl sm:text-3xl",
            isRemoteSpeaking 
              ? "border-emerald-400 ring-4 ring-emerald-500/30 scale-105 shadow-[0_0_25px_rgba(16,185,129,0.35)]" 
              : "border-emerald-500/30 shadow-inner"
          )}>
            {initials}
          </div>
          {!isThumbnail && isRemoteVideoOff && (
            <p className="text-xs text-zinc-400 mt-3 font-medium bg-black/40 px-3 py-1 rounded-full border border-white/5">
              Camera turned off
            </p>
          )}
        </div>
      )}

      {/* Top Controls: Spotlight & Fit Mode */}
      {!isThumbnail && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Fit / Fill toggle */}
          {onToggleFit && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleFit(); }}
              className="px-2.5 py-1.5 rounded-xl bg-black/60 hover:bg-black/85 text-xs font-medium text-white/90 backdrop-blur-xl border border-white/10 flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
              title={fitMode === 'contain' ? "Switch to Fill (zoom to edge)" : "Switch to Fit (show entire screen without cropping)"}
            >
              {fitMode === 'contain' ? <Maximize2 className="w-3.5 h-3.5 text-zinc-300" /> : <Minimize2 className="w-3.5 h-3.5 text-zinc-300" />}
              <span className="text-[11px]">{fitMode === 'contain' ? 'Fit (Full)' : 'Fill'}</span>
            </button>
          )}

          {/* Spotlight / Unspotlight button */}
          {isSpotlightStage && onUnspotlight ? (
            <button
              onClick={(e) => { e.stopPropagation(); onUnspotlight(); }}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-xs font-bold text-zinc-950 backdrop-blur-xl flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
              title="Exit Spotlight Mode"
            >
              <PinOff className="w-3.5 h-3.5" />
              <span>Unpin</span>
            </button>
          ) : onSpotlight ? (
            <button
              onClick={(e) => { e.stopPropagation(); onSpotlight(); }}
              className="p-2 rounded-xl bg-black/60 hover:bg-amber-500 hover:text-zinc-950 text-white backdrop-blur-xl border border-white/10 shadow-md cursor-pointer transition-all"
              title={`Spotlight ${name}`}
            >
              <Pin className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
      )}

      {/* Spotlight Badge on Stage */}
      {isSpotlightStage && (
        <div className="absolute top-3 left-3 flex items-center gap-2 bg-amber-500 text-zinc-950 px-3 py-1.5 rounded-xl text-xs font-bold shadow-lg z-20 backdrop-blur-md">
          <Sparkles className="w-3.5 h-3.5" />
          <span>SPOTLIGHT: {name.toUpperCase()}</span>
          {isLandscape && <span className="bg-black/20 px-1.5 py-0.5 rounded-md text-[10px]">LANDSCAPE</span>}
        </div>
      )}

      {/* Participant Name Badge */}
      <div className={cn(
        "absolute bottom-2.5 left-2.5 flex items-center gap-2 bg-black/60 backdrop-blur-xl border border-white/10 rounded-xl text-xs font-medium text-white shadow-lg z-10",
        isThumbnail ? "px-2 py-0.5 text-[10px]" : "px-3 py-1.5"
      )}>
        {isRemoteAudioMuted ? (
          <MicOff className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
        ) : isRemoteSpeaking ? (
          <div className="flex items-center gap-0.5 h-3">
            <span className="w-1 h-3 bg-emerald-400 rounded-full animate-pulse" />
            <span className="w-1 h-4 bg-emerald-400 rounded-full animate-pulse delay-75" />
            <span className="w-1 h-2 bg-emerald-400 rounded-full animate-pulse delay-150" />
          </div>
        ) : (
          <Volume2 className="w-3.5 h-3.5 text-zinc-300 flex-shrink-0" />
        )}
        <span className="truncate max-w-[120px]">{name}</span>
        {isLandscape && !isThumbnail && (
          <span className="text-[10px] text-amber-300 bg-amber-400/20 px-1.5 py-0.5 rounded-md font-mono border border-amber-400/30">
            Landscape
          </span>
        )}
      </div>
    </div>
  );
}
