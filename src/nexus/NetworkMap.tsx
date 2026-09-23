import React, { useRef, useEffect, useState } from 'react';
import { NexusPeer, NexusTransfer, NodePosition, NexusCall, BatchTransferState, ConcurrentBypassState } from './types';
import { ZoomIn, ZoomOut, RotateCcw, ShieldCheck, Zap, Radio, HardDrive, Phone, Video } from 'lucide-react';

interface NetworkMapProps {
  localPeer: NexusPeer;
  connectedPeers: Map<string, NexusPeer>;
  hostId: string;
  activeTransfers?: Map<string, NexusTransfer>;
  activeBatches?: Map<string, BatchTransferState>;
  activeCall?: NexusCall | null;
  concurrentPeerStates?: ConcurrentBypassState[];
  onFileDrop?: (targetPeerId: string, file: File) => void;
  onFilesDrop?: (targetPeerId: string, files: File[]) => void;
  onNodeClick?: (peer: NexusPeer) => void;
}

interface Particle {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  progress: number;
  speed: number;
  color: string;
  transferId: string;
}

export const NetworkMap: React.FC<NetworkMapProps> = ({
  localPeer,
  connectedPeers,
  hostId,
  activeTransfers,
  activeBatches,
  activeCall,
  concurrentPeerStates,
  onFileDrop,
  onFilesDrop,
  onNodeClick
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Physics simulation nodes
  const nodesRef = useRef<Map<string, NodePosition>>(new Map());
  const animationFrameRef = useRef<number | null>(null);

  // Viewport Transform (Pan & Zoom)
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  panRef.current = pan;
  zoomRef.current = zoom;

  // Interaction State
  const [hoveredNode, setHoveredNode] = useState<NodePosition | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [dropTargetNodeId, setDropTargetNodeId] = useState<string | null>(null);
  const isDraggingNode = useRef<string | null>(null);
  const isPanning = useRef<boolean>(false);
  const lastMousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Sync strictly real nodes (NO FAKE NODES)
  useEffect(() => {
    const currentMap = nodesRef.current;
    const allPeers = new Map<string, NexusPeer>();

    // 1. Add local peer
    allPeers.set(localPeer.id, localPeer);

    // 2. Add real connected peers from WebSocket signaling
    connectedPeers.forEach((peer, id) => {
      allPeers.set(id, peer);
    });

    // Remove despawned nodes immediately
    currentMap.forEach((_, id) => {
      if (!allPeers.has(id)) {
        currentMap.delete(id);
      }
    });

    // Spawn or update real nodes
    let index = 0;
    allPeers.forEach((peer, id) => {
      const isHost = id === hostId || (peer.isHost && !hostId);
      const existing = currentMap.get(id);

      if (existing) {
        existing.peer = peer;
        existing.isHost = isHost;
        existing.radius = isHost ? 34 : 26;
      } else {
        // Position initial spawn organically around center
        const angle = index * (Math.PI * 2 / Math.max(1, allPeers.size));
        const distance = isHost ? 0 : 160 + (index % 2) * 50;
        const x = isHost ? 0 : Math.cos(angle) * distance;
        const y = isHost ? 0 : Math.sin(angle) * distance;

        currentMap.set(id, {
          id,
          x,
          y,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          radius: isHost ? 34 : 26,
          isHost,
          peer
        });
      }
      index++;
    });
  }, [localPeer, connectedPeers, hostId]);

  // Coordinate Conversion helper
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const currentPan = panRef.current;
    const currentZoom = zoomRef.current;

    const worldX = (mouseX - (cx + currentPan.x)) / currentZoom;
    const worldY = (mouseY - (cy + currentPan.y)) / currentZoom;

    return { worldX, worldY, mouseX, mouseY };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { worldX, worldY } = getCanvasCoords(e);
    lastMousePos.current = { x: e.clientX, y: e.clientY };

    // Test node intersection
    let hitNode: NodePosition | null = null;
    nodesRef.current.forEach(node => {
      const dist = Math.hypot(node.x - worldX, node.y - worldY);
      if (dist <= node.radius + 6) {
        hitNode = node;
      }
    });

    if (hitNode) {
      isDraggingNode.current = (hitNode as NodePosition).id;
      setSelectedNodeId((hitNode as NodePosition).id);
      onNodeClick?.((hitNode as NodePosition).peer);
    } else {
      isPanning.current = true;
      setSelectedNodeId(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { worldX, worldY } = getCanvasCoords(e);

    // Node Dragging
    if (isDraggingNode.current) {
      const draggedNode = nodesRef.current.get(isDraggingNode.current);
      if (draggedNode) {
        draggedNode.x = worldX;
        draggedNode.y = worldY;
        draggedNode.vx = 0;
        draggedNode.vy = 0;
      }
      return;
    }

    // Canvas Panning
    if (isPanning.current) {
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      return;
    }

    // Hover Detection
    let hit: NodePosition | null = null;
    nodesRef.current.forEach(node => {
      const dist = Math.hypot(node.x - worldX, node.y - worldY);
      if (dist <= node.radius + 8) {
        hit = node;
      }
    });
    setHoveredNode(hit);
  };

  const handleMouseUp = () => {
    isDraggingNode.current = null;
    isPanning.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    setZoom(prev => Math.min(2.5, Math.max(0.35, prev * zoomFactor)));
  };

  // Drag and Drop Files over Canvas
  const handleDragOver = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { worldX, worldY } = getCanvasCoords(e as any);

    let target: NodePosition | null = null;
    nodesRef.current.forEach(node => {
      if (node.id !== localPeer.id) {
        const dist = Math.hypot(node.x - worldX, node.y - worldY);
        if (dist <= node.radius + 20) {
          target = node;
        }
      }
    });

    if (target) {
      setDropTargetNodeId((target as NodePosition).id);
    } else {
      setDropTargetNodeId(null);
    }
  };

  const handleDragLeave = () => {
    setDropTargetNodeId(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const targetId = dropTargetNodeId;
    setDropTargetNodeId(null);

    if (!targetId || targetId === localPeer.id) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      if (onFilesDrop) {
        onFilesDrop(targetId, filesArray);
      } else if (onFileDrop) {
        onFileDrop(targetId, filesArray[0]);
      }
    }
  };

  // Main Canvas Rendering & Physics Loop (60 FPS)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isRunning = true;
    let tick = 0;

    const render = () => {
      if (!isRunning) return;
      tick++;

      // Retina canvas sizing
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      }

      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);

      // Viewport Transform (Centered + Pan + Zoom)
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const currentPan = panRef.current;
      const currentZoom = zoomRef.current;

      ctx.translate(cx + currentPan.x, cy + currentPan.y);
      ctx.scale(currentZoom, currentZoom);

      const nodes: NodePosition[] = Array.from(nodesRef.current.values());

      // --- 1. Physics Engine (Force-Directed Graph) ---
      const hostNode = nodes.find(n => n.isHost);

      // Node-to-node Coulomb Repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = a.radius + b.radius + 70;

          if (dist < minDist * 2.5) {
            const force = (minDist * minDist) / (dist * dist) * 0.45;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            if (isDraggingNode.current !== a.id) {
              a.vx -= fx;
              a.vy -= fy;
            }
            if (isDraggingNode.current !== b.id) {
              b.vx += fx;
              b.vy += fy;
            }
          }
        }
      }

      // Spring links: Host to all spoke Peers (Hooke's Law)
      if (hostNode) {
        if (isDraggingNode.current !== hostNode.id) {
          hostNode.vx -= hostNode.x * 0.05;
          hostNode.vy -= hostNode.y * 0.05;
        }

        nodes.forEach(node => {
          if (!node.isHost && isDraggingNode.current !== node.id) {
            const dx = hostNode.x - node.x;
            const dy = hostNode.y - node.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const targetDist = 180;
            const springForce = (dist - targetDist) * 0.03;

            node.vx += (dx / dist) * springForce;
            node.vy += (dy / dist) * springForce;
          }
        });
      }

      // Direct P2P Bypass links attraction
      nodes.forEach(node => {
        if (node.peer.bypassPeers && node.peer.bypassPeers.length > 0) {
          node.peer.bypassPeers.forEach(bypassId => {
            const peerTarget = nodesRef.current.get(bypassId);
            if (peerTarget && isDraggingNode.current !== node.id) {
              const dx = peerTarget.x - node.x;
              const dy = peerTarget.y - node.y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const targetDist = 130;
              const springForce = (dist - targetDist) * 0.025;

              node.vx += (dx / dist) * springForce;
              node.vy += (dy / dist) * springForce;
            }
          });
        }
      });

      // Integrate velocity with friction/damping
      nodes.forEach(node => {
        if (isDraggingNode.current !== node.id) {
          node.x += node.vx;
          node.y += node.vy;
          node.vx *= 0.82;
          node.vy *= 0.82;
        }
      });

      // --- 2. Render Background Grid ---
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      const gridExtent = 1200;
      for (let x = -gridExtent; x <= gridExtent; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, -gridExtent);
        ctx.lineTo(x, gridExtent);
        ctx.stroke();
      }
      for (let y = -gridExtent; y <= gridExtent; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(-gridExtent, y);
        ctx.lineTo(gridExtent, y);
        ctx.stroke();
      }
      ctx.restore();

      // Active Call Nodes lookup
      const isCallActive = Boolean(activeCall && activeCall.active);
      const callCallerNode = isCallActive ? nodesRef.current.get(activeCall!.callerId) : null;
      const callTargetNode = isCallActive ? nodesRef.current.get(activeCall!.targetId) : null;

      // --- 3. Topology Rendering ---
      // A. Solid lines from Host node to all connected Peer nodes
      if (hostNode) {
        nodes.forEach(node => {
          if (!node.isHost) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(hostNode.x, hostNode.y);
            ctx.lineTo(node.x, node.y);
            ctx.strokeStyle = 'rgba(59, 130, 246, 0.45)';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
          }
        });
      }

      // B. Dynamic Dashed Lines between non-host peers when Direct P2P Bypass is active
      const renderedBypassPairs = new Set<string>();
      nodes.forEach(node => {
        if (node.peer.bypassPeers && node.peer.bypassPeers.length > 0) {
          node.peer.bypassPeers.forEach(peerId => {
            const pairKey = [node.id, peerId].sort().join(':');
            if (!renderedBypassPairs.has(pairKey)) {
              renderedBypassPairs.add(pairKey);
              const targetNode = nodesRef.current.get(peerId);
              if (targetNode) {
                ctx.save();
                ctx.beginPath();
                ctx.setLineDash([8, 6]);
                ctx.lineDashOffset = -tick * 0.8;
                ctx.moveTo(node.x, node.y);
                ctx.lineTo(targetNode.x, targetNode.y);
                ctx.strokeStyle = 'rgba(16, 185, 129, 0.85)';
                ctx.lineWidth = 2.5;
                ctx.stroke();

                // Multiplexed Midpoint Label
                const midX = (node.x + targetNode.x) / 2;
                const midY = (node.y + targetNode.y) / 2;
                ctx.setLineDash([]);
                ctx.font = '10px "JetBrains Mono", monospace';
                ctx.textAlign = 'center';

                // Check concurrent states on this link
                const isPairInCall = isCallActive &&
                  ((activeCall!.callerId === node.id && activeCall!.targetId === peerId) ||
                   (activeCall!.callerId === peerId && activeCall!.targetId === node.id));

                const activeBatchForLink = activeBatches ? (Array.from(activeBatches.values()) as BatchTransferState[]).find(
                  b => (b.targetId === node.id || b.targetId === peerId) && (b.status === 'streaming' || b.status === 'accepted')
                ) : null;

                if (isPairInCall && activeBatchForLink) {
                  ctx.fillStyle = '#F43F5E';
                  ctx.fillText(`⚡ DIRECT BYPASS • 📹 LIVE CALL • 📦 BATCH (${activeBatchForLink.progress}%)`, midX, midY - 8);
                } else if (isPairInCall) {
                  ctx.fillStyle = '#F43F5E';
                  ctx.fillText('⚡ DIRECT BYPASS • 📹 LIVE CALL STREAM', midX, midY - 8);
                } else if (activeBatchForLink) {
                  ctx.fillStyle = '#10B981';
                  ctx.fillText(`⚡ DIRECT BYPASS • 📦 BATCH (${activeBatchForLink.progress}%)`, midX, midY - 8);
                } else {
                  ctx.fillStyle = '#10B981';
                  ctx.fillText('⚡ DIRECT BYPASS', midX, midY - 6);
                }
                ctx.restore();
              }
            }
          });
        }
      });

      // C. Active Call A/V Media Energy Aura (Multiplexed on the connection)
      if (isCallActive && callCallerNode && callTargetNode) {
        ctx.save();
        const callDist = Math.hypot(callTargetNode.x - callCallerNode.x, callTargetNode.y - callCallerNode.y) || 1;
        const steps = Math.max(12, Math.floor(callDist / 8));

        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const nx = callCallerNode.x + (callTargetNode.x - callCallerNode.x) * t;
          const ny = callCallerNode.y + (callTargetNode.y - callCallerNode.y) * t;
          const perpX = -(callTargetNode.y - callCallerNode.y) / callDist;
          const perpY = (callTargetNode.x - callCallerNode.x) / callDist;
          const wave = Math.sin(t * Math.PI * 6 - tick * 0.18) * 8;
          const px = nx + perpX * wave;
          const py = ny + perpY * wave;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }

        const auraColor = activeCall!.callType === 'video' ? 'rgba(244, 63, 94, 0.9)' : 'rgba(168, 85, 247, 0.9)';
        ctx.strokeStyle = auraColor;
        ctx.lineWidth = 3;
        ctx.shadowColor = activeCall!.callType === 'video' ? '#F43F5E' : '#A855F7';
        ctx.shadowBlur = 14;
        ctx.stroke();
        ctx.restore();
      }

      // --- 4. Render Animated Data Pulses for Active Transfers ---
      if (activeTransfers && activeTransfers.size > 0) {
        activeTransfers.forEach(transfer => {
          if (transfer.status === 'active') {
            const fromNode = nodesRef.current.get(transfer.fromPeerId);
            const toNode = nodesRef.current.get(transfer.toPeerId);

            if (fromNode && toNode) {
              const numPackets = 4;
              for (let p = 0; p < numPackets; p++) {
                const phase = ((tick * 0.02) + (p / numPackets)) % 1;
                const px = fromNode.x + (toNode.x - fromNode.x) * phase;
                const py = fromNode.y + (toNode.y - fromNode.y) * phase;

                ctx.save();
                ctx.beginPath();
                ctx.arc(px, py, 4.5, 0, Math.PI * 2);
                ctx.fillStyle = transfer.isBypass ? '#10B981' : '#38BDF8';
                ctx.shadowColor = transfer.isBypass ? '#10B981' : '#38BDF8';
                ctx.shadowBlur = 12;
                ctx.fill();
                ctx.restore();
              }
            }
          }
        });
      }

      // --- 5. Render Nodes ---
      nodes.forEach(node => {
        const isHovered = hoveredNode?.id === node.id;
        const isSelected = selectedNodeId === node.id;
        const isDropTarget = dropTargetNodeId === node.id;
        const isLocal = node.id === localPeer.id;

        // Check if this node is in an active call
        const isNodeInCall = isCallActive && (activeCall!.callerId === node.id || activeCall!.targetId === node.id);

        // Check if this node has active batch transfer
        const nodeBatch = activeBatches ? (Array.from(activeBatches.values()) as BatchTransferState[]).find(
          b => (b.targetId === node.id || (isLocal && b.status === 'streaming')) && (b.status === 'streaming' || b.status === 'accepted')
        ) : null;

        ctx.save();

        // Pulsing radar ring for Host node
        if (node.isHost) {
          const pulse = (tick % 90) / 90;
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius + pulse * 28, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(59, 130, 246, ${0.7 * (1 - pulse)})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Active Call Glowing Halo & Media Aura
        if (isNodeInCall) {
          const auraPulse = (tick % 50) / 50;
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius + 8 + auraPulse * 18, 0, Math.PI * 2);
          ctx.strokeStyle = activeCall!.callType === 'video'
            ? `rgba(244, 63, 94, ${0.85 * (1 - auraPulse)})`
            : `rgba(168, 85, 247, ${0.85 * (1 - auraPulse)})`;
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }

        // Batch Progress Ring (Concurrently rendered around node)
        if (nodeBatch) {
          const progRatio = Math.max(0.05, nodeBatch.progress / 100);
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progRatio);
          ctx.strokeStyle = '#10B981';
          ctx.lineWidth = 3.5;
          ctx.shadowColor = '#10B981';
          ctx.shadowBlur = 10;
          ctx.stroke();
        }

        // Drop Target Highlight Ring
        if (isDropTarget) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius + 14, 0, Math.PI * 2);
          ctx.strokeStyle = '#10B981';
          ctx.lineWidth = 3;
          ctx.setLineDash([4, 4]);
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius + 8, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
          ctx.fill();
        }

        // Glowing Halo on Hover or Selection
        if (isHovered || isSelected) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius + 8, 0, Math.PI * 2);
          ctx.fillStyle = node.isHost ? 'rgba(59, 130, 246, 0.25)' : 'rgba(236, 72, 153, 0.25)';
          ctx.fill();
        }

        // Main Node Body Circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(node.x, node.y, 4, node.x, node.y, node.radius);
        if (node.isHost) {
          grad.addColorStop(0, '#3B82F6');
          grad.addColorStop(1, '#1D4ED8');
        } else if (isLocal) {
          grad.addColorStop(0, '#8B5CF6');
          grad.addColorStop(1, '#6D28D9');
        } else {
          grad.addColorStop(0, '#10B981');
          grad.addColorStop(1, '#047857');
        }
        ctx.fillStyle = grad;
        ctx.shadowColor = isNodeInCall ? '#F43F5E' : node.isHost ? '#3B82F6' : '#10B981';
        ctx.shadowBlur = isNodeInCall ? 22 : isHovered ? 18 : 8;
        ctx.fill();

        // Inner Border
        ctx.lineWidth = 2;
        ctx.strokeStyle = isNodeInCall ? '#FECDD3' : 'rgba(255, 255, 255, 0.8)';
        ctx.stroke();

        // Live Call Badge on top of Node
        if (isNodeInCall) {
          ctx.font = 'bold 9px "JetBrains Mono", monospace';
          ctx.fillStyle = activeCall!.callType === 'video' ? '#F43F5E' : '#A855F7';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(activeCall!.callType === 'video' ? '📹 VIDEO' : '🎙️ AUDIO', node.x, node.y - node.radius - 6);
        }

        // Node Label Initial
        ctx.font = `bold ${node.isHost ? 14 : 12}px sans-serif`;
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const initial = (node.peer.username || 'P').charAt(0).toUpperCase();
        ctx.fillText(initial, node.x, node.y);

        // Node Title Text Below
        ctx.font = '11px "Space Grotesk", sans-serif';
        ctx.fillStyle = '#E2E8F0';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const displayName = isLocal ? `${node.peer.username} (You)` : node.peer.username;
        ctx.fillText(displayName, node.x, node.y + node.radius + 6);

        // Node Role / Status Badge
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillStyle = node.isHost ? '#60A5FA' : nodeBatch ? '#10B981' : '#34D399';
        const roleText = node.isHost
          ? '● CENTRAL HOST'
          : isDropTarget
          ? 'DROP FILES HERE'
          : nodeBatch
          ? `SYNCING ${nodeBatch.progress}%`
          : '● PEER';
        ctx.fillText(roleText, node.x, node.y + node.radius + 20);

        ctx.restore();
      });

      ctx.restore();

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      isRunning = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [localPeer, hoveredNode, selectedNodeId, dropTargetNodeId, activeTransfers, activeBatches, activeCall]);

  const handleResetView = () => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  };

  const totalConnected = connectedPeers.size + (localPeer ? 1 : 0);

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[460px] bg-slate-950/80 backdrop-blur-xl rounded-3xl overflow-hidden border border-white/10 shadow-2xl flex flex-col select-none">
      {/* Top HUD Controls */}
      <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-3 bg-black/60 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-white/10 shadow-lg pointer-events-auto flex-wrap">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-accent animate-pulse" />
            <span className="text-xs font-semibold text-white tracking-wide">Nexus Mesh Topology</span>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/10 text-slate-300">
            {totalConnected} Active Node{totalConnected === 1 ? '' : 's'}
          </span>
          {hostId && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              Host: {hostId === localPeer.id ? 'You' : hostId.substring(0, 6)}
            </span>
          )}
          {activeCall && activeCall.active && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1 animate-pulse">
              {activeCall.callType === 'video' ? <Video className="w-3 h-3" /> : <Phone className="w-3 h-3" />}
              Live {activeCall.callType === 'video' ? 'Video' : 'Audio'}: {activeCall.callerName} ↔ {activeCall.targetName}
            </span>
          )}
        </div>

        {/* Viewport Zoom / Reset Controls */}
        <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md p-1.5 rounded-2xl border border-white/10 shadow-lg pointer-events-auto">
          <button
            onClick={() => setZoom(z => Math.min(2.5, z * 1.2))}
            className="p-1.5 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom(z => Math.max(0.35, z * 0.8))}
            className="p-1.5 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleResetView}
            className="p-1.5 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Reset View"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Interactive Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full flex-1 cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      />

      {/* Node Hover Card Tooltip */}
      {hoveredNode && (
        <div className="absolute bottom-4 left-4 z-20 bg-slate-900/90 backdrop-blur-md p-3 rounded-2xl border border-white/15 shadow-2xl pointer-events-none max-w-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2 mb-1.5">
            <div className={`w-3 h-3 rounded-full ${hoveredNode.isHost ? 'bg-blue-500' : 'bg-emerald-500'}`} />
            <span className="text-xs font-bold text-white">{hoveredNode.peer.username}</span>
            {hoveredNode.id === localPeer.id && (
              <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-1.5 rounded">Local</span>
            )}
            {hoveredNode.isHost && (
              <span className="text-[10px] font-mono text-blue-400 bg-blue-500/10 px-1.5 rounded">Host</span>
            )}
          </div>
          <div className="text-[11px] font-mono text-slate-400 space-y-0.5">
            <div>Peer ID: <span className="text-slate-200">{hoveredNode.id}</span></div>
            <div>Bypass Links: <span className="text-emerald-400">{hoveredNode.peer.bypassPeers?.length || 0} active</span></div>
            <div className="text-[10px] text-accent pt-1 flex items-center gap-1">
              <Zap className="w-3 h-3" />
              <span>Drag & drop files onto node to start batch transfer</span>
            </div>
          </div>
        </div>
      )}

      {/* Empty State Overlay when no external peers are connected */}
      {connectedPeers.size === 0 && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center text-accent mb-4 shadow-lg animate-pulse">
            <Radio className="w-8 h-8" />
          </div>
          <h3 className="text-sm font-semibold text-white mb-1">Waiting for Remote Peers</h3>
          <p className="text-xs text-slate-400 max-w-md">
            Your local node is actively connected to the WebSocket signaling hub. As other clients open this app or connect over the network, their nodes will organically spawn in this physics graph.
          </p>
        </div>
      )}

      {/* Drag & Drop Feedback Banner */}
      {dropTargetNodeId && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 bg-emerald-500/90 text-white px-4 py-2 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-medium animate-bounce pointer-events-none">
          <HardDrive className="w-4 h-4" />
          <span>Release to send files directly to {nodesRef.current.get(dropTargetNodeId)?.peer.username}!</span>
        </div>
      )}
    </div>
  );
};
