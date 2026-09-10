import {
  NexusPeer,
  NexusWireMessage,
  NexusNodeRole,
  NexusStateSnapshot,
  sortPeersDeterministically,
  electDeterministicLeader,
  hasMajorityQuorum,
  generateClaimSignature,
  verifyClaimSignature
} from './nexusFailover';

export interface NexusNodeConfig {
  peerId: string;
  username: string;
  avatarColor: string;
  endpoint?: string;
  heartbeatIntervalMs?: number; // default: 2000ms
  heartbeatTimeoutMs?: number;  // default: 5000ms
  electionTimeoutMs?: number;   // default: 4000ms
  maxMissedHeartbeats?: number; // default: 3
}

export type NexusEventListener<T = any> = (payload: T) => void;

export class NexusNetworkNode {
  public config: Required<NexusNodeConfig>;
  public role: NexusNodeRole = 'peer';
  public term: number = 1;
  public currentHostId: string = '';
  public peerTable: Map<string, NexusPeer> = new Map();
  public nextJoinOrder: number = 1;
  public authoritativeState: NexusStateSnapshot;

  // Election and quorum state
  public pendingHostClaim: {
    term: number;
    candidateId: string;
    receivedAcks: Set<string>;
    quorumAchieved: boolean;
  } | null = null;

  // Unreachable peers tracked during elections (for simultaneous drop handling)
  private unreachablePeers: Set<string> = new Set();

  // Timers
  private heartbeatIntervalTimer: any = null;
  private heartbeatWatchdogTimer: any = null;
  private electionTimeoutTimer: any = null;

  // Transport hook: plugged into RTCDatachannel or internal message bus
  public onSendMessage?: (targetPeerId: string | 'broadcast', message: NexusWireMessage) => void;

  // Event subscribers
  private listeners: Map<string, Set<NexusEventListener>> = new Map();

  constructor(config: NexusNodeConfig) {
    this.config = {
      peerId: config.peerId,
      username: config.username,
      avatarColor: config.avatarColor,
      endpoint: config.endpoint || 'webrtc-p2p',
      heartbeatIntervalMs: config.heartbeatIntervalMs ?? 2000,
      heartbeatTimeoutMs: config.heartbeatTimeoutMs ?? 5000,
      electionTimeoutMs: config.electionTimeoutMs ?? 4000,
      maxMissedHeartbeats: config.maxMissedHeartbeats ?? 3,
    };

    this.authoritativeState = {
      term: 1,
      sequenceNumber: 0,
      roomName: 'Nexus-Station',
      customData: { topic: 'Secure Matrix Link' },
      timestamp: Date.now(),
    };
  }

  // --- Event Emitter ---
  public on(event: string, listener: NexusEventListener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return () => this.listeners.get(event)?.delete(listener);
  }

