/**
 * Nexus P2P Network: Deterministic Host Migration & Failover Protocol
 * 
 * Protocol Specification:
 * - Peer Join-Order Monotonic Sequence
 * - Heartbeat Ping-Pong Failure Detection
 * - Deterministic Leader Election (Longest-standing active peer)
 * - State Handover, HOST_CLAIM & Quorum Verification
 * - Split-Brain Prevention via Majority Quorum (> 50%)
 */

export type NexusPeerStatus = 'active' | 'suspect' | 'disconnected';
export type NexusNodeRole = 'host' | 'peer' | 'electing' | 're-routing';

export interface NexusPeer {
  peerId: string;
  joinOrder: number;            // Monotonic sequence number assigned by the host (1, 2, 3...)
  joinTimestamp: number;        // Epoch timestamp (ms) when peer joined
  endpoint: string;             // IP / WebRTC candidate endpoint / connection ID
  status: NexusPeerStatus;
  role: 'host' | 'peer';
  username: string;
  avatarColor: string;
  avatarImage?: string;
  lastHeartbeat: number;        // Timestamp of last received heartbeat pong/ping
  latencyMs: number;
  missedHeartbeats: number;
}

export interface NexusStateSnapshot {
  term: number;
  sequenceNumber: number;
  roomName: string;
  activeTopic?: string;
  customData: Record<string, any>;
  timestamp: number;
}

// Wire Message Schemas
export type NexusWireMessage = 
  | {
      type: 'NEXUS_HEARTBEAT_PING';
      term: number;
      hostId: string;
      timestamp: number;
      peerCount: number;
      tableDigest: string;
    }
  | {
      type: 'NEXUS_HEARTBEAT_PONG';
      term: number;
      peerId: string;
      timestamp: number;
      pingTimestamp: number;
    }
  | {
      type: 'NEXUS_PEER_TABLE_SYNC';
      term: number;
      peers: NexusPeer[];
      nextJoinOrder: number;
    }
  | {
      type: 'NEXUS_HOST_HANDOFF';
      term: number;
      previousHostId: string;
      targetHostId: string;
      peerTable: NexusPeer[];
      stateSnapshot: NexusStateSnapshot;
      reason: 'orderly_exit' | 'load_transfer';
    }
  | {
      type: 'NEXUS_HOST_CLAIM';
      term: number;
      newHostId: string;
      previousHostId: string;
      claimTimestamp: number;
      peerTable: NexusPeer[];
      stateSnapshot: NexusStateSnapshot;
      signature: string;
    }
  | {
      type: 'NEXUS_HOST_CLAIM_ACK';
      term: number;
      voterPeerId: string;
      claimedHostId: string;
      acknowledged: boolean;
      rejectionReason?: string;
    }
  | {
      type: 'NEXUS_APP_STATE_SYNC';
      term: number;
      hostId: string;
      state: NexusStateSnapshot;
    };

/**
 * Stable 32-bit FNV-1a hash function for strings
 * Used as a deterministic tie-breaker when joinOrder or joinTimestamp are identical.
 */
export function hashString(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

/**
 * Deterministically sorts peers across all nodes.
 * Primary: joinOrder ascending (1, 2, 3...)
 * Secondary: joinTimestamp ascending
 * Tie-breaker: FNV-1a hash of peerId ascending, then lexical peerId
 */
export function sortPeersDeterministically(peers: NexusPeer[]): NexusPeer[] {
  return [...peers].sort((a, b) => {
    // 1. Monotonic join order assigned by the host
    if (a.joinOrder !== b.joinOrder) {
      return a.joinOrder - b.joinOrder;
    }
    // 2. Earliest join timestamp
    if (a.joinTimestamp !== b.joinTimestamp) {
      return a.joinTimestamp - b.joinTimestamp;
    }
    // 3. Deterministic hash tie-breaker
    const hashA = hashString(a.peerId);
    const hashB = hashString(b.peerId);
    if (hashA !== hashB) {
      return hashA - hashB;
    }
    // 4. Lexicographical fallback
    return a.peerId.localeCompare(b.peerId);
  });
}

/**
 * Filter surviving active peers (excluding dropped host and disconnected peers)
 */
export function getSurvivingActivePeers(
  peerTable: NexusPeer[],
  excludedHostId: string,
  unreachablePeerIds?: Set<string>
): NexusPeer[] {
  return peerTable.filter(peer => {
    if (peer.peerId === excludedHostId) return false;
    if (peer.status === 'disconnected') return false;
    if (unreachablePeerIds && unreachablePeerIds.has(peer.peerId)) return false;
    return true;
  });
}

/**
 * Deterministic Leader Election:
 * Runs the exact same ranking algorithm on every peer independently.
 */
export function electDeterministicLeader(
  peerTable: NexusPeer[],
  droppedHostId: string,
  localPeerId: string,
  unreachablePeerIds?: Set<string>
): {
  rankedCandidates: NexusPeer[];
  topCandidate: NexusPeer | null;
  isLocalElected: boolean;
  localRank: number;
} {
  const surviving = getSurvivingActivePeers(peerTable, droppedHostId, unreachablePeerIds);
  const ranked = sortPeersDeterministically(surviving);

  const topCandidate = ranked.length > 0 ? ranked[0] : null;
  const isLocalElected = topCandidate ? topCandidate.peerId === localPeerId : false;
  const localRank = ranked.findIndex(p => p.peerId === localPeerId);

  return {
    rankedCandidates: ranked,
    topCandidate,
    isLocalElected,
    localRank,
  };
}

/**
 * Quorum Check: Requires > 50% acknowledgment from known surviving peers
 * Prevents split-brain partitions.
 */
export function hasMajorityQuorum(ackCount: number, totalSurvivingCount: number): boolean {
  if (totalSurvivingCount <= 0) return true; // Single node is its own quorum
  const required = Math.floor(totalSurvivingCount / 2) + 1;
  return ackCount >= required;
}

/**
 * Computes a deterministic claim verification signature
 */
export function generateClaimSignature(term: number, newHostId: string, timestamp: number): string {
  const raw = `NEXUS-V1:TERM=${term}:HOST=${newHostId}:TS=${timestamp}`;
  return `SIG_${hashString(raw).toString(16).toUpperCase()}`;
}

export function verifyClaimSignature(claim: { term: number; newHostId: string; claimTimestamp: number; signature: string }): boolean {
  const expected = generateClaimSignature(claim.term, claim.newHostId, claim.claimTimestamp);
  return claim.signature === expected;
}
