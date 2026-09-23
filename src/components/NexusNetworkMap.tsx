import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  Network, 
  ArrowRight, 
  Upload, 
  Share2, 
  PhoneCall, 
  PhoneOff,
  Video,
  CheckCircle2, 
  Zap, 
  Users, 
  Crown, 
  Radio, 
  X, 
  Maximize2, 
  Minimize2,
  Send,
  MessageSquare,
  Shield,
  Laptop,
  Tablet,
  Smartphone,
  Activity,
  Download,
  Clock,
  Sparkles,
  Volume2,
  VolumeX,
  RefreshCw,
  FolderOpen
} from 'lucide-react';
import { cn, formatBytes } from '../lib/utils';
import { UserProfile, TransferProgress } from '../types';

export interface NexusNetworkMapProps {
  localProfile: UserProfile;
  role?: 'host' | 'join' | null;
  peerProfiles?: Record<string, UserProfile>;
  connectedCount?: number;
  dataChannels?: Map<string, RTCDataChannel>;
  activeTransfer?: TransferProgress | null;
  isCallActive?: boolean;
  callType?: 'audio' | 'video' | null;
  messages?: any[];
  logs?: any[];
  onSendFileToPeer?: (file: File, peerId?: string) => void;
  onStartCall?: (type: 'audio' | 'video') => void;
  onEndCall?: () => void;
  onSendMessage?: (text: string) => void;
  onAddReceivedFile?: (file: File) => void;
  onClose?: () => void;
  isModal?: boolean;
}

export interface MapNode {
  id: string;
  name: string;
  roleText: string;
  isHost: boolean;
  isSelf: boolean;
  avatarColor: string;
  deviceType: 'host' | 'peer';
  x: number; // percentage (0 - 100)
  y: number; // percentage (0 - 100)
  status: 'connected' | 'idle' | 'busy';
  pingMs: number;
}

interface ActiveInMapTransfer {
  id: string;
  fileName: string;
  fileSize: number;
  fromNodeId: string;
  toNodeId: string;
  progress: number;
  speed: string;
  isBypass: boolean;
}