  public emit(event: string, payload: any) {
    this.listeners.get(event)?.forEach(fn => {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[NexusNode] Error in listener for ${event}:`, err);
      }
    });
  }

  private log(text: string, level: 'info' | 'ok' | 'err' | 'warn' = 'info') {
    this.emit('log', {
      text: `[${this.config.username}] ${text}`,
      type: level,
      timestamp: new Date(),
    });
  }

  // --- Initializers ---

  /**
   * Initializes the node as the original network Host
   */
  public initializeAsHost() {
    this.role = 'host';
    this.currentHostId = this.config.peerId;
    this.term = 1;
    this.nextJoinOrder = 2; // host takes #1

    const hostPeer: NexusPeer = {
      peerId: this.config.peerId,
      joinOrder: 1,
      joinTimestamp: Date.now(),
      endpoint: this.config.endpoint,
      status: 'active',
      role: 'host',
      username: this.config.username,
      avatarColor: this.config.avatarColor,
      lastHeartbeat: Date.now(),
      latencyMs: 0,
      missedHeartbeats: 0,
    };

    this.peerTable.clear();
    this.peerTable.set(this.config.peerId, hostPeer);
    this.unreachablePeers.clear();

    this.startHeartbeatBroadcaster();
    this.emit('role-change', { role: 'host', term: this.term });
    this.emit('peer-table-updated', this.getSortedPeers());
    this.log(`Initialized as Nexus Network Host (Term: ${this.term})`, 'ok');
  }

  /**
   * Initializes the node as a regular Peer joining a host
   */
  public initializeAsPeer(hostId: string) {
    this.role = 'peer';
    this.currentHostId = hostId;
    this.stopHeartbeatBroadcaster();
    this.startHeartbeatWatchdog();

    this.emit('role-change', { role: 'peer', term: this.term });
    this.log(`Joined Nexus Session under Host [${hostId}]`, 'info');
  }

  // --- Peer Table Operations ---

  /**
   * Called by the Host when a new peer establishes a WebRTC connection.
   * Deterministically assigns a monotonic joinOrder sequence.
   */
  public registerNewPeer(peerId: string, username: string, avatarColor: string, endpoint: string = 'p2p'): NexusPeer {
    if (this.role !== 'host') {
      throw new Error("Only authoritative Host can register new peers");
    }

    const assignedOrder = this.nextJoinOrder++;
    const newPeer: NexusPeer = {
      peerId,
      joinOrder: assignedOrder,
      joinTimestamp: Date.now(),
      endpoint,
      status: 'active',
      role: 'peer',
      username,
      avatarColor,
      lastHeartbeat: Date.now(),
      latencyMs: 0,
      missedHeartbeats: 0,
    };

    this.peerTable.set(peerId, newPeer);
    this.broadcastPeerTable();
    this.emit('peer-table-updated', this.getSortedPeers());
    this.log(`Assigned monotonic Join Order #${assignedOrder} to peer [${username}]`, 'ok');
    return newPeer;
  }

  /**
   * Broadcasts the full synchronized peer table to all peers
   */
  public broadcastPeerTable() {
    if (this.role !== 'host') return;

    const peersArray = Array.from(this.peerTable.values());
    const msg: NexusWireMessage = {
      type: 'NEXUS_PEER_TABLE_SYNC',
      term: this.term,
      peers: peersArray,
      nextJoinOrder: this.nextJoinOrder,
    };

    this.broadcast(msg);
  }

  public getSortedPeers(): NexusPeer[] {
    return sortPeersDeterministically(Array.from(this.peerTable.values()));
  }

  // --- Heartbeat & Failure Watchdog ---

  /**
   * Host sends periodic HEARTBEAT_PING to all connected peers
   */
  private startHeartbeatBroadcaster() {
    this.stopHeartbeatBroadcaster();
    this.stopHeartbeatWatchdog();

    this.heartbeatIntervalTimer = setInterval(() => {
      if (this.role !== 'host') return;

      const now = Date.now();
      // Check for dead peers on host side
      this.peerTable.forEach(peer => {
        if (peer.peerId === this.config.peerId) return;

        if (now - peer.lastHeartbeat > this.config.heartbeatTimeoutMs) {
          peer.missedHeartbeats++;
          if (peer.missedHeartbeats >= this.config.maxMissedHeartbeats && peer.status !== 'disconnected') {
            peer.status = 'disconnected';
            this.log(`Peer [${peer.username}] missed heartbeats. Marked disconnected.`, 'warn');
            this.broadcastPeerTable();
            this.emit('peer-table-updated', this.getSortedPeers());
          }
        }
      });

      const pingMsg: NexusWireMessage = {
        type: 'NEXUS_HEARTBEAT_PING',
        term: this.term,
        hostId: this.config.peerId,
        timestamp: now,
        peerCount: this.peerTable.size,
        tableDigest: `T${this.term}:N${this.peerTable.size}`,
      };

      this.broadcast(pingMsg);
    }, this.config.heartbeatIntervalMs);
  }

  private stopHeartbeatBroadcaster() {
    if (this.heartbeatIntervalTimer) {
      clearInterval(this.heartbeatIntervalTimer);
      this.heartbeatIntervalTimer = null;
    }
  }

  /**
   * Peers monitor the host's heartbeat. If no ping received within heartbeatTimeoutMs,
   * trigger local election check.
   */
  private startHeartbeatWatchdog() {
    this.stopHeartbeatWatchdog();

    this.heartbeatWatchdogTimer = setInterval(() => {
      if (this.role === 'host') return;

      const hostPeer = this.peerTable.get(this.currentHostId);
      const lastContact = hostPeer ? hostPeer.lastHeartbeat : 0;
      const elapsed = Date.now() - lastContact;

      if (lastContact > 0 && elapsed > this.config.heartbeatTimeoutMs) {
        this.log(`Host heartbeat lost (No response for ${(elapsed / 1000).toFixed(1)}s). Triggering failover election...`, 'err');
        this.handleHostDropped('heartbeat_timeout');
      }
    }, 1000);
  }

  private stopHeartbeatWatchdog() {
    if (this.heartbeatWatchdogTimer) {
      clearInterval(this.heartbeatWatchdogTimer);
      this.heartbeatWatchdogTimer = null;
    }
  }

  // --- Deterministic Leader Election ---

  /**
   * Host dropped or timed out: compute deterministic new leader
   */
  public handleHostDropped(reason: 'heartbeat_timeout' | 'handoff' | 'disconnect') {
    const droppedHostId = this.currentHostId;
    if (droppedHostId && this.peerTable.has(droppedHostId)) {
      const p = this.peerTable.get(droppedHostId)!;
      p.status = 'disconnected';
    }

    this.stopHeartbeatWatchdog();

    // Run deterministic election
    this.executeElection(droppedHostId, reason);
  }

  private executeElection(droppedHostId: string, triggerReason: string) {
    const election = electDeterministicLeader(
      Array.from(this.peerTable.values()),
      droppedHostId,
      this.config.peerId,
      this.unreachablePeers
    );

    this.log(`Running deterministic leader election among ${election.rankedCandidates.length} surviving peers...`, 'info');

    if (!election.topCandidate) {
      this.log("No surviving candidates in network table. Network isolated.", 'err');
      this.role = 're-routing';
      this.emit('role-change', { role: 're-routing', term: this.term });
      return;
    }

    const { topCandidate, isLocalElected } = election;

    if (isLocalElected) {
      // We are the longest-standing active peer! Promote self to HOST immediately.
      this.promoteSelfToHost(droppedHostId, triggerReason);
    } else {
      // Another peer is older. Transition to 'electing' / 're-routing' state and await HOST_CLAIM.
      this.role = 're-routing';
      this.emit('role-change', { role: 're-routing', term: this.term });
      this.log(`Elected Candidate is [${topCandidate.username}] (Join Order #${topCandidate.joinOrder}). Awaiting HOST_CLAIM...`, 'info');

      this.armCandidateElectionTimeout(topCandidate.peerId, droppedHostId);
    }
  }

  /**
   * If the elected candidate fails to issue a valid HOST_CLAIM within electionTimeoutMs
   * (e.g. candidate was simultaneously disconnected), fall back to the next joiner!
   */
  private armCandidateElectionTimeout(candidateId: string, droppedHostId: string) {
    if (this.electionTimeoutTimer) clearTimeout(this.electionTimeoutTimer);

    this.electionTimeoutTimer = setTimeout(() => {
      this.log(`Candidate [${candidateId}] failed to claim host within ${this.config.electionTimeoutMs}ms. Marking candidate as unreachable and falling back to next joiner...`, 'warn');
      this.unreachablePeers.add(candidateId);
      
      const candidatePeer = this.peerTable.get(candidateId);
      if (candidatePeer) candidatePeer.status = 'disconnected';

      this.executeElection(droppedHostId, 'candidate_timeout');
    }, this.config.electionTimeoutMs);
  }

  /**
   * Promotes local node to Host, broadcasts HOST_CLAIM, and collects ACKs for Quorum.
   */
  private promoteSelfToHost(previousHostId: string, reason: string) {
    if (this.electionTimeoutTimer) clearTimeout(this.electionTimeoutTimer);

    this.term += 1;
    this.role = 'host';
    this.currentHostId = this.config.peerId;

    // Update local peer record
    const selfPeer = this.peerTable.get(this.config.peerId);
    if (selfPeer) {
      selfPeer.role = 'host';
      selfPeer.status = 'active';
    }

    // Prepare quorum tracking
    const surviving = Array.from(this.peerTable.values()).filter(p => 
      p.peerId !== previousHostId && p.status !== 'disconnected' && !this.unreachablePeers.has(p.peerId)
    );

    this.pendingHostClaim = {
      term: this.term,
      candidateId: this.config.peerId,
      receivedAcks: new Set([this.config.peerId]), // Local node votes for itself
      quorumAchieved: hasMajorityQuorum(1, surviving.length),
    };

    const claimTimestamp = Date.now();
    const signature = generateClaimSignature(this.term, this.config.peerId, claimTimestamp);

    const claimMsg: NexusWireMessage = {
      type: 'NEXUS_HOST_CLAIM',
      term: this.term,
      newHostId: this.config.peerId,
      previousHostId,
      claimTimestamp,
      peerTable: Array.from(this.peerTable.values()),
      stateSnapshot: {
        ...this.authoritativeState,
        term: this.term,
        timestamp: claimTimestamp,
      },
      signature,
    };

    this.log(`👑 PROMOTING TO HOST (Term ${this.term}). Reason: ${reason}. Broadcasting HOST_CLAIM...`, 'ok');
    this.broadcast(claimMsg);

    // Start hosting heartbeats
    this.startHeartbeatBroadcaster();

    this.emit('role-change', { role: 'host', term: this.term });
    this.emit('host-migrated', {
      previousHost: previousHostId,
      newHost: this.config.peerId,
      term: this.term,
      trigger: reason,
      isLocal: true,
    });
    this.emit('peer-table-updated', this.getSortedPeers());
    this.emit('quorum-status', {
      quorumMet: this.pendingHostClaim.quorumAchieved,
      acks: 1,
      total: surviving.length,
    });
  }

  // --- Graceful Handoff ---

  /**
   * Host initiates an orderly exit / handoff without waiting for heartbeat drop
   */
  public initiateGracefulHandoff(): boolean {
    if (this.role !== 'host') {
      this.log("Cannot initiate handoff: node is not host", 'err');
      return false;
    }

    const surviving = Array.from(this.peerTable.values()).filter(p => 
      p.peerId !== this.config.peerId && p.status === 'active'
    );

    if (surviving.length === 0) {
      this.log("No peers available for graceful handoff.", 'warn');
      return false;
    }

    const sorted = sortPeersDeterministically(surviving);
    const targetPeer = sorted[0];

    const nextTerm = this.term + 1;
    this.log(`Initiating graceful HOST_HANDOFF to [${targetPeer.username}] (Term ${nextTerm})...`, 'ok');

    const handoffMsg: NexusWireMessage = {
      type: 'NEXUS_HOST_HANDOFF',
      term: nextTerm,
      previousHostId: this.config.peerId,
      targetHostId: targetPeer.peerId,
      peerTable: Array.from(this.peerTable.values()),
      stateSnapshot: {
        ...this.authoritativeState,
        term: nextTerm,
        timestamp: Date.now(),
      },
      reason: 'orderly_exit',
    };

    this.broadcast(handoffMsg);

    // Demote self and stop hosting
    this.stopHeartbeatBroadcaster();
    this.role = 'peer';
    this.currentHostId = targetPeer.peerId;
    this.term = nextTerm;

    const selfPeer = this.peerTable.get(this.config.peerId);
    if (selfPeer) selfPeer.role = 'peer';

    this.startHeartbeatWatchdog();
    this.emit('role-change', { role: 'peer', term: this.term });
    this.emit('peer-table-updated', this.getSortedPeers());
    return true;
  }

  // --- Wire Message Processing ---

  public handleIncomingMessage(senderPeerId: string, message: NexusWireMessage) {
    switch (message.type) {
      case 'NEXUS_HEARTBEAT_PING':
        this.processHeartbeatPing(senderPeerId, message);
        break;

      case 'NEXUS_HEARTBEAT_PONG':
        this.processHeartbeatPong(senderPeerId, message);
        break;

      case 'NEXUS_PEER_TABLE_SYNC':
        this.processPeerTableSync(message);
        break;

      case 'NEXUS_HOST_CLAIM':
        this.processHostClaim(senderPeerId, message);
        break;

      case 'NEXUS_HOST_CLAIM_ACK':
        this.processHostClaimAck(senderPeerId, message);
        break;

      case 'NEXUS_HOST_HANDOFF':
        this.processHostHandoff(senderPeerId, message);
        break;

      case 'NEXUS_APP_STATE_SYNC':
        if (message.term >= this.term && senderPeerId === this.currentHostId) {
          this.authoritativeState = message.state;
          this.emit('state-sync', this.authoritativeState);
        }
        break;
    }
  }

  private processHeartbeatPing(senderId: string, msg: Extract<NexusWireMessage, { type: 'NEXUS_HEARTBEAT_PING' }>) {
    if (this.role === 'host') {
      // Dual host split-brain detection: higher term wins, or tie-break on hash
      if (msg.term > this.term) {
        this.log(`Detected higher term Host [${msg.hostId}] (Term ${msg.term} > ${this.term}). Yielding leadership.`, 'warn');
        this.stopHeartbeatBroadcaster();
        this.role = 'peer';
        this.term = msg.term;
        this.currentHostId = msg.hostId;
        this.startHeartbeatWatchdog();
        this.emit('role-change', { role: 'peer', term: this.term });
      } else if (msg.term === this.term && msg.hostId !== this.config.peerId) {
        // Tie-breaker
        if (msg.hostId > this.config.peerId) {
          this.log(`Tie-break split-brain: yielding to [${msg.hostId}].`, 'warn');
          this.stopHeartbeatBroadcaster();
          this.role = 'peer';
          this.currentHostId = msg.hostId;
          this.startHeartbeatWatchdog();
          this.emit('role-change', { role: 'peer', term: this.term });
        }
      }
    }

    this.currentHostId = msg.hostId;
    this.term = Math.max(this.term, msg.term);

    // Update host contact
    let hostPeer = this.peerTable.get(msg.hostId);
    if (hostPeer) {
      hostPeer.lastHeartbeat = Date.now();
      hostPeer.status = 'active';
      hostPeer.missedHeartbeats = 0;
    }

    // Respond with PONG
    const pong: NexusWireMessage = {
      type: 'NEXUS_HEARTBEAT_PONG',
      term: this.term,
      peerId: this.config.peerId,
      timestamp: Date.now(),
      pingTimestamp: msg.timestamp,
    };
    this.sendTo(msg.hostId, pong);
  }

  private processHeartbeatPong(senderId: string, msg: Extract<NexusWireMessage, { type: 'NEXUS_HEARTBEAT_PONG' }>) {
    const peer = this.peerTable.get(senderId);
    if (peer) {
      peer.lastHeartbeat = Date.now();
      peer.latencyMs = Math.max(1, Date.now() - msg.pingTimestamp);
      peer.missedHeartbeats = 0;
      peer.status = 'active';
      this.emit('heartbeat', { peerId: senderId, latency: peer.latencyMs });
    }
  }

  private processPeerTableSync(msg: Extract<NexusWireMessage, { type: 'NEXUS_PEER_TABLE_SYNC' }>) {
    if (msg.term < this.term) return;

    this.term = msg.term;
    this.nextJoinOrder = Math.max(this.nextJoinOrder, msg.nextJoinOrder);

    // Merge incoming peers
    msg.peers.forEach(incoming => {
      const existing = this.peerTable.get(incoming.peerId);
      if (existing) {
        existing.status = incoming.status;
        existing.role = incoming.role;
        existing.joinOrder = incoming.joinOrder;
        existing.joinTimestamp = incoming.joinTimestamp;
        existing.username = incoming.username;
        existing.avatarColor = incoming.avatarColor;
      } else {
        this.peerTable.set(incoming.peerId, { ...incoming });
      }
    });

    this.emit('peer-table-updated', this.getSortedPeers());
  }

  private processHostClaim(senderId: string, msg: Extract<NexusWireMessage, { type: 'NEXUS_HOST_CLAIM' }>) {
    this.log(`Received HOST_CLAIM from [${msg.newHostId}] for Term ${msg.term}`, 'info');

    // 1. Verify signature
    const isValidSig = verifyClaimSignature({
      term: msg.term,
      newHostId: msg.newHostId,
      claimTimestamp: msg.claimTimestamp,
      signature: msg.signature,
    });

    if (!isValidSig) {
      this.log(`REJECTED HOST_CLAIM from [${msg.newHostId}]: Invalid cryptographic signature.`, 'err');
      this.sendTo(senderId, {
        type: 'NEXUS_HOST_CLAIM_ACK',
        term: msg.term,
        voterPeerId: this.config.peerId,
        claimedHostId: msg.newHostId,
        acknowledged: false,
        rejectionReason: 'invalid_signature',
      });
      return;
    }

    // 2. Term check
    if (msg.term < this.term) {
      this.log(`REJECTED HOST_CLAIM from [${msg.newHostId}]: Stale term (${msg.term} < ${this.term}).`, 'err');
      this.sendTo(senderId, {
        type: 'NEXUS_HOST_CLAIM_ACK',
        term: msg.term,
        voterPeerId: this.config.peerId,
        claimedHostId: msg.newHostId,
        acknowledged: false,
        rejectionReason: 'stale_term',
      });
      return;
    }

    // Clear candidate timeout
    if (this.electionTimeoutTimer) {
      clearTimeout(this.electionTimeoutTimer);
      this.electionTimeoutTimer = null;
    }

    // Acknowledge new host
    this.term = msg.term;
    this.currentHostId = msg.newHostId;
    this.role = 'peer';
    this.authoritativeState = msg.stateSnapshot;

    // Update peer table
    msg.peerTable.forEach(p => {
      this.peerTable.set(p.peerId, { ...p });
    });
    const newHostPeer = this.peerTable.get(msg.newHostId);
    if (newHostPeer) {
      newHostPeer.role = 'host';
      newHostPeer.status = 'active';
      newHostPeer.lastHeartbeat = Date.now();
    }

    this.sendTo(senderId, {
      type: 'NEXUS_HOST_CLAIM_ACK',
      term: msg.term,
      voterPeerId: this.config.peerId,
      claimedHostId: msg.newHostId,
      acknowledged: true,
    });

    this.startHeartbeatWatchdog();
    this.emit('role-change', { role: 'peer', term: this.term });
    this.emit('host-migrated', {
      previousHost: msg.previousHostId,
      newHost: msg.newHostId,
      term: msg.term,
      trigger: 'host_claim',
      isLocal: false,
    });
    this.emit('peer-table-updated', this.getSortedPeers());
    this.log(`✅ Acknowledged and routed to new Host [${newHostPeer?.username || msg.newHostId}] (Term ${this.term})`, 'ok');
  }

  private processHostClaimAck(senderId: string, msg: Extract<NexusWireMessage, { type: 'NEXUS_HOST_CLAIM_ACK' }>) {
    if (this.role !== 'host' || !this.pendingHostClaim) return;
    if (msg.term !== this.term || msg.claimedHostId !== this.config.peerId) return;

    if (msg.acknowledged) {
      this.pendingHostClaim.receivedAcks.add(msg.voterPeerId);

      const surviving = Array.from(this.peerTable.values()).filter(p => p.status !== 'disconnected');
      const quorumMet = hasMajorityQuorum(this.pendingHostClaim.receivedAcks.size, surviving.length);
      this.pendingHostClaim.quorumAchieved = quorumMet;

      this.emit('quorum-status', {
        quorumMet,
        acks: this.pendingHostClaim.receivedAcks.size,
        total: surviving.length,
      });

      this.log(`Received HOST_CLAIM_ACK from [${senderId}]. Quorum: ${this.pendingHostClaim.receivedAcks.size}/${surviving.length} (${quorumMet ? 'MET' : 'PENDING'})`, 'info');
      
      if (quorumMet) {
        this.log(`🌟 Majority Quorum achieved! Authoritative session state active on Term ${this.term}.`, 'ok');
      }
    }
  }

  private processHostHandoff(senderId: string, msg: Extract<NexusWireMessage, { type: 'NEXUS_HOST_HANDOFF' }>) {
    this.log(`Received orderly HOST_HANDOFF from [${msg.previousHostId}] targeting [${msg.targetHostId}]`, 'info');

    this.term = msg.term;
    this.authoritativeState = msg.stateSnapshot;

    if (msg.targetHostId === this.config.peerId) {
      // Local node is designated target! Promote immediately!
      this.promoteSelfToHost(msg.previousHostId, 'graceful_handoff');
    } else {
      // Another peer is target: route to them
      this.currentHostId = msg.targetHostId;
      this.role = 'peer';
      this.startHeartbeatWatchdog();
      this.emit('role-change', { role: 'peer', term: this.term });
    }
  }

  // --- Network Dispatchers ---

  private broadcast(msg: NexusWireMessage) {
    if (this.onSendMessage) {
      this.onSendMessage('broadcast', msg);
    }
  }

  private sendTo(targetPeerId: string, msg: NexusWireMessage) {
    if (this.onSendMessage) {
      this.onSendMessage(targetPeerId, msg);
    }
  }

  public destroy() {
    this.stopHeartbeatBroadcaster();
    this.stopHeartbeatWatchdog();
    if (this.electionTimeoutTimer) clearTimeout(this.electionTimeoutTimer);
    this.listeners.clear();
  }
}
