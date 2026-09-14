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
  Info
} from 'lucide-react';
import { cn } from '../lib/utils';

export function CallOverlay({
  active,
  type,
  localStream,
  remoteStreams,
  onEndCall
}: {
  active: boolean;
  type: 'audio' | 'video' | null;
  localStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  onEndCall: () => void;
}) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  const toggleMic = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
        setIsMicMuted(!track.enabled);
      });
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
        setIsVideoOff(!track.enabled);
      });
    }
  };

  // Google Meet layout logic
  const remoteEntries = Object.entries(remoteStreams);
  const totalParticipants = 1 + remoteEntries.length; // 1 for local

  // Grid styling based on participant count
  let gridCols = "grid-cols-1";
  if (totalParticipants === 2) gridCols = "md:grid-cols-2 grid-cols-1";
  else if (totalParticipants >= 3 && totalParticipants <= 4) gridCols = "grid-cols-2";
  else if (totalParticipants > 4) gridCols = "grid-cols-3";

  return (
    <AnimatePresence>
      {active && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-[#202124] text-white flex flex-col font-sans"
        >
          {/* Main Content - Video Grid */}
          <div className="flex-1 p-4 md:p-6 flex items-center justify-center overflow-hidden">
            <div className={cn("w-full h-full grid gap-4 place-content-center", gridCols)}>
              
              {/* Local Participant */}
              <div className="relative group bg-[#3c4043] rounded-xl overflow-hidden shadow-sm h-full max-h-full flex flex-col justify-center min-h-[200px]">
                {(type === 'audio' || isVideoOff) ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-24 h-24 rounded-full bg-blue-500/20 flex items-center justify-center text-4xl text-blue-300 font-medium">
                      You
                    </div>
                  </div>
                ) : (
                  <video 
                    ref={localVideoRef}
                    autoPlay 
                    playsInline 
                    muted 
                    className="w-full h-full object-cover"
                  />
                )}
                
                {/* Overlay Name & Status */}
                <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-md text-sm">
                  {isMicMuted && <MicOff className="w-4 h-4 text-red-500" />}
                  You
                </div>
              </div>

              {/* Remote Participants */}
              {remoteEntries.map(([id, stream]) => (
                <StreamView key={id} id={id} stream={stream} type={type} />
              ))}

            </div>
          </div>

          {/* Bottom Control Bar */}
          <div className="h-20 bg-[#202124] flex items-center justify-between px-4 md:px-6 flex-shrink-0">
            {/* Left side: Time */}
            <div className="hidden md:flex items-center text-sm font-medium text-white/90 w-1/3">
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              <span className="mx-3 text-white/40">|</span>
              <span className="truncate">Quantum Secure Link</span>
            </div>

            {/* Center: Controls */}
            <div className="flex items-center justify-center gap-3 w-full md:w-1/3">
              <button 
                onClick={toggleMic}
                className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
                  isMicMuted 
                    ? "bg-[#ea4335] text-white hover:bg-[#d93025]" 
                    : "bg-[#3c4043] text-white hover:bg-[#4a4d51]"
                )}
              >
                {isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              <button 
                onClick={toggleVideo}
                className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
                  (isVideoOff || type === 'audio')
                    ? "bg-[#ea4335] text-white hover:bg-[#d93025]" 
                    : "bg-[#3c4043] text-white hover:bg-[#4a4d51]"
                )}
                disabled={type === 'audio'}
              >
                {(isVideoOff || type === 'audio') ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              </button>
              
              <button className="hidden sm:flex w-12 h-12 rounded-full bg-[#3c4043] text-white items-center justify-center hover:bg-[#4a4d51] transition-colors cursor-not-allowed opacity-80" title="Present now">
                <MonitorUp className="w-5 h-5" />
              </button>

              <button className="hidden sm:flex w-12 h-12 rounded-full bg-[#3c4043] text-white items-center justify-center hover:bg-[#4a4d51] transition-colors cursor-not-allowed opacity-80">
                <MoreVertical className="w-5 h-5" />
              </button>

              <button 
                onClick={onEndCall} 
                className="w-16 h-12 rounded-full bg-[#ea4335] text-white flex items-center justify-center hover:bg-[#d93025] transition-colors ml-2"
              >
                <PhoneOff className="w-5 h-5" />
              </button>
            </div>

            {/* Right side: Extras */}
            <div className="hidden md:flex items-center justify-end gap-4 w-1/3 text-white/90">
              <button className="p-2 hover:bg-[#3c4043] rounded-full transition-colors">
                <Info className="w-5 h-5" />
              </button>
              <button className="p-2 hover:bg-[#3c4043] rounded-full transition-colors">
                <Users className="w-5 h-5" />
              </button>
              <button className="p-2 hover:bg-[#3c4043] rounded-full transition-colors">
                <MessageSquare className="w-5 h-5" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StreamView({ stream, type, id }: { stream: MediaStream, type: 'audio' | 'video' | null, id: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
    }
    
    const checkVideo = () => {
      const videoTracks = stream.getVideoTracks();
      setHasVideo(videoTracks.length > 0 && videoTracks[0].enabled);
    };

    checkVideo();
    stream.addEventListener('addtrack', checkVideo);
    stream.addEventListener('removetrack', checkVideo);
    
    return () => {
      stream.removeEventListener('addtrack', checkVideo);
      stream.removeEventListener('removetrack', checkVideo);
    };
  }, [stream]);

  if (type === 'audio') {
    return (
      <div className="relative group bg-[#3c4043] rounded-xl overflow-hidden shadow-sm h-full min-h-[200px] flex flex-col justify-center">
        <audio autoPlay ref={ref as any} />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-24 h-24 rounded-full bg-emerald-500/20 flex items-center justify-center text-4xl text-emerald-300 font-medium uppercase">
            {id.substring(0,2)}
          </div>
        </div>
        <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-md text-sm">
          {id}
        </div>
      </div>
    );
  }

  return (
    <div className="relative group bg-[#3c4043] rounded-xl overflow-hidden shadow-sm h-full min-h-[200px] flex flex-col justify-center">
      <video 
        ref={ref} 
        autoPlay 
        playsInline 
        className={cn("w-full h-full object-cover", !hasVideo && "hidden")}
      />
      
      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-24 h-24 rounded-full bg-purple-500/20 flex items-center justify-center text-4xl text-purple-300 font-medium uppercase">
            {id.substring(0,2)}
          </div>
        </div>
      )}

      <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-md text-sm">
        {id}
      </div>
    </div>
  );
}