export function NexusNetworkMap({
  localProfile,
  role = null,
  peerProfiles = {},
  connectedCount = 0,
  dataChannels,
  activeTransfer = null,
  isCallActive = false,
  callType = null,
  messages = [],
  logs = [],
  onSendFileToPeer,
  onStartCall,
  onEndCall,
  onSendMessage,
  onAddReceivedFile,
  onClose,
  isModal = false,
}: NexusNetworkMapProps) {
  // Use simulated demo if 0 real peers, but allow user to toggle anytime
  const [useSimulatedDemo, setUseSimulatedDemo] = useState<boolean>(connectedCount < 1);
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<MapNode | null>(null);
  
  // Tab for bottom panel
  const [activeBottomTab, setActiveBottomTab] = useState<'messages' | 'connections' | 'calls'>('messages');
  const [inputMessage, setInputMessage] = useState('');
  
  // Simulated or direct bypass state
  const [simulatingBypass, setSimulatingBypass] = useState<boolean>(false);
  const [inMapTransfer, setInMapTransfer] = useState<ActiveInMapTransfer | null>(null);
  
  // Private call simulation (or synchronized with real call)
  const [simCallActive, setSimCallActive] = useState<boolean>(false);
  const [simCallDuration, setSimCallDuration] = useState<number>(0);
  const [simCallPeers, setSimCallPeers] = useState<{ p1: string; p2: string }>({ p1: 'Device A', p2: 'Device B' });

  // Event feed for the bottom bar (matching sketch)
  const [networkEvents, setNetworkEvents] = useState<Array<{ id: string; text: string; type: 'info' | 'ok' | 'bypass' | 'call' | 'msg'; time: string; sender?: string }>>([
    { id: '1', text: "Nexus mesh cluster online. Handshake port active.", type: 'ok', time: '10:00:01' },
    { id: '2', text: "Device A (Host) authority designated as Primary Relay.", type: 'info', time: '10:00:05' },
    { id: '3', text: "Direct P2P SCTP Bypass channel ready between outer peers.", type: 'bypass', time: '10:00:12' }
  ]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bypassFileInputRef = useRef<HTMLInputElement | null>(null);
  const targetPeerForFileInput = useRef<string | null>(null);

  // Sync real calls
  useEffect(() => {
    if (isCallActive) {
      setSimCallActive(true);
      setSimCallPeers({ p1: localProfile.username || 'Device A', p2: 'Connected Peer' });
    }
  }, [isCallActive, localProfile.username]);

  // Call timer effect
  useEffect(() => {
    let interval: any = null;
    if (simCallActive || isCallActive) {
      interval = setInterval(() => {
        setSimCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      setSimCallDuration(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [simCallActive, isCallActive]);

  // Construct Nodes faithfully matching reference sketch IMG_4474.png
  const nodes: MapNode[] = useMemo(() => {
    const realPeers = Object.values(peerProfiles);

    if (useSimulatedDemo || realPeers.length === 0) {
      // Exact representation from reference sketch IMG_4474.png:
      // Device A in center (Host), Device C (top-left), Device B (top-right), Device D (bottom-left), Device E (bottom-right)
      return [
        {
          id: 'node-host-a',
          name: localProfile.username ? `${localProfile.username} (You)` : 'Device A',
          roleText: '(Host)',
          isHost: true,
          isSelf: true,
          avatarColor: localProfile.avatarColor || 'bg-accent',
          deviceType: 'host',
          x: 50,
          y: 50,
          status: 'connected',
          pingMs: 2
        },
        {
          id: 'node-peer-c',
          name: 'Device C',
          roleText: '(peer)',
          isHost: false,
          isSelf: false,
          avatarColor: 'bg-emerald-600',
          deviceType: 'peer',
          x: 20,
          y: 22,
          status: 'connected',
          pingMs: 14
        },
        {
          id: 'node-peer-b',
          name: 'Device B',
          roleText: '(peer)',
          isHost: false,
          isSelf: false,
          avatarColor: 'bg-blue-600',
          deviceType: 'peer',
          x: 80,
          y: 22,
          status: 'connected',
          pingMs: 19
        },
        {
          id: 'node-peer-d',
          name: 'Device D',
          roleText: '(peer)',
          isHost: false,
          isSelf: false,
          avatarColor: 'bg-amber-600',
          deviceType: 'peer',
          x: 20,
          y: 78,
          status: 'connected',
          pingMs: 28
        },
        {
          id: 'node-peer-e',
          name: 'Device E',
          roleText: '(peer)',
          isHost: false,
          isSelf: false,
          avatarColor: 'bg-purple-600',
          deviceType: 'peer',
          x: 80,
          y: 78,
          status: 'connected',
          pingMs: 12
        }
      ];
    }

    // Dynamic nodes based on real live peer connections
    const list: MapNode[] = [];
    const isLocalHost = role === 'host';

    // Center Node (Host)
    list.push({
      id: isLocalHost ? 'self' : (realPeers[0]?.id || 'host-node'),
      name: isLocalHost ? `${localProfile.username} (You)` : (realPeers[0]?.username || 'Host Node'),
      roleText: '(Host)',
      isHost: true,
      isSelf: isLocalHost,
      avatarColor: isLocalHost ? localProfile.avatarColor : (realPeers[0]?.avatarColor || 'bg-accent'),
      deviceType: 'host',
      x: 50,
      y: 50,
      status: 'connected',
      pingMs: 4
    });

    // Outer peers distributed radially around center
    const remainingPeers = isLocalHost ? realPeers : [
      { id: 'self', username: `${localProfile.username} (You)`, avatarColor: localProfile.avatarColor },
      ...realPeers.slice(1)
    ];

    const radialPositions = [
      { x: 20, y: 22 }, // Top-Left (Device C position)
      { x: 80, y: 22 }, // Top-Right (Device B position)
      { x: 20, y: 78 }, // Bottom-Left (Device D position)
      { x: 80, y: 78 }, // Bottom-Right (Device E position)
      { x: 50, y: 16 }, // Top center
      { x: 50, y: 84 }  // Bottom center
    ];

    remainingPeers.forEach((p, idx) => {
      const pos = radialPositions[idx % radialPositions.length];
      list.push({
        id: p.id,
        name: p.username,
        roleText: '(peer)',
        isHost: false,
        isSelf: p.id === 'self',
        avatarColor: p.avatarColor || 'bg-blue-600',
        deviceType: 'peer',
        x: pos.x,
        y: pos.y,
        status: 'connected',
        pingMs: 12 + (idx * 5)
      });
    });

    return list;
  }, [useSimulatedDemo, peerProfiles, localProfile, role, connectedCount]);

  const hostNode = nodes.find(n => n.isHost) || nodes[0];
  const peerNodes = nodes.filter(n => !n.isHost);
  const nodeB = nodes.find(n => n.name.includes('Device B')) || peerNodes[0] || hostNode;
  const nodeE = nodes.find(n => n.name.includes('Device E')) || peerNodes[peerNodes.length - 1] || hostNode;

  // Real or simulated send file handler
  const executeSendFile = (file: File, targetNode: MapNode, isBypass = false) => {
    const fromNode = isBypass ? (nodeE || hostNode) : hostNode;
    const now = new Date().toLocaleTimeString();

    // Broadcast event
    setNetworkEvents(prev => [
      {
        id: Math.random().toString(),
        text: `[Transfer Started] "${file.name}" (${(file.size / 1024 / 1024).toFixed(2)} MB) ➔ ${targetNode.name}${isBypass ? ' (Direct Bypass)' : ''}`,
        type: 'bypass',
        time: now
      },
      ...prev.slice(0, 20)
    ]);

    // Active in-map transfer animation
    setInMapTransfer({
      id: Math.random().toString(),
      fileName: file.name,
      fileSize: file.size,
      fromNodeId: fromNode.id,
      toNodeId: targetNode.id,
      progress: 0,
      speed: '24.8 MB/s',
      isBypass
    });

    if (isBypass) {
      setSimulatingBypass(true);
    }

    // Call real parent handler if available
    if (onSendFileToPeer) {
      onSendFileToPeer(file, targetNode.id === 'self' ? undefined : targetNode.id);
    }

    // Simulate animated progress along the spoke/bypass line
    let p = 0;
    const interval = setInterval(() => {
      p += 15;
      if (p >= 100) {
        p = 100;
        clearInterval(interval);
        setTimeout(() => {
          setInMapTransfer(null);
          setSimulatingBypass(false);
          const endNow = new Date().toLocaleTimeString();
          setNetworkEvents(prev => [
            {
              id: Math.random().toString(),
              text: `[Transfer Complete] "${file.name}" successfully delivered to ${targetNode.name}!`,
              type: 'ok',
              time: endNow
            },
            ...prev.slice(0, 20)
          ]);
          // Add to received files list if user wanted to save it
          if (onAddReceivedFile) {
            onAddReceivedFile(file);
          }
        }, 600);
      } else {
        setInMapTransfer(prev => prev ? { ...prev, progress: p } : null);
      }
    }, 250);
  };

  // Drag & Drop
  const handleDragOver = (e: React.DragEvent, nodeId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverNodeId(nodeId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverNodeId(null);
  };

  const handleDrop = (e: React.DragEvent, targetNode: MapNode) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverNodeId(null);

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      const file = droppedFiles[0];
      executeSendFile(file, targetNode, false);
    }
  };

  // Node Click - Open Action Sheet
  const handleNodeClick = (node: MapNode) => {
    setSelectedNode(node);
  };

  // File Picker for selected node
  const handleTriggerFileSelect = () => {
    if (fileInputRef.current && selectedNode) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && selectedNode) {
      const file = files[0];
      executeSendFile(file, selectedNode, false);
    }
  };

  // Bypass File Input
  const handleBypassFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && nodeB) {
      const file = files[0];
      executeSendFile(file, nodeB, true);
    }
  };

  // Trigger Direct Bypass Transfer (E ➔ B)
  const triggerBypassTransfer = () => {
    if (bypassFileInputRef.current) {
      bypassFileInputRef.current.value = '';
      bypassFileInputRef.current.click();
    } else {
      // Generate sample package
      const blob = new Blob(["Direct P2P encrypted payload bypassing host channel"], { type: "text/plain" });
      const sampleFile = new File([blob], "Nexus_Direct_Payload_E_to_B.bin", { type: "application/octet-stream" });
      if (nodeB) {
        executeSendFile(sampleFile, nodeB, true);
      }
    }
  };

  // Call Initiation
  const handleStartCall = (type: 'audio' | 'video') => {
    if (onStartCall) {
      onStartCall(type);
    }
    setSimCallActive(true);
    setSimCallPeers({
      p1: localProfile.username || 'Device A',
      p2: selectedNode ? selectedNode.name : 'Device B'
    });
    const now = new Date().toLocaleTimeString();
    setNetworkEvents(prev => [
      {
        id: Math.random().toString(),
        text: `[Private Call Active] ${type.toUpperCase()} call established between ${localProfile.username || 'Device A'} ⇄ ${selectedNode ? selectedNode.name : 'Device B'}`,
        type: 'call',
        time: now
      },
      ...prev.slice(0, 20)
    ]);
    setActiveBottomTab('calls');
  };

  const handleEndCall = () => {
    if (onEndCall) {
      onEndCall();
    }
    setSimCallActive(false);
    const now = new Date().toLocaleTimeString();
    setNetworkEvents(prev => [
      {
        id: Math.random().toString(),
        text: `[Call Session Closed] Call concluded between ${simCallPeers.p1} and ${simCallPeers.p2}`,
        type: 'info',
        time: now
      },
      ...prev.slice(0, 20)
    ]);
  };

  // Message Sending
  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputMessage.trim()) return;

    const text = inputMessage.trim();
    setInputMessage('');

    if (onSendMessage) {
      onSendMessage(text);
    }

    const now = new Date().toLocaleTimeString();
    setNetworkEvents(prev => [
      {
        id: Math.random().toString(),
        text: `[Message] ${localProfile.username || 'Device A'}: "${text}"`,
        type: 'msg',
        time: now,
        sender: localProfile.username || 'Device A'
      },
      ...prev.slice(0, 20)
    ]);
  };

  // Format call duration
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Real messages combined with network events
  const combinedFeed = useMemo(() => {
    const list = [...networkEvents];
    messages.slice(-8).forEach((m, idx) => {
      list.push({
        id: `real-${idx}`,
        text: `[Message] ${m.senderName || 'Peer'}: "${m.text || 'Voice memo'}"`,
        type: 'msg',
        time: m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : 'Now',
        sender: m.senderName
      });
    });
    return list.slice(0, 15);
  }, [networkEvents, messages]);

  return (
    <div className={cn(
      "flex flex-col bg-slate-950 text-white rounded-3xl border border-white/10 shadow-2xl overflow-hidden backdrop-blur-3xl select-none relative",
      isModal ? "w-full max-w-5xl max-h-[92vh] h-[820px]" : "w-full h-full min-h-[560px]"
    )}>
      {/* Hidden File Inputs */}
      <input 
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileInputChange}
      />
      <input 
        ref={bypassFileInputRef}
        type="file"
        className="hidden"
        onChange={handleBypassFileInputChange}
      />

      {/* Top Header - Matches Reference Sketch IMG_4474.png Title */}
      <div className="px-5 py-3.5 border-b border-white/10 bg-white/5 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-accent/20 border border-accent/40 flex items-center justify-center text-accent shadow-sm">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base md:text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
                <span>Nexus Network Map</span>
                <ArrowRight className="w-4 h-4 text-accent animate-pulse" />
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-accent/20 text-accent border border-accent/30">
                {nodes.length} Nodes Online
              </span>
            </div>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Drag and drop to send files to individual peers
            </p>
          </div>
        </div>

        {/* Action Controls & Cluster Mode Switcher */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={triggerBypassTransfer}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
            title="Directly send file from Device E to Device B, bypassing the host"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Direct Bypass (E ➔ B)</span>
          </button>

          <button
            onClick={() => setUseSimulatedDemo(prev => !prev)}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5",
              useSimulatedDemo 
                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-sm" 
                : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
            )}
            title="Toggle between 5-Node Sketch Topology and Live Connected Peers"
          >
            <Users className="w-3.5 h-3.5" />
            <span>{useSimulatedDemo ? "5-Node Sketch Topology" : "Live Peer Mode"}</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Close Network Map"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Interactive Network Topology Canvas */}
      <div className="relative flex-1 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 overflow-hidden flex items-center justify-center p-4 min-h-[300px]">
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(#38bdf812_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none opacity-80" />

        {/* Top Floating Helper Banner */}
        <div className="absolute top-3 left-4 z-10 hidden sm:flex items-center gap-2 bg-slate-900/90 border border-white/10 rounded-full px-3 py-1 text-xs text-slate-400 backdrop-blur-md">
          <Upload className="w-3.5 h-3.5 text-accent" />
          <span>Drop file directly onto any circle to transmit P2P</span>
        </div>

        {/* SVG Mesh Connections */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
          <defs>
            <marker 
              id="bypassArrow" 
              viewBox="0 0 10 10" 
              refX="6" 
              refY="5" 
              markerWidth="6" 
              markerHeight="6" 
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
            </marker>
          </defs>

          {/* 1. Solid Spoke Lines from Host (Device A) to each Peer */}
          {peerNodes.map(peer => (
            <g key={`spoke-${peer.id}`}>
              <line
                x1={`${hostNode.x}%`}
                y1={`${hostNode.y}%`}
                x2={`${peer.x}%`}
                y2={`${peer.y}%`}
                stroke="rgba(255, 255, 255, 0.4)"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              {/* Animated packet beacon */}
              <circle r="3" fill="#38bdf8" className="animate-pulse">
                <animate
                  attributeName="cx"
                  from={`${hostNode.x}%`}
                  to={`${peer.x}%`}
                  dur="2.5s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="cy"
                  from={`${hostNode.y}%`}
                  to={`${peer.y}%`}
                  dur="2.5s"
                  repeatCount="indefinite"
                />
              </circle>
            </g>
          ))}

          {/* 2. Dashed Direct Bypass Line (Device E ➔ Device B) */}
          {nodeE && nodeB && (
            <g className={cn("transition-all duration-300", (simulatingBypass || (inMapTransfer && inMapTransfer.isBypass)) ? "opacity-100" : "opacity-85")}>
              <line
                x1={`${nodeE.x}%`}
                y1={`${nodeE.y - 5}%`}
                x2={`${nodeB.x}%`}
                y2={`${nodeB.y + 5}%`}
                stroke="#38bdf8"
                strokeWidth={simulatingBypass ? "3.5" : "2.5"}
                strokeDasharray="6 6"
                markerEnd="url(#bypassArrow)"
                className={simulatingBypass ? "animate-[dash_1s_linear_infinite]" : ""}
              />
            </g>
          )}

          {/* 3. Real Active Call Glow Stream */}
          {(simCallActive || isCallActive) && nodeB && (
            <line
              x1={`${hostNode.x}%`}
              y1={`${hostNode.y}%`}
              x2={`${nodeB.x}%`}
              y2={`${nodeB.y}%`}
              stroke="#22c55e"
              strokeWidth="4"
              strokeLinecap="round"
              className="animate-pulse opacity-90 shadow-lg"
            />
          )}
        </svg>

        {/* Dashed Bypass Line Annotation (Reference Sketch IMG_4474.png text) */}
        {nodeE && nodeB && (
          <div 
            onClick={triggerBypassTransfer}
            className="absolute z-10 cursor-pointer bg-slate-900/90 hover:bg-slate-800 border border-accent/40 hover:border-accent rounded-xl p-2.5 max-w-[210px] text-left shadow-xl backdrop-blur-md transition-all hover:scale-105 active:scale-95 group"
            style={{
              left: `calc(${nodeE.x}% - 40px)`,
              top: `calc(50% - 30px)`,
              transform: 'translate(-50%, -50%)'
            }}
            title="Click to transfer file directly between Device E and B (Bypassing Host)"
          >
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-accent">
              <Zap className="w-3.5 h-3.5 flex-shrink-0 animate-bounce" />
              <span>(When transferring files from E to B directly.)</span>
            </div>
            <div className="text-[10px] text-slate-300 font-mono mt-0.5 font-semibold flex items-center justify-between">
              <span>(Bypassing Host)</span>
              <span className="text-[9px] text-accent underline opacity-0 group-hover:opacity-100 transition-opacity">Click to send ➔</span>
            </div>
          </div>
        )}

        {/* In-Flight Transfer Floating Progress Indicator */}
        {inMapTransfer && (
          <div className="absolute top-3 right-4 z-20 bg-slate-900/95 border border-accent/60 rounded-2xl p-3 shadow-2xl backdrop-blur-xl w-64 animate-in fade-in slide-in-from-top duration-200">
            <div className="flex items-center justify-between text-xs font-bold mb-1">
              <span className="text-white truncate max-w-[140px]">{inMapTransfer.fileName}</span>
              <span className="text-accent font-mono">{inMapTransfer.progress}%</span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden mb-1.5">
              <div 
                className="bg-accent h-full transition-all duration-200" 
                style={{ width: `${inMapTransfer.progress}%` }} 
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
              <span>{inMapTransfer.isBypass ? "Direct Bypass SCTP" : "Encrypted P2P"}</span>
              <span className="text-emerald-400 font-semibold">{inMapTransfer.speed}</span>
            </div>
          </div>
        )}

        {/* Render Interactive Nodes */}
        {nodes.map(node => {
          const isDragTarget = dragOverNodeId === node.id;
          const isNodeInCall = (simCallActive || isCallActive) && (node.isHost || node.name.includes('Device B'));
          const isNodeInBypass = (simulatingBypass) && (node.name.includes('Device E') || node.name.includes('Device B'));
          const isSelected = selectedNode?.id === node.id;

          return (
            <div
              key={node.id}
              onDragOver={(e) => handleDragOver(e, node.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, node)}
              onClick={() => handleNodeClick(node)}
              className="absolute z-20 flex flex-col items-center cursor-pointer group select-none transition-all duration-300"
              style={{
                left: `${node.x}%`,
                top: `${node.y}%`,
                transform: 'translate(-50%, -50%)'
              }}
              title={`Click ${node.name} to send files, call, or chat. Or drop file directly to transmit.`}
            >
              {/* Call indicator ripple */}
              {isNodeInCall && (
                <div className="absolute -inset-3 rounded-full border-2 border-emerald-500 animate-ping opacity-75 pointer-events-none" />
              )}

              {/* Bypass Transfer ripple */}
              {isNodeInBypass && (
                <div className="absolute -inset-3 rounded-full border-2 border-accent animate-ping opacity-80 pointer-events-none" />
              )}

              {/* Node Avatar Circle */}
              <div className={cn(
                "relative rounded-full flex items-center justify-center text-white font-bold transition-all duration-300 shadow-xl border-2",
                node.isHost ? "w-16 h-16 md:w-20 md:h-20" : "w-14 h-14 md:w-16 md:h-16",
                node.avatarColor || "bg-accent",
                isDragTarget 
                  ? "ring-4 ring-accent scale-125 bg-accent border-white animate-pulse" 
                  : isSelected 
                    ? "ring-4 ring-white scale-110 border-white"
                    : "border-white/80 group-hover:scale-110 group-hover:border-accent",
                node.isHost && "ring-2 ring-accent/60 ring-offset-2 ring-offset-slate-950"
              )}>
                {/* Text inside node circle ("pfp" as in sketch) */}
                <div className="flex flex-col items-center justify-center leading-tight">
                  {node.isHost ? (
                    <Crown className="w-5 h-5 md:w-6 md:h-6 text-yellow-300 drop-shadow-md mb-0.5" />
                  ) : null}
                  <span className="text-xs md:text-sm font-black tracking-wider uppercase">
                    pfp
                  </span>
                </div>

                {/* Host Crown Badge */}
                {node.isHost && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-yellow-400 text-slate-950 flex items-center justify-center font-black text-[10px] shadow-sm">
                    ★
                  </span>
                )}

                {/* Drop cue overlay */}
                {isDragTarget && (
                  <div className="absolute inset-0 rounded-full bg-accent/90 flex items-center justify-center text-white">
                    <Upload className="w-6 h-6 animate-bounce" />
                  </div>
                )}
              </div>

              {/* Node Label (Device Name & Role text) */}
              <div className="mt-2 text-center flex flex-col items-center">
                <span className={cn(
                  "text-xs md:text-sm font-bold tracking-tight text-white whitespace-nowrap px-2 py-0.5 rounded-lg transition-colors shadow-sm",
                  node.isHost ? "bg-accent/20 text-accent font-black border border-accent/30" : "bg-slate-900/80 border border-white/10"
                )}>
                  {node.name}
                </span>
                <span className="text-[11px] md:text-xs font-mono text-slate-400 font-semibold mt-0.5">
                  {node.roleText}
                </span>
              </div>
            </div>
          );
        })}

        {/* Interactive Node Action Popover / Drawer when a node is clicked */}
        {selectedNode && (
          <div className="absolute z-30 bottom-4 right-4 max-w-sm w-80 bg-slate-900/95 border border-white/15 rounded-3xl p-4 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold", selectedNode.avatarColor)}>
                  {selectedNode.isHost ? "★" : selectedNode.name.charAt(0)}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <span>{selectedNode.name}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-white/10 text-slate-300">
                      {selectedNode.roleText}
                    </span>
                  </h4>
                  <div className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Direct P2P Link ({selectedNode.pingMs}ms)</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setSelectedNode(null)}
                className="w-7 h-7 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Actions for this peer */}
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button
                onClick={handleTriggerFileSelect}
                className="col-span-2 py-2.5 px-3 rounded-xl bg-accent hover:bg-accent/90 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md active:scale-98"
              >
                <Upload className="w-4 h-4" />
                <span>Send File to {selectedNode.name}</span>
              </button>

              <button
                onClick={() => handleStartCall('audio')}
                className="py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <PhoneCall className="w-3.5 h-3.5 text-emerald-400" />
                <span>Voice Call</span>
              </button>

              <button
                onClick={() => handleStartCall('video')}
                className="py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Video className="w-3.5 h-3.5 text-blue-400" />
                <span>Video Call</span>
              </button>
            </div>

            {/* Direct message quick input for this node */}
            <form onSubmit={handleSendMessage} className="mt-3 flex gap-1.5">
              <input 
                type="text"
                placeholder={`Message ${selectedNode.name}...`}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                className="flex-1 bg-slate-950/80 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-accent"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-xl bg-accent/20 hover:bg-accent/30 text-accent font-bold text-xs flex items-center justify-center"
              >
                <Send className="w-3 h-3" />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Bottom Live Activity Feed & Controls - Exactly faithful to sketch text */}
      <div className="p-4 md:p-5 border-t border-white/10 bg-slate-900/95 flex flex-col gap-3 flex-shrink-0">
        {/* Sketch Description Banner */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-xs md:text-sm text-slate-300 font-sans leading-relaxed border-l-2 border-accent pl-3">
            All messages and incoming, outgoing connections will be shown here and private calls occuring between two users can also be seen here by everyone on the network.
          </div>

          {/* Interactive Navigation Tabs */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-white/10">
            <button
              onClick={() => setActiveBottomTab('messages')}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5",
                activeBottomTab === 'messages' ? "bg-accent text-slate-950 font-bold" : "text-slate-400 hover:text-white"
              )}
            >
              <MessageSquare className="w-3 h-3" />
              <span>Messages</span>
            </button>
            <button
              onClick={() => setActiveBottomTab('connections')}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5",
                activeBottomTab === 'connections' ? "bg-accent text-slate-950 font-bold" : "text-slate-400 hover:text-white"
              )}
            >
              <Activity className="w-3 h-3" />
              <span>Connections</span>
            </button>
            <button
              onClick={() => setActiveBottomTab('calls')}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 relative",
                activeBottomTab === 'calls' ? "bg-accent text-slate-950 font-bold" : "text-slate-400 hover:text-white"
              )}
            >
              <PhoneCall className="w-3 h-3" />
              <span>Private Calls</span>
              {(simCallActive || isCallActive) && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              )}
            </button>
          </div>
        </div>

        {/* Tab 1: Live Network Messages & Direct Input */}
        {activeBottomTab === 'messages' && (
          <div className="flex flex-col gap-2">
            <div className="bg-slate-950/80 border border-white/10 rounded-2xl p-3 flex flex-col gap-1.5 max-h-32 overflow-y-auto font-mono text-xs scrollbar-thin scrollbar-thumb-white/20">
              {combinedFeed.map((evt) => (
                <div key={evt.id} className="flex items-center justify-between gap-3 text-slate-300">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn(
                      "w-2 h-2 rounded-full flex-shrink-0",
                      evt.type === 'ok' ? "bg-emerald-400" :
                      evt.type === 'bypass' ? "bg-accent animate-pulse" :
                      evt.type === 'call' ? "bg-emerald-500 animate-ping" : 
                      evt.type === 'msg' ? "bg-purple-400" : "bg-blue-400"
                    )} />
                    <span className={cn(
                      "truncate",
                      evt.type === 'bypass' ? "text-accent font-semibold" :
                      evt.type === 'call' ? "text-emerald-400 font-semibold" :
                      evt.type === 'msg' ? "text-slate-100" : "text-slate-300"
                    )}>
                      {evt.text}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 flex-shrink-0">{evt.time}</span>
                </div>
              ))}
            </div>

            {/* Broadcast / Direct Message Input Field */}
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                placeholder="Broadcast a message to everyone on the Nexus network map..."
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                className="flex-1 bg-slate-950/80 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-accent"
              />
              <button
                type="submit"
                disabled={!inputMessage.trim()}
                className="px-4 py-2 rounded-xl bg-accent hover:bg-accent/90 disabled:opacity-40 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send</span>
              </button>
            </form>
          </div>
        )}

        {/* Tab 2: Incoming & Outgoing Connections Matrix */}
        {activeBottomTab === 'connections' && (
          <div className="bg-slate-950/80 border border-white/10 rounded-2xl p-3 max-h-36 overflow-y-auto font-mono text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {nodes.map(node => (
                <div key={node.id} className="p-2 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <div className="min-w-0">
                      <div className="text-white font-bold text-xs truncate">{node.name}</div>
                      <div className="text-[10px] text-slate-400">{node.roleText} • {node.pingMs}ms RTT</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleNodeClick(node)}
                    className="px-2 py-1 rounded bg-accent/15 text-accent text-[10px] font-bold hover:bg-accent/25"
                  >
                    Action
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Private Calls Occurring Between Users */}
        {activeBottomTab === 'calls' && (
          <div className="bg-slate-950/80 border border-white/10 rounded-2xl p-4 flex flex-col gap-3 font-mono text-xs">
            {(simCallActive || isCallActive) ? (
              <div className="flex items-center justify-between flex-wrap gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 animate-pulse">
                    <PhoneCall className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-white font-bold text-sm flex items-center gap-2">
                      <span>Private Call: {simCallPeers.p1} ⇄ {simCallPeers.p2}</span>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px]">
                        LIVE
                      </span>
                    </div>
                    <div className="text-slate-400 text-xs flex items-center gap-3 mt-1">
                      <span>Duration: {formatTime(simCallDuration)}</span>
                      <span>•</span>
                      <span>End-to-End Encrypted SRTP</span>
                    </div>
                  </div>
                </div>

                {/* Animated Audio Waveform */}
                <div className="flex items-center gap-1">
                  {[4, 12, 8, 16, 6, 14, 10, 18, 8, 14].map((h, i) => (
                    <span 
                      key={i} 
                      className="w-1 bg-emerald-400 rounded-full animate-pulse"
                      style={{ height: `${h}px`, animationDelay: `${i * 100}ms` }}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleEndCall}
                    className="px-3 py-1.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                  >
                    <PhoneOff className="w-3.5 h-3.5" />
                    <span>End Session</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="text-slate-400 text-xs">
                  No private calls currently active in the mesh. All calls initiated between peers are visible to the network.
                </div>
                <button
                  onClick={() => handleStartCall('audio')}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  <span>Start Private Call</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
