import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';
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
  
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div 
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.9 }}
          className="fixed bottom-6 right-6 z-[100] bg-black/80 backdrop-blur-xl border border-white/20 p-4 rounded-3xl shadow-2xl flex flex-col gap-4 min-w-[200px]"
        >
          <div className="flex items-center justify-between">
            <span className="text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              {type === 'video' ? 'Video Call' : 'Audio Call'}
            </span>
            <span className="text-white/50 text-xs font-mono">0:00</span>
          </div>

          <div className="flex gap-2 max-w-[400px] overflow-x-auto">
            {type === 'video' && localStream && (
              <video 
                ref={localVideoRef}
                autoPlay 
                playsInline 
                muted 
                className="w-24 h-32 object-cover rounded-xl bg-black/50 border border-white/10"
              />
            )}
            {Object.values(remoteStreams).map((stream, i) => (
              <StreamView key={i} stream={stream} type={type} />
            ))}
          </div>

          <div className="flex justify-center gap-4">
            <button onClick={onEndCall} className="w-12 h-12 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition shadow-lg">
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StreamView({ stream, type }: { stream: MediaStream, type: 'audio' | 'video' | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);

  if (type === 'audio') {
    return <audio autoPlay ref={ref as any} />;
  }

  return (
    <video 
      ref={ref} 
      autoPlay 
      playsInline 
      className="w-24 h-32 object-cover rounded-xl bg-black/50 border border-white/10"
    />
  );
}
