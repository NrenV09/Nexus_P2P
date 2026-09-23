import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, 
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
  Network,
  Maximize2
} from 'lucide-react';

import { cn, formatBytes } from '../lib/utils';
import { 
  NodeRole, 
  ConnectionStatus, 
  ChatMessage, 
  FilePayload, 
  TransferProgress, 
  LogEntry,
  UserProfile
} from '../types';

import { SecureChatNode } from '../components/SecureChatNode';
import { FilePreview } from '../components/FilePreview';
import { NetworkBackground } from '../components/NetworkBackground';
import { DataStream } from '../components/DataStream';
import { PacketTransferAnimation } from '../components/PacketTransferAnimation';
import { ProfileModal } from '../components/ProfileModal';
import { ViewProfileModal } from '../components/ViewProfileModal';
import { NexusNetworkMap } from '../components/NexusNetworkMap';
import { generateRandomName } from '../lib/nameGenerator';
import { purgeAllTempStorage } from '../lib/diskStreamer';

const CHUNK_SIZE = 64000; // WebRTC safe chunk size (below 64KB SCTP limit for Firefox, Safari & iOS)
const MAX_BUFFERED_AMOUNT = 512 * 1024; // 512KB safe flow control threshold to prevent SCTP buffer overflows

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
  const [activeTab, setActiveTab] = useState<string>("p2p");
  const [role, setRole] = useState<NodeRole>(null);
  const [status, setStatus] = useState<ConnectionStatus>("offline");
  const [isTransferring, setIsTransferring] = useState(false);
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [files, setFiles] = useState<FilePayload[]>([]);
  const [transfer, setTransfer] = useState<TransferProgress | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  const [qrPayload, setQrPayload] = useState("");
  const [pasteBuffer, setPasteBuffer] = useState("");
  const [scannerType, setScannerType] = useState<'offer' | 'answer' | null>(null);
  const [selectedFile, setSelectedFile] = useState<FilePayload | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isSimulation, setIsSimulation] = useState(false);
  const [showNetworkMapModal, setShowNetworkMapModal] = useState(false);
  const [matrixTab, setMatrixTab] = useState<'standard' | 'network_map'>('standard');

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

  const localConnectionRef = useRef<RTCPeerConnection | null>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const dataChannels = useRef<Map<string, RTCDataChannel>>(new Map());
  const [peerProfiles, setPeerProfiles] = useState<Record<string, UserProfile>>({});
  const peerIdToProfileId = useRef<Map<string, string>>(new Map());
  const [connectedCount, setConnectedPeers] = useState(0);
  const fileBuffers = useRef<Map<string, any>>(new Map());
  const lastUpdateRef = useRef<number>(Date.now());

  const transferRef = useRef<TransferProgress | null>(null);
  useEffect(() => {
    transferRef.current = transfer;
  }, [transfer]);

  // Immediately removes partial or failed chunks from memory, OPFS, and storage cache
  const cleanupBuffersAndCache = useCallback(async (targetFileName?: string, targetPeerId?: string) => {
    if (targetPeerId && fileBuffers.current.has(targetPeerId)) {
      const buf = fileBuffers.current.get(targetPeerId);
      try {
        if (buf.writable && typeof buf.writable.abort === 'function') {
          try { await buf.writable.abort(); } catch (_) {}
        }
        if (buf.fileHandle && typeof buf.fileHandle.remove === 'function') {
          try { await buf.fileHandle.remove(); } catch (_) {}
        }
        if (Array.isArray(buf.chunks)) {
          buf.chunks.length = 0;
        }
        buf.isFinished = true;
      } catch (e) {
        console.warn("Failed to abort file buffer for peer:", e);
      }
      fileBuffers.current.delete(targetPeerId);
    } else {
      for (const [, buf] of fileBuffers.current.entries()) {
        try {
          if (buf.writable && typeof buf.writable.abort === 'function') {
            try { await buf.writable.abort(); } catch (_) {}
          }
          if (buf.fileHandle && typeof buf.fileHandle.remove === 'function') {
            try { await buf.fileHandle.remove(); } catch (_) {}
          }
          if (Array.isArray(buf.chunks)) {
            buf.chunks.length = 0;
          }
          buf.isFinished = true;
        } catch (e) {
          console.warn("Failed to abort file buffer:", e);
        }
      }
      fileBuffers.current.clear();
    }

    try {
      await purgeAllTempStorage(targetFileName);
    } catch (e) {
      console.warn("purgeAllTempStorage error:", e);
    }
  }, []);

  // Universal transfer failure handler: notifies remote peer, displays prominent error log, and cleans cache immediately
  const handleTransferFailure = useCallback(async (
    reason: string,
    peerId?: string,
    fileName?: string,
    notifyRemote = true
  ) => {
    const currentTransfer = transferRef.current;
    const targetFileName = fileName || currentTransfer?.name || 'File';
    const roleType = currentTransfer?.type || (peerId ? 'receiver' : 'sender');

    cancelTransferRef.current = true;
    setTransfer(null);

    if (notifyRemote) {
      const errorPayload = JSON.stringify({
        type: 'transfer-failed',
        fileName: targetFileName,
        reason,
        failedBy: roleType
      });

      if (peerId && dataChannels.current.has(peerId)) {
        const dc = dataChannels.current.get(peerId);
        if (dc && dc.readyState === 'open') {
          try { dc.send(errorPayload); } catch (_) {}
        }
      } else {
        dataChannels.current.forEach(dc => {
          if (dc.readyState === 'open') {
            try { dc.send(errorPayload); } catch (_) {}
          }
        });
      }
    }

    addLog(`Transfer failed for "${targetFileName}": ${reason}`, "err");
    await cleanupBuffersAndCache(targetFileName, peerId);
  }, [addLog, cleanupBuffersAndCache]);

  const handleCancelTransfer = useCallback(async () => {
    const currentTransfer = transferRef.current;
    const targetFileName = currentTransfer?.name || 'File';

    cancelTransferRef.current = true;
    setTransfer(null);

    const cancelMsg = JSON.stringify({
      type: 'transfer-failed',
      fileName: targetFileName,
      reason: 'Cancelled by user',
      failedBy: currentTransfer?.type || 'user'
    });

    dataChannels.current.forEach(dc => {
      if (dc.readyState === 'open') {
        try { dc.send(cancelMsg); } catch(e) {}
      }
    });

    addLog(`Transfer stopped / discarded for "${targetFileName}" - cached data cleared`, "err");
    await cleanupBuffersAndCache(targetFileName);
  }, [addLog, cleanupBuffersAndCache]);

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

  const toggleSimulation = useCallback(() => {
    if (isSimulation) {
      resetAll();
    } else {
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

    channel.onerror = (err) => {
      console.warn("RTCDataChannel transport error:", err);
      if (transferRef.current) {
        handleTransferFailure("WebRTC transport error", peerId, transferRef.current.name, false);
      }
    };

    channel.onclose = () => {
      if (transferRef.current) {
        handleTransferFailure("Peer connection lost during active transfer", peerId, transferRef.current.name, false);
      }
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
              id: (Math.random().toString(36).substring(2) + Date.now().toString(36)),
              text: data.text,
              audioData: data.audioData,
              sender: 'them',
              senderName: data.senderName,
              senderColor: data.senderColor,
              senderId: data.senderId,
              timestamp: new Date()
            }]);
            if (roleRef.current === 'host') {
              dataChannels.current.forEach((dc, otherId) => {
                if (otherId !== peerId && dc.readyState === 'open') {
                  dc.send(event.data);
                }
              });
            }
          } else if (data.type === 'file-meta') {
            const bufferRef: any = { 
              metadata: data, 
              receivedSize: 0, 
              chunks: [],
              fileHandle: null,
              writable: null,
              isWriting: false
            };
            
            if (navigator.storage && navigator.storage.getDirectory) {
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
            addLog(`Incoming payload: ${data.name}`, "info");
            if (roleRef.current === 'host') {
              dataChannels.current.forEach((dc, otherId) => {
                if (otherId !== peerId && dc.readyState === 'open') {
                  dc.send(event.data);
                }
              });
            }
          } else if (data.type === 'transfer-failed') {
            const failReason = data.reason || 'Remote peer encountered an error';
            const who = data.failedBy === 'sender' ? 'Sender' : data.failedBy === 'receiver' ? 'Receiver' : 'Peer';
            addLog(`Transfer failed for "${data.fileName || 'file'}": ${failReason} (${who})`, "err");
            cancelTransferRef.current = true;
            setTransfer(null);
            await cleanupBuffersAndCache(data.fileName, peerId);
          } else if (data.type === 'transfer-cancel') {
            addLog("Transfer cancelled by peer - temporary cache purged", "err");
            cancelTransferRef.current = true;
            setTransfer(null);
            await cleanupBuffersAndCache(undefined, peerId);
          }
        } catch (e) {
          console.error("Failed to parse message", e);
        }
      } else {
        const buffer = fileBuffers.current.get(peerId);
        if (buffer) {
          buffer.receivedSize += event.data.byteLength;
          buffer.chunks.push(event.data);

          if (buffer.writable && !buffer.isWriting) {
            buffer.isWriting = true;
            (async () => {
              try {
                while(buffer.chunks.length > 0) {
                  const chunk = buffer.chunks.shift();
                  await buffer.writable.write(chunk);
                }
                
                if (buffer.receivedSize >= buffer.metadata.size && buffer.chunks.length === 0) {
                  await buffer.writable.close();
                  const blob = await buffer.fileHandle.getFile();
                  finishFileReceive(buffer, blob);
                }
              } catch (writeErr: any) {
                await handleTransferFailure(`Storage write failed: ${writeErr?.message || writeErr}`, peerId, buffer.metadata?.name, true);
              } finally {
                buffer.isWriting = false;
              }
            })();
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
                try {
                  dc.send(event.data);
                } catch (_) {}
              }
            });
          }

          if (!buffer.writable && buffer.receivedSize >= buffer.metadata.size && !buffer.isFinished) {
            buffer.isFinished = true;
            try {
              triggerTransferAnimation();
              const blob = new Blob(buffer.chunks, { type: buffer.metadata.mimeType });
              buffer.chunks = [];
              finishFileReceive(buffer, blob);
            } catch (blobErr: any) {
              await handleTransferFailure(`Payload assembly failed: ${blobErr?.message || blobErr}`, peerId, buffer.metadata?.name, true);
            }
          }
        }
      }
    };

    const finishFileReceive = (buffer: any, blob: Blob) => {
      const name = buffer.metadata.name;
      const size = buffer.metadata.size;
      const senderName = buffer.metadata.senderName || "Unknown Node";
      const senderColor = buffer.metadata.senderColor || "bg-muted";
      const senderId = buffer.metadata.senderId;
      
      setFiles(prev => [{
        id: (Math.random().toString(36).substring(2) + Date.now().toString(36)),
        name,
        blob,
        size,
        senderName,
        senderColor,
        senderId,
        timestamp: new Date(),
        direction: 'in'
      }, ...prev]);
      
      setMessages(prev => [...prev, {
        id: (Math.random().toString(36).substring(2) + Date.now().toString(36)),
        text: `📁 Received: ${name}`,
        sender: 'system',
        timestamp: new Date()
      }]);
      
      setTransfer(null);
      fileBuffers.current.delete(peerId);
      addLog(`Payload received: ${name}`, "ok");

      if (autoDownloadRef.current) {
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
    const pc = new RTCPeerConnection({ iceServers: [] });
    peerConnections.current.set(id, pc);
    
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
        pc.close();
        if (transferRef.current) {
          handleTransferFailure("WebRTC peer connection lost", id, transferRef.current.name, false);
        }
      }
    };

    pc.ondatachannel = (event) => setupDataChannel(event.channel, id);
    localConnectionRef.current = pc;
    return pc;
  }, [setupDataChannel]);

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

  const sendMessage = (text: string, audioData?: string) => {
    if ((!text && !audioData) || dataChannels.current.size === 0) return;
    
    const msg = JSON.stringify({ 
      type: 'chat', 
      text,
      audioData,
      senderName: profile.username,
      senderColor: profile.avatarColor,
      senderId: profile.id
    });
    
    dataChannels.current.forEach(dc => {
      if (dc.readyState === 'open') dc.send(msg);
    });
    
    setMessages(prev => [...prev, {
      id: (Math.random().toString(36).substring(2) + Date.now().toString(36)),
      text,
      audioData,
      sender: 'me',
      senderName: profile.username,
      senderColor: profile.avatarColor,
      senderId: profile.id,
      timestamp: new Date()
    }]);
  };

  const sendFile = async (file: File, targetPeerId?: string) => {
    if (dataChannels.current.size === 0 && !isSimulation) return;
    const targetPeerName = targetPeerId ? (peerProfiles[targetPeerId]?.username || 'peer') : undefined;
    addLog(`Initiating transfer: ${file.name}${targetPeerName ? ` to ${targetPeerName}` : ''}`, "info");
    
    const meta = JSON.stringify({
      type: 'file-meta',
      name: file.name,
      size: file.size,
      mimeType: file.type,
      senderName: profile.username,
      senderColor: profile.avatarColor,
      senderId: profile.id,
      targetPeerId
    });

    if (targetPeerId) {
      const targetDc = dataChannels.current.get(targetPeerId);
      if (targetDc && targetDc.readyState === 'open') {
        targetDc.send(meta);
      }
    } else {
      dataChannels.current.forEach(dc => {
        if (dc.readyState === 'open') dc.send(meta);
      });
    }

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
    let lastActiveChunkTime = Date.now();

    const startStreaming = () => {
      const sendNextChunk = async () => {
        if (cancelTransferRef.current) {
          addLog(`Transfer aborted for ${file.name}`, "info");
          setTransfer(null);
          await cleanupBuffersAndCache(file.name);
          return;
        }

        if (offset >= file.size) {
          triggerTransferAnimation();
          addLog(`Sent payload: ${file.name}`, "ok");
          setTimeout(() => setTransfer(null), 1000);
          return;
        }

        let openCount = 0;
        let maxBuffer = 0;
        dataChannels.current.forEach(dc => {
          if (dc.readyState === 'open') {
            openCount++;
            if (typeof dc.bufferedAmount === 'number') {
              maxBuffer = Math.max(maxBuffer, dc.bufferedAmount);
            }
          }
        });

        if (openCount === 0 && !isSimulation) {
          await handleTransferFailure("All peer connections disconnected during transfer", undefined, file.name, false);
          return;
        }

        if (maxBuffer > MAX_BUFFERED_AMOUNT) {
          if (Date.now() - lastActiveChunkTime > 15000) {
            await handleTransferFailure("Network stalled: peer buffer did not drain for >15s", undefined, file.name, true);
            return;
          }
          setTimeout(sendNextChunk, 25);
          return;
        }

        const nextChunkEnd = Math.min(offset + CHUNK_SIZE, file.size);
        const slice = file.slice(offset, nextChunkEnd);

        try {
          const chunkData = await slice.arrayBuffer();
          if (cancelTransferRef.current) {
            await cleanupBuffersAndCache(file.name);
            return;
          }

          let anySent = false;
          dataChannels.current.forEach(dc => {
            if (dc.readyState === 'open') {
              try {
                dc.send(chunkData);
                anySent = true;
              } catch (sendErr) {
                console.warn("RTCDataChannel send chunk error:", sendErr);
              }
            }
          });

          if (anySent) {
            offset += chunkData.byteLength;
            lastActiveChunkTime = Date.now();
            const now = Date.now();
            if (now - lastUpdateRef.current > 150 || offset >= file.size) {
              const progress = Math.round((offset / file.size) * 100);
              setTransfer(prev => prev ? { ...prev, progress, transferredBytes: offset } : null);
              lastUpdateRef.current = now;
            }
          }

          if (offset < file.size) {
            if (maxBuffer > MAX_BUFFERED_AMOUNT / 2) {
              setTimeout(sendNextChunk, 10);
            } else {
              setTimeout(sendNextChunk, 0);
            }
          } else {
            triggerTransferAnimation();
            addLog(`Sent payload: ${file.name}`, "ok");
            setTimeout(() => setTransfer(null), 1000);
          }
        } catch (sliceErr: any) {
          await handleTransferFailure(`File read error during transfer: ${sliceErr?.message || sliceErr}`, undefined, file.name, true);
        }
      };

      sendNextChunk();
    };

    startStreaming();
  };

  const fileQueueRef = useRef<File[]>([]);
  const isProcessingQueueRef = useRef(false);

  const processFileQueue = async () => {
    if (isProcessingQueueRef.current || fileQueueRef.current.length === 0) return;
    isProcessingQueueRef.current = true;
    try {
      while (fileQueueRef.current.length > 0) {
        const nextFile = fileQueueRef.current.shift();
        if (nextFile) {
          await sendFile(nextFile);
        }
      }
    } finally {
      isProcessingQueueRef.current = false;
    }
  };

  const handleFilesSelected = (files: File[]) => {
    fileQueueRef.current.push(...files);
    processFileQueue();
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
            id="transfer-simulation-toggle-btn"
            onClick={toggleSimulation}
            className={cn(
               "w-8 h-8 md:w-9 md:h-9 lg:w-10 lg:h-10 border rounded-xl lg:rounded-2xl flex items-center justify-center font-medium text-xl shadow-sm flex-shrink-0 transition-colors cursor-pointer",
               isSimulation ? "bg-accent text-white border-accent" : "bg-accent/10 border-accent/20 text-accent hover:bg-accent/20"
            )}
            title={isSimulation ? "Simulation Active (Click to Disable)" : "Simulation Mode (Click to Enable)"}
            aria-label="Toggle simulation mode"
          >
            <RefreshCw className={cn("w-4 h-4 lg:w-5 lg:h-5", isSimulation && "animate-spin")} />
          </button>
          <div className="min-w-0">
            <h1 className="text-sm md:text-base lg:text-lg font-semibold tracking-tight text-text whitespace-nowrap">
              <span className="hidden sm:inline">Quantum Link</span>
              <span className="sm:hidden">Q-Link</span>
              <span className="text-[10px] lg:text-xs text-muted font-normal ml-1 lg:ml-2">v7.8.4</span>
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
              onClick={() => setActiveTab("chat")}
              className={cn(
                "nav-tab px-3 md:px-3 lg:px-4 py-1.5 text-[10px] md:text-xs font-medium transition-all rounded-xl whitespace-nowrap",
                activeTab === "chat" ? "bg-white dark:bg-transparent text-text shadow-sm" : "text-muted hover:text-text cursor-pointer"
              )}
            >
              Secure Chat
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
      <main className="z-10 flex-1 p-6 overflow-hidden">
        <AnimatePresence mode="wait">
          {activeTab === "chat" ? (
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
              />
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
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-text">Connection Matrix</h3>
                      <div className="inline-flex p-0.5 rounded-xl bg-black/5 dark:bg-white/5 border border-white/10 text-xs">
                        <button
                          onClick={() => setMatrixTab('standard')}
                          className={cn(
                            "px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer",
                            matrixTab === 'standard' ? "bg-accent text-white shadow-sm" : "text-muted hover:text-text"
                          )}
                        >
                          Port Setup
                        </button>
                        <button
                          onClick={() => setMatrixTab('network_map')}
                          className={cn(
                            "px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5",
                            matrixTab === 'network_map' ? "bg-accent text-white shadow-sm" : "text-accent hover:bg-accent/10"
                          )}
                        >
                          <Network className="w-3.5 h-3.5" />
                          <span>Nexus Network Map ➔</span>
                        </button>
                      </div>
                    </div>
                    {matrixTab === 'network_map' && (
                      <button
                        onClick={() => setShowNetworkMapModal(true)}
                        className="p-1.5 rounded-lg bg-accent/15 hover:bg-accent/25 text-accent transition-colors cursor-pointer"
                        title="Maximize Nexus Network Map to Fullscreen"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
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

                {matrixTab === 'network_map' ? (
                  <div className="flex-1 flex flex-col relative overflow-hidden lg:min-h-0 min-h-[580px] rounded-3xl shadow-xl">
                    <NexusNetworkMap 
                      localProfile={profile}
                      role={role}
                      peerProfiles={peerProfiles}
                      connectedCount={connectedCount}
                      dataChannels={dataChannels.current}
                      activeTransfer={transfer}
                      messages={messages}
                      logs={logs}
                      onSendFileToPeer={sendFile}
                      onSendMessage={(text) => sendMessage(text)}
                      onAddReceivedFile={(file) => {
                        setFiles(prev => [{
                          id: Math.random().toString(36).substring(2) + Date.now().toString(36),
                          name: file.name,
                          size: file.size,
                          mimeType: file.type || 'application/octet-stream',
                          senderName: 'Network Peer',
                          senderColor: 'bg-accent',
                          timestamp: Date.now(),
                          status: 'completed',
                          isOutgoing: false,
                          blob: file
                        }, ...prev]);
                      }}
                      isModal={false}
                    />
                  </div>
                ) : (
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
                )}
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
                      <div className="flex justify-end mb-2">
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
                      <div 
                        onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
                        onDragLeave={() => setIsDraggingOver(false)}
                        onDrop={(e) => { e.preventDefault(); setIsDraggingOver(false); if (e.dataTransfer.files) handleFilesSelected(Array.from(e.dataTransfer.files)); }}
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
                          onChange={(e) => { if (e.target.files) handleFilesSelected(Array.from(e.target.files)); }}
                        />
                        <div className="text-3xl mb-2 transition-transform group-hover:-translate-y-1">
                          <Send className="w-8 h-8 opacity-80" />
                        </div>
                        <div className="text-sm font-semibold mb-1">
                          {isDraggingOver ? "Drop to Send" : "Click or Drag Files Here"}
                        </div>
                        <div className="text-xs opacity-70">Direct high-speed P2P stream</div>
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
                    <div className="p-4 border-b border-white/30 dark:border-transparent dark:border-white/10 dark:border-transparent bg-white/20 dark:bg-transparent backdrop-blur-md sticky top-0 z-10 flex-shrink-0 rounded-t-3xl">
                      <span className="text-sm font-semibold text-text">Activity Log</span>
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
      

      <AnimatePresence>
        {selectedFile && (
          <FilePreview 
            file={selectedFile} 
            onClose={() => setSelectedFile(null)} 
          />
        )}

        {showNetworkMapModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-2 md:p-6 lg:p-8 bg-black/75 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="w-full max-w-5xl h-full md:h-[90vh] flex flex-col bg-slate-950 rounded-3xl border border-white/10 shadow-2xl overflow-hidden relative"
            >
              <NexusNetworkMap 
                localProfile={profile}
                role={role}
                peerProfiles={peerProfiles}
                connectedCount={connectedCount}
                dataChannels={dataChannels.current}
                activeTransfer={transfer}
                messages={messages}
                logs={logs}
                onSendFileToPeer={sendFile}
                onSendMessage={(text) => sendMessage(text)}
                onAddReceivedFile={(file) => {
                  setFiles(prev => [{
                    id: Math.random().toString(36).substring(2) + Date.now().toString(36),
                    name: file.name,
                    size: file.size,
                    mimeType: file.type || 'application/octet-stream',
                    senderName: 'Network Peer',
                    senderColor: 'bg-accent',
                    timestamp: Date.now(),
                    status: 'completed',
                    isOutgoing: false,
                    blob: file
                  }, ...prev]);
                }}
                onClose={() => setShowNetworkMapModal(false)}
                isModal={true}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
