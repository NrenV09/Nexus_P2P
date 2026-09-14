import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  PhoneOff, 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  MoreVertical, 
  MonitorUp,
  MessageSquare,
  Users,
  Info,
  Volume2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { UserProfile } from '../types';

export function CallOverlay({
  active,
  type,
  localStream,
  remoteStreams,
  peerProfiles,
  onEndCall,
  onToggleTrack
}: {
  active: boolean;
  type: 'audio' | 'video' | null;
  localStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  peerProfiles?: Record<string, UserProfile>;
  onEndCall: () => void;
  onToggleTrack?: (kind: 'audio' | 'video', enabled: boolean) => void;
}) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(type === 'audio');
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(e => console.warn("Local preview play error:", e));
    }
  }, [localStream, active]);

  useEffect(() => {
    setIsVideoOff(type === 'audio');
  }, [type]);

  const toggleMic = () => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      const newEnabled = isMicMuted; // toggling from muted to unmuted
      audioTracks.forEach(track => {
        track.enabled = newEnabled;
      });
      setIsMicMuted(!newEnabled);
      onToggleTrack?.('audio', newEnabled);
    }
  };

  const toggleVideo = () => {
    if (type === 'audio') return;
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      const newEnabled = isVideoOff; // toggling from off to on
      videoTracks.forEach(track => {
        track.enabled = newEnabled;
      });
      setIsVideoOff(!newEnabled);
      onToggleTrack?.('video', newEnabled);
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
              <div className="relative group bg-[#3c4043] rounded-2xl overflow-hidden shadow-md h-full min-h-[200px] flex items-center justify-center border border-white/10">
                {(type === 'audio' || isVideoOff || !localStream?.getVideoTracks().length) ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#28292c]">
                    <div className="w-24 h-24 rounded-full bg-blue-600/30 border-2 border-blue-400/40 flex items-center justify-center text-3xl text-blue-200 font-bold uppercase shadow-inner">
                      You
                    </div>
                  </div>
                ) : (
                  <video 
                    ref={localVideoRef}
                    autoPlay 
                    playsInline 
                    muted 
                    className="w-full h-full object-cover transform -scale-x-100"
                  />
                )}
                
                {/* Overlay Name & Status */}
                <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg text-xs font-medium text-white shadow">
                  {isMicMuted ? (
                    <MicOff className="w-3.5 h-3.5 text-red-400" />
                  ) : (
                    <Mic className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  <span>You (Local)</span>
                </div>
              </div>

              {/* Remote Participants */}
              {remoteEntries.map(([id, stream]) => {
                const profile = peerProfiles?.[id];
                const name = profile?.username || 'Remote Peer';
                return (
                  <StreamView 
                    key={id} 
                    id={id} 
                    name={name}
                    stream={stream} 
                    type={type} 
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
                  (isVideoOff || type === 'audio')
                    ? "bg-[#ea4335] text-white hover:bg-[#d93025]" 
                    : "bg-[#3c4043] text-white hover:bg-[#4a4d51]"
                )}
                disabled={type === 'audio'}
                title={isVideoOff ? "Turn on camera" : "Turn off camera"}
              >
                {(isVideoOff || type === 'audio') ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
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
  type, 
  id, 
  name 
}: { 
  key?: string;
  stream: MediaStream; 
  type: 'audio' | 'video' | null; 
  id: string; 
  name: string; 
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [hasVideoTrack, setHasVideoTrack] = useState(false);

  useEffect(() => {
    const updateTracks = () => {
      const vTracks = stream.getVideoTracks();
      const aTracks = stream.getAudioTracks();
      const vActive = vTracks.length > 0 && vTracks.some(t => t.readyState === 'live' && t.enabled);
      setHasVideoTrack(vActive);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(e => console.warn("Video playback prevented:", e));
      }
      if (audioRef.current) {
        audioRef.current.srcObject = stream;
        audioRef.current.play().catch(e => console.warn("Audio playback prevented:", e));
      }
    };

    updateTracks();

    stream.addEventListener('addtrack', updateTracks);
    stream.addEventListener('removetrack', updateTracks);
    const interval = setInterval(updateTracks, 1000);

    return () => {
      clearInterval(interval);
      stream.removeEventListener('addtrack', updateTracks);
      stream.removeEventListener('removetrack', updateTracks);
    };
  }, [stream]);

  const initials = (name || id || "Peer").substring(0, 2).toUpperCase();

  return (
    <div className="relative group bg-[#3c4043] rounded-2xl overflow-hidden shadow-md h-full min-h-[200px] flex items-center justify-center border border-white/10">
      {/* Dedicated audio element to guarantee remote audio plays even if video is paused */}
      <audio ref={audioRef} autoPlay playsInline />

      {/* Video Element */}
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        className={cn(
          "w-full h-full object-cover",
          (!hasVideoTrack || type === 'audio') && "invisible absolute pointer-events-none"
        )}
      />

      {/* Avatar Fallback for audio calls or when camera is off */}
      {(!hasVideoTrack || type === 'audio') && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#28292c]">
          <div className="w-24 h-24 rounded-full bg-emerald-600/30 border-2 border-emerald-400/40 flex items-center justify-center text-3xl text-emerald-200 font-bold uppercase shadow-inner">
            {initials}
          </div>
        </div>
      )}

      {/* Participant Name Badge */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg text-xs font-medium text-white shadow">
        <Volume2 className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
        <span>{name}</span>
      </div>
    </div>
  );
}
