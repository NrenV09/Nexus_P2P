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
  Volume2,
  Pin,
  PinOff,
  Sparkles,
  LayoutGrid,
  Maximize2,
  Minimize2,
  GripHorizontal
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
  getPeerName,
  onEndCall,
  onToggleTrack,
  onRequestAddTrack,
  isMinimized = false,
  onToggleMinimize
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
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
}) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(type === 'audio');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

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

      // When starting screen sharing, automatically spotlight self and set contain mode (preserves landscape orientation)
      setTileFitModes(prev => ({ ...prev, local: 'contain' }));
      setViewMode('spotlight');
      setSpotlightId('local');

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

          {/* MAIN CALL CONTAINER */}
          <motion.div 
            layout
            drag={minimized}
            dragMomentum={false}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className={cn(
              "text-white flex flex-col font-sans select-none transition-shadow duration-200",
              minimized
                ? "fixed bottom-5 right-5 z-[95] w-72 sm:w-80 md:w-88 rounded-2xl shadow-2xl border border-white/20 bg-[#1e2024]/95 backdrop-blur-xl overflow-hidden cursor-move"
                : "fixed inset-0 z-[110] bg-[#1a1b1e] overflow-hidden cursor-default"
            )}
          >
            {/* ------------------------------------------------------------- */}
            {/* MINIMIZED (PICTURE-IN-PICTURE) MODE WIDGET                     */}
            {/* Allows using Secure Chat and File Transfer simultaneously      */}
            {/* ------------------------------------------------------------- */}
            {minimized ? (
              <div className="w-full flex flex-col">
                {/* Mini Header: Drag bar + Expand button */}
                <div className="h-10 px-3 bg-[#26282c] border-b border-white/10 flex items-center justify-between flex-shrink-0 cursor-grab active:cursor-grabbing">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <GripHorizontal className="w-3.5 h-3.5 text-white/40 flex-shrink-0" />
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                    <span className="text-xs font-semibold text-white/90 truncate">
                      {pipPrimaryId === 'local' ? 'Call Preview' : resolveParticipantName(pipPrimaryId)}
                    </span>
                    <span className="text-[10px] text-white/40 font-mono hidden sm:inline">
                      {currentTime.toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Maximize Button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleMinimize(); }}
                      className="p-1 rounded-lg hover:bg-white/15 text-white/80 hover:text-white transition-colors cursor-pointer"
                      title="Maximize call to full screen"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Mini Video Feed (Aspect-preserved with object-contain) */}
                <div 
                  onClick={toggleMinimize}
                  className="w-full h-44 sm:h-48 bg-[#121316] relative overflow-hidden cursor-pointer group flex items-center justify-center"
                  title="Click to maximize meeting"
                >
                  {pipPrimaryId === 'local' ? (
                    <LocalVideoTile 
                      videoRef={localVideoRef}
                      isVideoOff={isVideoOff}
                      hasActiveVideoTrack={hasActiveVideoTrack}
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
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[2px] z-20">
                    <span className="text-xs font-semibold bg-white/20 px-2.5 py-1 rounded-full text-white flex items-center gap-1.5 shadow">
                      <Maximize2 className="w-3.5 h-3.5" />
                      Click to Maximize
                    </span>
                  </div>

                  {/* Multiple participant badge if > 1 remote */}
                  {totalParticipants > 2 && (
                    <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/60 text-[10px] font-medium text-white/80 backdrop-blur-md z-10">
                      +{totalParticipants - 1} peers
                    </div>
                  )}
                </div>

                {/* Mini Control Strip */}
                <div className="h-12 px-3 bg-[#202124] border-t border-white/10 flex items-center justify-between flex-shrink-0">
                  <div className="flex items-center gap-2">
                    {/* Mic Toggle */}
                    <button 
                      onClick={toggleMic}
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center transition-transform active:scale-95 cursor-pointer shadow",
                        isMicMuted ? "bg-red-500 text-white" : "bg-white/10 hover:bg-white/20 text-white"
                      )}
                      title={isMicMuted ? "Unmute mic" : "Mute mic"}
                    >
                      {isMicMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                    </button>

                    {/* Video Toggle */}
                    <button 
                      onClick={toggleVideo}
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center transition-transform active:scale-95 cursor-pointer shadow",
                        (isVideoOff || !hasActiveVideoTrack) ? "bg-red-500 text-white" : "bg-white/10 hover:bg-white/20 text-white"
                      )}
                      title={isVideoOff ? "Turn on camera" : "Turn off camera"}
                    >
                      {(isVideoOff || !hasActiveVideoTrack) ? <VideoOff className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Expand Button */}
                    <button
                      onClick={toggleMinimize}
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span>Expand</span>
                    </button>

                    {/* End Call */}
                    <button 
                      onClick={onEndCall}
                      className="w-8 h-8 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-transform active:scale-95 cursor-pointer shadow"
                      title="Leave call"
                    >
                      <PhoneOff className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* ------------------------------------------------------------- */
              /* FULL-SCREEN MEETING MODE                                      */
              /* ------------------------------------------------------------- */
              <div className="w-full h-full flex flex-col">
                {/* Top Bar: View Mode Switcher, Call Info & Minimize Button */}
                <div className="h-14 px-4 md:px-6 flex items-center justify-between border-b border-white/10 bg-[#202124]/90 backdrop-blur-md flex-shrink-0 z-20">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs font-mono">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="font-semibold tracking-wide">QUANTUM LINK</span>
                      <span className="text-white/40">•</span>
                      <span className="text-white/70">{type === 'video' ? 'Video Meeting' : 'Encrypted Audio'}</span>
                    </div>

                    {viewMode === 'spotlight' && (
                      <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-medium animate-fadeIn">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Spotlight: {resolveParticipantName(effectiveSpotlightId || '')}</span>
                      </div>
                    )}
                  </div>

                  {/* View Mode & Minimize Controls */}
                  <div className="flex items-center gap-2">
                    {/* Minimize Button: Return to chat / file transfer while call stays on */}
                    <button
                      onClick={toggleMinimize}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer border bg-white/5 text-white/80 border-white/10 hover:bg-white/10 hover:text-white"
                      title="Minimize to Picture-in-Picture to use Secure Chat and File Transfer"
                    >
                      <Minimize2 className="w-3.5 h-3.5 text-blue-400" />
                      <span className="hidden sm:inline">Minimize (Use Chat/Files)</span>
                    </button>

                    {/* Spotlight / Grid Switcher */}
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
                        "px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-all cursor-pointer border",
                        viewMode === 'spotlight'
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30"
                          : "bg-white/5 text-white/80 border-white/10 hover:bg-white/10"
                      )}
                      title={viewMode === 'spotlight' ? "Switch to Grid View" : "Prioritize a user with Spotlight Mode"}
                    >
                      {viewMode === 'spotlight' ? (
                        <>
                          <LayoutGrid className="w-3.5 h-3.5" />
                          <span>Grid View</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                          <span>Spotlight Mode</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Main Meeting Stage Area */}
                <div className="flex-1 p-2 md:p-4 flex flex-col items-center justify-center overflow-hidden relative">
                  
                  {/* 1. SPOTLIGHT MODE LAYOUT */}
                  {viewMode === 'spotlight' && (
                    <div className="w-full h-full flex flex-col md:flex-row gap-3 overflow-hidden">
                      
                      {/* Spotlight Main Stage (Hero Area) */}
                      <div className="flex-1 h-full min-h-[300px] flex items-center justify-center relative bg-[#131416] rounded-2xl overflow-hidden border border-white/15 shadow-2xl">
                        {effectiveSpotlightId === 'local' ? (
                          <LocalVideoTile 
                            videoRef={localVideoRef}
                            isVideoOff={isVideoOff}
                            hasActiveVideoTrack={hasActiveVideoTrack}
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
                              fitMode={tileFitModes[effectiveSpotlightId] || 'contain'}
                              isSpotlightStage={true}
                              onToggleFit={() => toggleTileFit(effectiveSpotlightId)}
                              onUnspotlight={() => { setViewMode('grid'); setSpotlightId(null); }}
                            />
                          )
                        )}
                      </div>

                      {/* Filmstrip (Thumbnails of other participants) */}
                      <div className="h-32 md:h-full md:w-56 lg:w-64 flex flex-row md:flex-col gap-2.5 overflow-x-auto md:overflow-y-auto p-1 flex-shrink-0">
                        {/* Local Thumbnail in filmstrip if not spotlighted */}
                        {effectiveSpotlightId !== 'local' && (
                          <div 
                            onClick={() => handleSpotlight('local')}
                            className="relative min-w-[140px] md:min-w-0 md:w-full h-full md:h-36 rounded-xl overflow-hidden cursor-pointer group border border-white/10 hover:border-amber-400/60 transition-all shadow-md bg-[#25272a] flex-shrink-0"
                            title="Click to spotlight your video"
                          >
                            <LocalVideoTile 
                              videoRef={localVideoRef}
                              isVideoOff={isVideoOff}
                              hasActiveVideoTrack={hasActiveVideoTrack}
                              isScreenSharing={isScreenSharing}
                              isLocalSpeaking={isLocalSpeaking}
                              isMicMuted={isMicMuted}
                              fitMode={tileFitModes['local'] || 'contain'}
                              isThumbnail={true}
                            />
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleSpotlight('local'); }}
                                className="p-1.5 rounded-md bg-black/70 hover:bg-amber-500 text-white text-xs shadow cursor-pointer"
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
                              className="relative min-w-[140px] md:min-w-0 md:w-full h-full md:h-36 rounded-xl overflow-hidden cursor-pointer group border border-white/10 hover:border-amber-400/60 transition-all shadow-md bg-[#25272a] flex-shrink-0"
                              title={`Click to spotlight ${resolvedName}`}
                            >
                              <RemoteVideoTile 
                                id={id}
                                name={resolvedName}
                                stream={stream}
                                isRemoteVideoOff={trackState?.video === false || (type === 'audio' && trackState?.video !== true)}
                                isRemoteAudioMuted={trackState?.audio === false}
                                fitMode={tileFitModes[id] || 'contain'}
                                isThumbnail={true}
                              />
                              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleSpotlight(id); }}
                                  className="p-1.5 rounded-md bg-black/70 hover:bg-amber-500 text-white text-xs shadow cursor-pointer"
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
                    <div className={cn("w-full h-full max-w-6xl max-h-[85vh] grid gap-3 md:gap-4 place-content-center", gridCols)}>
                      
                      {/* Local Participant Tile */}
                      <div className={cn(
                        "relative group bg-[#25272a] rounded-2xl overflow-hidden shadow-md h-full min-h-[200px] flex items-center justify-center border transition-all duration-300",
                        isLocalSpeaking ? "border-emerald-500 ring-2 ring-emerald-500/40" : "border-white/10"
                      )}>
                        <LocalVideoTile 
                          videoRef={localVideoRef}
                          isVideoOff={isVideoOff}
                          hasActiveVideoTrack={hasActiveVideoTrack}
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
                            className={cn(
                              "relative group bg-[#25272a] rounded-2xl overflow-hidden shadow-md h-full min-h-[200px] flex items-center justify-center border transition-all duration-300",
                              "border-white/10"
                            )}
                          >
                            <RemoteVideoTile 
                              id={id}
                              name={resolvedName}
                              stream={stream}
                              isRemoteVideoOff={trackState?.video === false || (type === 'audio' && trackState?.video !== true)}
                              isRemoteAudioMuted={trackState?.audio === false}
                              fitMode={tileFitModes[id] || 'contain'}
                              onToggleFit={() => toggleTileFit(id)}
                              onSpotlight={() => handleSpotlight(id)}
                            />
                          </div>
                        );
                      })}

                      {/* Waiting state when alone in call */}
                      {remoteEntries.length === 0 && (
                        <div className="relative group bg-[#202225] rounded-2xl overflow-hidden shadow-md h-full min-h-[200px] flex flex-col items-center justify-center p-6 text-center border border-white/10 border-dashed">
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
                  )}

                </div>

                {/* Bottom Control Bar (Google Meet Style) */}
                <div className="h-20 bg-[#202124] border-t border-white/10 flex items-center justify-between px-4 md:px-8 flex-shrink-0 z-20">
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
                      title={isScreenSharing ? "Stop sharing screen" : "Share screen (iPad / Desktop)"}
                    >
                      <MonitorUp className="w-5 h-5" />
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
                        "w-12 h-12 rounded-full flex items-center justify-center transition-transform active:scale-95 cursor-pointer shadow-md",
                        viewMode === 'spotlight'
                          ? "bg-amber-500 text-white hover:bg-amber-600 ring-2 ring-amber-400/50"
                          : "bg-[#3c4043] text-white hover:bg-[#4a4d51]"
                      )}
                      title={viewMode === 'spotlight' ? "Exit Spotlight mode" : "Spotlight mode"}
                    >
                      {viewMode === 'spotlight' ? <PinOff className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
                    </button>

                    {/* Minimize to PiP Toggle */}
                    <button
                      onClick={toggleMinimize}
                      className="w-12 h-12 rounded-full flex items-center justify-center transition-transform active:scale-95 cursor-pointer shadow-md bg-[#3c4043] text-white hover:bg-[#4a4d51]"
                      title="Minimize to Picture-in-Picture (use chat & file transfer)"
                    >
                      <Minimize2 className="w-5 h-5" />
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
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// -------------------------------------------------------------
// LOCAL VIDEO TILE
// -------------------------------------------------------------
function LocalVideoTile({
  videoRef,
  isVideoOff,
  hasActiveVideoTrack,
  isScreenSharing,
  isLocalSpeaking,
  isMicMuted,
  fitMode = 'contain',
  isSpotlightStage = false,
  isThumbnail = false,
  onToggleFit,
  onSpotlight,
  onUnspotlight
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  isVideoOff: boolean;
  hasActiveVideoTrack: boolean;
  isScreenSharing: boolean;
  isLocalSpeaking: boolean;
  isMicMuted: boolean;
  fitMode?: 'contain' | 'cover';
  isSpotlightStage?: boolean;
  isThumbnail?: boolean;
  onToggleFit?: () => void;
  onSpotlight?: () => void;
  onUnspotlight?: () => void;
}) {
  const [aspectLandscape, setAspectLandscape] = useState(false);

  const handleMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const vid = e.currentTarget;
    if (vid.videoWidth && vid.videoHeight) {
      setAspectLandscape(vid.videoWidth / vid.videoHeight >= 1.15);
    }
  };

  return (
    <div className={cn(
      "w-full h-full flex items-center justify-center relative overflow-hidden bg-[#121316]",
      isLocalSpeaking && !isThumbnail && "ring-2 ring-emerald-500/50"
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
          isScreenSharing ? "transform-none" : "transform -scale-x-100",
          (isVideoOff || !hasActiveVideoTrack) ? "opacity-0 pointer-events-none absolute inset-0" : "opacity-100"
        )}
      />

      {/* Avatar Fallback for audio or camera off */}
      {(isVideoOff || !hasActiveVideoTrack) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#25272a]">
          <div className={cn(
            "rounded-full bg-blue-600/30 border-2 flex items-center justify-center text-blue-200 font-bold uppercase shadow-inner transition-all",
            isThumbnail ? "w-12 h-12 text-sm" : "w-24 h-24 text-3xl",
            isLocalSpeaking ? "border-emerald-400 ring-4 ring-emerald-500/30 scale-105" : "border-blue-400/40"
          )}>
            You
          </div>
          {!isThumbnail && isVideoOff && (
            <span className="text-xs text-white/50 mt-2 font-medium">Camera is off</span>
          )}
        </div>
      )}

      {/* Top Controls Overlay: Spotlight / Fit / Aspect info */}
      {!isThumbnail && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Fit / Fill toggle button */}
          {onToggleFit && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleFit(); }}
              className="px-2 py-1 rounded-md bg-black/70 hover:bg-black text-xs font-medium text-white/90 backdrop-blur-md flex items-center gap-1 shadow cursor-pointer"
              title={fitMode === 'contain' ? "Switch to Fill (zoom to edge)" : "Switch to Fit (show entire screen without cropping)"}
            >
              {fitMode === 'contain' ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
              <span className="text-[11px]">{fitMode === 'contain' ? 'Fit (Full)' : 'Fill'}</span>
            </button>
          )}

          {/* Spotlight / Unspotlight button */}
          {isSpotlightStage && onUnspotlight ? (
            <button
              onClick={(e) => { e.stopPropagation(); onUnspotlight(); }}
              className="px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-600 text-xs font-semibold text-white backdrop-blur-md flex items-center gap-1 shadow cursor-pointer"
              title="Exit Spotlight Mode"
            >
              <PinOff className="w-3 h-3" />
              <span>Unpin</span>
            </button>
          ) : onSpotlight ? (
            <button
              onClick={(e) => { e.stopPropagation(); onSpotlight(); }}
              className="p-1.5 rounded-md bg-black/70 hover:bg-amber-500 text-white backdrop-blur-md shadow cursor-pointer"
              title="Spotlight your video"
            >
              <Pin className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
      )}

      {/* Spotlight Badge on Stage */}
      {isSpotlightStage && (
        <div className="absolute top-3 left-3 flex items-center gap-2 bg-amber-500/90 text-black px-2.5 py-1 rounded-md text-xs font-bold shadow z-20 backdrop-blur-sm">
          <Sparkles className="w-3.5 h-3.5" />
          <span>SPOTLIGHT • YOU</span>
          {isScreenSharing && <span className="bg-black/20 px-1 rounded text-[10px]">SCREEN</span>}
        </div>
      )}

      {/* Bottom Name & Audio Status Overlay */}
      <div className={cn(
        "absolute bottom-2 left-2 flex items-center gap-2 bg-black/65 backdrop-blur-md rounded-lg text-xs font-medium text-white shadow z-10",
        isThumbnail ? "px-2 py-0.5 text-[10px]" : "px-3 py-1.5"
      )}>
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
        <span className="truncate max-w-[120px]">
          You {isScreenSharing ? '(Screen)' : ''}
        </span>
        {aspectLandscape && isScreenSharing && !isThumbnail && (
          <span className="text-[10px] text-amber-300 bg-amber-400/20 px-1 py-0.5 rounded font-mono">
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
    if (!isRemoteVideoOff && videoRef.current && hasVideoTrack) {
      videoRef.current.play().catch(e => console.warn("Remote video resume play error:", e));
    }
  }, [isRemoteVideoOff, hasVideoTrack]);

  const handleMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const vid = e.currentTarget;
    if (vid.videoWidth && vid.videoHeight) {
      const ratio = vid.videoWidth / vid.videoHeight;
      setIsLandscape(ratio >= 1.15);
    }
  };

  const initials = (name || id || "Node").substring(0, 2).toUpperCase();
  const showVideo = hasVideoTrack && !isRemoteVideoOff;

  return (
    <div className={cn(
      "w-full h-full flex items-center justify-center relative overflow-hidden bg-[#121316]",
      isRemoteSpeaking && !isThumbnail && "ring-2 ring-emerald-500/50"
    )}>
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

      {/* Avatar Fallback for audio calls or when camera is off */}
      {!showVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#25272a]">
          <div className={cn(
            "rounded-full bg-emerald-600/30 border-2 flex items-center justify-center text-emerald-200 font-bold uppercase shadow-inner transition-all",
            isThumbnail ? "w-12 h-12 text-sm" : "w-24 h-24 text-3xl",
            isRemoteSpeaking ? "border-emerald-400 ring-4 ring-emerald-500/30 scale-105" : "border-emerald-400/40"
          )}>
            {initials}
          </div>
          {!isThumbnail && isRemoteVideoOff && (
            <p className="text-xs text-white/50 mt-2 font-medium">Camera turned off</p>
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
              className="px-2 py-1 rounded-md bg-black/70 hover:bg-black text-xs font-medium text-white/90 backdrop-blur-md flex items-center gap-1 shadow cursor-pointer"
              title={fitMode === 'contain' ? "Switch to Fill (zoom to edge)" : "Switch to Fit (show entire screen without cropping)"}
            >
              {fitMode === 'contain' ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
              <span className="text-[11px]">{fitMode === 'contain' ? 'Fit (Full)' : 'Fill'}</span>
            </button>
          )}

          {/* Spotlight / Unspotlight button */}
          {isSpotlightStage && onUnspotlight ? (
            <button
              onClick={(e) => { e.stopPropagation(); onUnspotlight(); }}
              className="px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-600 text-xs font-semibold text-white backdrop-blur-md flex items-center gap-1 shadow cursor-pointer"
              title="Exit Spotlight Mode"
            >
              <PinOff className="w-3 h-3" />
              <span>Unpin</span>
            </button>
          ) : onSpotlight ? (
            <button
              onClick={(e) => { e.stopPropagation(); onSpotlight(); }}
              className="p-1.5 rounded-md bg-black/70 hover:bg-amber-500 text-white backdrop-blur-md shadow cursor-pointer"
              title={`Spotlight ${name}`}
            >
              <Pin className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
      )}

      {/* Spotlight Badge on Stage */}
      {isSpotlightStage && (
        <div className="absolute top-3 left-3 flex items-center gap-2 bg-amber-500/90 text-black px-2.5 py-1 rounded-md text-xs font-bold shadow z-20 backdrop-blur-sm">
          <Sparkles className="w-3.5 h-3.5" />
          <span>SPOTLIGHT: {name.toUpperCase()}</span>
          {isLandscape && <span className="bg-black/20 px-1 rounded text-[10px]">LANDSCAPE</span>}
        </div>
      )}

      {/* Participant Name Badge */}
      <div className={cn(
        "absolute bottom-2 left-2 flex items-center gap-2 bg-black/65 backdrop-blur-md rounded-lg text-xs font-medium text-white shadow z-10",
        isThumbnail ? "px-2 py-0.5 text-[10px]" : "px-3 py-1.5"
      )}>
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
        <span className="truncate max-w-[120px]">{name}</span>
        {isLandscape && !isThumbnail && (
          <span className="text-[10px] text-amber-300 bg-amber-400/20 px-1 py-0.5 rounded font-mono">
            Landscape
          </span>
        )}
      </div>
    </div>
  );
}
