export type NodeRole = 'host' | 'join' | null;
export type ConnectionStatus = 'offline' | 'handshaking' | 'connected';

export interface ChatMessage {
  id: string;
  text: string;
  sender: 'me' | 'them' | 'system';
  senderName?: string;
  senderColor?: string;
  senderAvatar?: string;
  senderId?: string;
  audioData?: string;
  timestamp: Date;
}

export interface FilePayload {
  id: string;
  name: string;
  blob?: Blob;
  size: number;
  senderName: string;
  senderColor?: string;
  senderId?: string;
  timestamp: Date;
  direction: 'in' | 'out';
  cacheUrl?: string;
  mimeType?: string;
}

export interface TransferProgress {
  name: string;
  progress: number;
  type: 'sending' | 'receiving';
  peerUsername: string;
  transferredBytes: number;
  totalBytes: number;
  statusMessage?: string;
  isWaitingForReceiver?: boolean;
  isDirectDisk?: boolean;
}

export interface LogEntry {
  text: string;
  type: 'info' | 'ok' | 'err';
  timestamp: Date;
}

export interface UserProfile {
  id: string;
  username: string;
  avatarColor: string;
  avatarImage?: string; // Base64 data URL for profile picture
  bio: string;
  joinedAt: string;
}

export * from './lib/nexusFailover';
