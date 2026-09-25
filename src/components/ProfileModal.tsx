import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { X, User, Shield, Calendar, Palette, Info, RefreshCw, Camera, Upload, Trash2, Image as ImageIcon } from 'lucide-react';
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

const PRESET_AVATARS = [
  {
    name: 'Cyberpunk',
    url: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#6366f1"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="#0f172a"/><circle cx="50" cy="42" r="20" fill="url(#g1)"/><path d="M26 84c0-14 11-22 24-22s24 8 24 22" fill="url(#g1)"/><rect x="36" y="38" width="28" height="7" rx="3.5" fill="#38bdf8"/><circle cx="43" cy="41.5" r="2" fill="#fff"/><circle cx="57" cy="41.5" r="2" fill="#fff"/></svg>`)}`
  },
  {
    name: 'Quantum',
    url: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#10b981"/><stop offset="100%" stop-color="#06b6d4"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="#064e3b"/><circle cx="50" cy="50" r="28" fill="none" stroke="url(#g2)" stroke-width="4"/><ellipse cx="50" cy="50" rx="34" ry="13" fill="none" stroke="#34d399" stroke-width="3" transform="rotate(30 50 50)"/><ellipse cx="50" cy="50" rx="34" ry="13" fill="none" stroke="#22d3ee" stroke-width="3" transform="rotate(-30 50 50)"/><circle cx="50" cy="50" r="9" fill="#fff"/></svg>`)}`
  },
  {
    name: 'Sentinel',
    url: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g3" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#ef4444"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="#451a03"/><path d="M50 22 L74 36 L74 64 L50 78 L26 64 L26 36 Z" fill="url(#g3)"/><circle cx="50" cy="50" r="11" fill="#fff"/><circle cx="50" cy="50" r="5" fill="#78350f"/></svg>`)}`
  },
  {
    name: 'Vortex',
    url: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g4" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ec4899"/><stop offset="100%" stop-color="#8b5cf6"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="#3b0764"/><circle cx="50" cy="48" r="26" fill="url(#g4)"/><circle cx="42" cy="44" r="4.5" fill="#fff"/><circle cx="58" cy="44" r="4.5" fill="#fff"/><path d="M42 58 Q50 66 58 58" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`)}`
  },
  {
    name: 'Cosmos',
    url: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g5" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#0284c7"/><stop offset="100%" stop-color="#9333ea"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="#030712"/><circle cx="50" cy="44" r="18" fill="url(#g5)"/><ellipse cx="50" cy="74" rx="26" ry="14" fill="url(#g5)"/><circle cx="50" cy="42" r="7" fill="#38bdf8"/></svg>`)}`
  }
];

export function ProfileModal({ profile, onSave, onClose }: ProfileModalProps) {
  const [editedProfile, setEditedProfile] = useState<UserProfile>({ ...profile });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isValid = editedProfile.username.trim().length > 0;

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 160;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Center square crop
        const minDim = Math.min(img.width, img.height);
        const startX = (img.width - minDim) / 2;
        const startY = (img.height - minDim) / 2;

        ctx.drawImage(img, startX, startY, minDim, minDim, 0, 0, size, size);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

        setEditedProfile(prev => ({
          ...prev,
          avatarImage: dataUrl
        }));
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setEditedProfile(prev => {
      const next = { ...prev };
      delete next.avatarImage;
      return next;
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

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
            className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Avatar & Photo Upload Section */}
          <div className="flex flex-col items-center gap-3">
            <input 
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleImageChange}
              className="hidden"
            />
            
            <div className="relative group">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "w-24 h-24 sm:w-28 sm:h-28 rounded-full flex items-center justify-center text-white text-4xl sm:text-5xl font-bold shadow-xl border-4 border-white dark:border-zinc-800 transition-all duration-300 overflow-hidden cursor-pointer group-hover:scale-105 group-hover:shadow-accent/20 relative select-none",
                  editedProfile.avatarColor
                )}
                title="Click to choose a profile picture"
              >
                {editedProfile.avatarImage ? (
                  <img 
                    src={editedProfile.avatarImage} 
                    alt={editedProfile.username} 
                    className="w-full h-full object-cover" 
                  />
                ) : (
                  editedProfile.username.charAt(0).toUpperCase() || '?'
                )}
                
                {/* Hover Camera Overlay */}
                <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white backdrop-blur-[1px]">
                  <Camera className="w-6 h-6 mb-1 drop-shadow" />
                  <span className="text-[10px] font-semibold tracking-wide uppercase">Change</span>
                </div>
              </div>

              {/* Quick Action Camera Button Badge */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 p-2 rounded-full bg-accent text-white shadow-lg border-2 border-white dark:border-zinc-800 hover:scale-110 active:scale-95 transition-transform cursor-pointer"
                title="Upload Profile Picture"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>

            {/* Profile Picture Action Buttons */}
            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-1.5 rounded-xl bg-accent/10 hover:bg-accent/20 text-accent text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-accent/20 shadow-sm active:scale-95"
              >
                <Upload className="w-3.5 h-3.5" />
                {editedProfile.avatarImage ? "Upload Image" : "Add Picture"}
              </button>
              
              {editedProfile.avatarImage && (
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-red-500/20 shadow-sm active:scale-95"
                  title="Remove custom picture"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              )}
            </div>

            {/* Quick Avatar Presets */}
            <div className="w-full flex flex-col items-center gap-1.5 pt-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted">Or Pick Preset Avatar</span>
              <div className="flex items-center justify-center gap-2">
                {PRESET_AVATARS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => setEditedProfile(prev => ({ ...prev, avatarImage: preset.url }))}
                    className={cn(
                      "w-8 h-8 rounded-full overflow-hidden border-2 transition-all hover:scale-110 cursor-pointer shadow-sm",
                      editedProfile.avatarImage === preset.url 
                        ? "border-accent ring-2 ring-accent/30 scale-105" 
                        : "border-white/20 dark:border-white/10 opacity-70 hover:opacity-100"
                    )}
                    title={`Choose ${preset.name} avatar`}
                  >
                    <img src={preset.url} alt={preset.name} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-muted text-center max-w-[300px]">
              Profile picture is shared across the Nexus mesh and displayed during voice & video calls.
            </p>

            <div className="text-center pt-0.5">
              <p className="text-xs font-mono text-muted mb-0.5">NODE_ID: {profile.id}</p>
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
