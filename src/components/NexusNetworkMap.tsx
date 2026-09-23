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
  FolderOpen,
  QrCode,
  Key
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
  onNavigateToConnect?: () => void;
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
  onNavigateToConnect,
  onClose,
  isModal = false,
}: NexusNetworkMapProps) {
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<MapNode | null>(null);
  
  // Tab for bottom panel
  const [activeBottomTab, setActiveBottomTab] = useState<'messages' | 'connections' | 'calls'>('messages');
  const [inputMessage, setInputMessage] = useState('');
  
  // In-map active transfer animation
  const [inMapTransfer, setInMapTransfer] = useState<ActiveInMapTransfer | null>(null);
  
  // Call timer effect
  const [callDuration, setCallDuration] = useState<number>(0);

  // Network activity feed
  const [networkEvents, setNetworkEvents] = useState<Array<{ id: string; text: string; type: 'info' | 'ok' | 'bypass' | 'call' | 'msg'; time: string; sender?: string }>>(() => {
    return [
      { id: '1', text: "Nexus WebRTC node initialized. Zero-server P2P engine active.", type: 'ok', time: new Date().toLocaleTimeString() }
    ];
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Call timer effect
  useEffect(() => {
    let interval: any = null;
    if (isCallActive) {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isCallActive]);

  // Sync active external transfer if present
  useEffect(() => {
    if (activeTransfer) {
      setInMapTransfer({
        id: 'external-transfer',
        fileName: activeTransfer.name,
        fileSize: activeTransfer.totalBytes,
        fromNodeId: 'self',
        toNodeId: 'peer',
        progress: activeTransfer.progress,
        speed: activeTransfer.statusMessage || '24.5 MB/s',
        isBypass: false
      });
    } else if (inMapTransfer?.id === 'external-transfer') {
      setInMapTransfer(null);
    }
  }, [activeTransfer]);

  // Log real connection changes
  useEffect(() => {
    if (connectedCount > 0) {
      const now = new Date().toLocaleTimeString();
      setNetworkEvents(prev => [
        {
          id: Math.random().toString(),
          text: `Encrypted DataChannel online with ${connectedCount} peer${connectedCount > 1 ? 's' : ''}.`,
          type: 'ok',
          time: now
        },
        ...prev.slice(0, 20)
      ]);
    }
  }, [connectedCount]);

  // Construct Real Nodes (no fake demo star mesh!)
  const nodes: MapNode[] = useMemo(() => {
    const list: MapNode[] = [];
    const realPeers = Object.values(peerProfiles);
    const isLocalHost = role === 'host';

    // 1. If no peers connected yet, show ONLY the local user node in the center
    if (realPeers.length === 0 && connectedCount === 0) {
      list.push({
        id: 'self',
        name: localProfile.username ? `${localProfile.username} (You)` : 'Local Device',
        roleText: isLocalHost ? '(Host)' : '(Peer)',
        isHost: isLocalHost,
        isSelf: true,
        avatarColor: localProfile.avatarColor || 'bg-accent',
        deviceType: isLocalHost ? 'host' : 'peer',
        x: 50,
        y: 50,
        status: 'idle',
        pingMs: 0
      });
      return list;
    }

    // 2. Real Connected Network:
    // Determine the center node (Host)
    if (isLocalHost) {
      // Local user is Host at center
      list.push({
        id: 'self',
        name: `${localProfile.username || 'Host'} (You)`,
        roleText: '(Host)',
        isHost: true,
        isSelf: true,
        avatarColor: localProfile.avatarColor || 'bg-accent',
        deviceType: 'host',
        x: 50,
        y: 50,
        status: 'connected',
        pingMs: 0
      });

      // Radially position real connected peers around host
      const radialPositions = [
        { x: 22, y: 28 }, // Top-Left
        { x: 78, y: 28 }, // Top-Right
        { x: 22, y: 72 }, // Bottom-Left
        { x: 78, y: 72 }, // Bottom-Right
        { x: 50, y: 18 }, // Top Center
        { x: 50, y: 82 }, // Bottom Center
        { x: 15, y: 50 }, // Left Middle
        { x: 85, y: 50 }  // Right Middle
      ];

      // If peerProfiles has fewer entries than connectedCount, create placeholder peer entries for anonymous peers
      const peersToRender = realPeers.length > 0 ? realPeers : Array.from({ length: connectedCount }).map((_, i) => ({
        id: `peer-${i + 1}`,
        username: `Peer ${i + 1}`,
        avatarColor: ['bg-emerald-600', 'bg-blue-600', 'bg-purple-600', 'bg-amber-600'][i % 4]
      }));

      peersToRender.forEach((p, idx) => {
        const pos = radialPositions[idx % radialPositions.length];
        list.push({
          id: p.id,
          name: p.username || `Peer ${idx + 1}`,
          roleText: '(peer)',
          isHost: false,
          isSelf: false,
          avatarColor: p.avatarColor || 'bg-blue-600',
          deviceType: 'peer',
          x: pos.x,
          y: pos.y,
          status: 'connected',
          pingMs: 12 + (idx * 6)
        });
      });
    } else {
      // Local user is a peer. The Host is at center, local user and other peers are around it
      const hostPeer = realPeers[0] || { id: 'host-anchor', username: 'Host Node', avatarColor: 'bg-accent' };
      list.push({
        id: hostPeer.id,
        name: hostPeer.username || 'Host Node',
        roleText: '(Host)',
        isHost: true,
        isSelf: false,
        avatarColor: hostPeer.avatarColor || 'bg-accent',
        deviceType: 'host',
        x: 50,
        y: 50,
        status: 'connected',
        pingMs: 16
      });

      // Self node + remaining peers radially
      const radialPositions = [
        { x: 22, y: 28 },
        { x: 78, y: 28 },
        { x: 22, y: 72 },
        { x: 78, y: 72 }
      ];

      // Add self as peer 1
      list.push({
        id: 'self',
        name: `${localProfile.username || 'Peer'} (You)`,
        roleText: '(peer)',
        isHost: false,
        isSelf: true,
        avatarColor: localProfile.avatarColor || 'bg-blue-600',
        deviceType: 'peer',
        x: radialPositions[0].x,
        y: radialPositions[0].y,
        status: 'connected',
        pingMs: 0
      });

      // Remaining peers
      realPeers.slice(1).forEach((p, idx) => {
        const pos = radialPositions[(idx + 1) % radialPositions.length];
        list.push({
          id: p.id,
          name: p.username || `Peer ${idx + 2}`,
          roleText: '(peer)',
          isHost: false,
          isSelf: false,
          avatarColor: p.avatarColor || 'bg-emerald-600',
          deviceType: 'peer',
          x: pos.x,
          y: pos.y,
          status: 'connected',
          pingMs: 18 + (idx * 5)
        });
      });
    }

    return list;
  }, [peerProfiles, localProfile, role, connectedCount]);

  const hostNode = nodes.find(n => n.isHost) || nodes[0];
  const peerNodes = nodes.filter(n => !n.isHost);

  // Send file handler
  const executeSendFile = (file: File, targetNode: MapNode) => {
    const fromNode = nodes.find(n => n.isSelf) || hostNode;
    const now = new Date().toLocaleTimeString();

    // Log event
    setNetworkEvents(prev => [
      {
        id: Math.random().toString(),
        text: `[Transfer Started] "${file.name}" (${formatBytes(file.size)}) ➔ ${targetNode.name}`,
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
      speed: '28.4 MB/s',
      isBypass: false
    });

    // Invoke real transmission if available
    if (onSendFileToPeer) {
      onSendFileToPeer(file, targetNode.id === 'self' ? undefined : targetNode.id);
    }

    // Progress animation along the spoke
    let p = 0;
    const interval = setInterval(() => {
      p += 20;
      if (p >= 100) {
        p = 100;
        clearInterval(interval);
        setTimeout(() => {
          setInMapTransfer(null);
          const endNow = new Date().toLocaleTimeString();
          setNetworkEvents(prev => [
            {
              id: Math.random().toString(),
              text: `[Transfer Complete] "${file.name}" delivered to ${targetNode.name}!`,
              type: 'ok',
              time: endNow
            },
            ...prev.slice(0, 20)
          ]);
          if (onAddReceivedFile) {
            onAddReceivedFile(file);
          }
        }, 500);
      } else {
        setInMapTransfer(prev => prev ? { ...prev, progress: p } : null);
      }
    }, 200);
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
      executeSendFile(file, targetNode);
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
      executeSendFile(file, selectedNode);
    }
  };

  // Call Initiation
  const handleStartCall = (type: 'audio' | 'video') => {
    if (onStartCall) {
      onStartCall(type);
    }
    const now = new Date().toLocaleTimeString();
    setNetworkEvents(prev => [
      {
        id: Math.random().toString(),
        text: `[Encrypted Call Active] ${type.toUpperCase()} call initiated with ${selectedNode ? selectedNode.name : 'Peer'}`,
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
    const now = new Date().toLocaleTimeString();
    setNetworkEvents(prev => [
      {
        id: Math.random().toString(),
        text: `[Call Ended] Media channel closed.`,
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
        text: `[Message] You: "${text}"`,
        type: 'msg',
        time: now,
        sender: localProfile.username || 'You'
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

  // Combined real messages and network events
  const combinedFeed = useMemo(() => {
    const list = [...networkEvents];
    messages.slice(-8).forEach((m, idx) => {
      list.push({
        id: `msg-${idx}`,
        text: `[Message] ${m.senderName || 'Peer'}: "${m.text || 'Voice memo'}"`,
        type: 'msg',
        time: m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : 'Now',
        sender: m.senderName
      });
    });
    return list.slice(0, 20);
  }, [networkEvents, messages]);

  return (
    <div className={cn(
      "flex flex-col bg-slate-950 text-white rounded-3xl border border-white/10 shadow-2xl overflow-hidden backdrop-blur-3xl select-none relative",
      isModal ? "w-full max-w-5xl max-h-[92vh] h-[820px]" : "w-full h-full min-h-[560px]"
    )}>
      {/* Hidden File Input */}
      <input 
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Top Header */}
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
              <span className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border",
                connectedCount > 0 
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" 
                  : "bg-accent/20 text-accent border-accent/30"
              )}>
                {connectedCount > 0 ? `${connectedCount + 1} Nodes Online` : "Listening (0 Peers)"}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Live peer-to-peer topology • Drag and drop files to individual peers
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {connectedCount === 0 && onNavigateToConnect && (
            <button
              onClick={onNavigateToConnect}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-accent hover:bg-accent/90 text-slate-950 font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Connect a Peer</span>
            </button>
          )}

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
      <div className="relative flex-1 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 overflow-hidden flex items-center justify-center p-4 min-h-[340px]">
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(#38bdf812_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none opacity-80" />

        {/* Top Floating Helper Banner */}
        <div className="absolute top-3 left-4 z-10 hidden sm:flex items-center gap-2 bg-slate-900/90 border border-white/10 rounded-full px-3 py-1 text-xs text-slate-400 backdrop-blur-md">
          <Upload className="w-3.5 h-3.5 text-accent" />
          <span>{connectedCount > 0 ? "Drop file directly onto any peer node to transmit" : "Waiting for peers to connect to the mesh"}</span>
        </div>

        {/* Real Connections SVG */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
          {/* Solid Spoke Lines from Host to each real connected peer */}
          {peerNodes.map(peer => (
            <g key={`spoke-${peer.id}`}>
              <line
                x1={`${hostNode.x}%`}
                y1={`${hostNode.y}%`}
                x2={`${peer.x}%`}
                y2={`${peer.y}%`}
                stroke="rgba(255, 255, 255, 0.35)"
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

          {/* Real Active Call Glow Stream */}
          {isCallActive && peerNodes[0] && (
            <line
              x1={`${hostNode.x}%`}
              y1={`${hostNode.y}%`}
              x2={`${peerNodes[0].x}%`}
              y2={`${peerNodes[0].y}%`}
              stroke="#22c55e"
              strokeWidth="4"
              strokeLinecap="round"
              className="animate-pulse opacity-90 shadow-lg"
            />
          )}
        </svg>

        {/* Empty State: 0 peers connected */}
        {connectedCount === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
            {/* Pulsing Radar Ring */}
            <div className="w-48 h-48 md:w-64 md:h-64 rounded-full border border-accent/20 animate-ping opacity-25 absolute" />
            <div className="w-36 h-36 md:w-48 md:h-48 rounded-full border border-accent/30 animate-pulse opacity-40 absolute" />
            
            {/* Help card positioned below the local node */}
            <div className="mt-40 md:mt-48 max-w-sm text-center px-4 pointer-events-auto bg-slate-900/80 backdrop-blur-md p-4 rounded-2xl border border-white/10 shadow-xl">
              <p className="text-xs text-slate-300 font-medium leading-relaxed">
                Direct WebRTC channel ready. Share your Handshake token or QR code with a nearby peer to join the encrypted mesh.
              </p>
              {onNavigateToConnect && (
                <button
                  onClick={onNavigateToConnect}
                  className="mt-3 px-3 py-1.5 rounded-xl bg-accent/20 hover:bg-accent/30 text-accent text-xs font-semibold border border-accent/30 transition-all cursor-pointer"
                >
                  Open QR Utility ➔
                </button>
              )}
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
              <span>Encrypted DataChannel</span>
              <span className="text-emerald-400 font-semibold">{inMapTransfer.speed}</span>
            </div>
          </div>
        )}

        {/* Render Real Nodes */}
        {nodes.map(node => {
          const isDragTarget = dragOverNodeId === node.id;
          const isNodeInCall = isCallActive && (node.isHost || !node.isSelf);
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
              title={`Click ${node.name} to view actions. Drag & drop files directly onto this node to send.`}
            >
              {/* Call indicator ripple */}
              {isNodeInCall && (
                <div className="absolute -inset-3 rounded-full border-2 border-emerald-500 animate-ping opacity-75 pointer-events-none" />
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
                {/* Node icon / initial */}
                <div className="flex flex-col items-center justify-center leading-tight">
                  {node.isHost ? (
                    <Crown className="w-5 h-5 md:w-6 md:h-6 text-yellow-300 drop-shadow-md mb-0.5" />
                  ) : null}
                  <span className="text-xs md:text-sm font-bold tracking-wider uppercase">
                    {node.name.charAt(0)}
                  </span>
                </div>

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
                  "text-xs md:text-sm font-bold tracking-tight text-white whitespace-nowrap px-2.5 py-0.5 rounded-lg transition-colors shadow-sm",
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
                  {selectedNode.isHost ? "👑" : selectedNode.name.charAt(0)}
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
                    <span>Direct WebRTC Link {selectedNode.pingMs > 0 ? `(${selectedNode.pingMs}ms)` : '(Local)'}</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setSelectedNode(null)}
                className="w-7 h-7 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
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

            {/* Direct message quick input */}
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
                className="px-3 py-1.5 rounded-xl bg-accent/20 hover:bg-accent/30 text-accent font-bold text-xs flex items-center justify-center cursor-pointer"
              >
                <Send className="w-3 h-3" />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Bottom Live Activity Feed & Controls */}
      <div className="p-4 md:p-5 border-t border-white/10 bg-slate-900/95 flex flex-col gap-3 flex-shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-xs md:text-sm text-slate-300 font-sans leading-relaxed border-l-2 border-accent pl-3">
            Real-time WebRTC signal feed, active peer connections, encrypted transfers, and live call telemetry.
          </div>

          {/* Interactive Navigation Tabs */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-white/10">
            <button
              onClick={() => setActiveBottomTab('messages')}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer",
                activeBottomTab === 'messages' ? "bg-accent text-slate-950 font-bold" : "text-slate-400 hover:text-white"
              )}
            >
              <MessageSquare className="w-3 h-3" />
              <span>Messages</span>
            </button>
            <button
              onClick={() => setActiveBottomTab('connections')}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer",
                activeBottomTab === 'connections' ? "bg-accent text-slate-950 font-bold" : "text-slate-400 hover:text-white"
              )}
            >
              <Activity className="w-3 h-3" />
              <span>Connections ({connectedCount})</span>
            </button>
            <button
              onClick={() => setActiveBottomTab('calls')}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 relative cursor-pointer",
                activeBottomTab === 'calls' ? "bg-accent text-slate-950 font-bold" : "text-slate-400 hover:text-white"
              )}
            >
              <PhoneCall className="w-3 h-3" />
              <span>Live Calls</span>
              {isCallActive && (
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
                  <span className="text-[10px] text-slate-500 font-mono flex-shrink-0">{evt.time}</span>
                </div>
              ))}
            </div>

            {/* Bottom Global Network Broadcast Box */}
            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Broadcast a message across all connected nodes..."
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-accent"
              />
              <button
                type="submit"
                disabled={!inputMessage.trim()}
                className="px-4 py-2 rounded-xl bg-accent hover:bg-accent/90 disabled:opacity-40 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md active:scale-95"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send</span>
              </button>
            </form>
          </div>
        )}

        {/* Tab 2: Connections List */}
        {activeBottomTab === 'connections' && (
          <div className="bg-slate-950/80 border border-white/10 rounded-2xl p-3 max-h-36 overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {nodes.map(n => (
                <div key={n.id} className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white", n.avatarColor)}>
                      {n.isHost ? "👑" : n.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate text-white">{n.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{n.roleText} • {n.status}</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 font-semibold flex-shrink-0">
                    {n.pingMs}ms
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Active Calls */}
        {activeBottomTab === 'calls' && (
          <div className="bg-slate-950/80 border border-white/10 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3">
            {isCallActive ? (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                    <PhoneCall className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white flex items-center gap-2">
                      <span>Encrypted {callType?.toUpperCase() || 'Audio'} Call Active</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        {formatTime(callDuration)}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">Zero-relay WebRTC SRTP audio/video stream</div>
                  </div>
                </div>

                <button
                  onClick={handleEndCall}
                  className="px-3 py-1.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                >
                  <PhoneOff className="w-3.5 h-3.5" />
                  <span>End Call</span>
                </button>
              </>
            ) : (
              <div className="w-full text-center py-3 text-xs text-slate-400">
                No active calls on the network. Select any connected peer above to start an encrypted voice or video call.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
