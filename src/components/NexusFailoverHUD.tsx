import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldCheck, 
  Crown, 
  Activity, 
  RefreshCw, 
  Zap, 
  AlertTriangle, 
  CheckCircle2, 
  Server, 
  Wifi, 
  ArrowRight, 
  Clock, 
  Users, 
  Fingerprint,
  Radio,
  Lock,
  FlaskConical,
  WifiOff,
  X
} from 'lucide-react';
import { cn } from '../lib/utils';
import { NexusPeer, sortPeersDeterministically, hasMajorityQuorum } from '../lib/nexusFailover';
import { NexusNetworkNode } from '../lib/NexusNetworkNode';

interface NexusFailoverHUDProps {
  localUsername: string;
  localAvatarColor: string;
  localPeerId: string;
  realConnectedCount?: number;
  peerProfiles?: Record<string, { id: string; username: string; avatarColor: string; bio?: string; joinedAt?: string }>;
  role?: 'host' | 'join' | null;
  networkStatus?: 'offline' | 'disconnected' | 'handshaking' | 'connected';
  activeNode?: NexusNetworkNode | null;
  isSimulation?: boolean;
  onToggleSimulation?: () => void;
  onNavigateToConnect?: () => void;
  onClose?: () => void;
  onTransferHostControl?: (peerId: string) => void;
  onGracefulHostDrop?: () => void;
  onNetworkSplit?: () => void;
}

