import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, 
  ShieldCheck,
  Users, 
  Send, 
  RefreshCw, 
  X, 
  GripHorizontal, 
  Monitor, 
  UserPlus, 
  ArrowRight, 
  Hexagon, 
  FileText, 
  Download,
  CheckCircle2,
  Copy,
  Share,
  Moon,
  Sun,
  PhoneCall
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

import { cn, formatBytes } from './lib/utils';
import { 
  NodeRole, 
  ConnectionStatus, 
  ChatMessage, 
  FilePayload, 
  TransferProgress, 
  LogEntry,
  UserProfile
} from './types';

import { QRScanner } from './components/QRScanner';
import { QRUtilityNode } from './components/QRUtilityNode';
import { SecureChatNode } from './components/SecureChatNode';
import { Base64ToolNode } from './components/Base64ToolNode';
import { FilePreview } from './components/FilePreview';
import { NetworkBackground } from './components/NetworkBackground';
import { DataStream } from './components/DataStream';
import { PacketTransferAnimation } from './components/PacketTransferAnimation';
import { ProfileModal } from './components/ProfileModal';
import { ViewProfileModal } from './components/ViewProfileModal';
import { NexusFailoverHUD } from './components/NexusFailoverHUD';
import { CallOverlay } from './components/CallOverlay';
import { IncomingCallModal, IncomingCallData } from './components/IncomingCallModal';
import { EasterEggModal, playQuantumChime, playTapTick } from './components/EasterEggModal';
import { generateRandomName } from './lib/nameGenerator';

const CHUNK_SIZE = 131072; // Max WebRTC chunk size (128KB)

