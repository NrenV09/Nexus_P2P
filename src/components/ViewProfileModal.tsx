import React from 'react';
import { motion } from 'motion/react';
import { X, User, Calendar, Info, Phone, Video, MonitorUp } from 'lucide-react';
import { UserProfile } from '../types';
import { cn } from '../lib/utils';

interface ViewProfileModalProps {
  profile: UserProfile;
  onClose: () => void;
  onStartCall?: (type: 'audio' | 'video' | 'screen') => void;
}

export function ViewProfileModal({ profile, onClose, onStartCall }: ViewProfileModalProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl overflow-hidden border border-white/20 dark:border-white/5"
      >
        <div className="p-6 border-b border-gray-100 dark:border-white/5 flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/50">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-xl text-white shadow-sm", profile.avatarColor || "bg-accent")}>
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text">Node Details</h2>
              <p className="text-xs text-muted">Quantum Node Identity</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Avatar Display */}
          <div className="flex flex-col items-center gap-4">
            <div className={cn(
              "w-28 h-28 rounded-full flex items-center justify-center text-white text-5xl font-bold shadow-xl border-4 border-white dark:border-zinc-800 overflow-hidden relative",
              profile.avatarColor || "bg-accent"
            )}>
              {profile.avatarImage ? (
                <img 
                  src={profile.avatarImage} 
                  alt={profile.username} 
                  className="w-full h-full object-cover" 
                />
              ) : (
                profile.username.charAt(0).toUpperCase() || '?'
              )}
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-2xl font-bold text-text flex items-center justify-center gap-2">
                {profile.username}
                {profile.avatarImage && (
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    Custom Avatar
                  </span>
                )}
              </h3>
              <p className="text-xs font-mono text-muted mb-1">NODE_ID: {profile.id}</p>
              <div className="flex items-center gap-1.5 text-xs text-muted justify-center bg-zinc-100 dark:bg-zinc-800/50 px-3 py-1.5 rounded-full">
                <Calendar className="w-3.5 h-3.5" />
                Joined {new Date(profile.joinedAt).toLocaleDateString()}
              </div>
            </div>
          </div>

          {/* Bio */}
          <div className="space-y-3 pt-4 border-t border-gray-100 dark:border-white/5">
            <label className="text-xs font-semibold text-muted flex items-center gap-1.5 ml-1">
              <Info className="w-3.5 h-3.5" />
              COMM TRANSMISSION BIO
            </label>
            <div className="bg-zinc-50 dark:bg-zinc-800/50 border border-gray-100 dark:border-white/5 rounded-2xl px-5 py-4 text-sm text-text leading-relaxed min-h-[80px]">
              {profile.bio || "No bio information provided by this node."}
            </div>
          </div>
        </div>

        <div className="p-4 bg-zinc-50/50 dark:bg-zinc-800/20 border-t border-gray-100 dark:border-white/5 flex flex-wrap gap-2">
          {onStartCall && (
            <>
              <button 
                onClick={() => { onClose(); onStartCall('audio'); }}
                className="flex-1 min-w-[90px] px-3 py-2.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
              >
                <Phone className="w-3.5 h-3.5" />
                Voice
              </button>
              <button 
                onClick={() => { onClose(); onStartCall('video'); }}
                className="flex-1 min-w-[90px] px-3 py-2.5 text-xs font-semibold bg-accent hover:bg-accent/90 text-white rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
              >
                <Video className="w-3.5 h-3.5" />
                Video
              </button>
              <button 
                onClick={() => { onClose(); onStartCall('screen'); }}
                className="flex-1 min-w-[110px] px-3 py-2.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
                title="Mirror your screen directly to this peer"
              >
                <MonitorUp className="w-3.5 h-3.5" />
                Mirror Screen
              </button>
            </>
          )}
          <button 
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-semibold bg-zinc-100 dark:bg-white/5 text-text hover:bg-zinc-200 dark:hover:bg-white/10 rounded-xl transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}
