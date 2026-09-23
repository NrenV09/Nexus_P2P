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

export interface FileManifestItem {
  index: number;
  name: string;
  size: number;
  mimeType: string;
}

export interface BatchManifest {
  batchId: string;
  senderId: string;
  senderName: string;
  targetId: string;
  totalFiles: number;
  totalBytes: number;
  files: FileManifestItem[];
}

export interface BatchTransferState {
  batchId: string;
  targetId: string;
  targetName?: string;
  direction: 'outgoing' | 'incoming';
  status: 'queued' | 'negotiating' | 'accepted' | 'streaming' | 'completed' | 'failed' | 'rejected';
  totalFiles: number;
  totalBytes: number;
  transferredBytes: number;
  currentFileIndex: number;
  currentFileName: string;
  progress: number; // 0 to 100
  speed: string;
  files: {
    name: string;
    size: number;
    mimeType: string;
    status: 'pending' | 'transferring' | 'completed' | 'failed';
    progress: number;
  }[];
}

export interface ConcurrentBypassState {
  targetId: string;
  targetName?: string;
  isCalling: boolean;
  callType?: 'audio' | 'video';
  hasActiveBatch: boolean;
  batchProgress?: number;
  isHostLink: boolean;
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
