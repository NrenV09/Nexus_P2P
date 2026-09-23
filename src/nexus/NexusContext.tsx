import React, { createContext, useContext } from 'react';
import { useNexusRTC, UseNexusRTCOptions } from './useNexusRTC';
import {
  NexusPeer,
  NexusChatMessage,
  GlobalCallState,
  NexusTransfer,
  NexusLog,
  BatchTransferState,
  ConcurrentBypassState,
  NexusCall
} from './types';

export interface NexusContextType {
  localPeer: NexusPeer;
  peers: Map<string, NexusPeer>;
  peersList: NexusPeer[];
  messages: NexusChatMessage[];
  globalCallState: GlobalCallState;
  hostId: string;
  wsConnected: boolean;
  isSimulation: boolean;
  setSimulationMode: (enabled: boolean) => void;
  simulateAddPeer: () => void;
  simulateIncomingCall: (peerId?: string, type?: 'video' | 'audio') => void;
  simulateIncomingBatch: (peerId?: string) => void;
  simulateGroupCall: () => void;
  activeTransfers: Map<string, NexusTransfer>;
  activeBatches: Map<string, BatchTransferState>;
  concurrentPeerStates: ConcurrentBypassState[];
  logs: NexusLog[];
  activeCall: NexusCall | null;
  sendFile: (targetPeerId: string, file: File) => string;
  sendBatch: (targetPeerId: string, files: File[]) => string;
  cancelBatch: (targetPeerId: string, batchId: string) => void;
  sendMessage: (text: string, targetPeerId?: string) => void;
  startCall: (targetPeerId: string, callType?: 'audio' | 'video') => Promise<void>;
  answerCall: (callType?: 'audio' | 'video') => Promise<void>;
  endCall: () => void;
  startGroupCall: (callType?: 'audio' | 'video') => Promise<void>;
  endGroupCall: () => void;
}

export const NexusContext = createContext<NexusContextType | null>(null);

export interface NexusProviderProps extends UseNexusRTCOptions {
  children: React.ReactNode;
}

/**
 * Single Source of Truth for Nexus P2P Mesh, Multi-Peer Streams,
 * Group Video Calls, and Real-Time Multiplexed State.
 */
export const NexusProvider: React.FC<NexusProviderProps> = ({ children, ...options }) => {
  const nexusRTC = useNexusRTC(options);

  return (
    <NexusContext.Provider value={nexusRTC}>
      {children}
    </NexusContext.Provider>
  );
};

/**
 * Unified React hook for consuming Nexus centralized state across all components
 */
export const useNexus = (): NexusContextType => {
  const context = useContext(NexusContext);
  if (!context) {
    throw new Error('useNexus must be used within a NexusProvider');
  }
  return context;
};
