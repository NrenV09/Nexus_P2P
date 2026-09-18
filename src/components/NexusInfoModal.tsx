import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Info, 
  X, 
  HelpCircle, 
  Wifi, 
  WifiOff, 
  QrCode, 
  Send, 
  Download, 
  HardDrive, 
  Trash2, 
  ShieldCheck, 
  Radio, 
  Mic, 
  Video, 
  Phone, 
  PhoneOff, 
  Maximize2, 
  Sun, 
  Moon, 
  Terminal, 
  Copy, 
  Search, 
  Sparkles, 
  CheckCircle2, 
  Flame, 
  Layers,
  ArrowRight,
  BookOpen
} from 'lucide-react';
import { cn } from '../lib/utils';
import { LegalComplianceView } from './LegalComplianceView';

interface NexusInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'guide' | 'dictionary' | 'offline' | 'legal';
}

interface FeatureDoc {
  id: string;
  name: string;
  category: 'connection' | 'transfer' | 'failover' | 'chat_calls' | 'system';
  icon: React.ElementType;
  badge?: string;
  summary: string;
  description: string;
  howToUse: string;
}

const FEATURE_DOCS: FeatureDoc[] = [
  // Connection Category
  {
    id: 'host_mesh',
    name: 'Host Mesh Room (Create Offer)',
    category: 'connection',
    icon: Wifi,
    badge: 'Core Handshake',
    summary: 'Initializes an encrypted WebRTC room and creates an exchangeable offer token.',
    description: 'Generates a secure WebRTC Session Description Protocol (SDP) offer encapsulated into an encoded Matrix token and QR Code. No centralized servers or accounts are involved.',
    howToUse: 'Click "Host Mesh Room" to generate your room QR code or copy the encoded Offer token. Show the QR code to your peer or send them the token.'
  },
  {
    id: 'join_mesh',
    name: 'Join Mesh Room (Scan / Paste Offer)',
    category: 'connection',
    icon: QrCode,
    badge: 'Core Handshake',
    summary: 'Consumes an offer token from a host to generate a matching response answer.',
    description: 'Decodes the host node\'s SDP parameters, establishes local ICE network candidates, and synthesizes an encrypted Answer token.',
    howToUse: 'Click "Join Mesh Room", then scan the host\'s QR code or paste their Offer token into the buffer. Once accepted, an Answer QR code/token will be generated for the host.'
  },
  {
    id: 'finalize_handshake',
    name: 'Finalize Handshake (Host Receives Answer)',
    category: 'connection',
    icon: CheckCircle2,
    badge: 'Handshake Step 3',
    summary: 'Host accepts the peer\'s Answer token to establish the live P2P DataChannel.',
    description: 'Completes the WebRTC handshake cycle. Once the host processes the answer, peer-to-peer data channels and encrypted media tunnels open directly between the devices.',
    howToUse: 'On the Host device, scan the peer\'s Answer QR code or paste the Answer token into the host\'s input field to complete the connection.'
  },
  {
    id: 'status_badge',
    name: 'Connection Status Indicator',
    category: 'connection',
    icon: Radio,
    summary: 'Displays real-time connection state: Offline, Handshaking, or Connected.',
    description: 'Continuously monitors WebRTC DataChannel readyState, ICE connection state, and heartbeat keep-alives across connected peer nodes.',
    howToUse: 'Observe the indicator in the top header. Green ("Connected") indicates an active encrypted mesh channel ready for instant transfers and calls.'
  },

  // File Transfer Category
  {
    id: 'direct_downloads',
    name: 'Direct Downloads (Bypass RAM Limits)',
    category: 'transfer',
    icon: HardDrive,
    badge: 'High-Performance Disk Stream',
    summary: 'Streams files directly to disk, bypassing browser memory and sandboxes.',
    description: 'Instead of buffering multi-gigabyte files inside browser RAM or private browser cache sandboxes, this protocol instantly prompts the receiver\'s web browser to save directly to disk. The sender is shown "Waiting for receiver to click download" until the receiver chooses where to save, after which chunks stream directly into the disk file handle.',
    howToUse: 'Toggle the "Direct Downloads (Bypass RAM Limits)" checkbox in the File Drop Zone. When you drop a file to send, the receiver will instantly see a browser download prompt. Transmission begins the moment they click save!'
  },
  {
    id: 'file_drop_zone',
    name: 'File Drop Zone & File Selector',
    category: 'transfer',
    icon: Send,
    summary: 'High-speed encrypted peer-to-peer file transfer supporting files up to 5GB.',
    description: 'Slices large files into optimized 64KB chunks and sends them across WebRTC DataChannels with proactive backpressure buffer flow control.',
    howToUse: 'Drag and drop any file directly onto the dashed drop zone box, or click the box to browse your device files. Transfers begin automatically once connected.'
  },
  {
    id: 'auto_download',
    name: 'Auto-Download Files Toggle',
    category: 'transfer',
    icon: Download,
    summary: 'Automatically saves standard incoming files without requiring manual download clicks.',
    description: 'When enabled for standard transfers, as soon as all chunks of an incoming payload are assembled, the browser immediately triggers an automatic file save action.',
    howToUse: 'Check the "Auto-download files" checkbox in the File Drop Zone if you want incoming files saved to your default Downloads folder automatically.'
  },
  {
    id: 'clear_caches',
    name: 'Clear App Caches Button',
    category: 'transfer',
    icon: Trash2,
    summary: 'Flushes all transient memory buffers, OPFS handles, and browser cache entries.',
    description: 'Instantly resets internal transfer chunk maps, frees browser heap allocations, and purges any temporary Origin Private File System directory references.',
    howToUse: 'Click "Clear App Caches" above the drop zone at any time to reclaim memory and clear transfer history.'
  },
  {
    id: 'abort_transceiver',
    name: 'Abort Transceiver Button',
    category: 'transfer',
    icon: X,
    summary: 'Instantly halts any active file transmission or reception in progress.',
    description: 'Immediately signals cancel flags to the file reader, aborts DataChannel packets, and closes active file streaming streams on both nodes.',
    howToUse: 'Click the red "Abort Transceiver" button inside the active packet transfer animation card to safely cancel an ongoing file transfer.'
  },

  // Failover Category
  {
    id: 'peer_registry',
    name: 'Nexus Failover & Peer Registry HUD (Crown / Shield)',
    category: 'failover',
    icon: ShieldCheck,
    badge: 'Decentralized High Availability',
    summary: 'Monitors the mesh cluster hierarchy and coordinates seamless host failover.',
    description: 'Provides real-time visibility into every connected node\'s rank, sequence number, ping latency, and role. Uses a deterministic Bully/Raft-style consensus algorithm to automatically elect a new host if the active host disconnects.',
    howToUse: 'Click the "Peer Registry" button in the Activity Log header to open the full HUD. You can view all peers, test failover scenarios, or hand over leadership.'
  },
  {
    id: 'simulate_failover',
    name: 'Simulate Failover / Host Crash Drill',
    category: 'failover',
    icon: Flame,
    badge: 'Testing Tool',
    summary: 'Simulates host failure to verify automatic promotion of the next ranking peer.',
    description: 'Launches a sandboxed 4-node simulated cluster (Alpha, Beta, Gamma, Delta) where you can artificially crash nodes to witness instant election and session preservation.',
    howToUse: 'Open the Peer Registry HUD and click "Simulate Host Failover" to run live election drills without interrupting real peer connections.'
  },

  // Chat & Calls Category
  {
    id: 'encrypted_chat',
    name: 'Encrypted P2P Chat',
    category: 'chat_calls',
    icon: Radio,
    summary: 'Real-time peer-to-peer messaging with zero server retention or telemetry.',
    description: 'Text messages are transmitted directly through WebRTC DataChannels. Messages live solely in browser session memory and disappear when you leave.',
    howToUse: 'Switch to the "Chat" tab or use the chat bar to type messages. Markdown and emojis are fully supported.'
  },
  {
    id: 'push_to_talk',
    name: 'Push-to-Talk Voice Notes (Mic Icon)',
    category: 'chat_calls',
    icon: Mic,
    summary: 'Records and transmits direct voice audio clips with waveform playback.',
    description: 'Captures microphone audio via MediaRecorder API, converts to compressed voice payload, and transmits P2P with interactive audio waveform visualization.',
    howToUse: 'Press and hold the microphone button in the chat input bar to record your voice message. Release to instantly send it to all connected peers.'
  },
  {
    id: 'video_calls',
    name: 'Encrypted Video & Voice Calling',
    category: 'chat_calls',
    icon: Video,
    summary: 'Hardware-accelerated peer-to-peer video and voice calls with screen sharing.',
    description: 'Utilizes WebRTC MediaStream tracks with VP8/Opus encoding. Includes toggle controls for camera, microphone, screen sharing, and call decline.',
    howToUse: 'Click the Video or Phone icon in the top header to invite peers to an encrypted call. Peers will hear a ring chime and can accept or decline.'
  },

  // System Category
  {
    id: 'profile_modal',
    name: 'User Profile & Identity Customizer',
    category: 'system',
    icon: Sparkles,
    summary: 'Customize your display username, avatar color theme, and node bio.',
    description: 'Allows you to personalize your node identity across the mesh. Updates are automatically broadcast to all connected peers in real time.',
    howToUse: 'Click your circular avatar icon in the top right header to edit your username, avatar color palette, and bio.'
  },
  {
    id: 'theme_toggle',
    name: 'Light / Dark Theme Toggle',
    category: 'system',
    icon: Sun,
    summary: 'Toggles between high-contrast dark cybersecurity mode and crisp light mode.',
    description: 'Switches the entire user interface color palette, frosted glass shaders, and text contrast tokens.',
    howToUse: 'Click the Sun/Moon icon in the top header beside the profile button.'
  },
  {
    id: 'fullscreen_toggle',
    name: 'Fullscreen Mode Button',
    category: 'system',
    icon: Maximize2,
    summary: 'Expands the application to occupy the entire screen display.',
    description: 'Uses the browser Fullscreen API for an immersive distraction-free workspace.',
    howToUse: 'Click the square expand icon in the top header to toggle fullscreen.'
  },
  {
    id: 'easter_egg_terminal',
    name: 'Quantum Link Terminal (CMD & PowerShell)',
    category: 'system',
    icon: Terminal,
    summary: 'Diagnostic developer shell modeled after Windows CMD and PowerShell.',
    description: 'An authentic terminal matrix showing system specifications, network topology, and architecture tributes.',
    howToUse: 'Click the Quantum Link logo text in the header 5 times in rapid succession, or press Escape in the terminal to exit.'
  },
  {
    id: 'offline_mode',
    name: '100% Offline & Air-Gapped Operation',
    category: 'system',
    icon: WifiOff,
    badge: 'Zero Internet Needed',
    summary: 'Fully functional on local WiFi, phone hotspots, or air-gapped networks.',
    description: 'The app contains zero external CDN scripts, web fonts, or server dependencies. All assets are compiled directly into the standalone HTML file. WebRTC generates local host candidates for direct device-to-device communication on any local network.',
    howToUse: 'Connect two devices to the same local WiFi or mobile hotspot (even with mobile data disabled) and exchange QR codes or tokens to transfer files completely offline.'
  },
  {
    id: 'cache_storage_sandbox',
    name: 'CacheStorage Disk Persistence (app-cache-v1)',
    category: 'transfer',
    icon: HardDrive,
    badge: 'Zero RAM Limits',
    summary: 'Persists drop zone files directly to native browser disk cache.',
    description: 'Uses the browser CacheStorage API to store and read file payloads directly from the user disk rather than holding them in volatile RAM. Files remain intact across page reloads and browser restarts.',
    howToUse: 'Drop or select files into the File Drop Zone sandbox. Files are automatically committed to CacheStorage with a "Cached" badge and live megabyte disk counter.'
  },
  {
    id: 'clear_cache_purge',
    name: 'Clear Cache & Disk Purge Button',
    category: 'transfer',
    icon: Trash2,
    badge: 'Disk Cleanup',
    summary: 'Instantly purges all cached sandbox files and frees up browser disk space.',
    description: 'Wipes the app-cache-v1 CacheStorage bucket, removes metadata indexes from localStorage, and clears all in-memory file buffers with a single click.',
    howToUse: 'Click the "Clear Cache" button located in the header of the File Drop Zone sandbox.'
  },
  {
    id: 'legal_compliance_hub',
    name: 'Legal, Privacy & Compliance Hub',
    category: 'system',
    icon: ShieldCheck,
    badge: '14-Point Verified',
    summary: 'Complete privacy policy, terms of service, zero-cookie disclosures, and accessibility audits.',
    description: 'Comprehensive documentation covering GDPR/CCPA compliance, zero telemetry guarantees, acceptable use terms, WCAG 2.1 AA accessibility standards, and cryptographic export compliance.',
    howToUse: 'Click the (i) button in the header, then switch to the "Legal, Privacy & Compliance Hub" tab to inspect any policy or customize storage consent.'
  }
];

