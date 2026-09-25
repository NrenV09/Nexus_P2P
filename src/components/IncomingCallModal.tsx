import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, PhoneOff, Video, Users, MonitorUp } from 'lucide-react';
import { cn } from '../lib/utils';

export interface IncomingCallData {
  peerId: string;
  callerName: string;
  callerAvatar?: string;
  callerColor?: string;
  callType: 'audio' | 'video';
  isScreenMirror?: boolean;
  sdp: RTCSessionDescriptionInit;
}

interface IncomingCallModalProps {
  incomingCall: IncomingCallData | null;
  onAccept: (call: IncomingCallData) => void;
  onDecline: (call: IncomingCallData) => void;
}

export function IncomingCallModal({
  incomingCall,
  onAccept,
  onDecline
}: IncomingCallModalProps) {
  const isScreen = Boolean(incomingCall?.isScreenMirror);
  const isVideo = incomingCall?.callType === 'video' || isScreen;

  return (
    <AnimatePresence>
      {incomingCall && (
        <motion.div
          key="incoming-call-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 font-sans"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 20, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="bg-[#202124] border border-white/20 text-white rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-2xl flex flex-col items-center text-center relative overflow-hidden"
          >
            {/* Subtle animated background glow */}
            <div className="absolute -top-16 -left-16 w-36 h-36 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-16 -right-16 w-36 h-36 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />

            {/* Caller Avatar with pulsing ring */}
            <div className="relative mb-5">
              <div className="absolute -inset-2.5 rounded-full bg-blue-500/30 animate-ping opacity-75" />
              <div className={cn(
                "w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold uppercase shadow-lg border-2 border-white/20 relative z-10 overflow-hidden",
                incomingCall.callerColor || "bg-gradient-to-tr from-blue-600 to-indigo-600"
              )}>
                {incomingCall.callerAvatar ? (
                  <img 
                    src={incomingCall.callerAvatar} 
                    alt={incomingCall.callerName} 
                    className="w-full h-full object-cover" 
                  />
                ) : (
                  incomingCall.callerName.substring(0, 2)
                )}
              </div>
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[#1a73e8] flex items-center justify-center text-white border-2 border-[#202124] z-20">
                {isScreen ? <MonitorUp className="w-3.5 h-3.5" /> : isVideo ? <Video className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
              </div>
            </div>

            {/* Caller Details */}
            <h3 className="text-xl font-bold tracking-tight text-white mb-1">
              {incomingCall.callerName}
            </h3>
            <p className="text-sm text-white/70 mb-6 flex items-center gap-1.5 font-medium">
              <span>
                {isScreen 
                  ? 'Incoming Screen Mirror Broadcast' 
                  : isVideo 
                    ? 'Incoming Video Call' 
                    : 'Incoming Voice Call'}
              </span>
            </p>

            <p className="text-xs text-white/50 mb-8 max-w-[240px]">
              {isScreen 
                ? 'Real-time peer-to-peer screen mirroring over Quantum Link.' 
                : 'End-to-end encrypted direct peer connection over Quantum Link matrix.'}
            </p>

            {/* Action Buttons */}
            <div className="flex items-center justify-center gap-6 w-full">
              {/* Decline */}
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={() => onDecline(incomingCall)}
                  className="w-14 h-14 rounded-full bg-[#ea4335] hover:bg-[#d93025] text-white flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 cursor-pointer"
                  title="Decline"
                >
                  <PhoneOff className="w-6 h-6" />
                </button>
                <span className="text-[11px] text-white/60 font-medium">Decline</span>
              </div>

              {/* Accept */}
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={() => onAccept(incomingCall)}
                  className="w-14 h-14 rounded-full bg-[#34a853] hover:bg-[#2d9249] text-white flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 cursor-pointer"
                  title={isScreen ? "Watch Screen" : "Accept Call"}
                >
                  {isScreen ? <MonitorUp className="w-6 h-6" /> : isVideo ? <Video className="w-6 h-6" /> : <Phone className="w-6 h-6" />}
                </button>
                <span className="text-[11px] text-white/60 font-medium">
                  {isScreen ? "Watch Screen" : "Join Call"}
                </span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