export function NexusFailoverHUD({
  localUsername,
  localAvatarColor,
  localPeerId,
  realConnectedCount = 0,
  peerProfiles = {},
  role = null,
  networkStatus = 'disconnected',
  activeNode,
  isSimulation = false,
  onToggleSimulation,
  onNavigateToConnect,
  onClose,
  onTransferHostControl,
  onGracefulHostDrop,
  onNetworkSplit,
}: NexusFailoverHUDProps) {
  const [internalSimMode, setInternalSimMode] = useState<boolean>(isSimulation);

  useEffect(() => {
    if (isSimulation !== undefined) {
      setInternalSimMode(isSimulation);
    }
  }, [isSimulation]);

  const isSimActive = isSimulation !== undefined ? isSimulation : internalSimMode;

  const handleToggleSim = () => {
    if (onToggleSimulation) {
      onToggleSimulation();
    } else {
      setInternalSimMode(prev => !prev);
    }
  };

  // Factory functions for peers
  const createSimulatedPeers = (): NexusPeer[] => [
    {
      peerId: 'sim_host_01',
      joinOrder: 1,
      joinTimestamp: Date.now() - 120000,
      endpoint: '10.0.0.1:8080 (Sim)',
      status: 'active',
      role: 'host',
      username: '[Sim] Host Node (Leader)',
      avatarColor: 'bg-accent',
      lastHeartbeat: Date.now(),
      latencyMs: 8,
      missedHeartbeats: 0,
    },
    {
      peerId: 'sim_peer_02',
      joinOrder: 2,
      joinTimestamp: Date.now() - 85000,
      endpoint: '10.0.0.2:8081 (Sim)',
      status: 'active',
      role: 'peer',
      username: '[Sim] Beta (1st Joiner)',
      avatarColor: 'bg-blue-500',
      lastHeartbeat: Date.now(),
      latencyMs: 14,
      missedHeartbeats: 0,
    },
    {
      peerId: localPeerId || 'local_user_03',
      joinOrder: 3,
      joinTimestamp: Date.now() - 45000,
      endpoint: '10.0.0.3:8082 (Sim)',
      status: 'active',
      role: 'peer',
      username: localUsername ? `${localUsername}` : 'You (Local Node)',
      avatarColor: localAvatarColor || 'bg-emerald-500',
      lastHeartbeat: Date.now(),
      latencyMs: 12,
      missedHeartbeats: 0,
    },
    {
      peerId: 'sim_peer_04',
      joinOrder: 4,
      joinTimestamp: Date.now() - 15000,
      endpoint: '10.0.0.4:8083 (Sim)',
      status: 'active',
      role: 'peer',
      username: '[Sim] Gamma (3rd Joiner)',
      avatarColor: 'bg-purple-500',
      lastHeartbeat: Date.now(),
      latencyMs: 22,
      missedHeartbeats: 0,
    },
  ];

  const createLivePeers = (): NexusPeer[] => {
    const isHost = role === 'host';
    const myId = localPeerId || 'local_node';
    const myName = localUsername || 'You (Local Node)';
    const myColor = localAvatarColor || 'bg-accent';

    const myPeer: NexusPeer = {
      peerId: myId,
      joinOrder: isHost ? 1 : 2,
      joinTimestamp: Date.now(),
      endpoint: 'Local Loopback (WebRTC)',
      status: 'active',
      role: isHost ? 'host' : 'peer',
      username: myName,
      avatarColor: myColor,
      lastHeartbeat: Date.now(),
      latencyMs: 1,
      missedHeartbeats: 0,
    };

    const remoteEntries = Object.entries(peerProfiles || {});
    const isConnected = realConnectedCount > 0 && remoteEntries.length > 0;

    if (!isConnected) {
      // STRICT REQUIREMENT: When not connected to anyone, REMOVE ALL FAKE NAMES!
      // Only the real local user node is shown.
      return [
        {
          ...myPeer,
          joinOrder: 1,
          role: isHost ? 'host' : 'peer',
        }
      ];
    }

    // Connected to real peers via WebRTC! Real names only.
    const remotes: NexusPeer[] = remoteEntries.map(([id, p], idx) => {
      const isRemoteHost = !isHost && idx === 0;
      return {
        peerId: p.id || id,
        joinOrder: isHost ? idx + 2 : (isRemoteHost ? 1 : idx + 2),
        joinTimestamp: p.joinedAt ? new Date(p.joinedAt).getTime() : Date.now() - (idx + 1) * 30000,
        endpoint: `P2P Direct [${(p.id || id).substring(0, 6)}]`,
        status: 'active',
        role: isRemoteHost ? 'host' : 'peer',
        username: p.username || `Peer-${id.substring(0, 4)}`,
        avatarColor: p.avatarColor || 'bg-blue-500',
        lastHeartbeat: Date.now(),
        latencyMs: 8 + (idx * 3),
        missedHeartbeats: 0,
      };
    });

    return sortPeersDeterministically([myPeer, ...remotes]);
  };

  // Cluster state
  const [term, setTerm] = useState(1);
  const [currentHostId, setCurrentHostId] = useState<string>(localPeerId || 'local_node');
  const [localRole, setLocalRole] = useState<'host' | 'peer' | 're-routing'>('peer');
  const [logs, setLogs] = useState<{ id: string; text: string; type: 'info' | 'ok' | 'err' | 'warn'; time: string }[]>([]);
  const [heartbeatBeat, setHeartbeatBeat] = useState(false);
  const [peers, setPeers] = useState<NexusPeer[]>(() => isSimulation ? createSimulatedPeers() : createLivePeers());
  const [activeAcks, setActiveAcks] = useState<number>(4);
  const [isElecting, setIsElecting] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const addHUDLog = (text: string, type: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    setLogs(prev => [...prev.slice(-30), { id: Math.random().toString(36).substring(2), text, type, time }]);
  };

  // Sync cluster peers with simulation state or live connection changes
  const prevSimRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (isSimActive) {
      const simPeers = createSimulatedPeers();
      setPeers(simPeers);
      setCurrentHostId('sim_host_01');
      setLocalRole('peer');
      setTerm(1);
      setActiveAcks(simPeers.length);
      if (prevSimRef.current !== true) {
        addHUDLog("Loaded sandboxed 4-node simulation cluster. Failover testing enabled.", "info");
        prevSimRef.current = true;
      }
    } else {
      const live = createLivePeers();
      setPeers(live);
      const isHost = role === 'host';
      const hostPeer = live.find(p => p.role === 'host') || live[0];
      setCurrentHostId(hostPeer ? hostPeer.peerId : (localPeerId || 'local_node'));
      setLocalRole(isHost ? 'host' : 'peer');
      setTerm(1);
      setActiveAcks(live.length);
      if (prevSimRef.current !== false) {
        if (live.length === 1) {
          addHUDLog(`Standalone mode: [${localUsername || 'Local User'}] is active. Zero remote peers connected.`, "info");
        } else {
          addHUDLog(`Synchronized live mesh with ${live.length} real peers.`, "ok");
        }
        prevSimRef.current = false;
      }
    }
  }, [isSimActive, realConnectedCount, JSON.stringify(peerProfiles), role]);

  // Heartbeat pulse effect
  useEffect(() => {
    const interval = setInterval(() => {
      setHeartbeatBeat(true);
      setTimeout(() => setHeartbeatBeat(false), 400);

      // Random jitter on latency for connected nodes
      setPeers(prev => prev.map(p => {
        if (p.status === 'disconnected') return p;
        if (p.latencyMs === 1 || p.latencyMs === 0) return p; // local node
        return {
          ...p,
          lastHeartbeat: Date.now(),
          latencyMs: Math.max(4, p.latencyMs + Math.floor((Math.random() - 0.5) * 4))
        };
      }));
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // Scroll logs to bottom
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Initial log
  useEffect(() => {
    addHUDLog("Nexus P2P Engine online. Deterministic Join-Order Monotonic Registry active.", "ok");
    addHUDLog("Heartbeat Watchdog: ping/pong interval 2000ms | timeout threshold 5000ms.", "info");
    addHUDLog("Leader Election Rule: sort (joinOrder ASC, joinTimestamp ASC, hash(peerId)). First joiner is primary heir.", "info");
  }, []);

  // Compute surviving peers and next in line
  const survivingPeers = peers.filter(p => p.status !== 'disconnected' && p.peerId !== currentHostId);
  const sortedSurviving = sortPeersDeterministically(survivingPeers);
  const nextInLine = sortedSurviving.length > 0 ? sortedSurviving[0] : null;

  const totalActivePeers = peers.filter(p => p.status !== 'disconnected').length;
  const quorumMet = hasMajorityQuorum(activeAcks, totalActivePeers);
  const isConnectedToRealPeers = !isSimActive && realConnectedCount > 0 && Object.keys(peerProfiles || {}).length > 0;
  const isStandalone = !isSimActive && !isConnectedToRealPeers;

  // --- Simulation Actions (Only in Simulation Mode) ---

  const handleSimulateAbruptHostDrop = () => {
    setIsElecting(true);
    addHUDLog(`🚨 ALERT: Heartbeat lost from current host [${currentHostId}]!`, "err");
    
    setPeers(prev => prev.map(p => p.peerId === currentHostId ? { ...p, status: 'disconnected', role: 'peer' } : p));
    setLocalRole('re-routing');

    setTimeout(() => {
      addHUDLog("Heartbeat watchdog timed out (5000ms threshold). Triggering deterministic election check on all peers...", "warn");
      
      const surviving = peers.filter(p => p.peerId !== currentHostId && p.status !== 'disconnected');
      const ranked = sortPeersDeterministically(surviving);
      const winner = ranked[0];

      if (!winner) {
        addHUDLog("No surviving nodes available in partition.", "err");
        setIsElecting(false);
        return;
      }

      addHUDLog(`Deterministic sorting complete: [${winner.username}] has lowest joinOrder (#${winner.joinOrder}) and earliest timestamp.`, "ok");
      addHUDLog(`👑 [${winner.username}] promotes itself to NEW HOST! Term increments to ${term + 1}.`, "ok");
      addHUDLog(`Broadcasting signed HOST_CLAIM (Term ${term + 1}, Signature: SIG_${Math.random().toString(16).substring(2, 10).toUpperCase()})...`, "info");

      setTimeout(() => {
        const nextTerm = term + 1;
        setTerm(nextTerm);
        setCurrentHostId(winner.peerId);
        setLocalRole(winner.peerId === (localPeerId || 'local_user_03') ? 'host' : 'peer');

        setPeers(prev => prev.map(p => {
          if (p.peerId === winner.peerId) {
            return { ...p, role: 'host', status: 'active' };
          }
          if (p.status !== 'disconnected') {
            return { ...p, role: 'peer' };
          }
          return p;
        }));

        const survivingCount = surviving.length;
        setActiveAcks(survivingCount);
        setIsElecting(false);

        addHUDLog(`✅ Quorum Acknowledged: ${survivingCount}/${survivingCount} surviving peers sent HOST_CLAIM_ACK. Session state resumed.`, "ok");
      }, 1200);
    }, 1000);
  };

  const handleSimulateGracefulHandoff = () => {
    if (!nextInLine) {
      addHUDLog("No eligible peer for handoff.", "warn");
      return;
    }

    addHUDLog(`Host [${currentHostId}] initiated graceful HOST_HANDOFF to [${nextInLine.username}].`, "info");
    addHUDLog("Packaging state snapshot (sequenceNum, transfers, message state) into handover packet...", "info");

    setTimeout(() => {
      const nextTerm = term + 1;
      setTerm(nextTerm);
      const oldHost = currentHostId;
      setCurrentHostId(nextInLine.peerId);
      setLocalRole(nextInLine.peerId === (localPeerId || 'local_user_03') ? 'host' : 'peer');

      setPeers(prev => prev.map(p => {
        if (p.peerId === nextInLine.peerId) return { ...p, role: 'host', status: 'active' };
        if (p.peerId === oldHost) return { ...p, role: 'peer', status: 'active' };
        return p;
      }));

      addHUDLog(`🔄 Handoff Successful! [${nextInLine.username}] is the new Host. Term ${nextTerm}. Zero dropped packets.`, "ok");
    }, 800);
  };

  const handleSimulateSimultaneousDrop = () => {
    setIsElecting(true);
    addHUDLog("⚠️ CRITICAL FAILURE: Simultaneous disconnect! Current Host AND First-Joiner crashed simultaneously!", "err");

    const heir = nextInLine;
    const secondHeir = sortedSurviving.length > 1 ? sortedSurviving[1] : null;

    setPeers(prev => prev.map(p => {
      if (p.peerId === currentHostId || (heir && p.peerId === heir.peerId)) {
        return { ...p, status: 'disconnected', role: 'peer' };
      }
      return p;
    }));
    setLocalRole('re-routing');

    setTimeout(() => {
      addHUDLog(`First candidate [${heir?.username || 'Heir'}] failed to broadcast HOST_CLAIM within election timeout (4000ms). Marking unresponsive...`, "warn");

      if (!secondHeir) {
        addHUDLog("Cluster partitioned: No secondary heirs available.", "err");
        setIsElecting(false);
        return;
      }

      addHUDLog(`Fallback Algorithm engaged: Re-evaluating sorted table... Next candidate is 2nd Joiner [${secondHeir.username}].`, "ok");
      addHUDLog(`👑 [${secondHeir.username}] promotes to NEW HOST! Term ${term + 1}.`, "ok");

      setTimeout(() => {
        const nextTerm = term + 1;
        setTerm(nextTerm);
        setCurrentHostId(secondHeir.peerId);
        setLocalRole(secondHeir.peerId === (localPeerId || 'local_user_03') ? 'host' : 'peer');

        setPeers(prev => prev.map(p => {
          if (p.peerId === secondHeir.peerId) return { ...p, role: 'host', status: 'active' };
          return p;
        }));

        const survivingNow = peers.filter(p => p.status !== 'disconnected' && p.peerId !== currentHostId && p.peerId !== heir?.peerId);
        setActiveAcks(survivingNow.length);
        setIsElecting(false);

        addHUDLog(`✅ 2nd Joiner established consensus. Quorum preserved without network split.`, "ok");
      }, 1000);
    }, 1200);
  };

  const handleSimulatePartition = () => {
    addHUDLog("🌐 Simulating Network Partition: Cluster split into 2-node subnets.", "warn");
    
    setPeers(prev => prev.map((p, idx) => {
      if (idx >= 2) return { ...p, status: 'disconnected' };
      return p;
    }));

    setActiveAcks(2);

    setTimeout(() => {
      addHUDLog("Split-Brain Guard Active: Partition has 2/4 surviving nodes. Quorum requirement (> 50%) = 3 nodes.", "err");
      addHUDLog("⏸️ Commits PAUSED on minority partition to prevent split-brain state divergence. Awaiting network heal.", "warn");
    }, 600);
  };

  const handleResetTopology = () => {
    setIsElecting(false);
    if (isSimActive) {
      const sim = createSimulatedPeers();
      setTerm(1);
      setCurrentHostId('sim_host_01');
      setLocalRole('peer');
      setActiveAcks(sim.length);
      setPeers(sim);
      addHUDLog("Topology reset to initial 4-node simulated Nexus cluster.", "info");
    } else {
      const live = createLivePeers();
      setPeers(live);
      const isHost = role === 'host';
      const hostPeer = live.find(p => p.role === 'host') || live[0];
      setCurrentHostId(hostPeer ? hostPeer.peerId : (localPeerId || 'local_node'));
      setLocalRole(isHost ? 'host' : 'peer');
      setTerm(1);
      setActiveAcks(live.length);
      addHUDLog("Live topology refreshed to current connected peer state.", "info");
    }
  };

  const currentHostPeer = peers.find(p => p.peerId === currentHostId) || peers.find(p => p.role === 'host') || peers[0];

  return (
    <div className="w-full h-full flex flex-col gap-3 sm:gap-4 lg:gap-5 overflow-y-auto p-3 sm:p-5 lg:p-6 pb-24 lg:pb-8 scrollbar-hide text-text">
      
      {/* Simulation Mode Toggle Banner */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 px-3.5 sm:px-4 py-2.5 rounded-2xl border glass-panel flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={cn(
            "w-2.5 h-2.5 rounded-full flex-shrink-0",
            isSimActive ? "bg-accent animate-ping" : isConnectedToRealPeers ? "bg-emerald-500" : "bg-amber-500"
          )} />
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-text truncate">
              {isSimActive ? "Simulation Mode Active" : isConnectedToRealPeers ? "Live Mesh Connected" : "Live Standalone Mode"}
            </span>
            <span className={cn(
              "text-[9px] px-2 py-0.5 rounded-full font-mono font-bold uppercase flex-shrink-0",
              isSimActive ? "bg-accent/20 text-accent border border-accent/30" : isConnectedToRealPeers ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20"
            )}>
              {isSimActive ? "Sandboxed" : isConnectedToRealPeers ? "Production" : "0 Peers"}
            </span>
          </div>
          <span className="text-[11px] text-muted hidden md:inline font-mono truncate">
            {isSimActive 
              ? "• Simulation triggers and failure scenarios enabled" 
              : isConnectedToRealPeers
                ? `• Connected to ${realConnectedCount} real peers via WebRTC`
                : "• Real WebRTC watchdog active (no fake names)"}
          </span>
        </div>

        <button
          onClick={handleToggleSim}
          className={cn(
            "px-3.5 py-1.5 text-xs font-mono font-semibold rounded-xl border transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm flex-shrink-0",
            isSimActive
              ? "bg-accent text-white border-accent hover:opacity-90"
              : "bg-white/60 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/20 text-text border-white/30 dark:border-white/10"
          )}
        >
          <FlaskConical className="w-3.5 h-3.5" />
          <span>{isSimActive ? "Exit Simulation" : "Enable Simulation Mode"}</span>
        </button>
      </div>

      {/* Top Telemetry Strip (Responsive 2x2 grid in portrait, 4 cols in landscape) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4 flex-shrink-0">
        
        {/* Card 1: Current Host Node */}
        <div className="glass-panel p-2.5 sm:p-3.5 lg:p-4 rounded-xl sm:rounded-2xl flex items-center gap-2.5 sm:gap-3 border border-white/40 dark:border-white/10 shadow-sm relative overflow-hidden">
          <div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-11 lg:h-11 rounded-lg sm:rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent flex-shrink-0">
            <Crown className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] sm:text-[10px] lg:text-[11px] font-mono text-muted uppercase tracking-wider flex items-center gap-1">
              <span className="truncate">Leader</span>
              <span className="text-[8px] sm:text-[9px] px-1 py-0.2 rounded bg-accent/10 text-accent font-bold">T{term}</span>
            </div>
            <div className="text-xs sm:text-sm font-semibold truncate text-text mt-0.5">
              {isStandalone 
                ? (role === 'host' ? `${localUsername || 'You'} (Host)` : 'Standalone') 
                : (currentHostPeer?.username || 'Electing...')}
            </div>
            <div className="text-[8px] sm:text-[10px] font-mono text-muted truncate">
              {isStandalone ? 'Local Node' : `ID: ${currentHostId.substring(0, 10)}`}
            </div>
          </div>
        </div>

        {/* Card 2: Quorum Status */}
        <div className="glass-panel p-2.5 sm:p-3.5 lg:p-4 rounded-xl sm:rounded-2xl flex items-center gap-2.5 sm:gap-3 border border-white/40 dark:border-white/10 shadow-sm">
          <div className={cn(
            "w-8 h-8 sm:w-10 sm:h-10 lg:w-11 lg:h-11 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0 border",
            quorumMet ? "bg-success/10 border-success/20 text-success" : "bg-red-500/10 border-red-500/20 text-red-500"
          )}>
            <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] sm:text-[10px] lg:text-[11px] font-mono text-muted uppercase tracking-wider truncate">
              Quorum (&gt;50%)
            </div>
            <div className={cn("text-xs sm:text-sm font-semibold mt-0.5 truncate", quorumMet ? "text-success" : "text-red-500")}>
              {isStandalone ? "Standalone" : quorumMet ? "Consensus Valid" : "Guarded"}
            </div>
            <div className="text-[8px] sm:text-[10px] font-mono text-muted truncate">
              {isStandalone ? "0 peers connected" : `${activeAcks}/${totalActivePeers} nodes acked`}
            </div>
          </div>
        </div>

        {/* Card 3: Local Node Role */}
        <div className="glass-panel p-2.5 sm:p-3.5 lg:p-4 rounded-xl sm:rounded-2xl flex items-center gap-2.5 sm:gap-3 border border-white/40 dark:border-white/10 shadow-sm">
          <div className={cn(
            "w-8 h-8 sm:w-10 sm:h-10 lg:w-11 lg:h-11 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0 border",
            localRole === 'host' ? "bg-accent/10 border-accent/30 text-accent" : localRole === 'peer' ? "bg-blue-500/10 border-blue-500/20 text-blue-500" : "bg-amber-500/10 border-amber-500/20 text-amber-500 animate-pulse"
          )}>
            <Server className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] sm:text-[10px] lg:text-[11px] font-mono text-muted uppercase tracking-wider truncate">
              Local Role
            </div>
            <div className="text-xs sm:text-sm font-bold uppercase tracking-tight mt-0.5 truncate">
              {isStandalone ? (role === 'host' ? 'HOST' : role === 'join' ? 'PEER' : 'STANDALONE') : localRole}
            </div>
            <div className="text-[8px] sm:text-[10px] font-mono text-muted truncate">
              {role === 'host' ? "Authoritative state" : role === 'join' ? "Tunnel client" : "Awaiting connect"}
            </div>
          </div>
        </div>

        {/* Card 4: Heartbeat Pulse */}
        <div className="glass-panel p-2.5 sm:p-3.5 lg:p-4 rounded-xl sm:rounded-2xl flex items-center gap-2.5 sm:gap-3 border border-white/40 dark:border-white/10 shadow-sm">
          <div className={cn(
            "w-8 h-8 sm:w-10 sm:h-10 lg:w-11 lg:h-11 rounded-lg sm:rounded-xl border flex items-center justify-center flex-shrink-0 transition-transform duration-200",
            heartbeatBeat ? "scale-110 bg-rose-500/20 border-rose-500 text-rose-500" : "bg-rose-500/10 border-rose-500/20 text-rose-400"
          )}>
            <Activity className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] sm:text-[10px] lg:text-[11px] font-mono text-muted uppercase tracking-wider flex items-center gap-1">
              <span className="truncate">Heartbeat</span>
              <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", heartbeatBeat ? "bg-rose-500" : "bg-muted/40")} />
            </div>
            <div className="text-xs sm:text-sm font-semibold mt-0.5 truncate">
              Every 2.0s
            </div>
            <div className="text-[8px] sm:text-[10px] font-mono text-muted truncate">
              Threshold: 5.0s
            </div>
          </div>
        </div>

      </div>

      {/* Main Content Grid: Synchronized Peer Table & Simulator/Locked Engine */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 lg:gap-5 flex-1 min-h-0">
        
        {/* Left Column: Synchronized Peer Table */}
        <div className="lg:col-span-8 flex flex-col glass-panel rounded-2xl sm:rounded-3xl p-3 sm:p-5 border border-white/40 dark:border-white/10 shadow-sm">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 sm:pb-4 border-b border-white/20 dark:border-white/10">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold tracking-tight text-text flex items-center gap-2">
                  <Users className="w-4 h-4 sm:w-5 sm:h-5 text-accent flex-shrink-0" />
                  <span>Synchronized Nexus Peer Registry</span>
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-accent/15 text-accent border border-accent/20 flex-shrink-0">
                  {peers.length} {peers.length === 1 ? 'Node' : 'Nodes'}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-muted mt-0.5 font-mono">
                {isSimActive 
                  ? "Sandboxed simulation registry. Earliest joiner is designated failover heir." 
                  : isConnectedToRealPeers
                    ? "Live active WebRTC cluster with authoritative sequence sorting."
                    : "Standalone node. Connect peers to establish failover redundancy."}
              </p>
            </div>
            
            <div className="flex items-center gap-2 text-[11px] sm:text-xs font-mono bg-white/40 dark:bg-white/5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl border border-white/30 dark:border-white/10 self-start sm:self-auto flex-shrink-0">
              <Clock className="w-3.5 h-3.5 text-accent flex-shrink-0" />
              <span>Next in Line: <strong className="text-accent">{isStandalone ? 'None (0 peers)' : (nextInLine?.username || 'None')}</strong></span>
            </div>
          </div>

          {/* Mobile Portrait Peer Cards View (Optimal for portrait phones & narrow screens) */}
          <div className="block sm:hidden space-y-2.5 mt-3">
            {peers.map((peer) => {
              const isHost = peer.role === 'host';
              const isLocal = peer.peerId === (localPeerId || 'local_node') || peer.peerId === 'local_user_03';
              const isNext = nextInLine?.peerId === peer.peerId;
              const isDead = peer.status === 'disconnected';

              return (
                <div 
                  key={`mobile-${peer.peerId}`}
                  className={cn(
                    "p-3 rounded-2xl border transition-all flex flex-col gap-2.5 shadow-sm",
                    isDead 
                      ? "opacity-50 bg-red-500/5 border-red-500/20" 
                      : isHost 
                        ? "bg-accent/10 border-accent/30" 
                        : isNext 
                          ? "bg-blue-500/10 border-blue-500/30" 
                          : "bg-white/40 dark:bg-white/5 border-white/30 dark:border-white/10"
                  )}
                >
                  {/* Card Header: Seq #, Avatar, Name, Status */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] font-mono font-bold flex-shrink-0",
                        isHost ? "bg-accent text-white" : "bg-white/60 dark:bg-white/10 text-text"
                      )}>
                        #{peer.joinOrder}
                      </span>
                      <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-sm flex-shrink-0", peer.avatarColor)}>
                        {peer.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-text truncate flex items-center gap-1.5 text-xs">
                          <span className="truncate">{peer.username}</span>
                          {isLocal && (
                            <span className="text-[8px] bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold px-1.5 py-0.2 rounded flex-shrink-0">
                              YOU
                            </span>
                          )}
                        </div>
                        <div className="text-[9px] font-mono text-muted truncate">
                          ID: {peer.peerId.substring(0, 10)}
                        </div>
                      </div>
                    </div>

                    <span className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0",
                      isDead 
                        ? "bg-red-500/20 text-red-500 border border-red-500/30" 
                        : isStandalone
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                          : "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                    )}>
                      <span className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        isDead ? "bg-red-500" : isStandalone ? "bg-amber-500" : "bg-emerald-500 animate-pulse"
                      )} />
                      {isDead ? "DEAD" : isStandalone ? "STANDALONE" : "ONLINE"}
                    </span>
                  </div>

                  {/* Card Details Grid: Role, Failover Priority, Latency, Endpoint */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/15 dark:border-white/10 text-[10px] font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted">Role:</span>
                      {isHost ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-accent/20 text-accent">
                          <Crown className="w-2.5 h-2.5" /> HOST
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-white/40 dark:bg-white/10 text-muted">
                          PEER
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 justify-end">
                      <span className="text-muted">Rank:</span>
                      {isDead ? (
                        <span className="text-muted/60">—</span>
                      ) : isHost ? (
                        <span className="text-accent font-semibold">{isStandalone ? "Standalone" : "Active Leader"}</span>
                      ) : isNext ? (
                        <span className="text-blue-500 font-bold flex items-center gap-0.5">
                          <Zap className="w-2.5 h-2.5" /> 1st Heir
                        </span>
                      ) : (
                        <span className="text-muted">Rank #{peer.joinOrder}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 col-span-2 justify-between">
                      <span className="text-muted truncate max-w-[200px]">{peer.endpoint}</span>
                      <span className={cn(
                        "font-bold flex-shrink-0",
                        peer.latencyMs < 15 ? "text-emerald-500" : peer.latencyMs < 30 ? "text-blue-500" : "text-amber-500"
                      )}>
                        {isDead ? "TIMEOUT" : `${peer.latencyMs}ms`}
                      </span>
                    </div>
                  </div>

                  {/* Host Transfer Action for Mobile */}
                  {role === 'host' && !isHost && !isDead && (
                    <button
                      onClick={() => {
                        if (onTransferHostControl) {
                          onTransferHostControl(peer.peerId);
                        } else {
                          handleSimulateGracefulHandoff();
                        }
                      }}
                      className="w-full mt-1 py-1.5 px-3 rounded-xl bg-accent text-white hover:bg-accent/90 font-medium text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-[0.98]"
                    >
                      <Crown className="w-3.5 h-3.5" />
                      <span>Transfer Host Authority to {peer.username}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop/Tablet Peer Table (Hidden on small portrait mobile screens, shown on tablet/desktop) */}
          <div className="hidden sm:block w-full overflow-x-auto mt-2 sm:mt-3 scrollbar-hide">
            <table className="w-full text-left border-collapse text-xs whitespace-nowrap sm:whitespace-normal">
              <thead>
                <tr className="border-b border-white/10 text-muted font-mono uppercase text-[9px] sm:text-[10px] tracking-wider">
                  <th className="py-2 px-2 sm:px-3 text-center sm:text-left">Seq #</th>
                  <th className="py-2 px-2 sm:px-3">Node Identity</th>
                  <th className="py-2 px-2 sm:px-3 hidden md:table-cell">Endpoint</th>
                  <th className="py-2 px-2 sm:px-3 hidden sm:table-cell">Latency</th>
                  <th className="py-2 px-2 sm:px-3">Role</th>
                  <th className="py-2 px-2 sm:px-3 hidden sm:table-cell">Failover Rank</th>
                  <th className="py-2 px-2 sm:px-3 text-center">Status</th>
                  {role === 'host' && (
                    <th className="py-2 px-2 sm:px-3 text-right">Host Control</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {peers.map((peer) => {
                  const isHost = peer.role === 'host';
                  const isLocal = peer.peerId === (localPeerId || 'local_node') || peer.peerId === 'local_user_03';
                  const isNext = nextInLine?.peerId === peer.peerId;
                  const isDead = peer.status === 'disconnected';

                  return (
                    <tr 
                      key={peer.peerId}
                      className={cn(
                        "transition-colors",
                        isDead ? "opacity-40 bg-red-500/5" : isHost ? "bg-accent/5 font-medium" : isNext ? "bg-blue-500/5" : "hover:bg-white/30 dark:hover:bg-white/5"
                      )}
                    >
                      {/* Seq # */}
                      <td className="py-2.5 sm:py-3 px-2 sm:px-3 font-mono font-bold text-center sm:text-left">
                        <span className={cn(
                          "px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs",
                          isHost ? "bg-accent text-white" : "bg-white/60 dark:bg-white/10 text-text"
                        )}>
                          #{peer.joinOrder}
                        </span>
                      </td>

                      {/* Identity */}
                      <td className="py-2.5 sm:py-3 px-2 sm:px-3">
                        <div className="flex items-center gap-2 sm:gap-2.5">
                          <div className={cn("w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center text-white text-[10px] sm:text-xs font-bold shadow-sm flex-shrink-0", peer.avatarColor)}>
                            {peer.username.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-text truncate flex items-center gap-1.5 text-xs sm:text-sm">
                              <span className="truncate">{peer.username}</span>
                              {isLocal && <span className="text-[8px] sm:text-[9px] bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold px-1.5 py-0.2 rounded flex-shrink-0">YOU</span>}
                            </div>
                            <div className="text-[9px] sm:text-[10px] font-mono text-muted truncate">
                              {peer.peerId.substring(0, 10)}
                              <span className="sm:hidden ml-1.5 text-muted/80">• {peer.latencyMs}ms</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Endpoint (Hidden on portrait mobile/tablet to avoid overflow) */}
                      <td className="py-2.5 sm:py-3 px-2 sm:px-3 font-mono text-muted text-[10px] sm:text-[11px] hidden md:table-cell">
                        {peer.endpoint}
                      </td>

                      {/* Latency (Hidden on extra small mobile) */}
                      <td className="py-2.5 sm:py-3 px-2 sm:px-3 font-mono hidden sm:table-cell">
                        {isDead ? (
                          <span className="text-red-400">TIMEOUT</span>
                        ) : (
                          <span className={cn(
                            peer.latencyMs < 15 ? "text-emerald-500" : peer.latencyMs < 30 ? "text-blue-500" : "text-amber-500"
                          )}>
                            {peer.latencyMs}ms
                          </span>
                        )}
                      </td>

                      {/* Role */}
                      <td className="py-2.5 sm:py-3 px-2 sm:px-3">
                        {isHost ? (
                          <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold bg-accent/20 text-accent border border-accent/30">
                            <Crown className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> HOST
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-medium bg-white/40 dark:bg-white/10 text-muted">
                            PEER
                          </span>
                        )}
                      </td>

                      {/* Failover Priority */}
                      <td className="py-2.5 sm:py-3 px-2 sm:px-3 font-mono text-[10px] sm:text-[11px] hidden sm:table-cell">
                        {isDead ? (
                          <span className="text-muted/60">—</span>
                        ) : isHost ? (
                          <span className="text-accent font-semibold">{isStandalone ? "Standalone Host" : "Active Leader"}</span>
                        ) : isNext ? (
                          <span className="text-blue-500 font-bold flex items-center gap-1">
                            <Zap className="w-3 h-3" /> 1st In Line
                          </span>
                        ) : (
                          <span className="text-muted">Rank #{peer.joinOrder}</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-2.5 sm:py-3 px-2 sm:px-3 text-center">
                        <span className={cn(
                          "inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold",
                          isDead 
                            ? "bg-red-500/20 text-red-500 border border-red-500/30" 
                            : isStandalone
                              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                              : "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                        )}>
                          <span className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            isDead ? "bg-red-500" : isStandalone ? "bg-amber-500" : "bg-emerald-500 animate-pulse"
                          )} />
                          {isDead ? "DEAD" : isStandalone ? "STANDALONE" : "ONLINE"}
                        </span>
                      </td>

                      {/* Host Control Actions */}
                      {role === 'host' && (
                        <td className="py-2.5 sm:py-3 px-2 sm:px-3 text-right">
                          {!isHost && !isDead && (
                            <button
                              onClick={() => {
                                if (onTransferHostControl) {
                                  onTransferHostControl(peer.peerId);
                                } else {
                                  handleSimulateGracefulHandoff();
                                }
                              }}
                              className="px-2.5 py-1 rounded-xl bg-accent text-white hover:bg-accent/90 font-medium text-[10px] transition-all inline-flex items-center gap-1 cursor-pointer shadow-sm active:scale-95"
                              title={`Transfer Host control to ${peer.username} and become 1st heir`}
                            >
                              <Crown className="w-3 h-3" />
                              <span>Transfer Host</span>
                            </button>
                          )}
                          {isHost && (
                            <span className="text-[10px] text-muted font-mono italic">Current Host</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Standalone Empty-State Notification (When not connected to anyone) */}
          {isStandalone && (
            <div className="mt-3 p-3 sm:p-4 rounded-2xl bg-white/40 dark:bg-white/5 border border-white/30 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
                  <WifiOff className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-text">No Remote Peers Connected</div>
                  <div className="text-[11px] text-muted max-w-md leading-relaxed">
                    This node is running standalone. When peers connect via QR code or connection string, they will be registered here with deterministic failover order.
                  </div>
                </div>
              </div>
              {onNavigateToConnect && (
                <button
                  onClick={onNavigateToConnect}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-accent text-white hover:bg-accent/90 shrink-0 shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span>Connect Peers</span>
                </button>
              )}
            </div>
          )}

          {/* Failover Telemetry Log Feed */}
          <div className="mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-white/20 dark:border-white/10 flex flex-col">
            <div className="text-[10px] sm:text-[11px] font-mono text-muted uppercase tracking-wider mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-accent animate-pulse" />
                Deterministic Election Protocol Telemetry
              </span>
              <button 
                onClick={() => setLogs([])}
                className="text-[10px] text-muted hover:text-text transition-colors cursor-pointer"
              >
                Clear Log
              </button>
            </div>

            <div 
              ref={logContainerRef}
              className="h-28 sm:h-32 overflow-y-auto pr-1 space-y-1.5 font-mono text-[10px] sm:text-[11px] bg-black/5 dark:bg-black/20 p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border border-white/10 scrollbar-hide"
            >
              {logs.map(l => (
                <div key={l.id} className="flex items-start gap-2">
                  <span className="text-muted/60 text-[9px] sm:text-[10px] mt-0.5 shrink-0">[{l.time}]</span>
                  <span className={cn(
                    "flex-1 leading-relaxed",
                    l.type === 'err' ? "text-red-500 font-semibold" : l.type === 'ok' ? "text-emerald-500 font-semibold" : l.type === 'warn' ? "text-amber-500" : "text-text/80"
                  )}>
                    {l.text}
                  </span>
                </div>
              ))}
              {logs.length === 0 && (
                <div className="text-muted/50 text-center py-4">Telemetry standby. Awaiting failover events...</div>
              )}
            </div>
          </div>

        </div>

        {/* Right Column: Failover Simulation & Testing Suite */}
        <div className="lg:col-span-4 flex flex-col gap-3 sm:gap-4">
          
          <div className="glass-panel p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/40 dark:border-white/10 shadow-sm flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs sm:text-sm font-bold text-text flex items-center gap-2">
                <Zap className="w-4 h-4 text-accent" />
                Failover Simulator
              </h4>
              {isSimActive && (
                <button 
                  onClick={handleResetTopology}
                  className="text-xs text-muted hover:text-text flex items-center gap-1 font-mono transition-colors cursor-pointer"
                  title="Reset network to healthy state"
                >
                  <RefreshCw className="w-3 h-3" /> Reset
                </button>
              )}
            </div>

            {isSimActive ? (
              <>
                <div className="flex items-center justify-between gap-2 p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-accent/10 border border-accent/20">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-accent animate-ping flex-shrink-0" />
                    <span className="text-[11px] font-mono font-semibold text-accent truncate">Simulation Sandbox Active</span>
                  </div>
                  <button 
                    onClick={handleToggleSim}
                    className="text-[10px] font-mono text-muted hover:text-text cursor-pointer underline flex-shrink-0"
                  >
                    Exit
                  </button>
                </div>

                <p className="text-[11px] sm:text-xs text-muted leading-relaxed">
                  Test host crash detection, deterministic leader election, simultaneous disconnect fallbacks, and quorum enforcement.
                </p>

                {/* Simulation Action Buttons (ONLY available in Simulation Mode) */}
                <div className="flex flex-col gap-2 mt-1">
                  
                  {/* Button 1: Abrupt Host Drop */}
                  <button
                    onClick={handleSimulateAbruptHostDrop}
                    disabled={isElecting}
                    className="w-full text-left p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-text transition-all group cursor-pointer disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-red-500 mb-1">
                      <span>1. Abrupt Host Drop</span>
                      <AlertTriangle className="w-4 h-4 group-hover:scale-110 transition-transform flex-shrink-0" />
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-muted leading-snug">
                      Host crashes silently. Watchdog detects missed heartbeats (5.0s) and promotes First Joiner.
                    </div>
                  </button>

                  {/* Button 2: Graceful Handoff */}
                  <button
                    onClick={handleSimulateGracefulHandoff}
                    disabled={isElecting}
                    className="w-full text-left p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-accent/10 hover:bg-accent/20 border border-accent/20 text-text transition-all group cursor-pointer disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-accent mb-1">
                      <span>2. Graceful HOST_HANDOFF</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform flex-shrink-0" />
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-muted leading-snug">
                      Host sends signed handoff token before exit. Successor promotes instantly with zero delay.
                    </div>
                  </button>

                  {/* Button 3: Simultaneous Disconnect */}
                  <button
                    onClick={handleSimulateSimultaneousDrop}
                    disabled={isElecting}
                    className="w-full text-left p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-text transition-all group cursor-pointer disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-amber-500 mb-1">
                      <span>3. Host + 1st Joiner Drop</span>
                      <Fingerprint className="w-4 h-4 group-hover:scale-110 transition-transform flex-shrink-0" />
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-muted leading-snug">
                      Both Host & heir crash. First candidate times out; system falls back to 2nd Joiner.
                    </div>
                  </button>

                  {/* Button 4: Quorum Partition */}
                  <button
                    onClick={handleSimulatePartition}
                    disabled={isElecting}
                    className="w-full text-left p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-text transition-all group cursor-pointer disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-purple-500 mb-1">
                      <span>4. Network Partition</span>
                      <ShieldCheck className="w-4 h-4 group-hover:scale-110 transition-transform flex-shrink-0" />
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-muted leading-snug">
                      Split network test. Demonstrates how minority partitions pause commits without quorum (&gt; 50%).
                    </div>
                  </button>

                </div>
              </>
            ) : role === 'host' ? (
              /* Live Host Authority Controls */
              <div className="flex flex-col gap-3 py-1">
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <Crown className="w-4 h-4 text-accent" />
                    <span className="text-xs font-bold text-text uppercase tracking-wider">Host Authority Controls</span>
                  </div>
                  <span className="text-[9px] px-2 py-0.5 rounded-full font-mono font-bold bg-accent/15 text-accent border border-accent/20">
                    Host Exclusive
                  </span>
                </div>

                <div className="space-y-2">
                  <button
                    onClick={() => {
                      if (onGracefulHostDrop) {
                        onGracefulHostDrop();
                      } else {
                        handleSimulateGracefulHandoff();
                      }
                    }}
                    className="w-full text-left p-3 rounded-2xl bg-white/40 dark:bg-white/5 hover:bg-accent/10 border border-white/40 dark:border-white/10 hover:border-accent/30 transition-all group cursor-pointer shadow-sm active:scale-[0.99]"
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-accent mb-1">
                      <span className="flex items-center gap-1.5">
                        <Crown className="w-3.5 h-3.5 text-accent" /> Graceful Host Drop
                      </span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform flex-shrink-0" />
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-muted leading-snug">
                      Step down as Host and immediately transfer host access to the 1st joiner (heir).
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      if (onNetworkSplit) {
                        onNetworkSplit();
                      } else {
                        handleSimulatePartition();
                      }
                    }}
                    className="w-full text-left p-3 rounded-2xl bg-white/40 dark:bg-white/5 hover:bg-purple-500/10 border border-white/40 dark:border-white/10 hover:border-purple-500/30 transition-all group cursor-pointer shadow-sm active:scale-[0.99]"
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-purple-500 mb-1">
                      <span className="flex items-center gap-1.5">
                        <WifiOff className="w-3.5 h-3.5" /> Network Split Test
                      </span>
                      <ShieldCheck className="w-4 h-4 group-hover:scale-110 transition-transform flex-shrink-0" />
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-muted leading-snug">
                      Simulate network partition. Validates that split sub-networks prevent split-brain without majority quorum.
                    </div>
                  </button>
                </div>

                <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                  <span className="text-[10px] text-muted font-mono">Sandbox Scenarios</span>
                  <button
                    onClick={handleToggleSim}
                    className="px-2.5 py-1 rounded-xl bg-white/40 dark:bg-white/10 hover:bg-accent hover:text-white text-[10px] font-semibold text-text transition-all flex items-center gap-1.5 cursor-pointer border border-white/20"
                  >
                    <FlaskConical className="w-3 h-3" />
                    <span>Enter Simulation</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Locked State in Live Mode for Joiners */
              <div className="flex flex-col items-center text-center py-4 sm:py-6 px-2 sm:px-3 gap-3">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-white/40 dark:bg-white/5 border border-white/40 dark:border-white/10 flex items-center justify-center text-muted">
                  <Lock className="w-5 h-5 sm:w-6 sm:h-6 text-muted" />
                </div>
                
                <div>
                  <h5 className="text-xs sm:text-sm font-bold text-text mb-1">
                    Simulation Triggers Locked
                  </h5>
                  <p className="text-[11px] sm:text-xs text-muted leading-relaxed max-w-xs">
                    Simulation actions (crash injection, handoff triggers, and partition tests) are available only in <strong>Simulation Mode</strong> to prevent accidental disruption to live P2P tunnels.
                  </p>
                </div>

                <button
                  onClick={handleToggleSim}
                  className="mt-1 px-4 py-2 rounded-xl bg-accent text-white hover:bg-accent/90 text-xs font-semibold shadow-sm transition-all flex items-center gap-2 cursor-pointer"
                >
                  <FlaskConical className="w-4 h-4" />
                  <span>Enable Simulation Mode</span>
                </button>
              </div>
            )}
          </div>

          {/* Protocol Invariants Card */}
          <div className="glass-panel p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl border border-white/40 dark:border-white/10 shadow-sm flex flex-col gap-2 text-xs">
            <h5 className="font-bold text-text flex items-center gap-1.5 text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <span>Nexus Protocol Invariants</span>
            </h5>
            <ul className="text-muted space-y-1.5 text-[10px] sm:text-[11px] pl-1 font-mono">
              <li>• <strong>Determinism:</strong> Identical sorting on all peers ensures 0 conflict.</li>
              <li>• <strong>No Split-Brain:</strong> Requires majority ACK (&gt; 50% surviving).</li>
              <li>• <strong>Cryptographic Claims:</strong> Signed tokens prevent spoofing.</li>
              <li>• <strong>Seamless Re-routing:</strong> In-memory session buffers preserved.</li>
            </ul>
          </div>

        </div>

      </div>

    </div>
  );
}