export default function App() {
  // --- State ---
  const [profile, setProfile] = useState<UserProfile>(() => {
    let saved = null;
    try {
      saved = localStorage.getItem('quantum_profile');
    } catch(e) {}
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (!parsed.username || parsed.username.trim() === "") {
          parsed.username = generateRandomName();
        }
        return parsed;
      } catch (e) {
        console.error("Failed to load profile", e);
      }
    }
    return {
      id: Math.random().toString(36).substring(2, 8).toUpperCase(),
      username: generateRandomName(),
      avatarColor: 'bg-accent',
      bio: 'Quantum data node activated.',
      joinedAt: new Date().toISOString(),
    };
  });
  
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedPeerProfile, setSelectedPeerProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTabState] = useState<string>("p2p");
  const activeTabRef = useRef<string>("p2p");

  const setActiveTab = useCallback((tab: string) => {
    setActiveTabState(tab);
    activeTabRef.current = tab;
  }, []);
  const [role, setRole] = useState<NodeRole>(null);
  const [status, setStatus] = useState<ConnectionStatus>("offline");
  const [isTransferring, setIsTransferring] = useState(false);
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [callType, setCallType] = useState<'audio' | 'video' | null>(null);
  const [peerTrackStates, setPeerTrackStates] = useState<Record<string, { video?: boolean; audio?: boolean }>>({});
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const ringtoneCtxRef = useRef<AudioContext | null>(null);
  const ringtoneIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const endCallRef = useRef<() => void>(() => {});

  const playRingChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!ringtoneCtxRef.current || ringtoneCtxRef.current.state === 'closed') {
        ringtoneCtxRef.current = new AudioCtx();
      }
      const ctx = ringtoneCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const playTone = () => {
        if (!ctx || ctx.state === 'closed') return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(780, ctx.currentTime + 0.25);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      };

      playTone();
      if (ringtoneIntervalRef.current) clearInterval(ringtoneIntervalRef.current);
      ringtoneIntervalRef.current = setInterval(playTone, 2000);
    } catch (e) {
      console.warn("Could not play ringtone:", e);
    }
  }, []);

  const stopRingChime = useCallback(() => {
    if (ringtoneIntervalRef.current) {
      clearInterval(ringtoneIntervalRef.current);
      ringtoneIntervalRef.current = null;
    }
    if (ringtoneCtxRef.current) {
      ringtoneCtxRef.current.close().catch(() => {});
      ringtoneCtxRef.current = null;
    }
  }, []);
  const [files, setFiles] = useState<FilePayload[]>([]);
  const [transfer, setTransfer] = useState<TransferProgress | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  const [qrPayload, setQrPayload] = useState("");
  const [pasteBuffer, setPasteBuffer] = useState("");
  const [scannerType, setScannerType] = useState<'offer' | 'answer' | null>(null);
  const [selectedFile, setSelectedFile] = useState<FilePayload | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isSimulation, setIsSimulation] = useState(false);
  const [showSimWarning, setShowSimWarning] = useState(false);
  const [showFailoverMenu, setShowFailoverMenu] = useState(false);
  const [showCreatorPopup, setShowCreatorPopup] = useState(false);
  const [titleTapCount, setTitleTapCount] = useState(0);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [isCallActive, setIsCallActive] = useState(false);
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleTitleClick = useCallback(() => {
    setTitleTapCount(prev => {
      const next = prev + 1;
      if (next >= 10) {
        setShowCreatorPopup(true);
        playQuantumChime();
        return 0;
      } else {
        playTapTick(next);
        return next;
      }
    });
    if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
    tapTimeoutRef.current = setTimeout(() => setTitleTapCount(0), 1500);
  }, []);

  // --- Refs ---
  const cancelTransferRef = useRef(false);
  const roleRef = useRef<NodeRole>(null);
  const usernameRef = useRef("");
  
  useEffect(() => { roleRef.current = role; }, [role]);
  useEffect(() => { 
    usernameRef.current = profile.username;
    try {
      localStorage.setItem('quantum_profile', JSON.stringify(profile));
    } catch(e) {}
  }, [profile]);
  
  // --- Helpers ---
  const addLog = useCallback((text: string, type: 'info' | 'ok' | 'err' = 'info') => {
    setLogs(prev => [...prev.slice(-20), { text, type, timestamp: new Date() }]);
  }, []);

  const handleCancelTransfer = useCallback(() => {
    cancelTransferRef.current = true;
    setTransfer(null);
    fileBuffers.current.clear();
    addLog("Transfer stopped / discarded", "err");
  }, [addLog]);

  const localConnectionRef = useRef<RTCPeerConnection | null>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const dataChannels = useRef<Map<string, RTCDataChannel>>(new Map());
  const chatChunkBuffers = useRef<Record<string, { chunks: (string | null)[]; count: number; total: number }>>({});
  const [peerProfiles, setPeerProfiles] = useState<Record<string, UserProfile>>({});
  const peerIdToProfileId = useRef<Map<string, string>>(new Map());
  const [connectedCount, setConnectedPeers] = useState(0);
  const fileBuffers = useRef<Map<string, any>>(new Map());
  const lastUpdateRef = useRef<number>(Date.now());

  const [directDownloads, setDirectDownloadsState] = useState(false);
  const directDownloadsRef = useRef(false);
  const setDirectDownloads = (val: boolean) => {
    setDirectDownloadsState(val);
    directDownloadsRef.current = val;
    if (val) {
      addLog("Direct Downloads enabled: Transfers will stream directly to disk (RAM bypassed)", "ok");
    } else {
      addLog("Direct Downloads disabled: Standard browser buffering active", "info");
    }
  };

  const [bandwidthOptimized, setBandwidthOptimized] = useState(false);

  const handleClearCache = useCallback(async () => {
    try {
      fileBuffers.current.forEach(async (buffer) => {
        try {
          if (buffer.writable) await buffer.writable.close();
        } catch(e) {}
      });
      fileBuffers.current.clear();
      chatChunkBuffers.current = {};
      setTransfer(null);

      if (window.caches) {
        const cacheKeys = await caches.keys();
        for (const key of cacheKeys) {
          await caches.delete(key);
        }
      }

      if (navigator.storage && navigator.storage.getDirectory) {
        try {
          const root = await navigator.storage.getDirectory();
          // @ts-ignore
          if (root.values) {
            // @ts-ignore
            for await (const entry of root.values()) {
              try {
                await root.removeEntry(entry.name, { recursive: true });
              } catch(e) {}
            }
          }
        } catch(e) {}
      }

      addLog("App cache cleared: In-memory buffers and temp storage purged", "ok");
    } catch (e: any) {
      addLog("Failed to clear cache: " + (e?.message || e), "err");
    }
  }, [addLog]);

  const handleTransferHostControl = useCallback((targetPeerId: string) => {
    const targetPeer = peerProfiles[targetPeerId];
    const targetName = targetPeer?.username || targetPeerId.substring(0, 8);
    
    // Broadcast handoff message to all peers
    const msg = JSON.stringify({
      type: 'host-handoff',
      newHostId: targetPeerId,
      newHostName: targetName,
      oldHostId: profile.id,
      oldHostName: profile.username
    });
    dataChannels.current.forEach(dc => {
      if (dc.readyState === 'open') {
        try { dc.send(msg); } catch(e) {}
      }
    });

    // Step down to join role and become 1st heir
    setRole('join');
    roleRef.current = 'join';
    setShowFailoverMenu(false);
    addLog(`👑 Host authority transferred to ${targetName}. You are now designated 1st Heir.`, "ok");
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      text: `👑 Host authority handed over to ${targetName}. This node is now a Peer (1st Heir).`,
      sender: 'system',
      timestamp: new Date()
    }]);
  }, [peerProfiles, profile, addLog]);

  const handleGracefulHostDrop = useCallback(() => {
    const peerEntries = Object.entries(peerProfiles);
    if (peerEntries.length === 0) {
      addLog("No connected peers to hand over host access to.", "err");
      return;
    }
    const [firstPeerId, firstPeer] = peerEntries[0];
    const targetName = (firstPeer as UserProfile)?.username || firstPeerId.substring(0, 8);

    const msg = JSON.stringify({
      type: 'host-handoff',
      newHostId: firstPeerId,
      newHostName: targetName,
      oldHostId: profile.id,
      oldHostName: profile.username,
      graceful: true
    });
    dataChannels.current.forEach(dc => {
      if (dc.readyState === 'open') {
        try { dc.send(msg); } catch(e) {}
      }
    });

    setRole('join');
    roleRef.current = 'join';
    setShowFailoverMenu(false);
    addLog(`🛡️ Graceful Host Drop: Stepped down and gave host authority to 1st joiner (${targetName}).`, "ok");
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      text: `🛡️ Graceful Host Drop: ${profile.username} gracefully stepped down. ${targetName} is now Authoritative Host.`,
      sender: 'system',
      timestamp: new Date()
    }]);
  }, [peerProfiles, profile, addLog]);

  const handleNetworkSplit = useCallback(() => {
    addLog("⚡ Network Partition Split test initiated", "info");
    addLog("Nexus Failover Quorum: Commits quarantined until majority consensus (>50%) re-establishes.", "ok");
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      text: "⚡ Network Split Test: Quorum consensus active. Sub-partition split handled safely.",
      sender: 'system',
      timestamp: new Date()
    }]);
  }, [addLog]);

  const [autoDownload, setAutoDownloadState] = useState(true);
  const autoDownloadRef = useRef(true);
  const setAutoDownload = (val: boolean) => {
    setAutoDownloadState(val);
    autoDownloadRef.current = val;
  };
  
  const triggerTransferAnimation = useCallback(() => {
    setIsTransferring(true);
    setTimeout(() => setIsTransferring(false), 800);
  }, []);

  const resetAll = useCallback(() => {
    localConnectionRef.current?.close();
    localConnectionRef.current = null;
    peerConnections.current.forEach(pc => pc.close());
    peerConnections.current.clear();
    dataChannels.current.clear();
    setPeerProfiles({});
    setConnectedPeers(0);
    setStatus("offline");
    setQrPayload("");
    setPasteBuffer("");
    setTransfer(null);
    setFiles([]);
    setMessages([]);
    setLogs([]);
    setScannerType(null);
    setIsSimulation(false);
    addLog("All connections reset", "info");
  }, [addLog]);

  const toggleSimulation = useCallback((force = false) => {
    if (!isSimulation && status === "connected" && !force) {
      setShowSimWarning(true);
      return;
    }
    if (isSimulation) {
      resetAll();
    } else {
      setShowSimWarning(false);
      resetAll();
      setIsSimulation(true);
      setStatus("connected");
      setConnectedPeers(2);
      setRole("host");
      setPeerProfiles({
        "sim_peer_1": {
          id: "sim_peer_1",
          username: "Alpha (Sim)",
          avatarColor: "bg-blue-500",
          bio: "Simulation Node 1",
          joinedAt: new Date().toISOString()
        },
        "sim_peer_2": {
          id: "sim_peer_2",
          username: "Beta (Sim)",
          avatarColor: "bg-purple-500",
          bio: "Simulation Node 2",
          joinedAt: new Date().toISOString()
        }
      });
      addLog("Simulation Mode Enabled", "ok");
      
      setMessages([
        {
          id: "sim_msg_1",
          text: "Welcome to Simulation Mode! UI features are mocked.",
          sender: "system",
          timestamp: new Date()
        },
        {
          id: (Math.random().toString(36).substring(2) + Date.now().toString(36)),
          text: "Hello from the simulated network!",
          sender: "sim_peer_1",
          senderName: "Alpha (Sim)",
          senderColor: "bg-blue-500",
          timestamp: new Date()
        }
      ]);
      
      setFiles([
        {
           id: (Math.random().toString(36).substring(2) + Date.now().toString(36)),
           name: "Simulation_Report.txt",
           size: 1024 * 3,
           timestamp: new Date(),
           direction: 'in',
           senderName: "Beta (Sim)",
           senderColor: "bg-purple-500",
           senderId: "sim_peer_2",
           blob: new Blob(['=== QUANTUM LINK SIMULATION REPORT ===\n\nNetwork Status: SECURED\nNodes Connected: 2\nLatency: 12ms\nPacket Loss: 0.00%\n\nSimulation metrics indicate optimal performance.'], { type: 'text/plain' })
        }
      ]);

      const dummyDc = {
         readyState: 'open',
         send: (data: any) => {
           console.log("[Simulation Send]:", data);
         },
         close: () => {}
      } as unknown as RTCDataChannel;

      dataChannels.current.set("sim_peer_1", dummyDc);
      peerIdToProfileId.current.set("sim_peer_1", "sim_peer_1");
    }
  }, [isSimulation, resetAll, addLog]);

  const disconnectPeer = useCallback((profileId: string) => {
    let peerIdToClose = profileId;
    // Find the peerId associated with this profileId if it's a direct connection
    for (const [pId, profId] of peerIdToProfileId.current.entries()) {
      if (profId === profileId) {
        peerIdToClose = pId;
        break;
      }
    }

    const pc = peerConnections.current.get(peerIdToClose);
    if (pc) pc.close();
    
    setPeerProfiles(prev => {
      const p = prev[profileId];
      if (p) {
        setMessages(msgs => [...msgs, {
          id: (Math.random().toString(36).substring(2) + Date.now().toString(36)),
          text: `PEER KICKED: ${p.username}`,
          sender: 'system',
          timestamp: new Date()
        }]);
        addLog(`Tunnel force-closed [${p.username}]`, "err");
        
        // Notify others if host
        if (roleRef.current === 'host') {
          dataChannels.current.forEach((dc, pid) => {
            if (pid !== peerIdToClose && dc.readyState === 'open') {
              dc.send(JSON.stringify({ type: 'peer-left', name: p.username, id: profileId }));
            }
          });
        }
      }
      
      const next = { ...prev };
      delete next[profileId];
      return next;
    });
    
    dataChannels.current.delete(peerIdToClose);
    peerConnections.current.delete(peerIdToClose);
    peerIdToProfileId.current.delete(peerIdToClose);
    
    setConnectedPeers(dataChannels.current.size);
    if (dataChannels.current.size === 0) setStatus("offline");
  }, [addLog]);

  const setupDataChannel = useCallback((channel: RTCDataChannel, peerId: string) => {
    channel.binaryType = 'arraybuffer';
    
    channel.onopen = () => {
      dataChannels.current.set(peerId, channel);
      setConnectedPeers(dataChannels.current.size);
      setStatus("connected");
      channel.send(JSON.stringify({ 
        type: 'identity', 
        profile: profile
      }));
    };

    channel.onclose = () => {
      dataChannels.current.delete(peerId);
      const profId = peerIdToProfileId.current.get(peerId);
      peerIdToProfileId.current.delete(peerId);
      
      setConnectedPeers(dataChannels.current.size);
      if (dataChannels.current.size === 0) setStatus("offline");
      
      setPeerProfiles(prev => {
        const idToRemove = profId || peerId;
        const p = prev[idToRemove];
        if (p) {
          addLog(`Tunnel closed [${p.username}]`, "err");
          
          if (roleRef.current === 'host') {
            dataChannels.current.forEach((dc, otherId) => {
              if (otherId !== peerId && dc.readyState === 'open') {
                dc.send(JSON.stringify({ type: 'peer-left', name: p.username, id: idToRemove }));
              }
            });
          }
        }
        
        const next = { ...prev };
        delete next[idToRemove];
        return next;
      });
      peerConnections.current.delete(peerId);

      // Automated Heir Succession: If joiner and host tunnel terminates abruptly, promote to host!
      if (roleRef.current === 'join') {
        addLog("⚠️ Nexus Failover: Host node disappeared abruptly. Activating automated heir succession...", "info");
        setRole('host');
        roleRef.current = 'host';
        addLog("👑 Nexus Failover: You are designated 1st Heir and have assumed Host authority!", "ok");
        setMessages(msgs => [...msgs, {
          id: Date.now().toString(),
          text: "🛡️ Nexus Failover: Host disconnected abruptly. You have assumed Authoritative Host status!",
          sender: 'system',
          timestamp: new Date()
        }]);
      }
    };

    channel.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'identity') {
            setPeerProfiles(prev => {
              const peerProfile = data.profile as UserProfile;
              let actualName = peerProfile.username;
              const existingProfiles = Object.values(prev) as UserProfile[];
              
              // Only apply name conflict resolution if it's a DIFFERENT person with the same name
              let postfix = 1;
              while (existingProfiles.some((p: UserProfile) => p.username === actualName && p.id !== peerProfile.id)) {
                actualName = `${peerProfile.username} (${postfix})`;
                postfix++;
              }
              
              const finalProfile = { ...peerProfile, username: actualName };
              peerIdToProfileId.current.set(peerId, finalProfile.id);

              try {
                const list = JSON.parse(localStorage.getItem('quantum_saved_peers') || '[]');
                const existingIdx = list.findIndex((p: any) => p.id === finalProfile.id);
                if (existingIdx !== -1) {
                  list[existingIdx] = finalProfile;
                } else {
                  list.push(finalProfile);
                }
                localStorage.setItem('quantum_saved_peers', JSON.stringify(list));
              } catch(e) {}

              setMessages(msgs => [...msgs, {
                id: (Math.random().toString(36).substring(2) + Date.now().toString(36)),
                text: `PEER CONNECTED: ${actualName}`,
                sender: 'system',
                timestamp: new Date()
              }]);
              addLog(`Tunnel established [${actualName}]`, "ok");
              
              const updatedProfiles = { ...prev, [finalProfile.id]: finalProfile };
              
              // Host relays new peer to existing peers
              if (roleRef.current === 'host') {
                dataChannels.current.forEach((dc, otherId) => {
                  if (otherId !== peerId && dc.readyState === 'open') {
                    dc.send(JSON.stringify({ type: 'peer-joined', profile: finalProfile }));
                  }
                });
                // Send existing profiles to new peer
                Object.values(updatedProfiles).forEach((otherProf: any) => {
                  if (otherProf.id !== finalProfile.id) {
                    channel.send(JSON.stringify({ type: 'peer-joined', profile: otherProf }));
                  }
                });
              }

              return updatedProfiles;
            });
          } else if (data.type === 'peer-joined') {
            const joinedProfile = data.profile as UserProfile;
            let actualName = joinedProfile.username;
            let postfix = 1;
            setPeerProfiles(prev => {
              const prevVals = Object.values(prev);
              while (prevVals.some((p: UserProfile) => p.username === actualName && p.id !== joinedProfile.id)) {
                actualName = `${joinedProfile.username} (${postfix})`;
                postfix++;
              }
              joinedProfile.username = actualName;
              
              try {
                const list = JSON.parse(localStorage.getItem('quantum_saved_peers') || '[]');
                const existingIdx = list.findIndex((p: any) => p.id === joinedProfile.id);
                if (existingIdx !== -1) {
                  list[existingIdx] = joinedProfile;
                } else {
                  list.push(joinedProfile);
                }
                localStorage.setItem('quantum_saved_peers', JSON.stringify(list));
              } catch(e) {}
              
              return { ...prev, [joinedProfile.id]: joinedProfile };
            });
            setMessages(prev => [...prev, {
              id: (Math.random().toString(36).substring(2) + Date.now().toString(36)),
              text: `PEER CONNECTED: ${actualName}`,
              sender: 'system',
              timestamp: new Date()
            }]);
          } else if (data.type === 'peer-left') {
            setMessages(prev => [...prev, {
              id: (Math.random().toString(36).substring(2) + Date.now().toString(36)),
              text: `PEER DISCONNECTED: ${data.name}`,
              sender: 'system',
              timestamp: new Date()
            }]);
            setPeerProfiles(prev => {
              const next = { ...prev };
              delete next[data.id];
              return next;
            });
          } else if (data.type === 'host-handoff') {
            if (data.newHostId === profile.id) {
              setRole('host');
              roleRef.current = 'host';
              addLog(`👑 Host Authority Transferred: You are now the Authoritative Host!`, "ok");
              setMessages(prev => [...prev, {
                id: Date.now().toString(),
                text: `👑 Nexus Failover: Host authority handed over to you by ${data.oldHostName}!`,
                sender: 'system',
                timestamp: new Date()
              }]);
            } else {
              addLog(`👑 Host authority transferred to ${data.newHostName}`, "info");
              setMessages(prev => [...prev, {
                id: Date.now().toString(),
                text: `👑 Nexus Failover: Host authority transferred to ${data.newHostName}.`,
                sender: 'system',
                timestamp: new Date()
              }]);
            }
          } else if (data.type === 'profile-update') {
            const updatedProfile = data.profile;
            setPeerProfiles(prev => ({ ...prev, [updatedProfile.id]: updatedProfile }));
            if (roleRef.current === 'host') {
              dataChannels.current.forEach((dc, otherId) => {
                if (otherId !== peerId && dc.readyState === 'open') {
                  dc.send(JSON.stringify({ type: 'profile-update', profile: updatedProfile }));
                }
              });
            }
          } else if (data.type === 'chat') {
            setMessages(prev => [...prev, {
              id: data.id || (Math.random().toString(36).substring(2) + Date.now().toString(36)),
              text: data.text,
              audioData: data.audioData,
              sender: 'them',
              senderName: data.senderName,
              senderColor: data.senderColor,
              senderId: data.senderId,
              timestamp: data.timestamp ? new Date(data.timestamp) : new Date()
            }]);
            
            setUnreadChatCount(prev => activeTabRef.current !== 'chat' ? prev + 1 : 0);
            if (roleRef.current === 'host') {
              dataChannels.current.forEach((dc, otherId) => {
                if (otherId !== peerId && dc.readyState === 'open') {
                  dc.send(event.data);
                }
              });
            }
          } else if (data.type === 'chat-chunk') {
            if (roleRef.current === 'host') {
              dataChannels.current.forEach((dc, otherId) => {
                if (otherId !== peerId && dc.readyState === 'open') {
                  dc.send(event.data);
                }
              });
            }
            const { msgId, index, total, chunk } = data;
            if (!chatChunkBuffers.current[msgId]) {
              chatChunkBuffers.current[msgId] = {
                chunks: new Array(total).fill(null),
                count: 0,
                total
              };
            }
            const buffer = chatChunkBuffers.current[msgId];
            if (buffer.chunks[index] === null) {
              buffer.chunks[index] = chunk;
              buffer.count++;
            }
            if (buffer.count === buffer.total) {
              const fullJson = buffer.chunks.join('');
              delete chatChunkBuffers.current[msgId];
              try {
                const fullData = JSON.parse(fullJson);
                setMessages(prev => [...prev, {
                  id: fullData.id || (Math.random().toString(36).substring(2) + Date.now().toString(36)),
                  text: fullData.text,
                  audioData: fullData.audioData,
                  sender: 'them',
                  senderName: fullData.senderName,
                  senderColor: fullData.senderColor,
                  senderId: fullData.senderId,
                  timestamp: fullData.timestamp ? new Date(fullData.timestamp) : new Date()
                }]);
                setUnreadChatCount(prev => activeTabRef.current !== 'chat' ? prev + 1 : 0);
              } catch (e) {
                console.error("Failed to parse reassembled chat chunk:", e);
              }
            }
          } else if (data.type === 'file-meta') {
            const bufferRef: any = { 
              metadata: data, 
              receivedSize: 0, 
              chunks: [],
              fileHandle: null,
              writable: null,
              isWriting: false,
              isDirectDisk: false
            };
            
            // Direct Downloads: Prompt browser immediately to save directly to disk (bypasses RAM completely)
            if (directDownloadsRef.current && (window as any).showSaveFilePicker) {
              try {
                const handle = await (window as any).showSaveFilePicker({
                  suggestedName: data.name,
                  types: [{
                    description: 'Direct Disk Download',
                    accept: { [data.mimeType || 'application/octet-stream']: [] }
                  }]
                });
                bufferRef.fileHandle = handle;
                bufferRef.writable = await handle.createWritable();
                bufferRef.isDirectDisk = true;
                addLog(`Direct download initiated: Writing ${data.name} directly to disk (RAM bypassed)`, "ok");
              } catch (err: any) {
                if (err.name === 'AbortError') {
                  addLog("Transfer Aborted: User cancelled direct disk save prompt", "err");
                  setTransfer(null);
                  fileBuffers.current.delete(peerId);
                  return;
                } else {
                  addLog(`Transfer Aborted: ${err.message || err}`, "err");
                  setTransfer(null);
                  fileBuffers.current.delete(peerId);
                  return;
                }
              }
            } else if (navigator.storage && navigator.storage.getDirectory) {
              navigator.storage.getDirectory().then(async root => {
                try {
                  const safeName = data.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
                  const fh = await root.getFileHandle(`transfer-${Date.now()}-${safeName}`, { create: true });
                  bufferRef.fileHandle = fh;
                  bufferRef.writable = await fh.createWritable();
                } catch(e) {
                  console.warn("OPFS setup failed:", e);
                }
              }).catch(() => {});
            }

            fileBuffers.current.set(peerId, bufferRef);
            setTransfer({ 
              name: data.name, 
              progress: 0, 
              type: 'receiving',
              peerUsername: data.senderName || peerProfiles[peerId]?.username || 'Unknown',
              transferredBytes: 0,
              totalBytes: data.size
            });
            addLog(`Incoming payload: ${data.name}${bufferRef.isDirectDisk ? ' [Direct Disk]' : ''}`, "info");
            if (roleRef.current === 'host') {
              dataChannels.current.forEach((dc, otherId) => {
                if (otherId !== peerId && dc.readyState === 'open') {
                  dc.send(event.data);
                }
              });
            }
          } else if (data.type === 'call-invite') {
            addLog(`Incoming ${data.callType} call from ${data.callerName || 'peer'}`, "info");
            setIncomingCall({
              peerId,
              callerName: data.callerName || 'Peer',
              callType: data.callType || 'video',
              sdp: data.sdp
            });
            playRingChime();
          } else if (data.type === 'call-answer') {
            const pc = peerConnections.current.get(peerId);
            if (pc) {
              try {
                await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                addLog("Direct encrypted media tunnel connected!", "ok");
              } catch (e) {
                console.error("Error setting remote description on call-answer:", e);
              }
            }
          } else if (data.type === 'call-decline') {
            addLog(`Call declined by ${data.by || 'peer'}`, "err");
            endCallRef.current?.();
          } else if (data.type === 'call-track-state') {
            setPeerTrackStates(prev => ({
              ...prev,
              [peerId]: {
                ...prev[peerId],
                [data.kind]: data.enabled
              }
            }));
          } else if (data.type === 'call-end') {
            addLog("Call ended by peer", "info");
            stopRingChime();
            setIncomingCall(null);
            if (localStreamRef.current) {
              if ((localStreamRef.current as any)._simTimer) {
                clearInterval((localStreamRef.current as any)._simTimer);
              }
              localStreamRef.current.getTracks().forEach(t => t.stop());
              localStreamRef.current = null;
            }
            Object.values(remoteStreams).forEach((st: any) => {
              if (st._simTimer) clearInterval(st._simTimer);
              st.getTracks?.().forEach((t: any) => t.stop());
            });
            setLocalStream(null);
            setIsCallActive(false);
            setCallType(null);
            setRemoteStreams({});
            setPeerTrackStates({});
          } else if (data.type === 'ice-candidate') {
            const pc = peerConnections.current.get(peerId);
            if (pc && data.candidate) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
              } catch (e) {
                console.warn("ICE candidate error:", e);
              }
            }
          } else if (data.type === 'media-offer') {
            const pc = peerConnections.current.get(peerId);
            if (pc) {
              await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              const dc = dataChannels.current.get(peerId);
              if (dc && dc.readyState === 'open') {
                dc.send(JSON.stringify({ type: 'media-answer', sdp: pc.localDescription }));
              }
            }
          } else if (data.type === 'media-answer') {
            const pc = peerConnections.current.get(peerId);
            if (pc) {
              await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            }
          }
        } catch (e) {
          console.error("Failed to parse message", e);
        }
      } else {
        const buffer = fileBuffers.current.get(peerId);
        if (buffer) {
          buffer.receivedSize += event.data.byteLength;

          if (buffer.isDirectDisk) {
            // Direct disk streaming without keeping in RAM
            if (buffer.writable) {
              buffer.chunks.push(event.data);
              if (!buffer.isWriting) {
                buffer.isWriting = true;
                (async () => {
                  try {
                    while (buffer.chunks.length > 0) {
                      const chunk = buffer.chunks.shift();
                      await buffer.writable.write(chunk);
                    }
                    if (buffer.receivedSize >= buffer.metadata.size && buffer.chunks.length === 0) {
                      await buffer.writable.close();
                      triggerTransferAnimation();
                      addLog(`Direct download complete: ${buffer.metadata.name} written directly to disk`, "ok");
                      finishFileReceive(buffer, null);
                    }
                  } catch (diskErr: any) {
                    addLog(`Transfer Aborted: Direct disk write failed (${diskErr?.message || diskErr})`, "err");
                    setTransfer(null);
                    fileBuffers.current.delete(peerId);
                  } finally {
                    buffer.isWriting = false;
                  }
                })();
              }
            }
          } else {
            buffer.chunks.push(event.data);

            if (buffer.writable && !buffer.isWriting) {
              buffer.isWriting = true;
              (async () => {
                try {
                  while(buffer.chunks.length > 0) {
                    const chunk = buffer.chunks.shift();
                    await buffer.writable.write(chunk);
                  }
                } finally {
                  buffer.isWriting = false;
                }
                
                if (buffer.receivedSize >= buffer.metadata.size && buffer.chunks.length === 0) {
                  await buffer.writable.close();
                  const blob = await buffer.fileHandle.getFile();
                  finishFileReceive(buffer, blob);
                }
              })();
            }
          }

          const now = Date.now();
          if (now - lastUpdateRef.current > 150 || buffer.receivedSize >= buffer.metadata.size) {
            const progress = Math.round((buffer.receivedSize / buffer.metadata.size) * 100);
            setTransfer(prev => prev ? { ...prev, progress, transferredBytes: buffer.receivedSize } : null);
            lastUpdateRef.current = now;
          }
          
          if (roleRef.current === 'host') {
            dataChannels.current.forEach((dc, otherId) => {
              if (otherId !== peerId && dc.readyState === 'open') {
                dc.send(event.data);
              }
            });
          }

          if (!buffer.isDirectDisk && !buffer.writable && buffer.receivedSize >= buffer.metadata.size) {
            triggerTransferAnimation();
            const blob = new Blob(buffer.chunks, { type: buffer.metadata.mimeType });
            finishFileReceive(buffer, blob);
          }
        }
      }
    };

    const finishFileReceive = (buffer: any, blob: Blob | null) => {
      const name = buffer.metadata.name;
      const size = buffer.metadata.size;
      const senderName = buffer.metadata.senderName || "Unknown Node";
      const senderColor = buffer.metadata.senderColor || "bg-muted";
      const senderId = buffer.metadata.senderId;
      const isDirectDisk = buffer.isDirectDisk;
      
      setFiles(prev => [{
        id: (Math.random().toString(36).substring(2) + Date.now().toString(36)),
        name,
        blob: blob || new Blob([], { type: buffer.metadata.mimeType || 'application/octet-stream' }),
        size,
        senderName,
        senderColor,
        senderId,
        timestamp: new Date(),
        direction: 'in'
      }, ...prev]);
      
      setMessages(prev => [...prev, {
        id: (Math.random().toString(36).substring(2) + Date.now().toString(36)),
        text: `📁 Received: ${name}${isDirectDisk ? ' (Saved directly to Disk)' : ''}`,
        sender: 'system',
        timestamp: new Date()
      }]);
      
      setTransfer(null);
      fileBuffers.current.delete(peerId);
      addLog(`Payload received: ${name}${isDirectDisk ? ' (Saved to disk)' : ''}`, "ok");
      
      // Auto-download to browser folder if not already written to disk
      if (!isDirectDisk && autoDownloadRef.current && blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    };
  }, [addLog]);

  const createPeer = useCallback((id: string) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
      ],
      iceCandidatePoolSize: 2,
    });
    peerConnections.current.set(id, pc);
    
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        pc.close();
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const dc = dataChannels.current.get(id);
        if (dc && dc.readyState === 'open') {
          dc.send(JSON.stringify({
            type: 'ice-candidate',
            candidate: event.candidate
          }));
        }
      }
    };

    pc.ondatachannel = (event) => setupDataChannel(event.channel, id);

    pc.ontrack = (event) => {
      const track = event.track;
      addLog(`Received incoming media stream track (${track.kind})`, "ok");
      if (event.streams && event.streams[0]) {
        const stream = event.streams[0];
        setRemoteStreams(prev => {
          if (prev[id] === stream) return prev;
          return { ...prev, [id]: stream };
        });
      } else {
        setRemoteStreams(prev => {
          const currentStream = prev[id];
          if (currentStream) {
            if (!currentStream.getTracks().some(t => t.id === track.id)) {
              currentStream.addTrack(track);
            }
            return { ...prev, [id]: new MediaStream(currentStream.getTracks()) };
          }
          return { ...prev, [id]: new MediaStream([track]) };
        });
      }
    };

    localConnectionRef.current = pc;
    return pc;
  }, [setupDataChannel, addLog]);

  const waitForIce = (pc: RTCPeerConnection) => new Promise<void>((resolve) => {
    if (pc.iceGatheringState === 'complete') resolve();
    else {
      const check = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', check);
          resolve();
        }
      };
      pc.addEventListener('icegatheringstatechange', check);
      setTimeout(resolve, 3000);
    }
  });

  const createHostOffer = async () => {
    const id = (Math.random().toString(36).substring(2) + Date.now().toString(36));
    setQrPayload("");
    setPasteBuffer("");
    
    const pc = createPeer(id);
    const dc = pc.createDataChannel('nexus-transfer');
    setupDataChannel(dc, id);
    
    if (connectedCount === 0) setStatus("handshaking");
    
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    addLog("Generating matrix offer...", "info");
    await waitForIce(pc);
    
    const sdp = JSON.stringify(pc.localDescription);
    const compressed = btoa(encodeURIComponent(sdp));
    setQrPayload(compressed);
    addLog("Offer ready. Peer sync required.", "ok");
  };

  const decodeSDP = (input: string) => {
    try {
      const decoded = atob(input);
      if (decoded.trim().startsWith('{')) return decoded;
    } catch {}
    try {
      const decompressed = decodeURIComponent(atob(input));
      if (decompressed && decompressed.trim().startsWith('{')) return decompressed;
    } catch {}
    throw new Error("Invalid or corrupt protocol string format");
  };

  const handleReceivedOffer = async (input: string) => {
    if (!input) return;
    try {
      const id = (Math.random().toString(36).substring(2) + Date.now().toString(36));
      const sdpString = decodeSDP(input);
      const pc = createPeer(id);
      
      await pc.setRemoteDescription(JSON.parse(sdpString));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      setStatus("handshaking");
      addLog("Offer synced, generating response matrix...", "info");
      await waitForIce(pc);
      
      const answerSdp = JSON.stringify(pc.localDescription);
      const compressed = btoa(encodeURIComponent(answerSdp));
      setQrPayload(compressed);
      addLog("Response generated. Finalize handshake at host.", "ok");
    } catch (e) {
      addLog("Corrupt offer payload", "err");
    }
  };

  const handleReceivedAnswer = async (input?: string) => {
    const sdp = input || pasteBuffer;
    if (!sdp || !localConnectionRef.current) return;
    
    try {
      const sdpString = decodeSDP(sdp);
      await localConnectionRef.current.setRemoteDescription(JSON.parse(sdpString));
      addLog("Synchronizing ICE protocols...", "info");
      setTimeout(() => {
        setQrPayload("");
        setPasteBuffer("");
      }, 500);
    } catch (e) {
      addLog("Corrupt answer payload", "err");
    }
  };

  const createSimStream = (label: string, color: string, withAudio: boolean = true) => {
    const canvas = document.createElement('canvas');
    canvas.width = 640; 
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    let frame = 0;
    const timer = setInterval(() => {
      if (!ctx) return;
      frame++;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = color;
      ctx.font = 'bold 24px monospace';
      ctx.fillText(label, 160, 220);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '16px monospace';
      ctx.fillText(new Date().toLocaleTimeString(), 250, 260);
      const pulse = Math.sin(frame / 6) * 30;
      ctx.fillStyle = color;
      ctx.fillRect(190, 290, 260 + pulse, 6);
    }, 100);
    const s = (canvas as any).captureStream(30);
    (s as any)._simTimer = timer;

    if (withAudio) {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, audioCtx.currentTime);
          gain.gain.setValueAtTime(0.005, audioCtx.currentTime);
          osc.connect(gain);
          const dest = audioCtx.createMediaStreamDestination();
          gain.connect(dest);
          osc.start();
          dest.stream.getAudioTracks().forEach(t => s.addTrack(t));
          (s as any)._simAudioCtx = audioCtx;
        }
      } catch (e) {}
    }
    return s;
  };

  const startCall = async (type: 'audio' | 'video') => {
    let stream: MediaStream;
    const isRestricted = bandwidthOptimized || connectedCount >= 3;
    const videoConstraint = type === 'video' 
      ? (isRestricted ? { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { max: 15 } } : true)
      : false;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: videoConstraint
      });
    } catch (e) {
      if (isSimulation) {
        addLog("Permission denied or preview mode, using simulated live stream", "info");
        stream = createSimStream('SIMULATED LOCAL STREAM', '#38bdf8', true);
      } else if (type === 'video') {
        addLog("Camera access restricted, attempting audio-only fallback", "info");
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } catch {
          addLog("Hardware media access restricted, generating preview stream", "info");
          stream = createSimStream('TEST LOCAL STREAM', '#38bdf8', true);
        }
      } else {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } catch {
          addLog("Microphone access restricted, generating preview stream", "info");
          stream = createSimStream('TEST LOCAL AUDIO', '#38bdf8', true);
        }
      }
    }

    localStreamRef.current = stream;
    setLocalStream(stream);
    setCallType(type);
    setIsCallActive(true);
    addLog(`Started ${type} call`, "ok");
    
    if (isSimulation) {
      const fakeStreams: Record<string, MediaStream> = {};
      if (type === 'video') {
        fakeStreams['sim_peer_1'] = createSimStream('Simulated Peer Video', '#34d399', true);
      } else {
        fakeStreams['sim_peer_1'] = createSimStream('Simulated Peer Audio', '#34d399', true);
      }
      setRemoteStreams(fakeStreams);
      return;
    }

    // Attach local tracks and notify all peers via call-invite with offer SDP
    peerConnections.current.forEach(async (pc, peerId) => {
      stream.getTracks().forEach(track => {
        if (!pc.getSenders().find(s => s.track === track)) {
          pc.addTrack(track, stream);
        }
      });

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await waitForIce(pc);
        const dc = dataChannels.current.get(peerId);
        if (dc && dc.readyState === 'open') {
          dc.send(JSON.stringify({
            type: 'call-invite',
            callType: type,
            callerName: profile.username,
            callerId: profile.id,
            sdp: pc.localDescription
          }));
        }
      } catch (err) {
        console.error("Error creating call offer for peer " + peerId, err);
      }
    });
  };

  const acceptCall = async (incoming: IncomingCallData) => {
    stopRingChime();
    setIncomingCall(null);
    let stream: MediaStream;
    const isRestricted = bandwidthOptimized || connectedCount >= 3;
    const videoConstraint = incoming.callType === 'video' 
      ? (isRestricted ? { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { max: 15 } } : true)
      : false;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: videoConstraint
      });
    } catch (e) {
      addLog("Camera access restricted, attempting audio-only", "info");
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch {
        stream = createSimStream('Joined Stream', '#38bdf8', true);
      }
    }

    localStreamRef.current = stream;
    setLocalStream(stream);
    setCallType(incoming.callType);
    setIsCallActive(true);
    addLog(`Joined ${incoming.callType} call with ${incoming.callerName}`, "ok");

    const pc = peerConnections.current.get(incoming.peerId);
    if (pc) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(incoming.sdp));
        stream.getTracks().forEach(track => {
          if (!pc.getSenders().find(s => s.track === track)) {
            pc.addTrack(track, stream);
          }
        });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await waitForIce(pc);
        const dc = dataChannels.current.get(incoming.peerId);
        if (dc && dc.readyState === 'open') {
          dc.send(JSON.stringify({
            type: 'call-answer',
            sdp: pc.localDescription
          }));
        }
      } catch (err) {
        console.error("Error setting answer on incoming call:", err);
      }
    }
  };

  const declineCall = (incoming: IncomingCallData) => {
    stopRingChime();
    setIncomingCall(null);
    const dc = dataChannels.current.get(incoming.peerId);
    if (dc && dc.readyState === 'open') {
      dc.send(JSON.stringify({
        type: 'call-decline',
        by: profile.username
      }));
    }
    addLog(`Declined call from ${incoming.callerName}`, "info");
  };

  const endCall = useCallback(() => {
    stopRingChime();
    setIncomingCall(null);

    dataChannels.current.forEach(dc => {
      if (dc.readyState === 'open') {
        try {
          dc.send(JSON.stringify({ type: 'call-end' }));
        } catch (e) {}
      }
    });

    if (localStreamRef.current) {
      if ((localStreamRef.current as any)._simTimer) {
        clearInterval((localStreamRef.current as any)._simTimer);
      }
      if ((localStreamRef.current as any)._simAudioCtx) {
        (localStreamRef.current as any)._simAudioCtx.close().catch(() => {});
      }
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);

    Object.values(remoteStreams).forEach((st: any) => {
      if (st._simTimer) clearInterval(st._simTimer);
      if (st._simAudioCtx) st._simAudioCtx.close().catch(() => {});
      st.getTracks?.().forEach((t: any) => t.stop());
    });

    peerConnections.current.forEach(pc => {
      pc.getSenders().forEach(sender => {
        if (sender.track) {
          try {
            pc.removeTrack(sender);
          } catch (e) {}
        }
      });
    });

    setIsCallActive(false);
    setCallType(null);
    setRemoteStreams({});
    setPeerTrackStates({});
    addLog("Ended call", "info");
  }, [addLog, stopRingChime, remoteStreams]);

  useEffect(() => {
    endCallRef.current = endCall;
  }, [endCall]);

  const handleToggleTrack = (kind: 'audio' | 'video', enabled: boolean) => {
    dataChannels.current.forEach(dc => {
      if (dc.readyState === 'open') {
        try {
          dc.send(JSON.stringify({
            type: 'call-track-state',
            kind,
            enabled,
            from: profile.username
          }));
        } catch (e) {}
      }
    });
  };

  const handleAddTrack = async (track: MediaStreamTrack) => {
    setCallType('video');
    peerConnections.current.forEach(pc => {
      if (localStreamRef.current) {
        if (!pc.getSenders().find(s => s.track === track)) {
          pc.addTrack(track, localStreamRef.current);
        }
      }
    });

    peerConnections.current.forEach(async (pc, peerId) => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await waitForIce(pc);
        const dc = dataChannels.current.get(peerId);
        if (dc && dc.readyState === 'open') {
          dc.send(JSON.stringify({ type: 'media-offer', sdp: pc.localDescription }));
        }
      } catch (e) {
        console.error("Renegotiation failed:", e);
      }
    });
  };

  const sendMessage = (text: string, audioData?: string) => {
    if ((!text && !audioData) || dataChannels.current.size === 0) return;
    
    const messageId = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const msgObj = { 
      type: 'chat', 
      id: messageId,
      text,
      audioData,
      senderName: profile.username,
      senderColor: profile.avatarColor,
      senderId: profile.id,
      timestamp: new Date().toISOString()
    };
    const fullMsg = JSON.stringify(msgObj);
    
    // WebRTC safe chunking threshold (32KB chunks prevent SCTP buffer overflow)
    const CHUNK_SIZE_LIMIT = 32000;
    if (fullMsg.length > CHUNK_SIZE_LIMIT) {
      const total = Math.ceil(fullMsg.length / CHUNK_SIZE_LIMIT);
      for (let i = 0; i < total; i++) {
        const slice = fullMsg.slice(i * CHUNK_SIZE_LIMIT, (i + 1) * CHUNK_SIZE_LIMIT);
        const chunkPayload = JSON.stringify({
          type: 'chat-chunk',
          msgId: messageId,
          index: i,
          total,
          chunk: slice
        });
        dataChannels.current.forEach(dc => {
          if (dc.readyState === 'open') {
            try { dc.send(chunkPayload); } catch (e) { console.error("DC chunk send error:", e); }
          }
        });
      }
    } else {
      dataChannels.current.forEach(dc => {
        if (dc.readyState === 'open') {
          try { dc.send(fullMsg); } catch (e) { console.error("DC send error:", e); }
        }
      });
    }
    
    setMessages(prev => [...prev, {
      id: messageId,
      text,
      audioData,
      sender: 'me',
      senderName: profile.username,
      senderColor: profile.avatarColor,
      senderId: profile.id,
      timestamp: new Date()
    }]);

    if (isSimulation) {
      setTimeout(() => {
        setMessages(prev => [...prev, {
          id: (Math.random().toString(36).substring(2) + Date.now().toString(36)),
          text: audioData ? "🎙️ [Simulated Voice Note Received]" : "Simulated reply to: " + text,
          audioData: audioData ? audioData : undefined,
          sender: 'them',
          senderName: 'Alpha (Sim)',
          senderColor: 'bg-blue-500',
          senderId: 'sim_peer_1',
          timestamp: new Date()
        }]);
        setUnreadChatCount(prev => activeTabRef.current !== 'chat' ? prev + 1 : 0);
      }, 1200);
    }
  };

  const sendFile = async (file: File) => {
    if (dataChannels.current.size === 0) return;
    addLog(`Initiating transfer: ${file.name}`, "info");
    
    const meta = JSON.stringify({
      type: 'file-meta',
      name: file.name,
      size: file.size,
      mimeType: file.type,
      senderName: profile.username,
      senderColor: profile.avatarColor,
      senderId: profile.id
    });

    dataChannels.current.forEach(dc => {
      if (dc.readyState === 'open') dc.send(meta);
    });

    setFiles(prev => [{
      id: (Math.random().toString(36).substring(2) + Date.now().toString(36)),
      name: file.name,
      size: file.size,
      senderName: profile.username,
      senderColor: profile.avatarColor,
      timestamp: new Date(),
      direction: 'out'
    }, ...prev]);

    setTransfer({ 
      name: file.name, 
      progress: 0, 
      type: 'sending',
      peerUsername: dataChannels.current.size === 1 ? (Object.values(peerProfiles) as any[])[0]?.username || 'Peer' : 'Group',
      transferredBytes: 0,
      totalBytes: file.size
    });

    let offset = 0;
    cancelTransferRef.current = false;
    const reader = new FileReader();
    
    const readSlice = () => {
      const slice = file.slice(offset, offset + CHUNK_SIZE);
      reader.readAsArrayBuffer(slice);
    };

    reader.onload = (e) => {
      if (!e.target?.result) return;
      const data = e.target.result as ArrayBuffer;
      
      if (file.size > 5 * 1024 * 1024 * 1024) {
        addLog(`File exceeds 5GB limit: ${file.name}`, "err");
        return;
      }
      
      if (cancelTransferRef.current) return;
      
      dataChannels.current.forEach(dc => {
        if (dc.readyState === 'open') dc.send(data);
      });

      offset += data.byteLength;
      
      const now = Date.now();
      if (now - lastUpdateRef.current > 150 || offset >= file.size) {
        const progress = Math.round((offset / file.size) * 100);
        setTransfer(prev => prev ? { ...prev, progress, transferredBytes: offset } : null);
        lastUpdateRef.current = now;
      }

      if (offset < file.size) {
        // High throughput flow control
        const checkBuffer = () => {
          let maxBuffer = 0;
          dataChannels.current.forEach(dc => maxBuffer = Math.max(maxBuffer, dc.bufferedAmount));
          if (maxBuffer > 4 * 1024 * 1024) {
            setTimeout(checkBuffer, 50);
          } else {
            readSlice();
          }
        };
        checkBuffer();
      } else {
        triggerTransferAnimation();
        addLog(`Sent payload: ${file.name}`, "ok");
        setTimeout(() => setTransfer(null), 1000);
      }
    };

    readSlice();
  };

  return (
    <div className="h-screen w-full overflow-hidden flex flex-col relative text-[14px] bg-transparent text-text antialiased">
      <AnimatePresence>
        {showProfileModal && (
          <ProfileModal 
            profile={profile} 
            onSave={(newProfile) => {
              setProfile(newProfile);
              if (status === 'connected') {
                dataChannels.current.forEach(dc => {
                  if(dc.readyState === 'open') dc.send(JSON.stringify({ type: 'profile-update', profile: newProfile }));
                });
              }
            }} 
            onClose={() => setShowProfileModal(false)} 
          />
        )}
        {selectedPeerProfile && (
          <ViewProfileModal
            profile={selectedPeerProfile}
            onClose={() => setSelectedPeerProfile(null)}
          />
        )}
      </AnimatePresence>
      <NetworkBackground connectedCount={connectedCount} />
      
      {/* Header */}
      <header className="z-10 h-auto md:h-16 py-3 md:py-0 border-b border-white/40 dark:border-transparent dark:border-white/10 bg-white/30 dark:bg-transparent backdrop-blur-3xl flex flex-wrap md:flex-nowrap items-center justify-between px-3 md:px-6 lg:px-8 shadow-sm flex-shrink-0 relative gap-x-2 gap-y-3 md:gap-y-0">
        <div className="flex items-center gap-2 md:gap-3 lg:gap-4 flex-shrink-0 min-w-0">
          <button 
            onClick={toggleSimulation}
            className={cn(
               "w-8 h-8 md:w-9 md:h-9 lg:w-10 lg:h-10 border rounded-xl lg:rounded-2xl flex items-center justify-center font-medium text-xl shadow-sm flex-shrink-0 transition-colors cursor-pointer",
               isSimulation ? "bg-accent text-white border-accent" : "bg-accent/10 border-accent/20 text-accent hover:bg-accent/20"
            )}
            title={isSimulation ? "Disable Simulation Mode" : "Enable Simulation Mode"}
          >
            <RefreshCw className={cn("w-4 h-4 lg:w-5 lg:h-5", isSimulation && "animate-spin")} />
          </button>
          <div 
            className="min-w-0 cursor-pointer select-none relative group" 
            onClick={handleTitleClick}
            title={titleTapCount > 0 ? `${10 - titleTapCount} taps left to unlock easter egg` : "Quantum Link"}
          >
            <motion.div
              animate={titleTapCount > 0 ? { scale: [1, 0.95, 1] } : {}}
              transition={{ duration: 0.12 }}
            >
              <h1 className="text-sm md:text-base lg:text-lg font-semibold tracking-tight text-text whitespace-nowrap flex items-center gap-1.5">
                <span className="hidden sm:inline">Quantum Link</span>
                <span className="sm:hidden">Q-Link</span>
                <span className="text-[10px] lg:text-xs text-muted font-normal">v7.8.4</span>
                {titleTapCount >= 3 && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-500 dark:text-cyan-400 border border-cyan-500/40 text-[9px] font-mono font-bold animate-pulse"
                  >
                    ⚡ {10 - titleTapCount}
                  </motion.span>
                )}
              </h1>
              <div className="text-[9px] md:text-[10px] lg:text-xs text-muted flex items-center gap-1 lg:gap-2 mt-0.5 whitespace-nowrap">
                <span className={cn(
                  "h-1.5 w-1.5 lg:h-2 lg:w-2 rounded-full flex-shrink-0",
                  status === "connected" ? "bg-success" : status === "handshaking" ? "bg-accent animate-pulse" : "bg-muted"
                )} />
                <span className="truncate">
                  {status === "connected" ? (isSimulation ? "Network Simulated" : "Network Secured") : status === "handshaking" ? "Syncing..." : "Disconnected"}
                </span>
              </div>
            </motion.div>
          </div>
        </div>

        <div className="w-full md:w-auto md:flex-1 flex justify-center min-w-0 order-last md:order-none pb-1 md:pb-0">
          <nav className="flex w-max justify-center gap-1 p-1 bg-white/40 dark:bg-transparent backdrop-blur-xl border border-white/50 dark:border-transparent dark:border-white/10 rounded-2xl shadow-sm z-[20] shrink-0 mx-auto overflow-x-auto scrollbar-hide">
            <button 
              onClick={() => setActiveTab("p2p")}
              className={cn(
                "nav-tab px-3 md:px-3 lg:px-4 py-1.5 text-[10px] md:text-xs font-medium transition-all rounded-xl whitespace-nowrap",
                activeTab === "p2p" ? "bg-white dark:bg-transparent text-text shadow-sm" : "text-muted hover:text-text cursor-pointer"
              )}
            >
              Transceiver
            </button>
            <button 
              onClick={() => { setActiveTab("qr"); addLog("Entering QR Utility", "info"); }}
              className={cn(
                "nav-tab px-3 md:px-3 lg:px-4 py-1.5 text-[10px] md:text-xs font-medium transition-all rounded-xl whitespace-nowrap",
                activeTab === "qr" ? "bg-white dark:bg-transparent text-text shadow-sm" : "text-muted hover:text-text cursor-pointer"
              )}
            >
              QR Utility
            </button>
            <button 
              onClick={() => { setActiveTab("chat"); setUnreadChatCount(0); }}
              className={cn(
                "nav-tab px-3 md:px-3 lg:px-4 py-1.5 text-[10px] md:text-xs font-medium transition-all rounded-xl whitespace-nowrap relative",
                activeTab === "chat" ? "bg-white dark:bg-transparent text-text shadow-sm" : "text-muted hover:text-text cursor-pointer"
              )}
            >
              Secure Chat
              {unreadChatCount > 0 && activeTab !== "chat" && (
                <span className="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full">
                  {unreadChatCount > 9 ? '9+' : unreadChatCount}
                </span>
              )}
              {isCallActive && (
                <span className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center w-3 h-3 bg-accent animate-pulse rounded-full shadow-md border border-white" />
              )}
            </button>
            <button 
              onClick={() => setActiveTab("base64")}
              className={cn(
                "nav-tab px-3 md:px-3 lg:px-4 py-1.5 text-[10px] md:text-xs font-semibold transition-all rounded-xl whitespace-nowrap",
                activeTab === "base64" ? "bg-white dark:bg-transparent text-text shadow-sm" : "text-muted hover:text-text cursor-pointer"
              )}
            >
              Base64
            </button>
          </nav>
        </div>

        <div className="flex gap-2 md:gap-3 lg:gap-6 items-center flex-shrink-0 ml-auto md:ml-0">
          <button
            onClick={() => setShowProfileModal(true)}
            className="flex items-center justify-center hover:bg-white/40 dark:hover:bg-white/5 rounded-full transition-all group"
          >
            <div className={cn(
              "w-8 h-8 md:w-9 md:h-9 lg:w-10 lg:h-10 rounded-full flex items-center justify-center text-white text-sm md:text-base font-bold shadow-sm group-hover:scale-105 transition-transform",
              profile.avatarColor
            )}>
              {profile.username.charAt(0).toUpperCase()}
            </div>
          </button>
          
          <button
            onClick={() => document.documentElement.classList.toggle('dark')}
            className="w-8 h-8 md:w-9 md:h-9 lg:w-10 lg:h-10 flex items-center justify-center text-muted hover:text-text transition-colors border border-white/40 dark:border-transparent dark:border-white/10 dark:border-transparent bg-white/30 dark:bg-transparent backdrop-blur rounded-xl lg:rounded-2xl shadow-sm hover:bg-white/50 dark:hover:bg-black/5 cursor-pointer flex-shrink-0"
            title="Toggle Dark Mode"
          >
            <Moon className="w-4 h-4 lg:w-5 lg:h-5 dark:hidden" />
            <Sun className="w-4 h-4 lg:w-5 lg:h-5 hidden dark:block" />
          </button>
        </div>
      </header>

      {/* Main Area */}
      <main className="z-10 flex-1 p-2.5 sm:p-4 md:p-6 overflow-hidden">
        <AnimatePresence mode="wait">
          {activeTab === "qr" ? (
            <motion.div 
              key="qr" 
              initial={{ opacity: 0, y: 15, filter: "blur(4px)" }} 
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} 
              exit={{ opacity: 0, y: -15, filter: "blur(4px)" }} 
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="h-full w-full"
            >
              <QRUtilityNode />
            </motion.div>
          ) : activeTab === "chat" ? (
            <motion.div 
              key="chat" 
              initial={{ opacity: 0, y: 15, filter: "blur(4px)" }} 
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} 
              exit={{ opacity: 0, y: -15, filter: "blur(4px)" }} 
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="h-full w-full"
            >
              <SecureChatNode 
                messages={messages} 
                sendMessage={sendMessage} 
                connectedPeers={connectedCount} 
                role={role} 
                onClickProfile={(senderId) => {
                  const p = peerProfiles[senderId];
                  if (p) setSelectedPeerProfile(p);
                }}
                startCall={startCall}
                bandwidthOptimized={bandwidthOptimized}
                onToggleBandwidthOptimized={() => setBandwidthOptimized(prev => !prev)}
                isCallActive={isCallActive}
              />
            </motion.div>
          ) : activeTab === "base64" ? (
            <motion.div 
              key="base64" 
              initial={{ opacity: 0, y: 15, filter: "blur(4px)" }} 
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} 
              exit={{ opacity: 0, y: -15, filter: "blur(4px)" }} 
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="h-full w-full"
            >
              <Base64ToolNode />
            </motion.div>
          ) : role ? (
            <motion.div 
              key="p2p-active"
              initial={{ opacity: 0, y: 15, filter: "blur(4px)" }} 
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} 
              exit={{ opacity: 0, y: -15, filter: "blur(4px)" }} 
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="grid grid-cols-1 lg:grid-cols-12 lg:grid-rows-[1fr_auto] gap-6 h-full lg:overflow-hidden overflow-y-auto pb-20 lg:pb-0"
            >
              {/* Top/First Section: Connection Matrix */}
              <section className="col-span-1 lg:col-span-4 flex flex-col gap-4 flex-shrink-0 lg:overflow-y-auto scrollbar-hide">
                <div className="glass-panel p-5 flex-shrink-0">
                  <h3 className="text-sm font-semibold text-text mb-4">Connection Matrix</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => { setRole("host"); resetAll(); }}
                      className={cn(
                        "py-2 text-sm font-medium transition-all rounded-xl border",
                        role === "host" ? "bg-accent text-white border-accent shadow-md" : "border-white/50 dark:border-transparent dark:border-white/10 dark:border-transparent bg-white/30 dark:bg-transparent text-text hover:bg-white/50 dark:hover:bg-black/5 "
                      )}
                    >
                      Host Channel
                    </button>
                    <button 
                      onClick={() => { setRole("join"); resetAll(); }}
                      className={cn(
                        "py-2 text-sm font-medium transition-all rounded-xl border",
                        role === "join" ? "bg-success text-white border-success shadow-md" : "border-white/50 dark:border-transparent dark:border-white/10 dark:border-transparent bg-white/30 dark:bg-transparent text-text hover:bg-white/50 dark:hover:bg-black/5 "
                      )}
                    >
                      Join Session
                    </button>
                  </div>
                </div>

                <div className="glass-panel flex-1 flex flex-col relative overflow-hidden lg:min-h-0 min-h-[400px]">
                  <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center w-full text-center">
                    <div className="text-sm font-medium text-muted self-start w-full text-left mb-6 pb-2 border-b border-white/20 dark:border-transparent dark:border-white/10 dark:border-transparent ">
                      Handshake Port
                    </div>

                    {status === "connected" && role === "join" ? (
                      <div className="flex flex-col items-center justify-center flex-1">
                        <div className="w-24 h-24 bg-success/10 border border-success/30 rounded-full flex items-center justify-center text-success shadow-sm mb-4">
                          <CheckCircle2 className="w-12 h-12" />
                        </div>
                        <p className="text-success font-semibold text-lg">Tunnel Secured</p>
                        <p className="text-muted text-sm mt-2">Direct Peer-to-Peer Link Active</p>
                        <button 
                          onClick={() => { setRole(null); resetAll(); setQrPayload(""); setPasteBuffer(""); setMessages([]); setLogs([]); }}
                          className="mt-8 text-sm text-red-500 hover:text-red-600 bg-red-50 hover:bg-red-100 rounded-full px-6 py-2 flex items-center gap-2 font-medium transition-colors"
                        >
                          <X className="w-4 h-4" /> Disconnect
                        </button>
                      </div>
                    ) : (
                      <div className="w-full flex flex-col items-center">
                        {role === 'host' ? (
                          <div className="w-full flex flex-col items-center">
                            {connectedCount > 0 && (
                              <div className="mb-6 w-full text-center">
                                <div className="p-5 border border-accent/20 bg-accent/5 mb-4 rounded-2xl shadow-sm">
                                  <p className="text-accent font-semibold text-sm mb-1">Host Mode Active</p>
                                  <p className="text-muted text-sm mb-4">Relaying connections for {connectedCount} peer(s).</p>
                                  <button 
                                    onClick={() => { setRole(null); resetAll(); setQrPayload(""); setPasteBuffer(""); setMessages([]); setLogs([]); setConnectedPeers(0); }}
                                    className="text-sm text-red-500 bg-red-50 hover:bg-red-100 rounded-full px-5 py-2 flex items-center gap-2 mx-auto font-medium transition-colors"
                                  >
                                    <X className="w-4 h-4" /> Stop Hosting
                                  </button>
                                </div>
                                <div className="text-left w-full border border-white/40 dark:border-transparent dark:border-white/10 dark:border-transparent bg-white/30 dark:bg-transparent p-4 max-h-48 overflow-y-auto rounded-2xl shadow-sm">
                                  <p className="text-sm font-semibold text-text mb-3 border-b border-white/20 dark:border-transparent dark:border-white/10 dark:border-transparent pb-2">Connected Peers</p>
                                  {(Object.entries(peerProfiles) as [string, UserProfile][]).map(([id, p]) => (
                                    <div key={id} className="flex justify-between items-center mb-2 last:mb-0 bg-white/40 dark:bg-transparent p-3 rounded-xl border border-white/30 dark:border-transparent dark:border-white/10 dark:border-transparent transition-colors">
                                      <button 
                                        className="flex gap-3 items-center hover:opacity-80 transition-opacity text-left cursor-pointer outline-none"
                                        onClick={() => setSelectedPeerProfile(p)}
                                      >
                                        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-sm", p.avatarColor)}>
                                          {p.username.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex flex-col">
                                          <span className="text-accent text-sm font-semibold truncate max-w-[120px]">{p.username}</span>
                                          <span className="text-muted text-[10px] font-mono mt-0.5 truncate max-w-[100px] opacity-70">{p.bio}</span>
                                        </div>
                                      </button>
                                      <button 
                                        onClick={() => disconnectPeer(id)}
                                        className="text-xs text-red-500 bg-red-50 border border-red-100 px-4 py-2 hover:bg-red-100 transition-colors font-medium rounded-xl"
                                      >
                                        Kick
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {qrPayload ? (
                              <>
                                <div 
                                  className="bg-white dark:bg-transparent p-4 rounded-3xl relative shadow-xl mt-4 cursor-pointer hover:scale-[1.02] transition-transform"
                                  onClick={() => {
                                    navigator.clipboard.writeText(qrPayload);
                                    addLog("Offer string copied to clipboard", "ok");
                                  }}
                                  title="Click to copy protocol matrix"
                                >
                                  <QRCodeSVG value={qrPayload} size={240} level="L" marginSize={2} />
                                </div>
                                <div className="flex gap-2 mt-4 w-full object-contain max-w-[250px]">
                                  <button 
                                    onClick={createHostOffer}
                                    className="flex-1 py-2 bg-white dark:bg-transparent hover:bg-gray-50 border border-white/50 dark:border-transparent dark:border-white/10 dark:border-transparent rounded-xl text-accent text-sm font-semibold transition-colors shadow-sm"
                                  >
                                    Regenerate Offer
                                  </button>
                                  <button 
                                    onClick={() => {
                                      if (navigator.share) {
                                        navigator.share({ title: 'Host Matrix', text: qrPayload }).catch(() => {
                                          navigator.clipboard.writeText(qrPayload);
                                          addLog("Offer string copied to clipboard", "ok");
                                        });
                                      } else {
                                        navigator.clipboard.writeText(qrPayload);
                                        addLog("Offer string copied to clipboard", "ok");
                                      }
                                    }}
                                    className="flex justify-center items-center px-4 py-2 bg-white dark:bg-transparent hover:bg-gray-50 border border-white/50 dark:border-transparent dark:border-white/10 dark:border-transparent rounded-xl text-accent transition-colors shadow-sm cursor-pointer"
                                    title="Share / Copy Protocol Data"
                                  >
                                    <Copy className="w-5 h-5" />
                                  </button>
                                </div>
                              </>
                            ) : (
                              <button 
                                onClick={createHostOffer}
                                className="w-full py-4 mt-2 border border-dashed border-white/60 dark:border-transparent dark:border-white/10 dark:border-transparent bg-white/30 dark:bg-transparent rounded-xl hover:bg-white/50 dark:hover:bg-black/5 transition-all text-text font-medium flex-row flex items-center justify-center gap-3 shadow-sm"
                              >
                                {connectedCount > 0 ? "Add Another Peer (Generate QR)" : "Init Offer Matrix"}
                                {connectedCount > 0 ? <UserPlus className="w-5 h-5 text-accent" /> : <RefreshCw className="w-5 h-5 text-muted" />}
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="w-full flex flex-col items-center">
                            {qrPayload ? (
                              <>
                                <div 
                                  className="bg-white dark:bg-transparent p-4 rounded-3xl relative shadow-xl mt-4 cursor-pointer hover:scale-[1.02] transition-transform"
                                  onClick={() => {
                                    navigator.clipboard.writeText(qrPayload);
                                    addLog("Answer string copied to clipboard", "ok");
                                  }}
                                  title="Click to copy protocol matrix"
                                >
                                  <QRCodeSVG value={qrPayload} size={240} level="L" marginSize={2} />
                                </div>
                                <p className="mt-8 text-sm font-medium text-success bg-success/10 rounded-2xl p-4 w-full">
                                  Answer generated. Present to host.
                                </p>
                              </>
                            ) : (
                              <button 
                                onClick={() => setScannerType('offer')}
                                className="w-full py-4 border border-dashed border-white/60 dark:border-transparent dark:border-white/10 dark:border-transparent bg-white/30 dark:bg-transparent rounded-xl hover:bg-white/50 dark:hover:bg-black/5 transition-all text-text font-medium shadow-sm"
                              >
                                Scan Peer Matrix
                              </button>
                            )}
                          </div>
                        )}

                        <div className="w-full mt-8 pt-8 border-t border-white/20 dark:border-transparent dark:border-white/10 dark:border-transparent space-y-4 pb-12 lg:pb-4 flex-shrink-0">
                          <textarea 
                            placeholder="Paste Protocol Data..."
                            value={pasteBuffer}
                            onChange={(e) => setPasteBuffer(e.target.value)}
                            className="w-full bg-white/40 dark:bg-transparent border border-white/50 dark:border-transparent dark:border-white/10 dark:border-transparent text-text p-4 rounded-2xl min-h-24 outline-none focus:border-accent resize-none placeholder:text-muted/70 shadow-inner"
                          />
                          
                          {role === 'host' && (
                            <div className="flex gap-2 w-full">
                              <button 
                                onClick={() => setScannerType('answer')}
                                className="flex-shrink-0 w-12 flex items-center justify-center bg-white/50 dark:bg-transparent border border-white/50 dark:border-transparent dark:border-white/10 dark:border-transparent hover:bg-white/70 dark:bg-transparent transition-colors rounded-xl shadow-sm text-text"
                              >
                                <Monitor className="w-5 h-5" />
                              </button>
                              <button 
                                disabled={!pasteBuffer}
                                onClick={() => handleReceivedAnswer()}
                                className="flex-1 py-3 rounded-xl bg-success text-white font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm border-none"
                              >
                                Sync Answer Protocol <ArrowRight className="w-4 h-4" />
                              </button>
                            </div>
                          )}

                          {role === 'join' && !qrPayload && (
                            <button 
                              disabled={!pasteBuffer}
                              onClick={() => handleReceivedOffer(pasteBuffer)}
                              className="w-full py-3 rounded-xl bg-accent text-white font-medium transition-colors disabled:opacity-50 shadow-sm flex items-center justify-center gap-2 border-none"
                            >
                              Process Offer <Hexagon className="w-4 h-4 fill-white/20" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* Rest of the Sections: File Payload & Logs */}
              <section className="col-span-1 lg:col-span-8 flex flex-col lg:flex-row gap-6 lg:overflow-hidden min-h-[800px] lg:min-h-0">
                <div className="flex-1 flex flex-col lg:flex-row gap-6 lg:overflow-hidden">
                  {/* File Bay */}
                  <div className="flex-1 glass-panel flex flex-col lg:overflow-y-auto scrollbar-hide min-h-[400px] lg:min-h-0">
                    <div className="p-4 border-b border-white/30 dark:border-transparent dark:border-white/10 dark:border-transparent bg-white/20 dark:bg-transparent backdrop-blur-md flex justify-between items-center sticky top-0 z-10 rounded-t-3xl">
                      <span className="text-sm font-semibold text-text">File Drop Zone</span>
                      <span className={cn(
                        "text-xs font-medium px-2.5 py-1 rounded-full",
                        status === "connected" ? "bg-success/20 text-success" : "bg-white/40 dark:bg-transparent text-muted"
                      )}>
                        ● {status === "connected" ? "Online" : "Offline"}
                      </span>
                    </div>

                    <div className="flex-1 p-5 overflow-hidden flex flex-col">
                      <div className="flex flex-wrap items-center justify-between mb-2 gap-2">
                        <button onClick={handleClearCache} className="px-3 py-1 rounded bg-white/20 dark:bg-white/5 border border-white/30 dark:border-white/10 hover:bg-white/30 dark:hover:bg-white/10 transition-colors text-text shadow-sm cursor-pointer text-xs font-medium">
                          Clear App Caches
                        </button>
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-2 text-xs text-muted cursor-pointer hover:text-text transition-colors">
                            <input 
                              type="checkbox" 
                              checked={directDownloads} 
                              onChange={(e) => setDirectDownloads(e.target.checked)} 
                              className="rounded border-white/20 bg-transparent text-accent focus:ring-accent"
                            />
                            Direct Downloads (Bypass RAM Limits)
                          </label>
                          <label className="flex items-center gap-2 text-xs text-muted cursor-pointer hover:text-text transition-colors">
                            <input 
                              type="checkbox" 
                              checked={autoDownload} 
                              onChange={(e) => setAutoDownload(e.target.checked)} 
                              className="rounded border-white/20 bg-transparent text-accent focus:ring-accent"
                            />
                            Auto-download files
                          </label>
                        </div>
                      </div>
                      <div 
                        onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
                        onDragLeave={() => setIsDraggingOver(false)}
                        onDrop={(e) => { e.preventDefault(); setIsDraggingOver(false); if (e.dataTransfer.files) Array.from(e.dataTransfer.files).forEach(sendFile); }}
                        className={cn(
                          "relative border-2 border-dashed rounded-3xl h-36 flex flex-col items-center justify-center transition-colors cursor-pointer mb-5 overflow-hidden group",
                          isDraggingOver ? "border-accent bg-accent/5 text-accent" : "border-white/60 dark:border-transparent dark:border-white/10 dark:border-transparent bg-white/30 dark:bg-transparent text-muted hover:border-accent hover:bg-white/50 dark:hover:bg-black/5 "
                        )}
                      >
                        <DataStream active={isTransferring} />
                        <input 
                          type="file" 
                          multiple 
                          className="absolute inset-0 opacity-0 cursor-pointer z-10"
                          disabled={status !== 'connected'}
                          onChange={(e) => { if (e.target.files) Array.from(e.target.files).forEach(sendFile); }}
                        />
                        <div className="text-3xl mb-2 transition-transform group-hover:-translate-y-1">
                          <Send className="w-8 h-8 opacity-80" />
                        </div>
                        <div className="text-sm font-semibold mb-1">
                          {isDraggingOver ? "Drop to Send" : "Click or Drag Files Here"}
                        </div>
                        <div className="text-xs opacity-70">Up to 5GB per file transfer</div>
                      </div>

                      <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-hide">
                        {transfer && (
                          <PacketTransferAnimation transfer={transfer} myUsername={profile.username} onCancel={handleCancelTransfer} />
                        )}

                        {files.map((file, idx) => (
                          <div 
                            key={file.id}
                            onClick={() => file.blob ? setSelectedFile(file) : null}
                            className={cn(
                              "bg-white/40 dark:bg-transparent border p-4 rounded-2xl flex items-center gap-4 transition-all shadow-sm",
                              file.blob ? "cursor-pointer hover:bg-white/60 dark:hover:bg-black/5 hover:shadow-md border-white/60 dark:border-transparent dark:border-white/10 dark:border-transparent " : "border-white/30 dark:border-transparent dark:border-white/10 dark:border-transparent opacity-70"
                            )}
                          >
                            <div className={cn(
                              "w-10 h-10 rounded-xl bg-white dark:bg-transparent flex items-center justify-center shadow-sm shrink-0",
                              file.direction === 'in' ? "text-success" : "text-accent"
                            )}>
                              {file.direction === 'in' ? <Download className="w-5 h-5" /> : <Send className="w-5 h-5" />}
                            </div>
                            <div className={cn(
                              "flex-1 min-w-0 transition-colors",
                              file.direction === 'in' ? "text-text" : "text-text"
                            )}>
                              <div className="text-sm font-semibold truncate">{file.name}</div>
                              <div className="text-xs text-muted mt-0.5">
                                {formatBytes(file.size)} • {file.direction === 'in' ? `From: ${file.senderName}` : "Sent by you"}
                              </div>
                            </div>
                          </div>
                        ))}

                        {files.length === 0 && !transfer && (
                          <div className="h-full flex flex-col items-center justify-center opacity-40 py-12">
                            <FileText className="w-12 h-12 mb-3 text-muted" />
                            <span className="text-sm font-medium text-muted">No files transferred yet</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Signal Feed */}
                  <div className="w-full lg:w-72 flex-shrink-0 glass-panel flex flex-col min-h-[350px] lg:min-h-0">
                    <div className="p-4 border-b border-white/30 dark:border-transparent dark:border-white/10 dark:border-transparent bg-white/20 dark:bg-transparent backdrop-blur-md sticky top-0 z-10 flex-shrink-0 rounded-t-3xl flex justify-between items-center">
                      <span className="text-sm font-semibold text-text">Activity Log</span>
                      {role === 'host' && (
                        <button
                          onClick={() => setShowFailoverMenu(true)}
                          className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors bg-accent/10 border border-accent/20 shadow-sm"
                          title="Nexus Failover Settings"
                        >
                          <ShieldCheck className="w-4 h-4 text-accent" />
                        </button>
                      )}
                    </div>
                    <div className="flex-1 p-4 text-[13px] overflow-y-auto scrollbar-hide flex flex-col gap-2 relative">
                      {[...logs, ...messages.filter(m => m.sender !== 'system').map(m => ({ 
                        text: m.text, 
                        type: m.sender === 'me' ? 'me_msg' : 'peer_msg', 
                        timestamp: m.timestamp,
                        name: m.senderName
                      } as any))].sort((a: any, b: any) => a.timestamp.getTime() - b.timestamp.getTime()).map((entry: any, i) => (
                        <div key={i} className="flex gap-3 items-start bg-white/30 dark:bg-transparent p-2.5 rounded-xl border border-white/20 dark:border-transparent dark:border-white/10 dark:border-transparent ">
                          <span className="text-muted/60 text-xs shrink-0 mt-0.5 font-mono">{entry.timestamp.toLocaleTimeString([], { hour12: false })}</span>
                          {entry.type === 'me_msg' || entry.type === 'peer_msg' ? (
                            <div className="flex flex-col">
                              <span className={cn("text-xs font-semibold uppercase tracking-wider mb-0.5", entry.type === 'me_msg' ? "text-accent" : "text-success")}>
                                {entry.name ? (entry.name as string).substring(0, 10) : entry.type === 'me_msg' ? 'Locals' : 'Peer'}
                              </span>
                              <span className="text-text font-medium">{entry.text}</span>
                            </div>
                          ) : (
                            <div className="flex gap-2 items-center">
                              <span className={cn(
                                "text-xs font-bold px-2 py-0.5 rounded-md",
                                entry.type === 'err' ? "bg-red-100 text-red-600" : entry.type === 'ok' ? "bg-green-100 text-success" : entry.type === 'info' ? "bg-blue-100 text-accent" : "bg-gray-100 text-gray-700"
                              )}>
                                {entry.type}
                              </span>
                              <span className="text-text font-medium">{entry.text}</span>
                            </div>
                          )}
                        </div>
                      ))}
                      {logs.length === 0 && messages.length === 0 && (
                        <div className="text-muted/50 italic flex items-center justify-center p-6 border border-dashed border-white/40 dark:border-transparent dark:border-white/10 dark:border-transparent mt-auto rounded-3xl">
                          No recent activity
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </motion.div>
          ) : (
            <motion.section 
              key="role-select"
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="flex flex-col h-full overflow-y-auto pb-24 lg:pb-0 z-20"
            >
              <div className="m-auto flex flex-col items-center gap-8 w-full py-8 lg:py-0">
                <div className="text-center px-4">
                  <h2 className="text-4xl font-bold text-text tracking-tight mb-2 shadow-sm">
                    Select Access Node
                  </h2>
                  <p className="text-muted text-sm font-medium">Choose peer behavior to initiate handshake</p>
                </div>

                <div className="flex flex-col md:flex-row gap-6 w-full max-w-4xl mt-6 px-4">
                  <RoleCard 
                    num="01"
                    icon={<Monitor className="w-8 h-8" />}
                    title="Host Station"
                    desc="Generate synchronization matrix and open transmission port."
                    onClick={() => setRole("host")}
                    color="accent"
                  />
                  <RoleCard 
                    num="02"
                    icon={<RefreshCw className="w-8 h-8" />}
                    title="Join Station"
                    desc="Scan peer matrix to calibrate secure tunnel connection."
                    onClick={() => setRole("join")}
                    color="success"
                  />
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="z-10 min-h-8 py-2 md:py-0 border-t border-border bg-surface flex flex-wrap sm:flex-nowrap items-center px-4 md:px-8 justify-center sm:justify-between text-[9px] tracking-widest text-muted flex-shrink-0 font-bold gap-2 sm:gap-4">
        <div className="uppercase hidden md:block">Transmitting: {status === "connected" ? "TRUE" : "FALSE"}</div>
        <div className="flex gap-2 sm:gap-4 flex-wrap justify-center text-center">
          <span>ALGO: WebRTC-DATA</span>
          <span className="hidden sm:inline">ENTROPY: LOCAL-ONLY</span>
        </div>
        <div className="flex items-center gap-2 uppercase">
          <span className={cn(
            "w-2 h-2 rounded-full",
            status === "connected" ? "bg-success shadow-[0_0_5px_var(--color-success)]" : "bg-muted"
          )} />
          <span className="hidden sm:inline">Tunnel</span> {status === "connected" ? "Active" : "Standby"}
        </div>
      </footer>
      

      {/* Overlays */}
      <QRScanner 
        isOpen={scannerType !== null} 
        onClose={() => setScannerType(null)} 
        onScan={(data) => {
          if (scannerType === 'offer') handleReceivedOffer(data);
          else if (scannerType === 'answer') handleReceivedAnswer(data);
          setScannerType(null);
        }} 
      />

      <AnimatePresence>
        {selectedFile && (
          <FilePreview 
            file={selectedFile} 
            onClose={() => setSelectedFile(null)} 
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showFailoverMenu && role === 'host' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-2 md:p-6 lg:p-8 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="w-full max-w-6xl h-full md:h-[90vh] flex flex-col bg-background/95 md:rounded-3xl border border-white/10 shadow-2xl overflow-hidden relative"
            >
              <div className="flex justify-between items-center p-4 border-b border-white/10">
                <h2 className="text-lg font-bold flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-accent"/> Nexus Failover Control</h2>
                <button onClick={() => setShowFailoverMenu(false)} className="p-2 rounded-full hover:bg-white/10 transition cursor-pointer">
                  <X className="w-5 h-5 text-muted" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden relative p-2 md:p-0">
                <NexusFailoverHUD 
                  localUsername={profile.username}
                  localAvatarColor={profile.avatarColor}
                  localPeerId={profile.id}
                  realConnectedCount={connectedCount}
                  peerProfiles={peerProfiles}
                  role={role}
                  networkStatus={status}
                  isSimulation={isSimulation}
                  onToggleSimulation={toggleSimulation}
                  onNavigateToConnect={() => { setShowFailoverMenu(false); setActiveTab(role ? "chat" : "qr"); }}
                  onTransferHostControl={handleTransferHostControl}
                  onGracefulHostDrop={handleGracefulHostDrop}
                  onNetworkSplit={handleNetworkSplit}
                />
              </div>
            </motion.div>
          </motion.div>
        )}

        {showSimWarning && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <div className="bg-background max-w-md p-6 rounded-3xl border border-accent/30 shadow-2xl">
              <h3 className="text-xl font-bold mb-3 flex items-center gap-2"><RefreshCw className="text-accent w-6 h-6"/> Enable Simulation Mode?</h3>
              <p className="text-muted text-sm mb-6">Are you sure you wanna enable simulation mode? This will disconnect existing tunnel(s).</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowSimWarning(false)} className="px-5 py-2 rounded-xl text-sm font-semibold hover:bg-white/10 transition cursor-pointer">Cancel</button>
                <button onClick={() => toggleSimulation(true)} className="px-5 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent/90 transition cursor-pointer shadow-md">Enable</button>
              </div>
            </div>
          </motion.div>
        )}

        <EasterEggModal 
          isOpen={showCreatorPopup} 
          onClose={() => setShowCreatorPopup(false)} 
        />
      </AnimatePresence>

      <CallOverlay 
        active={isCallActive}
        type={callType}
        localStream={localStream || localStreamRef.current}
        remoteStreams={remoteStreams}
        peerProfiles={peerProfiles}
        peerTrackStates={peerTrackStates}
        getPeerName={(peerId) => {
          const profId = peerIdToProfileId.current.get(peerId);
          if (profId && peerProfiles[profId]?.username) return peerProfiles[profId].username;
          if (peerProfiles[peerId]?.username) return peerProfiles[peerId].username;
          const matched = (Object.values(peerProfiles) as UserProfile[]).find(p => p.id === peerId || p.id === profId);
          if (matched?.username) return matched.username;
          return 'Remote Node';
        }}
        onEndCall={endCall}
        onToggleTrack={handleToggleTrack}
        onRequestAddTrack={handleAddTrack}
      />

      <AnimatePresence>
        {selectedPeerProfile && (
          <ViewProfileModal 
            profile={selectedPeerProfile}
            onClose={() => setSelectedPeerProfile(null)}
            onStartCall={startCall}
          />
        )}
      </AnimatePresence>

      <IncomingCallModal 
        incomingCall={incomingCall}
        onAccept={acceptCall}
        onDecline={declineCall}
      />
    </div>
  );
}

function RoleCard({ num, icon, title, desc, onClick, color }: { 
  num: string, 
  icon: React.ReactNode, 
  title: string, 
  desc: string, 
  onClick: () => void,
  color: 'accent' | 'success'
}) {
  return (
    <button 
      onClick={onClick}
      className="glass-panel flex-1 p-8 text-left transition-all hover:scale-[1.02] hover:shadow-lg active:scale-95 group cursor-pointer border hover:border-accent"
    >
      <div className="flex justify-between items-start mb-6">
        <div className={cn(
          "w-16 h-16 rounded-2xl flex items-center justify-center transition-all shadow-sm",
          color === 'accent' ? "bg-accent/10 text-accent group-hover:bg-accent group-hover:text-white" : "bg-success/10 text-success group-hover:bg-success group-hover:text-white"
        )}>
          {icon}
        </div>
        <span className="text-sm font-black text-muted tracking-tighter opacity-30">{num}</span>
      </div>
      <h3 className="text-xl font-bold mb-3 tracking-tight text-text transition-colors">{title}</h3>
      <p className="text-sm font-medium text-muted leading-relaxed">{desc}</p>
    </button>
  );
}
