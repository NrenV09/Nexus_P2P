export interface NexusPeer {
  id: string;
  username: string;
  avatarColor: string;
  isHost: boolean;
  joinedAt: number;
  pingMs?: number;
  status: 'connecting' | 'connected' | 'disconnected';
  bypassPeers: string[]; // List of peer IDs with whom this peer has an active direct P2P bypass link
}

export interface NexusTransfer {
  id: string;
  fileName: string;
  fileSize: number;
  progress: number; // 0 to 100
  speed: string;
  fromPeerId: string;
  toPeerId: string;
  isBypass: boolean;
  status: 'active' | 'completed' | 'failed';
  transferredBytes: number;
}

export interface NexusLog {
  id: string;
  timestamp: Date;
  type: 'signaling' | 'connection' | 'chat' | 'call' | 'transfer' | 'error';
  text: string;
  source?: string;
  metadata?: Record<string, any>;
}

export interface NexusCall {
  active: boolean;
  callId: string;
  callerId: string;
  callerName: string;
  targetId: string;
  targetName: string;
  callType: 'audio' | 'video';
  isOutgoing: boolean;
  stream?: MediaStream;
  remoteStream?: MediaStream;
}

export interface NodePosition {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  isHost: boolean;
  peer: NexusPeer;
  isHovered?: boolean;
  isSelected?: boolean;
  isDropTarget?: boolean;
}
