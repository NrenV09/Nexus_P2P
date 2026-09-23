import React, { useRef, useEffect, useState } from 'react';
import { useNexus } from './NexusContext';
import { NexusPeer } from './types';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  ShieldCheck,
  Crown,
  Maximize2,
  Users,
  Activity
} from 'lucide-react';

interface PeerVideoCardProps {
  peer: NexusPeer;
  isLocal?: boolean;
  stream?: MediaStream | null;
  isMuted?: boolean;
  isVideoOff?: boolean;
}

const PeerVideoCard: React.FC<PeerVideoCardProps> = ({
  peer,
  isLocal = false,
  stream,
  isMuted = false,
  isVideoOff = false
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hasVideoTrack, setHasVideoTrack] = useState<boolean>(false);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      const vTracks = stream.getVideoTracks();
      setHasVideoTrack(vTracks.length > 0 && vTracks[0].enabled);

      const handleTrackUpdate = () => {
        const tracks = stream.getVideoTracks();
        setHasVideoTrack(tracks.length > 0 && tracks[0].enabled);
      };

      stream.addEventListener('addtrack', handleTrackUpdate);
      stream.addEventListener('removetrack', handleTrackUpdate);

      return () => {
        stream.removeEventListener('addtrack', handleTrackUpdate);
        stream.removeEventListener('removetrack', handleTrackUpdate);
      };
    } else {
      setHasVideoTrack(false);
    }
  }, [stream]);

  return (
    <div className="relative flex flex-col rounded-2xl overflow-hidden bg-slate-900/90 border border-white/10 shadow-xl aspect-video group transition-all duration-300 hover:border-accent/40">
      {/* Video Element or Avatar Fallback */}
      {stream && hasVideoTrack && !isVideoOff ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={`w-full h-full object-cover ${isLocal ? 'scale-x-[-1]' : ''}`}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 relative overflow-hidden">
          {/* Animated radar rings */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-28 h-28 rounded-full border border-accent/20 animate-ping opacity-40" />
            <div className="w-44 h-44 rounded-full border border-accent/10 animate-pulse" />
          </div>

          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-lg relative z-10 ${peer.avatarColor || 'bg-accent'}`}>
            {peer.username ? peer.username.charAt(0).toUpperCase() : 'P'}
          </div>

          <span className="text-xs font-medium text-slate-300 mt-2 font-mono relative z-10">
            {isVideoOff ? 'Camera Paused' : 'Connecting Media Stream...'}
          </span>
        </div>
      )}

      {/* Top Overlay Badges */}
      <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-1.5">
          {peer.isHost && (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 backdrop-blur-md">
              <Crown className="w-2.5 h-2.5" />
              HOST
            </span>
          )}
          {isLocal && (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 backdrop-blur-md">
              YOU
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono bg-black/60 text-emerald-400 border border-white/10 backdrop-blur-md flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            30 FPS
          </span>
        </div>
      </div>

      {/* Bottom Identity & Mic Status Bar */}
      <div className="absolute bottom-0 inset-x-0 p-2.5 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isMuted ? 'bg-rose-500' : 'bg-emerald-400 animate-pulse'}`} />
          <span className="text-xs font-semibold text-white tracking-wide truncate max-w-[130px] sm:max-w-[170px]">
            {peer.username}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-slate-400">
          {isMuted ? (
            <MicOff className="w-3.5 h-3.5 text-rose-400" />
          ) : (
            <Mic className="w-3.5 h-3.5 text-emerald-400" />
          )}
          {isVideoOff ? (
            <VideoOff className="w-3.5 h-3.5 text-rose-400" />
          ) : (
            <Video className="w-3.5 h-3.5 text-slate-300" />
          )}
        </div>
      </div>
    </div>
  );
};

export const UnifiedVideoGrid: React.FC = () => {
  const {
    localPeer,
    peersList,
    globalCallState,
    endGroupCall
  } = useNexus();

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [duration, setDuration] = useState(0);

  // Call timer
  useEffect(() => {
    if (!globalCallState.isActive) {
      setDuration(0);
      return;
    }
    const interval = setInterval(() => {
      setDuration(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [globalCallState.isActive]);

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Toggle local mic
  const toggleMic = () => {
    if (globalCallState.localStream) {
      const audioTracks = globalCallState.localStream.getAudioTracks();
      audioTracks.forEach(t => {
        t.enabled = !t.enabled;
      });
      setIsMuted(prev => !prev);
    }
  };

  // Toggle local video
  const toggleVideo = () => {
    if (globalCallState.localStream) {
      const videoTracks = globalCallState.localStream.getVideoTracks();
      videoTracks.forEach(t => {
        t.enabled = !t.enabled;
      });
      setIsVideoOff(prev => !prev);
    }
  };

  if (!globalCallState.isActive) {
    return null;
  }

  // All 5 participants: Local Peer + all remote peers
  const allParticipants: { peer: NexusPeer; isLocal: boolean; stream?: MediaStream | null }[] = [
    {
      peer: localPeer,
      isLocal: true,
      stream: globalCallState.localStream || localPeer.stream
    },
    ...peersList.map(peer => ({
      peer,
      isLocal: false,
      stream: globalCallState.streams[peer.id] || peer.stream
    }))
  ];

  return (
    <div className="flex flex-col w-full bg-slate-950/95 backdrop-blur-2xl rounded-3xl border border-rose-500/30 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
      {/* Conference Header */}
      <div className="p-3.5 bg-gradient-to-r from-rose-950/40 via-purple-950/30 to-slate-900/50 border-b border-white/10 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-3 h-3 rounded-full bg-rose-500 animate-pulse" />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white tracking-wide">
                Unified Group Video Conference
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                <Users className="w-2.5 h-2.5" />
                {allParticipants.length} Connected Nodes
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
              <span>Time: <strong className="text-white">{formatDuration(duration)}</strong></span>
              <span>•</span>
              <span className="text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                SRTP Mesh Encrypted
              </span>
            </div>
          </div>
        </div>

        {/* Call Controls Bar */}
        <div className="flex items-center gap-2 bg-black/50 p-1.5 rounded-2xl border border-white/10 shadow-inner">
          <button
            onClick={toggleMic}
            className={`p-2 rounded-xl transition-all cursor-pointer ${
              isMuted ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30' : 'bg-white/10 text-white hover:bg-white/20'
            }`}
            title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <button
            onClick={toggleVideo}
            className={`p-2 rounded-xl transition-all cursor-pointer ${
              isVideoOff ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30' : 'bg-white/10 text-white hover:bg-white/20'
            }`}
            title={isVideoOff ? 'Turn Camera On' : 'Turn Camera Off'}
          >
            {isVideoOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
          </button>

          <button
            onClick={endGroupCall}
            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-rose-950/50 cursor-pointer hover:scale-105"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            <span>Leave Conference</span>
          </button>
        </div>
      </div>

      {/* Synchronized 5-Peer Video Grid */}
      <div className="p-3 lg:p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[520px] overflow-y-auto">
        {allParticipants.map(({ peer, isLocal, stream }) => (
          <PeerVideoCard
            key={peer.id}
            peer={peer}
            isLocal={isLocal}
            stream={stream}
            isMuted={isLocal ? isMuted : false}
            isVideoOff={isLocal ? isVideoOff : false}
          />
        ))}
      </div>
    </div>
  );
};
