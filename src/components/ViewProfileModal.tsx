import React from 'react';
import { motion } from 'motion/react';
import { X, User, Calendar, Info } from 'lucide-react';
import { UserProfile } from '../types';
import { cn } from '../lib/utils';

interface ViewProfileModalProps {
  profile: UserProfile;
  onClose: () => void;
}

export function ViewProfileModal({ profile, onClose }: ViewProfileModalProps) {
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
            className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Avatar Display */}
          <div className="flex flex-col items-center gap-4">
            <div className={cn(
              "w-32 h-32 rounded-full flex items-center justify-center text-white text-5xl font-bold shadow-xl border-4 border-white dark:border-zinc-800",
              profile.avatarColor || "bg-accent"
            )}>
              {profile.username.charAt(0).toUpperCase() || '?'}
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-2xl font-bold text-text">{profile.username}</h3>
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

        <div className="p-4 bg-zinc-50/50 dark:bg-zinc-800/20 border-t border-gray-100 dark:border-white/5">
          <button 
            onClick={onClose}
            className="w-full px-4 py-3 text-sm font-semibold bg-zinc-100 dark:bg-white/5 text-text hover:bg-zinc-200 dark:hover:bg-white/10 rounded-xl transition-all"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}