export const NexusInfoModal: React.FC<NexusInfoModalProps> = ({ isOpen, onClose, initialTab = 'guide' }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'guide' | 'dictionary' | 'offline' | 'legal'>(initialTab);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filteredDocs = FEATURE_DOCS.filter(doc => {
    const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.howToUse.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedCategory === 'all' || doc.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[260] flex items-center justify-center p-3 sm:p-5 md:p-8 bg-black/70 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 15, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 15, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 350 }}
            className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-card border border-white/40 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden text-text"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 sm:px-7 py-4 sm:py-5 border-b border-white/20 dark:border-white/10 bg-white/20 dark:bg-black/20 backdrop-blur-xl flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-accent/15 border border-accent/30 text-accent flex items-center justify-center shadow-sm">
                  <Info className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold tracking-tight text-text flex items-center gap-2">
                    App Manual & Connection Guide
                    <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/25 hidden sm:inline">
                      v7.8
                    </span>
                  </h2>
                  <p className="text-xs text-muted">
                    Learn how to connect, transfer files without RAM limits, and use every button.
                  </p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/10 transition-colors border border-white/20 dark:border-white/10 cursor-pointer"
                title="Close manual (ESC)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-2 px-5 sm:px-7 py-2.5 border-b border-white/10 bg-white/5 dark:bg-black/10 overflow-x-auto scrollbar-hide flex-shrink-0">
              <button
                onClick={() => setActiveTab('guide')}
                className={cn(
                  "px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer",
                  activeTab === 'guide' 
                    ? "bg-accent text-white shadow-sm" 
                    : "text-muted hover:text-text hover:bg-white/10"
                )}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Quick Start: How to Connect</span>
              </button>

              <button
                onClick={() => setActiveTab('dictionary')}
                className={cn(
                  "px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer",
                  activeTab === 'dictionary' 
                    ? "bg-accent text-white shadow-sm" 
                    : "text-muted hover:text-text hover:bg-white/10"
                )}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>All Buttons & Functions Dictionary</span>
              </button>

              <button
                onClick={() => setActiveTab('offline')}
                className={cn(
                  "px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap",
                  activeTab === 'offline' 
                    ? "bg-accent text-white shadow-sm" 
                    : "text-muted hover:text-text hover:bg-white/10"
                )}
              >
                <WifiOff className="w-3.5 h-3.5" />
                <span>100% Offline & Direct Disk Stream</span>
              </button>

              <button
                onClick={() => setActiveTab('legal')}
                className={cn(
                  "px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap",
                  activeTab === 'legal' 
                    ? "bg-emerald-600 text-white shadow-sm" 
                    : "text-muted hover:text-text hover:bg-white/10"
                )}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Legal, Privacy & Compliance Hub</span>
                <span className={cn(
                  "text-[10px] font-mono px-1.5 py-0.5 rounded font-bold",
                  activeTab === 'legal' ? "bg-white/20 text-white" : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                )}>14/14</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6 scrollbar-hide">
              
              {/* TAB 1: HOW TO CONNECT */}
              {activeTab === 'guide' && (
                <div className="space-y-6">
                  <div className="p-4 sm:p-5 rounded-2xl bg-accent/10 border border-accent/20">
                    <h3 className="text-sm sm:text-base font-bold text-accent flex items-center gap-2 mb-1.5">
                      <Sparkles className="w-4 h-4" />
                      Connecting Two Devices in 3 Simple Steps
                    </h3>
                    <p className="text-xs sm:text-sm text-text/80 leading-relaxed">
                      Quantum Link uses peer-to-peer WebRTC connections with zero servers. You connect by exchanging an encrypted cryptographic handshake token via QR code or text copy.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Step 1 */}
                    <div className="p-4 rounded-2xl bg-white/40 dark:bg-white/5 border border-white/40 dark:border-white/10 flex flex-col justify-between">
                      <div>
                        <div className="w-8 h-8 rounded-xl bg-accent text-white flex items-center justify-center text-xs font-bold mb-3 shadow-sm">
                          1
                        </div>
                        <h4 className="text-sm font-bold text-text mb-1">Host Creates Offer</h4>
                        <p className="text-xs text-muted leading-relaxed">
                          Device A clicks <span className="font-semibold text-text">"Host Mesh Room"</span>. This generates a unique room matrix and displays a QR code along with a copyable Offer Token.
                        </p>
                      </div>
                      <div className="mt-4 pt-3 border-t border-white/10 text-[11px] font-mono text-accent">
                        Action: Click Host Mesh
                      </div>
                    </div>

                    {/* Step 2 */}
                    <div className="p-4 rounded-2xl bg-white/40 dark:bg-white/5 border border-white/40 dark:border-white/10 flex flex-col justify-between">
                      <div>
                        <div className="w-8 h-8 rounded-xl bg-accent text-white flex items-center justify-center text-xs font-bold mb-3 shadow-sm">
                          2
                        </div>
                        <h4 className="text-sm font-bold text-text mb-1">Peer Scans or Pastes</h4>
                        <p className="text-xs text-muted leading-relaxed">
                          Device B clicks <span className="font-semibold text-text">"Join Mesh Room"</span>, then scans Device A's QR code (or pastes the token). Device B immediately generates an Answer response token.
                        </p>
                      </div>
                      <div className="mt-4 pt-3 border-t border-white/10 text-[11px] font-mono text-accent">
                        Action: Scan or Paste Token
                      </div>
                    </div>

                    {/* Step 3 */}
                    <div className="p-4 rounded-2xl bg-white/40 dark:bg-white/5 border border-white/40 dark:border-white/10 flex flex-col justify-between">
                      <div>
                        <div className="w-8 h-8 rounded-xl bg-success text-white flex items-center justify-center text-xs font-bold mb-3 shadow-sm">
                          3
                        </div>
                        <h4 className="text-sm font-bold text-text mb-1">Finalize Handshake</h4>
                        <p className="text-xs text-muted leading-relaxed">
                          Device A scans or pastes Device B's Answer token. The status badge immediately flips to <span className="font-semibold text-success">● Connected</span>. You can now transfer files, chat, and make calls!
                        </p>
                      </div>
                      <div className="mt-4 pt-3 border-t border-white/10 text-[11px] font-mono text-success">
                        Result: Live Encrypted Tunnel
                      </div>
                    </div>
                  </div>

                  {/* Pro Tip Callout */}
                  <div className="p-4 rounded-2xl bg-white/40 dark:bg-white/5 border border-white/40 dark:border-white/10 flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center justify-center shrink-0 mt-0.5">
                      <HelpCircle className="w-5 h-5" />
                    </div>
                    <div className="space-y-1 text-xs">
                      <div className="font-bold text-text text-sm">Need to connect without an internet connection?</div>
                      <p className="text-muted leading-relaxed">
                        Simply connect both devices to the same local Wi-Fi router, personal mobile hotspot, or ad-hoc network. The app gathers local LAN IP addresses directly, so transfers operate at full local Wi-Fi speed without consuming any mobile data or touching external servers!
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: BUTTONS & FUNCTIONS DICTIONARY */}
              {activeTab === 'dictionary' && (
                <div className="space-y-4">
                  {/* Search and Category Filter */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search any button, toggle, or function (e.g., 'bypass', 'drop', 'failover')..."
                        className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-xl bg-white/40 dark:bg-white/5 border border-white/40 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-accent text-text placeholder:text-muted"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide text-xs">
                      {[
                        { id: 'all', label: 'All' },
                        { id: 'connection', label: 'Connection' },
                        { id: 'transfer', label: 'Transfer & Drop' },
                        { id: 'failover', label: 'Failover' },
                        { id: 'chat_calls', label: 'Chat & Calls' },
                        { id: 'system', label: 'System' }
                      ].map(cat => (
                        <button
                          key={cat.id}
                          onClick={() => setSelectedCategory(cat.id)}
                          className={cn(
                            "px-2.5 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer",
                            selectedCategory === cat.id 
                              ? "bg-accent/20 text-accent border border-accent/30" 
                              : "text-muted hover:text-text hover:bg-white/10"
                          )}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Feature Cards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
                    {filteredDocs.map((doc) => {
                      const Icon = doc.icon;
                      return (
                        <div
                          key={doc.id}
                          className="p-4 rounded-2xl bg-white/40 dark:bg-white/5 border border-white/40 dark:border-white/10 flex flex-col justify-between hover:border-accent/40 transition-colors shadow-sm"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-xl bg-accent/15 text-accent flex items-center justify-center shrink-0">
                                  <Icon className="w-4 h-4" />
                                </div>
                                <span className="text-sm font-bold text-text">{doc.name}</span>
                              </div>
                              {doc.badge && (
                                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/25 shrink-0">
                                  {doc.badge}
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-text/90 font-medium mb-1.5">
                              {doc.summary}
                            </p>
                            <p className="text-xs text-muted leading-relaxed mb-3">
                              {doc.description}
                            </p>
                          </div>

                          <div className="pt-2.5 border-t border-white/10 flex items-start gap-1.5 text-[11px] text-accent/90">
                            <ArrowRight className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span><strong className="text-text">How to use:</strong> {doc.howToUse}</span>
                          </div>
                        </div>
                      );
                    })}

                    {filteredDocs.length === 0 && (
                      <div className="col-span-full py-10 text-center text-muted text-xs">
                        No buttons or functions found matching "{searchQuery}". Try a different keyword!
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: OFFLINE CAPABILITIES & DIRECT DISK STREAM */}
              {activeTab === 'offline' && (
                <div className="space-y-5">
                  <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-text">
                    <h3 className="text-base font-bold text-emerald-400 flex items-center gap-2 mb-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      100% Offline, Serverless & Independent of the Internet
                    </h3>
                    <p className="text-xs sm:text-sm text-text/80 leading-relaxed">
                      Quantum Link is engineered to operate in complete isolation from the public internet. All JavaScript, fonts, icons, and UI logic are bundled into a single self-contained HTML document.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-white/40 dark:bg-white/5 border border-white/40 dark:border-white/10 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-bold text-text">
                        <HardDrive className="w-4 h-4 text-accent" />
                        <span>Direct Disk Downloads (No RAM Limits)</span>
                      </div>
                      <p className="text-xs text-muted leading-relaxed">
                        When you toggle <strong className="text-text">"Direct Downloads (Bypass RAM Limits)"</strong>, incoming transfers stream directly to the receiver's local hard drive via browser disk write handles.
                      </p>
                      <ul className="text-xs text-text/80 space-y-1.5 list-disc pl-4 pt-1">
                        <li>The receiver's browser is immediately prompted to choose a save destination.</li>
                        <li>The sender's screen pauses and shows <em>"Waiting for receiver to click download..."</em> until confirmed.</li>
                        <li>The file is <strong>never sandboxed</strong> into browser memory or hidden cache, allowing transfers of massive 5GB+ files without crashing your browser!</li>
                      </ul>
                    </div>

                    <div className="p-4 rounded-2xl bg-white/40 dark:bg-white/5 border border-white/40 dark:border-white/10 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-bold text-text">
                        <WifiOff className="w-4 h-4 text-emerald-400" />
                        <span>Air-Gapped Local Network Handshakes</span>
                      </div>
                      <p className="text-xs text-muted leading-relaxed">
                        WebRTC creates direct local IP connections on your local Wi-Fi or mobile hotspot.
                      </p>
                      <ul className="text-xs text-text/80 space-y-1.5 list-disc pl-4 pt-1">
                        <li>Zero internet required: Devices talk directly across LAN or ad-hoc WiFi.</li>
                        <li>Public STUN servers are gracefully bypassed when offline.</li>
                        <li>Full transfer speeds up to maximum router / device Wi-Fi capacity.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: LEGAL, PRIVACY & COMPLIANCE HUB */}
              {activeTab === 'legal' && (
                <LegalComplianceView />
              )}

            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 sm:px-7 py-3 border-t border-white/10 bg-white/10 dark:bg-black/10 flex-shrink-0">
              <div className="flex items-center gap-2 text-xs text-muted">
                <ShieldCheck className="w-4 h-4 text-success" />
                <span>Zero telemetry • End-to-end encrypted • Standalone offline executable</span>
              </div>

              <button
                onClick={onClose}
                className="px-4 py-1.5 rounded-xl bg-accent text-white hover:bg-accent/90 transition-colors text-xs font-semibold cursor-pointer shadow-sm"
              >
                Close Manual
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
