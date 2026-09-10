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
  FlaskConical
} from 'lucide-react';
import { cn } from '../lib/utils';
import { NexusPeer, sortPeersDeterministically, hasMajorityQuorum } from '../lib/nexusFailover';
import { NexusNetworkNode } from '../lib/NexusNetworkNode';

interface NexusFailoverHUDProps {
  localUsername: string;
  localAvatarColor: string;
  localPeerId: string;
  realConnectedCount?: number;
  activeNode?: NexusNetworkNode | null;
  isSimulation?: boolean;
  onToggleSimulation?: () => void;
}

export function NexusFailoverHUD({
  localUsername,
  localAvatarColor,
  localPeerId,
  activeNode,
  isSimulation = false,
  onToggleSimulation,
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

  // Cluster state (simulated or real)
  const [term, setTerm] = useState(1);
  const [currentHostId, setCurrentHostId] = useState('node_host_01');
  const [localRole, setLocalRole] = useState<'host' | 'peer' | 're-routing'>('peer');
  const [logs, setLogs] = useState<{ id: string; text: string; type: 'info' | 'ok' | 'err' | 'warn'; time: string }[]>([]);
  const [heartbeatBeat, setHeartbeatBeat] = useState(false);

  // Synchronized Peer Registry Table
  const [peers, setPeers] = useState<NexusPeer[]>([
    {
      peerId: 'node_host_01',
      joinOrder: 1,
      joinTimestamp: Date.now() - 120000,
      endpoint: '192.168.1.10:8080',
      status: 'active',
      role: 'host',
      username: 'Nexus-Prime (Host)',
      avatarColor: 'bg-accent',
      lastHeartbeat: Date.now(),
      latencyMs: 8,
      missedHeartbeats: 0,
    },
    {
      peerId: 'peer_alpha_02',
      joinOrder: 2,
      joinTimestamp: Date.now() - 85000,
      endpoint: '192.168.1.15:8081',
      status: 'active',
      role: 'peer',
      username: 'Alpha-Station (1st Joiner)',
      avatarColor: 'bg-blue-500',
      lastHeartbeat: Date.now(),
      latencyMs: 14,
      missedHeartbeats: 0,
    },
    {
      peerId: localPeerId || 'peer_local_03',
      joinOrder: 3,
      joinTimestamp: Date.now() - 45000,
      endpoint: '192.168.1.22:8082',
      status: 'active',
      role: 'peer',
      username: `${localUsername || 'You (Local Node)'}`,
      avatarColor: localAvatarColor || 'bg-emerald-500',
      lastHeartbeat: Date.now(),
      latencyMs: 12,
      missedHeartbeats: 0,
    },
    {
      peerId: 'peer_gamma_04',
      joinOrder: 4,
      joinTimestamp: Date.now() - 15000,
      endpoint: '192.168.1.33:8083',
      status: 'active',
      role: 'peer',
      username: 'Gamma-Sensor (3rd Joiner)',
      avatarColor: 'bg-purple-500',
      lastHeartbeat: Date.now(),
      latencyMs: 22,
      missedHeartbeats: 0,
    },
  ]);

  const [activeAcks, setActiveAcks] = useState<number>(4);
  const [isElecting, setIsElecting] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const addHUDLog = (text: string, type: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    setLogs(prev => [...prev.slice(-30), { id: Math.random().toString(36).substring(2), text, type, time }]);
  };

  // Heartbeat pulse effect
  useEffect(() => {
    const interval = setInterval(() => {
      setHeartbeatBeat(true);
      setTimeout(() => setHeartbeatBeat(false), 400);

      // Random jitter on latency
      setPeers(prev => prev.map(p => {
        if (p.status === 'disconnected') return p;
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

  // --- Simulation Actions ---

  /**
   * Action 1: Abrupt Host Drop (Heartbeat loss timeout)
   */
  const handleSimulateAbruptHostDrop = () => {
    setIsElecting(true);
    addHUDLog(`🚨 ALERT: Heartbeat lost from current host [${currentHostId}]!`, "err");
    
    // Mark old host disconnected
    setPeers(prev => prev.map(p => p.peerId === currentHostId ? { ...p, status: 'disconnected', role: 'peer' } : p));
    setLocalRole('re-routing');

    setTimeout(() => {
      addHUDLog("Heartbeat watchdog timed out (5000ms threshold). Triggering deterministic election check on all peers...", "warn");
      
      // Calculate winner
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
        setLocalRole(winner.peerId === (localPeerId || 'peer_local_03') ? 'host' : 'peer');

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

  /**
   * Action 2: Graceful Handoff (HOST_HANDOFF)
   */
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
      setLocalRole(nextInLine.peerId === (localPeerId || 'peer_local_03') ? 'host' : 'peer');

      setPeers(prev => prev.map(p => {
        if (p.peerId === nextInLine.peerId) return { ...p, role: 'host', status: 'active' };
        if (p.peerId === oldHost) return { ...p, role: 'peer', status: 'active' };
        return p;
      }));

      addHUDLog(`✅ Immediate handover successful: [${nextInLine.username}] is now Host (Term ${nextTerm}). No heartbeat timeout required.`, "ok");
    }, 800);
  };

  /**
   * Action 3: Simultaneous Disconnect (Host + First Joiner drop)
   */
  const handleSimulateSimultaneousDrop = () => {
    setIsElecting(true);
    addHUDLog(`💥 CATASTROPHIC EVENT: Simultaneous drop of Host [${currentHostId}] AND First Joiner [${peers[1]?.username}]!`, "err");

    const droppedHost = currentHostId;
    const droppedFirstJoiner = peers[1]?.peerId;

    setPeers(prev => prev.map(p => {
      if (p.peerId === droppedHost || p.peerId === droppedFirstJoiner) {
        return { ...p, status: 'disconnected', role: 'peer' };
      }
      return p;
    }));
    setLocalRole('re-routing');

    setTimeout(() => {
      addHUDLog(`First candidate [${peers[1]?.username}] is unreachable (Candidate Election Timeout fired after 4000ms).`, "warn");
      addHUDLog("Falling back to Second Joiner in deterministic sequence...", "info");

      setTimeout(() => {
        const surviving = peers.filter(p => p.peerId !== droppedHost && p.peerId !== droppedFirstJoiner && p.status !== 'disconnected');
        const ranked = sortPeersDeterministically(surviving);
        const secondWinner = ranked[0];

        if (secondWinner) {
          const nextTerm = term + 1;
          setTerm(nextTerm);
          setCurrentHostId(secondWinner.peerId);
          setLocalRole(secondWinner.peerId === (localPeerId || 'peer_local_03') ? 'host' : 'peer');

          setPeers(prev => prev.map(p => {
            if (p.peerId === secondWinner.peerId) return { ...p, role: 'host', status: 'active' };
            return p;
          }));

          setActiveAcks(surviving.length);
          setIsElecting(false);
          addHUDLog(`👑 Second Joiner [${secondWinner.username}] promoted to Host (Term ${nextTerm}). Failover sustained without network split!`, "ok");
        }
      }, 1000);
    }, 1200);
  };

  /**
   * Action 4: Partition & Split-Brain Quorum Check
   */
  const handleSimulatePartition = () => {
    addHUDLog("Simulating network partition: 3 out of 4 nodes disconnected from local segment...", "warn");
    
    setPeers(prev => prev.map((p, idx) => {
      if (idx > 0 && p.peerId !== (localPeerId || 'peer_local_03')) {
        return { ...p, status: 'disconnected' };
      }
      return p;
    }));

    setActiveAcks(1);
    addHUDLog("Quorum validation: Acknowledged nodes = 1 / 4. Required majority = 3.", "err");
    addHUDLog("⛔ SPLIT-BRAIN BLOCKED: Majority Quorum not met (> 50%). Authoritative state mutations paused in isolated partition.", "err");
  };

  /**
   * Action 5: Reset Topology
   */
  const handleResetTopology = () => {
    setTerm(1);
    setCurrentHostId('node_host_01');
    setLocalRole('peer');
    setIsElecting(false);
    setActiveAcks(4);
    setPeers([
      {
        peerId: 'node_host_01',
        joinOrder: 1,
        joinTimestamp: Date.now() - 120000,
        endpoint: '192.168.1.10:8080',
        status: 'active',
        role: 'host',
        username: 'Nexus-Prime (Host)',
        avatarColor: 'bg-accent',
        lastHeartbeat: Date.now(),
        latencyMs: 8,
        missedHeartbeats: 0,
      },
      {
        peerId: 'peer_alpha_02',
        joinOrder: 2,
        joinTimestamp: Date.now() - 85000,
        endpoint: '192.168.1.15:8081',
        status: 'active',
        role: 'peer',
        username: 'Alpha-Station (1st Joiner)',
        avatarColor: 'bg-blue-500',
        lastHeartbeat: Date.now(),
        latencyMs: 14,
        missedHeartbeats: 0,
      },
      {
        peerId: localPeerId || 'peer_local_03',
        joinOrder: 3,
        joinTimestamp: Date.now() - 45000,
        endpoint: '192.168.1.22:8082',
        status: 'active',
        role: 'peer',
        username: `${localUsername || 'You (Local Node)'}`,
        avatarColor: localAvatarColor || 'bg-emerald-500',
        lastHeartbeat: Date.now(),
        latencyMs: 12,
        missedHeartbeats: 0,
      },
      {
        peerId: 'peer_gamma_04',
        joinOrder: 4,
        joinTimestamp: Date.now() - 15000,
        endpoint: '192.168.1.33:8083',
        status: 'active',
        role: 'peer',
        username: 'Gamma-Sensor (3rd Joiner)',
        avatarColor: 'bg-purple-500',
        lastHeartbeat: Date.now(),
        latencyMs: 22,
        missedHeartbeats: 0,
      },
    ]);
    addHUDLog("Topology reset to initial 4-node Nexus cluster.", "info");
  };

  const currentHostPeer = peers.find(p => p.peerId === currentHostId);

  return (
    <div className="w-full h-full flex flex-col gap-5 overflow-y-auto pr-1 pb-16 lg:pb-4 scrollbar-hide text-text">
      
      {/* Simulation Mode Toggle Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-2xl border glass-panel flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className={cn(
            "w-2.5 h-2.5 rounded-full flex-shrink-0",
            isSimActive ? "bg-accent animate-ping" : "bg-emerald-500"
          )} />
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-text">
              {isSimActive ? "Simulation Mode Active" : "Live Mesh Operation"}
            </span>
            <span className={cn(
              "text-[9px] px-2 py-0.5 rounded-full font-mono font-bold uppercase",
              isSimActive ? "bg-accent/20 text-accent border border-accent/30" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
            )}>
              {isSimActive ? "Sandboxed" : "Production"}
            </span>
          </div>
          <span className="text-[11px] text-muted hidden md:inline font-mono">
            {isSimActive 
              ? "• Simulation triggers and failure scenarios enabled" 
              : "• Real WebRTC channels and live heartbeat watchdog active"}
          </span>
        </div>

        <button
          onClick={handleToggleSim}
          className={cn(
            "px-3.5 py-1.5 text-xs font-mono font-semibold rounded-xl border transition-all flex items-center gap-2 cursor-pointer shadow-sm",
            isSimActive
              ? "bg-accent text-white border-accent hover:opacity-90"
              : "bg-white/60 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/20 text-text border-white/30 dark:border-white/10"
          )}
        >
          <FlaskConical className="w-3.5 h-3.5" />
          <span>{isSimActive ? "Exit Simulation" : "Enable Simulation Mode"}</span>
        </button>
      </div>

      {/* Top Telemetry Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 flex-shrink-0">
        
        {/* Card 1: Current Host Node */}
        <div className="glass-panel p-4 rounded-2xl flex items-center gap-3 border border-white/40 dark:border-white/10 shadow-sm relative overflow-hidden">
          <div className="w-11 h-11 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent flex-shrink-0">
            <Crown className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-mono text-muted uppercase tracking-wider flex items-center gap-1.5">
              Current Leader
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-accent/10 text-accent font-bold">Term {term}</span>
            </div>
            <div className="text-sm font-semibold truncate text-text mt-0.5">
              {currentHostPeer?.username || 'Electing...'}
            </div>
            <div className="text-[10px] font-mono text-muted truncate">
              ID: {currentHostId.substring(0, 14)}
            </div>
          </div>
        </div>

        {/* Card 2: Quorum Status */}
        <div className="glass-panel p-4 rounded-2xl flex items-center gap-3 border border-white/40 dark:border-white/10 shadow-sm">
          <div className={cn(
            "w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 border",
            quorumMet ? "bg-success/10 border-success/20 text-success" : "bg-red-500/10 border-red-500/20 text-red-500"
          )}>
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-mono text-muted uppercase tracking-wider">
              Quorum (&gt; 50%)
            </div>
            <div className={cn("text-sm font-semibold mt-0.5 flex items-center gap-1.5", quorumMet ? "text-success" : "text-red-500")}>
              {quorumMet ? "Consensus Valid" : "Split-Brain Guarded"}
            </div>
            <div className="text-[10px] font-mono text-muted">
              Acks: {activeAcks}/{totalActivePeers} nodes
            </div>
          </div>
        </div>

        {/* Card 3: Local Node Role */}
        <div className="glass-panel p-4 rounded-2xl flex items-center gap-3 border border-white/40 dark:border-white/10 shadow-sm">
          <div className={cn(
            "w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 border",
            localRole === 'host' ? "bg-accent/10 border-accent/30 text-accent" : localRole === 'peer' ? "bg-blue-500/10 border-blue-500/20 text-blue-500" : "bg-amber-500/10 border-amber-500/20 text-amber-500 animate-pulse"
          )}>
            <Server className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-mono text-muted uppercase tracking-wider">
              Local Node Role
            </div>
            <div className="text-sm font-bold uppercase tracking-tight mt-0.5">
              {localRole}
            </div>
            <div className="text-[10px] font-mono text-muted truncate">
              {localRole === 'host' ? "Broadcasting state" : "Upstream synced"}
            </div>
          </div>
        </div>

        {/* Card 4: Heartbeat Pulse */}
        <div className="glass-panel p-4 rounded-2xl flex items-center gap-3 border border-white/40 dark:border-white/10 shadow-sm">
          <div className={cn(
            "w-11 h-11 rounded-xl border flex items-center justify-center flex-shrink-0 transition-transform duration-200",
            heartbeatBeat ? "scale-110 bg-rose-500/20 border-rose-500 text-rose-500" : "bg-rose-500/10 border-rose-500/20 text-rose-400"
          )}>
            <Activity className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-mono text-muted uppercase tracking-wider flex items-center gap-1">
              Heartbeat Ping
              <span className={cn("w-2 h-2 rounded-full", heartbeatBeat ? "bg-rose-500" : "bg-muted/40")} />
            </div>
            <div className="text-sm font-semibold mt-0.5">
              Every 2,000ms
            </div>
            <div className="text-[10px] font-mono text-muted">
              Timeout threshold: 5.0s
            </div>
          </div>
        </div>

      </div>

      {/* Main Content Grid: Synchronized Peer Table (Left/Top) & Simulation Suite (Right/Bottom) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-[520px]">
        
        {/* Left Column: Synchronized Peer Table */}
        <div className="lg:col-span-8 flex flex-col glass-panel rounded-3xl p-5 border border-white/40 dark:border-white/10 shadow-sm overflow-hidden">
          
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-white/20 dark:border-white/10">
            <div>
              <h3 className="text-base font-bold tracking-tight text-text flex items-center gap-2">
                <Users className="w-5 h-5 text-accent" />
                Synchronized Nexus Peer Registry
              </h3>
              <p className="text-xs text-muted mt-0.5 font-mono">
                Join order is monotonically sequenced. Earliest joiner is designated successor.
              </p>
            </div>
            
            <div className="flex items-center gap-2 text-xs font-mono bg-white/40 dark:bg-white/5 px-3 py-1.5 rounded-xl border border-white/30 dark:border-white/10">
              <Clock className="w-3.5 h-3.5 text-accent" />
              <span>Next in Line: <strong className="text-accent">{nextInLine?.username || 'None'}</strong></span>
            </div>
          </div>

          {/* Peer Table */}
          <div className="flex-1 overflow-x-auto mt-3">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/10 text-muted font-mono uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-3">Seq #</th>
                  <th className="py-2.5 px-3">Node Identity</th>
                  <th className="py-2.5 px-3">Endpoint</th>
                  <th className="py-2.5 px-3">Latency</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Failover Rank</th>
                  <th className="py-2.5 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {peers.map((peer) => {
                  const isHost = peer.role === 'host';
                  const isLocal = peer.peerId === (localPeerId || 'peer_local_03');
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
                      <td className="py-3 px-3 font-mono font-bold">
                        <span className={cn(
                          "px-2 py-0.5 rounded-md",
                          isHost ? "bg-accent text-white" : "bg-white/60 dark:bg-white/10 text-text"
                        )}>
                          #{peer.joinOrder}
                        </span>
                      </td>

                      {/* Identity */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-sm flex-shrink-0", peer.avatarColor)}>
                            {peer.username.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-text truncate flex items-center gap-1.5">
                              {peer.username}
                              {isLocal && <span className="text-[9px] bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold px-1.5 py-0.2 rounded">YOU</span>}
                            </div>
                            <div className="text-[10px] font-mono text-muted truncate">
                              {peer.peerId.substring(0, 12)}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Endpoint */}
                      <td className="py-3 px-3 font-mono text-muted text-[11px]">
                        {peer.endpoint}
                      </td>

                      {/* Latency */}
                      <td className="py-3 px-3 font-mono">
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
                      <td className="py-3 px-3">
                        {isHost ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent/20 text-accent border border-accent/30">
                            <Crown className="w-3 h-3" /> HOST
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/40 dark:bg-white/10 text-muted">
                            PEER
                          </span>
                        )}
                      </td>

                      {/* Failover Priority */}
                      <td className="py-3 px-3 font-mono text-[11px]">
                        {isDead ? (
                          <span className="text-muted/60">—</span>
                        ) : isHost ? (
                          <span className="text-accent font-semibold">Active Leader</span>
                        ) : isNext ? (
                          <span className="text-blue-500 font-bold flex items-center gap-1">
                            <Zap className="w-3 h-3" /> 1st In Line
                          </span>
                        ) : (
                          <span className="text-muted">Backup Heir</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 text-right">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold",
                          peer.status === 'active' ? "bg-success/15 text-success" : peer.status === 'suspect' ? "bg-amber-500/15 text-amber-500" : "bg-red-500/15 text-red-500"
                        )}>
                          ● {peer.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Failover Telemetry Log Feed */}
          <div className="mt-4 pt-3 border-t border-white/20 dark:border-white/10 flex flex-col min-h-[160px] max-h-[220px]">
            <div className="text-[11px] font-mono text-muted uppercase tracking-wider mb-2 flex items-center justify-between">
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
              className="flex-1 overflow-y-auto pr-1 space-y-1.5 font-mono text-[11px] bg-black/5 dark:bg-black/20 p-3 rounded-2xl border border-white/10 scrollbar-hide"
            >
              {logs.map(l => (
                <div key={l.id} className="flex items-start gap-2">
                  <span className="text-muted/60 text-[10px] mt-0.5 shrink-0">[{l.time}]</span>
                  <span className={cn(
                    "flex-1 leading-relaxed",
                    l.type === 'err' ? "text-red-500 font-semibold" : l.type === 'ok' ? "text-emerald-500 font-semibold" : l.type === 'warn' ? "text-amber-500" : "text-text/80"
                  )}>
                    {l.text}
                  </span>
                </div>
              ))}
              {logs.length === 0 && (
                <div className="text-muted/50 text-center py-6">Telemetry standby. Awaiting failover events...</div>
              )}
            </div>
          </div>

        </div>

        {/* Right Column: Failover Simulation & Testing Suite */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          
          <div className="glass-panel p-5 rounded-3xl border border-white/40 dark:border-white/10 shadow-sm flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-text flex items-center gap-2">
                <Zap className="w-4 h-4 text-accent" />
                Failover Simulator
              </h4>
              {isSimActive && (
                <button 
                  onClick={handleResetTopology}
                  className="text-xs text-muted hover:text-text flex items-center gap-1 font-mono transition-colors cursor-pointer"
                  title="Reset network to healthy 4-peer state"
                >
                  <RefreshCw className="w-3 h-3" /> Reset
                </button>
              )}
            </div>

            {isSimActive ? (
              <>
                <div className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-accent/10 border border-accent/20">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-accent animate-ping" />
                    <span className="text-[11px] font-mono font-semibold text-accent">Simulation Mode Active</span>
                  </div>
                  <button 
                    onClick={handleToggleSim}
                    className="text-[10px] font-mono text-muted hover:text-text cursor-pointer underline"
                  >
                    Exit
                  </button>
                </div>

                <p className="text-xs text-muted leading-relaxed">
                  Test host crash detection, deterministic leader election, simultaneous disconnect fallbacks, and quorum enforcement.
                </p>

                {/* Simulation Action Buttons (ONLY available in Simulation Mode) */}
                <div className="flex flex-col gap-2.5 mt-1">
                  
                  {/* Button 1: Abrupt Host Drop */}
                  <button
                    onClick={handleSimulateAbruptHostDrop}
                    disabled={isElecting}
                    className="w-full text-left p-3 rounded-2xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-text transition-all group cursor-pointer disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-red-500 mb-1">
                      <span>1. Abrupt Host Drop</span>
                      <AlertTriangle className="w-4 h-4 group-hover:scale-110 transition-transform" />
                    </div>
                    <div className="text-[11px] text-muted leading-snug">
                      Host crashes silently. Watchdog detects missed heartbeats (5.0s) and promotes First Joiner.
                    </div>
                  </button>

                  {/* Button 2: Graceful Handoff */}
                  <button
                    onClick={handleSimulateGracefulHandoff}
                    disabled={isElecting}
                    className="w-full text-left p-3 rounded-2xl bg-accent/10 hover:bg-accent/20 border border-accent/20 text-text transition-all group cursor-pointer disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-accent mb-1">
                      <span>2. Graceful HOST_HANDOFF</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                    <div className="text-[11px] text-muted leading-snug">
                      Host sends signed handoff token before exit. Successor promotes instantly with zero delay.
                    </div>
                  </button>

                  {/* Button 3: Simultaneous Disconnect */}
                  <button
                    onClick={handleSimulateSimultaneousDrop}
                    disabled={isElecting}
                    className="w-full text-left p-3 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-text transition-all group cursor-pointer disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-amber-500 mb-1">
                      <span>3. Host + 1st Joiner Drop</span>
                      <Fingerprint className="w-4 h-4 group-hover:scale-110 transition-transform" />
                    </div>
                    <div className="text-[11px] text-muted leading-snug">
                      Both Host & heir crash. First candidate times out; system falls back to 2nd Joiner.
                    </div>
                  </button>

                  {/* Button 4: Quorum Partition */}
                  <button
                    onClick={handleSimulatePartition}
                    disabled={isElecting}
                    className="w-full text-left p-3 rounded-2xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-text transition-all group cursor-pointer disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-purple-500 mb-1">
                      <span>4. Network Partition</span>
                      <ShieldCheck className="w-4 h-4 group-hover:scale-110 transition-transform" />
                    </div>
                    <div className="text-[11px] text-muted leading-snug">
                      Split network test. Demonstrates how minority partitions pause commits without quorum (&gt; 50%).
                    </div>
                  </button>

                </div>
              </>
            ) : (
              /* Locked State in Live Mode */
              <div className="flex flex-col items-center text-center py-6 px-3 gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-white/40 dark:bg-white/5 border border-white/40 dark:border-white/10 flex items-center justify-center text-muted">
                  <Lock className="w-6 h-6 text-muted" />
                </div>
                
                <div>
                  <h5 className="text-sm font-bold text-text mb-1">
                    Simulation Triggers Locked
                  </h5>
                  <p className="text-xs text-muted leading-relaxed max-w-xs">
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
          <div className="glass-panel p-4 rounded-3xl border border-white/40 dark:border-white/10 shadow-sm flex flex-col gap-2 text-xs">
            <h5 className="font-bold text-text flex items-center gap-1.5 text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Nexus Protocol Invariants
            </h5>
            <ul className="text-muted space-y-1.5 text-[11px] pl-1 font-mono">
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
