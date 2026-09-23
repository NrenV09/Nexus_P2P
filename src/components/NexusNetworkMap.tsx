import React, { useState, useRef, useMemo } from 'react';
import { 
  Network, 
  ArrowRight, 
  Upload, 
  Share2, 
  PhoneCall, 
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
  Smartphone
} from 'lucide-react';
import { cn } from '../lib/utils';
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
  onClose?: () => void;
  isModal?: boolean;
}

interface MapNode {
  id: string;
  name: string;
  roleText: string;
  isHost: boolean;
  isSelf: boolean;
  avatarColor: string;
  deviceType: 'host' | 'peer';
  x: number; // percentage (0 - 100)
  y: number; // percentage (0 - 100)
  labelPos: 'top' | 'bottom' | 'left' | 'right';
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
  onClose,
  isModal = false,
}: NexusNetworkMapProps) {
  // Use simulated 5-node cluster if fewer than 2 real peers are connected
  const [useSimulatedDemo, setUseSimulatedDemo] = useState<boolean>(connectedCount < 1);
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<MapNode | null>(null);
  const [simulatingBypass, setSimulatingBypass] = useState<boolean>(false);
  const [simulatingCall, setSimulatingCall] = useState<boolean>(false);
  const [simLogs, setSimLogs] = useState<Array<{ text: string; type: 'info' | 'ok' | 'bypass' | 'call'; time: string }>>([
    { text: "Nexus mesh cluster online. Handshake port active.", type: 'ok', time: '10:10:01' },
    { text: "Device A designated as Primary Authority Node (Host).", type: 'info', time: '10:10:04' }
  ]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const targetPeerForFileInput = useRef<string | null>(null);

  // Determine actual nodes to display (matching sketch: Device A at center, B, C, D, E around)
  const nodes: MapNode[] = useMemo(() => {
    const realPeers = Object.values(peerProfiles);

    if (useSimulatedDemo || realPeers.length === 0) {
      // Exact representation from reference sketch IMG_4474.png
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
          labelPos: 'bottom'
        },
        {
          id: 'node-peer-c',
          name: 'Device C',
          roleText: '(peer)',
          isHost: false,
          isSelf: false,
          avatarColor: 'bg-emerald-500',
          deviceType: 'peer',
          x: 18,
          y: 20,
          labelPos: 'bottom'
        },
        {
          id: 'node-peer-b',
          name: 'Device B',
          roleText: '(peer)',
          isHost: false,
          isSelf: false,
          avatarColor: 'bg-blue-500',
          deviceType: 'peer',
          x: 82,
          y: 20,
          labelPos: 'bottom'
        },
        {
          id: 'node-peer-d',
          name: 'Device D',
          roleText: '(peer)',
          isHost: false,
          isSelf: false,
          avatarColor: 'bg-amber-500',
          deviceType: 'peer',
          x: 18,
          y: 80,
          labelPos: 'bottom'
        },
        {
          id: 'node-peer-e',
          name: 'Device E',
          roleText: '(peer)',
          isHost: false,
          isSelf: false,
          avatarColor: 'bg-purple-500',
          deviceType: 'peer',
          x: 82,
          y: 80,
          labelPos: 'bottom'
        }
      ];
    }

    // Dynamic nodes based on live peer connections
    const list: MapNode[] = [];
    const isLocalHost = role === 'host';

    // Center Node (Host)
    list.push({
      id: isLocalHost ? 'self' : 'host-peer',
      name: isLocalHost ? `${localProfile.username} (You)` : (realPeers[0]?.username || 'Host Node'),
      roleText: '(Host)',
      isHost: true,
      isSelf: isLocalHost,
      avatarColor: isLocalHost ? localProfile.avatarColor : (realPeers[0]?.avatarColor || 'bg-accent'),
      deviceType: 'host',
      x: 50,
      y: 50,
      labelPos: 'bottom'
    });

    // Outer peers distributed radially around center
    const remainingPeers = isLocalHost ? realPeers : [
      { id: 'self', username: `${localProfile.username} (You)`, avatarColor: localProfile.avatarColor },
      ...realPeers.slice(1)
    ];

    const angles = [
      { x: 18, y: 20 }, // Top-Left (Device C position)
      { x: 82, y: 20 }, // Top-Right (Device B position)
      { x: 18, y: 80 }, // Bottom-Left (Device D position)
      { x: 82, y: 80 }, // Bottom-Right (Device E position)
      { x: 50, y: 15 }, // Top center
      { x: 50, y: 85 }  // Bottom center
    ];

    remainingPeers.forEach((p, idx) => {
      const pos = angles[idx % angles.length];
      list.push({
        id: p.id,
        name: p.username,
        roleText: '(peer)',
        isHost: false,
        isSelf: p.id === 'self',
        avatarColor: p.avatarColor || 'bg-blue-500',
        deviceType: 'peer',
        x: pos.x,
        y: pos.y,
        labelPos: 'bottom'
      });
    });

    return list;
  }, [useSimulatedDemo, peerProfiles, localProfile, role, connectedCount]);

  const hostNode = nodes.find(n => n.isHost) || nodes[0];
  const peerNodes = nodes.filter(n => !n.isHost);
  const nodeB = nodes.find(n => n.name.includes('Device B')) || peerNodes[0] || hostNode;
  const nodeE = nodes.find(n => n.name.includes('Device E')) || peerNodes[peerNodes.length - 1] || hostNode;

  // Handle Drag and Drop
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
      const now = new Date().toLocaleTimeString();
      setSimLogs(prev => [
        { text: `[Direct P2P] Dispatching "${file.name}" (${(file.size / 1024 / 1024).toFixed(1)} MB) to ${targetNode.name}...`, type: 'bypass', time: now },
        ...prev.slice(0, 15)
      ]);

      if (onSendFileToPeer) {
        onSendFileToPeer(file, targetNode.id === 'self' ? undefined : targetNode.id);
      }
    }
  };

  const handleNodeClick = (node: MapNode) => {
    setSelectedNode(node);
    targetPeerForFileInput.current = node.id === 'self' ? null : node.id;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const targetName = selectedNode ? selectedNode.name : 'Peer';
      const now = new Date().toLocaleTimeString();
      setSimLogs(prev => [
        { text: `[Direct P2P] Sending "${file.name}" to ${targetName}...`, type: 'bypass', time: now },
        ...prev.slice(0, 15)
      ]);
      if (onSendFileToPeer) {
        onSendFileToPeer(file, targetPeerForFileInput.current || undefined);
      }
    }
  };

  // Simulate direct bypass transfer as sketched in IMG_4474.png
  const triggerBypassSimulation = () => {
    setSimulatingBypass(true);
    const now = new Date().toLocaleTimeString();
    setSimLogs(prev => [
      { text: `[Direct Bypass Initiated] Device E ➔ Device B direct transfer started (Bypassing Host Channel)`, type: 'bypass', time: now },
      ...prev.slice(0, 15)
    ]);

    setTimeout(() => {
      setSimLogs(prev => [
        { text: `[Bypass In-Flight] 64KB SCTP chunks streaming directly E ➔ B without host overhead`, type: 'info', time: new Date().toLocaleTimeString() },
        ...prev.slice(0, 15)
      ]);
    }, 1200);

    setTimeout(() => {
      setSimLogs(prev => [
        { text: `[Transfer Complete] Device B received 1.4 GB package directly from Device E`, type: 'ok', time: new Date().toLocaleTimeString() },
        ...prev.slice(0, 15)
      ]);
      setSimulatingBypass(false);
    }, 4000);
  };

  // Simulate private call notification visible to everyone
  const triggerCallSimulation = () => {
    setSimulatingCall(true);
    const now = new Date().toLocaleTimeString();
    setSimLogs(prev => [
      { text: `[Private Call Active] Secure encrypted call established between Device A ⇄ Device B`, type: 'call', time: now },
      ...prev.slice(0, 15)
    ]);

    setTimeout(() => {
      setSimLogs(prev => [
        { text: `[Call Session Closed] Device A and Device B concluded audio/video session`, type: 'info', time: new Date().toLocaleTimeString() },
        ...prev.slice(0, 15)
      ]);
      setSimulatingCall(false);
    }, 4500);
  };

  // Combine real activity logs/messages with sketch network ticker
  const displayEvents = useMemo(() => {
    const combined = [...simLogs];
    
    // Add real messages if available
    messages.slice(-5).forEach(m => {
      combined.push({
        text: `[Message] ${m.senderName || 'Peer'}: "${m.text || 'Audio message'}"`,
        type: 'info',
        time: m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : 'Now'
      });
    });

    // Add active transfer status if present
    if (activeTransfer) {
      const speedOrMsg = (activeTransfer as any).speed || activeTransfer.statusMessage || 'Active';
      combined.unshift({
        text: `[Transfer] ${activeTransfer.name} (${activeTransfer.progress}%) - ${speedOrMsg}`,
        type: 'bypass',
        time: 'Now'
      });
    }

    // Add real call status
    if (isCallActive) {
      combined.unshift({
        text: `[Active Call] High-definition ${callType || 'audio'} stream active on mesh link`,
        type: 'call',
        time: 'Now'
      });
    }

    return combined.slice(0, 8);
  }, [simLogs, messages, activeTransfer, isCallActive, callType]);

  return (
    <div className={cn(
      "flex flex-col bg-slate-950 text-white rounded-3xl border border-white/10 shadow-2xl overflow-hidden backdrop-blur-3xl select-none",
      isModal ? "w-full max-w-4xl max-h-[90vh] h-[780px]" : "w-full h-full min-h-[580px]"
    )}>
      {/* Hidden file input for tap-to-select on mobile/iPad */}
      <input 
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Top Header - Faithful to Reference Sketch IMG_4474.png */}
      <div className="px-6 py-4 border-b border-white/10 bg-white/5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg md:text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <span>Nexus Network Map</span>
              <ArrowRight className="w-4 h-4 text-accent" />
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-accent/20 text-accent border border-accent/30">
              {nodes.length} Nodes Active
            </span>
          </div>
          <p className="text-xs md:text-sm text-slate-400 mt-0.5 font-sans">
            Drag and drop to send files to individual peers
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setUseSimulatedDemo(prev => !prev)}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5",
              useSimulatedDemo 
                ? "bg-accent/20 border-accent/40 text-accent shadow-sm" 
                : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
            )}
            title="Toggle between Reference Sketch (5 Nodes) and Live Connected Peers"
          >
            <Users className="w-3.5 h-3.5" />
            <span>{useSimulatedDemo ? "Sketch Demo (5 Nodes)" : "Live Cluster Mode"}</span>
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

      {/* Interactive Network Canvas */}
      <div className="relative flex-1 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 overflow-hidden flex items-center justify-center p-4">
        {/* Subtle grid background */}
        <div className="absolute inset-0 bg-[radial-gradient(#38bdf815_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none opacity-60" />

        {/* Dynamic SVG Connection Lines */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
          <defs>
            <linearGradient id="solidHostSpoke" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#818cf8" stopOpacity="0.4" />
            </linearGradient>

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

          {/* 1. Solid lines connecting Host (Device A) to each Peer (as in sketch) */}
          {peerNodes.map(peer => (
            <g key={`line-host-${peer.id}`}>
              <line
                x1={`${hostNode.x}%`}
                y1={`${hostNode.y}%`}
                x2={`${peer.x}%`}
                y2={`${peer.y}%`}
                stroke="rgba(255, 255, 255, 0.45)"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              {/* Animated pulse packet moving along the solid line */}
              <circle r="3.5" fill="#38bdf8" className="animate-pulse">
                <animate
                  attributeName="cx"
                  from={`${hostNode.x}%`}
                  to={`${peer.x}%`}
                  dur="3s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="cy"
                  from={`${hostNode.y}%`}
                  to={`${peer.y}%`}
                  dur="3s"
                  repeatCount="indefinite"
                />
              </circle>
            </g>
          ))}

          {/* 2. Dashed line with arrow between Device E and Device B (Bypassing Host) */}
          {nodeE && nodeB && (
            <g className={cn("transition-opacity duration-300", (simulatingBypass || activeTransfer) ? "opacity-100" : "opacity-85")}>
              <line
                x1={`${nodeE.x}%`}
                y1={`${nodeE.y - 6}%`}
                x2={`${nodeB.x}%`}
                y2={`${nodeB.y + 6}%`}
                stroke="#38bdf8"
                strokeWidth={simulatingBypass ? "3.5" : "2.5"}
                strokeDasharray="6 6"
                markerEnd="url(#bypassArrow)"
                className={simulatingBypass ? "animate-[dash_1s_linear_infinite]" : ""}
              />
            </g>
          )}

          {/* 3. Call Wave Glow between Device A and Device B when call is active */}
          {(simulatingCall || isCallActive) && nodeB && (
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

        {/* Dashed Bypass Line Annotation (Matches sketch text exactly) */}
        {nodeE && nodeB && (
          <div 
            className="absolute z-10 pointer-events-auto bg-slate-900/90 border border-accent/40 rounded-xl p-2.5 max-w-[210px] text-left shadow-xl backdrop-blur-md transition-all hover:scale-105"
            style={{
              left: `calc(${nodeE.x}% - 40px)`,
              top: `calc(50% - 30px)`,
              transform: 'translate(-50%, -50%)'
            }}
          >
            <div className="flex items-center gap-1 text-[11px] font-bold text-accent">
              <Zap className="w-3.5 h-3.5 flex-shrink-0 animate-bounce" />
              <span>(When transferring files from E to B directly.)</span>
            </div>
            <div className="text-[10px] text-slate-300 font-mono mt-0.5 font-semibold">
              (Bypassing Host)
            </div>
          </div>
        )}

        {/* Render Interactive Nodes */}
        {nodes.map(node => {
          const isDragTarget = dragOverNodeId === node.id;
          const isNodeInCall = (simulatingCall || isCallActive) && (node.isHost || node.name.includes('Device B'));
          const isNodeInBypass = (simulatingBypass) && (node.name.includes('Device E') || node.name.includes('Device B'));

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
              title={`Click or drop file on ${node.name} to send directly`}
            >
              {/* Call indicator ripple */}
              {isNodeInCall && (
                <div className="absolute -inset-3 rounded-full border-2 border-emerald-500 animate-ping opacity-60 pointer-events-none" />
              )}

              {/* Bypass Transfer ripple */}
              {isNodeInBypass && (
                <div className="absolute -inset-3 rounded-full border-2 border-accent animate-ping opacity-75 pointer-events-none" />
              )}

              {/* Node Avatar / Circle */}
              <div className={cn(
                "relative rounded-full flex items-center justify-center text-white font-bold transition-all duration-300 shadow-xl border-2",
                node.isHost ? "w-16 h-16 md:w-20 md:h-20" : "w-14 h-14 md:w-16 md:h-16",
                node.avatarColor || "bg-accent",
                isDragTarget 
                  ? "ring-4 ring-accent scale-125 bg-accent border-white animate-pulse" 
                  : "border-white/80 group-hover:scale-110 group-hover:border-accent",
                node.isHost && "ring-2 ring-accent/60 ring-offset-2 ring-offset-slate-950"
              )}>
                {/* Text inside node circle (as in sketch "pfp") */}
                <div className="flex flex-col items-center justify-center leading-tight">
                  {node.isHost ? (
                    <Crown className="w-5 h-5 md:w-6 md:h-6 text-yellow-300 drop-shadow-md mb-0.5" />
                  ) : null}
                  <span className="text-xs md:text-sm font-black tracking-wider uppercase">
                    pfp
                  </span>
                </div>

                {/* Host badge */}
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
                  "text-xs md:text-sm font-bold tracking-tight text-white whitespace-nowrap px-2 py-0.5 rounded-lg transition-colors",
                  node.isHost ? "bg-accent/20 text-accent font-black" : "bg-slate-900/80 border border-white/10"
                )}>
                  {node.name}
                </span>
                <span className="text-[11px] md:text-xs font-mono text-slate-400 font-semibold mt-0.5">
                  {node.roleText}
                </span>
              </div>

              {/* Hover Drop tooltip */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 pointer-events-none bg-accent text-slate-950 text-[10px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap shadow-lg">
                Drop file to send
              </div>
            </div>
          );
        })}

        {/* Quick Simulation Trigger Buttons floating on canvas */}
        <div className="absolute top-4 left-4 z-20 flex flex-wrap gap-2">
          <button
            onClick={triggerBypassSimulation}
            disabled={simulatingBypass}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-accent/20 hover:bg-accent/30 text-accent border border-accent/40 shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Demonstrates direct file transfer from Device E to Device B bypassing host"
          >
            <Zap className="w-3.5 h-3.5 animate-pulse" />
            <span>{simulatingBypass ? "Streaming E ➔ B..." : "Simulate Bypass (E ➔ B)"}</span>
          </button>

          <button
            onClick={triggerCallSimulation}
            disabled={simulatingCall}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40 shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Broadcasts private call status across all nodes"
          >
            <PhoneCall className="w-3.5 h-3.5" />
            <span>{simulatingCall ? "Call in Progress..." : "Simulate Private Call (A ⇄ B)"}</span>
          </button>
        </div>
      </div>

      {/* Bottom Live Activity Feed - Faithful to Reference Sketch IMG_4474.png */}
      <div className="p-4 md:p-5 border-t border-white/10 bg-slate-900/90 flex flex-col gap-2.5">
        {/* Sketch Description Banner */}
        <div className="text-xs md:text-sm text-slate-300 font-sans leading-relaxed border-l-2 border-accent pl-3">
          All messages and incoming, outgoing connections will be shown here and private calls occuring between two users can also be seen here by everyone on the network.
        </div>

        {/* Real-Time Network Ticker / Events Feed */}
        <div className="bg-slate-950/80 border border-white/10 rounded-2xl p-3 flex flex-col gap-1.5 max-h-32 overflow-y-auto font-mono text-xs scrollbar-thin scrollbar-thumb-white/20">
          {displayEvents.map((evt, idx) => (
            <div key={idx} className="flex items-center justify-between gap-3 text-slate-300">
              <div className="flex items-center gap-2 min-w-0">
                <span className={cn(
                  "w-2 h-2 rounded-full flex-shrink-0",
                  evt.type === 'ok' ? "bg-emerald-400" :
                  evt.type === 'bypass' ? "bg-accent animate-pulse" :
                  evt.type === 'call' ? "bg-emerald-500 animate-ping" : "bg-blue-400"
                )} />
                <span className={cn(
                  "truncate",
                  evt.type === 'bypass' ? "text-accent font-semibold" :
                  evt.type === 'call' ? "text-emerald-400 font-semibold" :
                  evt.type === 'ok' ? "text-emerald-300" : "text-slate-300"
                )}>
                  {evt.text}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 flex-shrink-0">{evt.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
