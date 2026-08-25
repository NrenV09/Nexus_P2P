import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, User, Shield, Calendar, Palette, Info, RefreshCw } from 'lucide-react';
import { UserProfile } from '../types';
import { cn } from '../lib/utils';
import { generateRandomName } from '../lib/nameGenerator';

interface ProfileModalProps {
  profile: UserProfile;
  onSave: (profile: UserProfile) => void;
  onClose: () => void;
}

const AVATAR_COLORS = [
  'bg-accent',
  'bg-red-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-yellow-500',
  'bg-lime-500',
  'bg-green-500',
  'bg-emerald-500',
  'bg-teal-500',
  'bg-cyan-500',
  'bg-sky-500',
  'bg-blue-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-purple-500',
  'bg-fuchsia-500',
  'bg-pink-500',
  'bg-rose-500',
  'bg-zinc-800'
];

export function ProfileModal({ profile, onSave, onClose }: ProfileModalProps) {
  const [editedProfile, setEditedProfile] = useState<UserProfile>({ ...profile });

  const isValid = editedProfile.username.trim().length > 0;

  const handleSave = () => {
    if (!isValid) return;
    onSave({
      ...editedProfile,
      username: editedProfile.username.trim()
    });
    onClose();
  };

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
            <div className={cn("p-2 rounded-xl text-white shadow-sm", editedProfile.avatarColor)}>
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text">User Profile</h2>
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
          {/* Avatar Preview */}
          <div className="flex flex-col items-center gap-4">
            <div className={cn(
              "w-24 h-24 rounded-full flex items-center justify-center text-white text-4xl font-bold shadow-xl border-4 border-white dark:border-zinc-800 transition-all duration-300",
              editedProfile.avatarColor
            )}>
              {editedProfile.username.charAt(0).toUpperCase() || '?'}
            </div>
            <div className="text-center">
              <p className="text-xs font-mono text-muted mb-1">NODE_ID: {profile.id}</p>
              <div className="flex items-center gap-1.5 text-[10px] text-muted justify-center">
                <Calendar className="w-3 h-3" />
                Joined {new Date(profile.joinedAt).toLocaleDateString()}
              </div>
            </div>
          </div>

          {/* Username */}
          <div className="space-y-2">
            <div className="flex justify-between items-center ml-1">
              <label className="text-xs font-semibold text-muted flex items-center gap-1.5">
                <Shield className="w-3 h-3" />
                NODE ALIAS
              </label>
              <button
                onClick={() => setEditedProfile({...editedProfile, username: generateRandomName()})}
                className="text-[10px] uppercase font-bold text-accent hover:text-accent/80 transition-colors flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                Randomize
              </button>
            </div>
            <input 
              type="text"
              value={editedProfile.username}
              onChange={(e) => setEditedProfile({ ...editedProfile, username: e.target.value.substring(0, 20) })}
              className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-gray-200 dark:border-white/5 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-accent outline-none transition-all"
              placeholder="Enter node alias..."
            />
          </div>

          {/* Bio */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted flex items-center gap-1.5 ml-1">
              <Info className="w-3 h-3" />
              COMM TRANSMISSION BIO
            </label>
            <textarea 
              value={editedProfile.bio}
              onChange={(e) => setEditedProfile({ ...editedProfile, bio: e.target.value.substring(0, 100) })}
              className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-gray-200 dark:border-white/5 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-accent outline-none transition-all min-h-[80px] resize-none"
              placeholder="Tell other nodes about you..."
            />
            <p className="text-[10px] text-right text-muted">{editedProfile.bio.length}/100</p>
          </div>

          {/* Avatar Colors */}
          <div className="space-y-3">
            <label className="text-xs font-semibold text-muted flex items-center gap-1.5 ml-1">
              <Palette className="w-3 h-3" />
              NODE SIGNATURE COLOR
            </label>
            <div className="grid grid-cols-5 sm:grid-cols-6 gap-3 max-h-32 overflow-y-auto p-1 scrollbar-hide">
              {AVATAR_COLORS.map((color) => (
                <div
                  key={color}
                  onClick={() => setEditedProfile({ ...editedProfile, avatarColor: color })}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setEditedProfile({ ...editedProfile, avatarColor: color });
                    }
                  }}
                  className={cn(
                    "h-10 rounded-xl transition-all relative overflow-hidden cursor-pointer",
                    color,
                    editedProfile.avatarColor === color ? "ring-2 ring-offset-2 ring-accent scale-105 shadow-md border border-white/20" : "opacity-80 hover:opacity-100 hover:scale-105"
                  )}
                >
                  {editedProfile.avatarColor === color && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                      <div className="w-2 h-2 bg-white rounded-full shadow-sm" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 bg-zinc-50/50 dark:bg-zinc-800/20 border-t border-gray-100 dark:border-white/5 flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 px-4 py-3 text-sm font-semibold text-muted hover:text-text hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-all"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={!isValid}
            className={cn(
              "flex-[2] px-4 py-3 text-sm font-semibold text-white rounded-xl shadow-lg transition-all",
              isValid 
                ? "bg-accent shadow-accent/20 hover:brightness-110 active:scale-[0.98]" 
                : "bg-gray-400 dark:bg-zinc-700 opacity-50 cursor-not-allowed"
            )}
          >
            Update Manifest
          </button>
        </div>
      </motion.div>
    </div>
  );
}
