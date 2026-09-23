import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  NexusPeer,
  NexusTransfer,
  NexusLog,
  NexusCall,
  GlobalCallState,
  NexusChatMessage,
  BatchTransferState,
  ConcurrentBypassState
} from './types';
import { BatchTransferManager } from './BatchTransferManager';
import { createSyntheticVideoStream } from './syntheticMedia';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ]
};

export interface UseNexusRTCOptions {
  wsUrl?: string;
  roomId?: string;
  username?: string;
  avatarColor?: string;
  peerId?: string;
  isSimulation?: boolean;
  onFileReceived?: (file: File, fromPeer: NexusPeer) => void;
}

const DEFAULT_SIM_PEERS: NexusPeer[] = [
  {
    id: 'sim-atlas',
    username: 'Atlas-Prime',
    avatarColor: 'bg-blue-600',
    isHost: true,
    joinedAt: Date.now() - 120000,
    status: 'connected',
    bypassPeers: []
  },
  {
    id: 'sim-vortex',
    username: 'Vortex-9',
    avatarColor: 'bg-emerald-600',
    isHost: false,
    joinedAt: Date.now() - 90000,
    status: 'connected',
    bypassPeers: ['sim-atlas']
  },
  {
    id: 'sim-echo',
    username: 'Cyber-Echo',
    avatarColor: 'bg-purple-600',
    isHost: false,
    joinedAt: Date.now() - 60000,
    status: 'connected',
    bypassPeers: []
  },
  {
    id: 'sim-nova',
    username: 'Nova-Core',
    avatarColor: 'bg-amber-600',
    isHost: false,
    joinedAt: Date.now() - 30000,
    status: 'connected',
    bypassPeers: []
  }
];

export function useNexusRTC(options: UseNexusRTCOptions = {}) {
  const {
    roomId = 'nexus-main',
    username = `Node-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
    avatarColor = 'bg-accent',
    onFileReceived
  } = options;

  // Local Peer Identity
  const [localPeer, setLocalPeer] = useState<NexusPeer>(() => ({
    id: options.peerId || `peer-${Math.random().toString(36).substring(2, 8)}`,
    username,
    avatarColor,
    isHost: false,
    joinedAt: Date.now(),
    status: 'connecting',
    bypassPeers: []
  }));

  const [peers, setPeers] = useState<Map<string, NexusPeer>>(new Map());
  const [hostId, setHostId] = useState<string>('');
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [isSimulation, setIsSimulation] = useState<boolean>(() => {
    if (typeof options.isSimulation === 'boolean') return options.isSimulation;
    // Auto-enable simulation if deployed on GitHub Pages or file protocol where no WS server exists
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      if (host.includes('github.io') || host === 'localhost' && window.location.port === '5173') {
        return true;
      }
    }
    return false;
  });

  const [activeTransfers, setActiveTransfers] = useState<Map<string, NexusTransfer>>(new Map());
  const [activeBatches, setActiveBatches] = useState<Map<string, BatchTransferState>>(new Map());
  const [logs, setLogs] = useState<NexusLog[]>([]);
  const [activeCall, setActiveCall] = useState<NexusCall | null>(null);
  const [messages, setMessages] = useState<NexusChatMessage[]>([]);
  const [globalCallState, setGlobalCallState] = useState<GlobalCallState>({
    isActive: false,
    callId: null,
    callType: null,
    initiatorId: null,
    initiatorName: null,
    participants: [],
    streams: {},
    localStream: null,
    isGroupCall: false
  });

  // Connection References
  const wsRef = useRef<WebSocket | null>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const bypassConnections = useRef<Map<string, RTCPeerConnection>>(new Map());

  // Multiplexed Channel Isolation: Chat vs File Transfer
  const chatChannels = useRef<Map<string, RTCDataChannel>>(new Map());
  const fileChannels = useRef<Map<string, RTCDataChannel>>(new Map());
  const batchManagers = useRef<Map<string, BatchTransferManager>>(new Map());

  // WebRTC Perfect Negotiation State Tracker per peer
  const makingOfferMap = useRef<Map<string, boolean>>(new Map());
  const ignoreOfferMap = useRef<Map<string, boolean>>(new Map());

  // Media Stream References
  const localStreamRef = useRef<MediaStream | null>(null);
  const syntheticCleanupRef = useRef<(() => void) | null>(null);
  const groupSyntheticCleanupsRef = useRef<(() => void)[]>([]);
  const simBatchTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const wsFailCountRef = useRef<number>(0);

  // Helper: Append log
  const addLog = useCallback((type: NexusLog['type'], text: string, source?: string, metadata?: Record<string, any>) => {
    const newLog: NexusLog = {
      id: Math.random().toString(36).substring(2) + Date.now().toString(36),
      timestamp: new Date(),
      type,
      text,
      source: source || 'Signaling',
      metadata
    };
    setLogs(prev => [...prev.slice(-300), newLog]);
  }, []);

  // Send message over WebSocket signaling
  const sendSignal = useCallback((type: string, targetId: string, payload?: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type,
        roomId,
        targetId,
        senderId: localPeer.id,
        senderName: localPeer.username,
        payload
      }));
    }
  }, [localPeer.id, localPeer.username, roomId]);

  // Setup Chat Data Channel
  const setupChatDataChannel = useCallback((dc: RTCDataChannel, remotePeerId: string, isBypass = false) => {
    dc.onopen = () => {
      chatChannels.current.set(remotePeerId, dc);
      addLog('connection', `Control/Chat channel [nexus-chat] opened with ${remotePeerId}`, remotePeerId);
      setPeers(prev => {
        const next = new Map(prev);
        const p = next.get(remotePeerId) as NexusPeer | undefined;
        if (p) {
          next.set(remotePeerId, {
            ...p,
            status: 'connected',
            bypassPeers: isBypass ? Array.from(new Set([...p.bypassPeers, localPeer.id])) : p.bypassPeers
          });
        }
        return next;
      });
    };

    dc.onclose = () => {
      addLog('connection', `Control/Chat channel closed with ${remotePeerId}`, remotePeerId);
      chatChannels.current.delete(remotePeerId);
    };

    dc.onerror = (err: any) => {
      console.warn(`Chat channel error on peer ${remotePeerId}:`, err);
    };

    dc.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'chat') {
          addLog('chat', `${data.senderName}: ${data.text}`, remotePeerId, { direct: true });
          const newMsg: NexusChatMessage = {
            id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            senderId: remotePeerId,
            senderName: data.senderName || 'Peer',
            text: data.text,
            timestamp: data.timestamp || Date.now(),
            isDirect: true
          };
          setMessages(prev => [...prev.slice(-300), newMsg]);
        }
      } catch {
        addLog('chat', `Peer ${remotePeerId}: ${event.data}`, remotePeerId, { direct: true });
      }
    };
  }, [addLog, localPeer.id]);

  // Setup File Transfer Data Channel
  const setupFileDataChannel = useCallback((dc: RTCDataChannel, remotePeerId: string, isBypass = false) => {
    fileChannels.current.set(remotePeerId, dc);

    const targetPeer = peers.get(remotePeerId);
    let manager = batchManagers.current.get(remotePeerId);
    if (!manager) {
      manager = new BatchTransferManager(
        dc,
        localPeer.id,
        localPeer.username,
        {
          onStateChange: (batch) => {
            setActiveBatches(prev => {
              const next = new Map(prev);
              if (batch.status === 'completed' || batch.status === 'failed' || batch.status === 'rejected') {
                setTimeout(() => {
                  setActiveBatches(curr => {
                    const m = new Map(curr);
                    m.delete(batch.batchId);
                    return m;
                  });
                }, 2500);
              }
              next.set(batch.batchId, { ...batch });
              return next;
            });
          },
          onFileReceived: (file, batchId, fileIndex) => {
            addLog('transfer', `Batch file received: "${file.name}" (${(file.size / 1024).toFixed(1)} KB) from ${targetPeer?.username || remotePeerId}`, remotePeerId);
            const fromPeer = peers.get(remotePeerId) || {
              id: remotePeerId,
              username: targetPeer?.username || remotePeerId,
              avatarColor: 'bg-accent',
              isHost: false,
              joinedAt: Date.now(),
              status: 'connected',
              bypassPeers: []
            };
            onFileReceived?.(file, fromPeer);
          },
          onBatchCompleted: (batchId, direction) => {
            addLog('transfer', `Batch ${batchId} (${direction}) fully finalized.`, targetPeer?.username || remotePeerId);
          },
          onLog: (type, text, meta) => {
            addLog(type, text, targetPeer?.username || remotePeerId, meta);
          }
        }
      );
      batchManagers.current.set(remotePeerId, manager);
    } else {
      manager.bindChannel(dc);
    }
  }, [addLog, localPeer.id, localPeer.username, onFileReceived, peers]);

  // Initialize Simulation Mode
  const initSimulationMode = useCallback(() => {
    setIsSimulation(true);
    setWsConnected(true);
    wsFailCountRef.current = 0;

    const simMap = new Map<string, NexusPeer>();
    DEFAULT_SIM_PEERS.forEach(peer => {
      const bypassList = [...peer.bypassPeers];
      if (peer.id === 'sim-atlas' || peer.id === 'sim-vortex') {
        bypassList.push(localPeer.id);
      }
      simMap.set(peer.id, {
        ...peer,
        bypassPeers: bypassList
      });
    });

    setPeers(simMap);
    setHostId('sim-atlas');

    setLocalPeer(prev => ({
      ...prev,
      status: 'connected',
      bypassPeers: ['sim-atlas', 'sim-vortex']
    }));

    addLog('signaling', '🌟 Simulation Mode Activated: 4 virtual peers joined mesh topology', 'Simulation');
    addLog('connection', 'P2P mesh links verified: [Atlas-Prime] ↔ [You] & [Vortex-9] ↔ [You]', 'Simulation');
    addLog('connection', 'Multiplexed channels ready: [nexus-chat] • [nexus-file-transfer] • A/V Dynamic Media', 'Simulation');
  }, [addLog, localPeer.id]);

  // Teardown Simulation Mode
  const teardownSimulationMode = useCallback(() => {
    setIsSimulation(false);
    setWsConnected(false);
    simBatchTimers.current.forEach(t => clearInterval(t));
    simBatchTimers.current.clear();
    if (syntheticCleanupRef.current) {
      syntheticCleanupRef.current();
      syntheticCleanupRef.current = null;
    }
    if (groupSyntheticCleanupsRef.current) {
      groupSyntheticCleanupsRef.current.forEach(c => c());
      groupSyntheticCleanupsRef.current = [];
    }
    setGlobalCallState({
      isActive: false,
      callId: null,
      callType: null,
      initiatorId: null,
      initiatorName: null,
      participants: [],
      streams: {},
      localStream: null,
      isGroupCall: false
    });
    setActiveCall(null);
    setActiveBatches(new Map());
    setPeers(new Map());
    addLog('signaling', 'Simulation Mode disabled. Returning to live WebRTC signaling...', 'System');
  }, [addLog]);

  // Toggle Simulation Mode
  const setSimulationMode = useCallback((enabled: boolean) => {
    if (enabled) {
      initSimulationMode();
    } else {
      teardownSimulationMode();
    }
  }, [initSimulationMode, teardownSimulationMode]);

  // Add a dynamically simulated peer
  const simulateAddPeer = useCallback((customName?: string) => {
    const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
    const name = customName || `Peer-${randomHex}`;
    const newId = `sim-peer-${randomHex.toLowerCase()}`;
    const colors = ['bg-indigo-600', 'bg-pink-600', 'bg-cyan-600', 'bg-emerald-600', 'bg-rose-600'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const newPeer: NexusPeer = {
      id: newId,
      username: name,
      avatarColor: randomColor,
      isHost: false,
      joinedAt: Date.now(),
      status: 'connected',
      bypassPeers: ['sim-atlas']
    };

    setPeers(prev => {
      const next = new Map(prev);
      next.set(newId, newPeer);
      return next;
    });

    addLog('connection', `New simulated peer joined network: ${name} (ID: ${newId})`, 'Simulation');
  }, [addLog]);

  // Simulate incoming call from a simulated peer
  const simulateIncomingCall = useCallback((callerPeerId = 'sim-vortex', callType: 'video' | 'audio' = 'video') => {
    const caller = peers.get(callerPeerId) || DEFAULT_SIM_PEERS[1];
    const callId = `call-sim-${Date.now()}`;

    setActiveCall({
      active: true,
      callId,
      callerId: caller.id,
      callerName: caller.username,
      targetId: localPeer.id,
      targetName: localPeer.username,
      callType,
      isOutgoing: false
    });

    addLog('call', `Incoming ${callType} call from ${caller.username}`, caller.username, {
      callId,
      callerId: caller.id
    });
  }, [addLog, localPeer.id, localPeer.username, peers]);

  // Simulate incoming batch file transfer from a simulated peer
  const simulateIncomingBatch = useCallback((senderPeerId = 'sim-atlas') => {
    const sender = peers.get(senderPeerId) || DEFAULT_SIM_PEERS[0];
    const batchId = `batch-sim-${Date.now()}`;
    const files = [
      { name: 'quantum_mesh_spec.pdf', size: 1024 * 720, mimeType: 'application/pdf', status: 'pending' as const, progress: 0 },
      { name: 'satellite_telemetry.bin', size: 1024 * 1450, mimeType: 'application/octet-stream', status: 'pending' as const, progress: 0 }
    ];
    const totalBytes = files.reduce((acc, f) => acc + f.size, 0);

    const initialBatch: BatchTransferState = {
      batchId,
      targetId: sender.id,
      targetName: sender.username,
      direction: 'incoming',
      status: 'streaming',
      totalFiles: files.length,
      totalBytes,
      transferredBytes: 0,
      currentFileIndex: 0,
      currentFileName: files[0].name,
      progress: 0,
      speed: '7.8 MB/s',
      files
    };

    setActiveBatches(prev => new Map(prev).set(batchId, initialBatch));
    addLog('transfer', `Incoming batch manifest accepted from ${sender.username}: 2 files (2.17 MB)`, sender.username, { batchId });

    let prog = 0;
    const interval = setInterval(() => {
      prog += 16;
      if (prog >= 100) {
        prog = 100;
        clearInterval(interval);
        simBatchTimers.current.delete(batchId);

        setActiveBatches(prev => {
          const next = new Map(prev);
          const current = next.get(batchId) as BatchTransferState | undefined;
          if (current) {
            next.set(batchId, {
              ...current,
              progress: 100,
              status: 'completed',
              speed: '0 KB/s',
              files: current.files.map(f => ({ ...f, status: 'completed', progress: 100 }))
            });
          }
          return next;
        });

        addLog('transfer', `Completed receiving batch from ${sender.username} (2 files verified)`, sender.username, { batchId });

        // Deliver mock file
        const dummyBlob = new Blob(['Quantum Mesh Telemetry Data Stream Simulation verified.'], { type: 'application/pdf' });
        const dummyFile = new File([dummyBlob], 'quantum_mesh_spec.pdf', { type: 'application/pdf' });
        onFileReceived?.(dummyFile, sender);

        setTimeout(() => {
          setActiveBatches(curr => {
            const m = new Map(curr);
            m.delete(batchId);
            return m;
          });
        }, 2000);
      } else {
        const fileIdx = prog > 50 ? 1 : 0;
        const currentFileName = files[fileIdx].name;
        setActiveBatches(prev => {
          const next = new Map(prev);
          const current = next.get(batchId) as BatchTransferState | undefined;
          if (current) {
            next.set(batchId, {
              ...current,
              progress: prog,
              currentFileIndex: fileIdx,
              currentFileName,
              speed: `${(6.5 + Math.sin(prog) * 1.5).toFixed(1)} MB/s`,
              files: current.files.map((f, i) => ({
                ...f,
                status: i < fileIdx ? 'completed' : i === fileIdx ? 'transferring' : 'pending',
                progress: i < fileIdx ? 100 : i === fileIdx ? Math.min(100, Math.round((prog % 50) * 2)) : 0
              }))
            });
          }
          return next;
        });
      }
    }, 250);

    simBatchTimers.current.set(batchId, interval);
  }, [addLog, onFileReceived, peers]);

  // Create or retrieve standard connection
  const getOrCreatePeerConnection = useCallback((remotePeerId: string, isInitiator = false): RTCPeerConnection => {
    let pc = peerConnections.current.get(remotePeerId);
    if (pc && pc.signalingState !== 'closed') return pc;

    pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnections.current.set(remotePeerId, pc);

    makingOfferMap.current.set(remotePeerId, false);
    ignoreOfferMap.current.set(remotePeerId, false);

    // Dynamic track negotiation
    pc.ontrack = (event) => {
      addLog('call', `Media track (${event.track.kind}) received dynamically from ${remotePeerId}`, remotePeerId);
      const stream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);
      
      setGlobalCallState(prev => ({
        ...prev,
        streams: {
          ...prev.streams,
          [remotePeerId]: stream
        }
      }));

      setPeers(prev => {
        const next = new Map(prev);
        const p = next.get(remotePeerId) as NexusPeer | undefined;
        if (p) {
          next.set(remotePeerId, { ...p, stream });
        }
        return next;
      });

      setActiveCall(prev => {
        if (prev && (prev.targetId === remotePeerId || prev.callerId === remotePeerId)) {
          return { ...prev, remoteStream: stream };
        }
        return prev;
      });
    };

    if (isInitiator) {
      const chatDc = pc.createDataChannel('nexus-chat', { ordered: true });
      setupChatDataChannel(chatDc, remotePeerId, false);

      const fileDc = pc.createDataChannel('nexus-file-transfer', { ordered: true });
      setupFileDataChannel(fileDc, remotePeerId, false);
    }

    pc.ondatachannel = (event) => {
      const dc = event.channel;
      if (dc.label === 'nexus-chat') {
        setupChatDataChannel(dc, remotePeerId, false);
      } else if (dc.label === 'nexus-file-transfer') {
        setupFileDataChannel(dc, remotePeerId, false);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal('signal-ice', remotePeerId, event.candidate);
      }
    };

    // Perfect Negotiation pattern
    pc.onnegotiationneeded = async () => {
      try {
        makingOfferMap.current.set(remotePeerId, true);
        await pc.setLocalDescription();
        sendSignal('signal-offer', remotePeerId, pc.localDescription);
      } catch (err) {
        console.error('onnegotiationneeded error:', err);
      } finally {
        makingOfferMap.current.set(remotePeerId, false);
      }
    };

    pc.onconnectionstatechange = () => {
      addLog('connection', `Standard link to ${remotePeerId}: ${pc.connectionState}`, remotePeerId);
      if (pc.connectionState === 'connected') {
        setPeers(prev => {
          const next = new Map(prev);
          const p = next.get(remotePeerId) as NexusPeer | undefined;
          if (p) {
            next.set(remotePeerId, { ...p, status: 'connected' });
          }
          return next;
        });
      }
    };

    return pc;
  }, [addLog, sendSignal, setupChatDataChannel, setupFileDataChannel]);

  // Create or retrieve bypass connection
  const getOrCreateBypassConnection = useCallback((remotePeerId: string, isInitiator = false): RTCPeerConnection => {
    let pc = bypassConnections.current.get(remotePeerId);
    if (pc && pc.signalingState !== 'closed') return pc;

    pc = new RTCPeerConnection(RTC_CONFIG);
    bypassConnections.current.set(remotePeerId, pc);

    makingOfferMap.current.set(remotePeerId, false);
    ignoreOfferMap.current.set(remotePeerId, false);

    pc.ontrack = (event) => {
      addLog('call', `Media track (${event.track.kind}) received from ${remotePeerId}`, remotePeerId);
      const stream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);

      setGlobalCallState(prev => ({
        ...prev,
        streams: {
          ...prev.streams,
          [remotePeerId]: stream
        }
      }));

      setPeers(prev => {
        const next = new Map(prev);
        const p = next.get(remotePeerId) as NexusPeer | undefined;
        if (p) {
          next.set(remotePeerId, { ...p, stream });
        }
        return next;
      });

      setActiveCall(prev => {
        if (prev && (prev.targetId === remotePeerId || prev.callerId === remotePeerId)) {
          return { ...prev, remoteStream: stream };
        }
        return prev;
      });
    };

    if (isInitiator) {
      const chatDc = pc.createDataChannel('nexus-chat', { ordered: true });
      setupChatDataChannel(chatDc, remotePeerId, true);

      const fileDc = pc.createDataChannel('nexus-file-transfer', { ordered: true });
      setupFileDataChannel(fileDc, remotePeerId, true);
    }

    pc.ondatachannel = (event) => {
      const dc = event.channel;
      if (dc.label === 'nexus-chat') {
        setupChatDataChannel(dc, remotePeerId, true);
      } else if (dc.label === 'nexus-file-transfer') {
        setupFileDataChannel(dc, remotePeerId, true);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal('bypass-ice', remotePeerId, event.candidate);
      }
    };

    pc.onnegotiationneeded = async () => {
      try {
        makingOfferMap.current.set(remotePeerId, true);
        await pc.setLocalDescription();
        sendSignal('bypass-offer', remotePeerId, pc.localDescription);
      } catch (err) {
        console.error('Bypass negotiation error:', err);
      } finally {
        makingOfferMap.current.set(remotePeerId, false);
      }
    };

    pc.onconnectionstatechange = () => {
      addLog('connection', `Peer link to ${remotePeerId}: ${pc.connectionState}`, remotePeerId);
      if (pc.connectionState === 'connected') {
        setPeers(prev => {
          const next = new Map(prev);
          const p = next.get(remotePeerId) as NexusPeer | undefined;
          if (p) {
            next.set(remotePeerId, {
              ...p,
              status: 'connected',
              bypassPeers: Array.from(new Set([...p.bypassPeers, localPeer.id]))
            });
          }
          return next;
        });

        setLocalPeer(prev => ({
          ...prev,
          bypassPeers: Array.from(new Set([...prev.bypassPeers, remotePeerId]))
        }));
      }
    };

    return pc;
  }, [addLog, localPeer.id, sendSignal, setupChatDataChannel, setupFileDataChannel]);

  // Connect WebSocket signaling (runs when not in simulation mode)
  useEffect(() => {
    if (isSimulation) {
      initSimulationMode();
      return;
    }

    let ws: WebSocket;
    let reconnectTimeout: any;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const defaultWsUrl = `${protocol}//${window.location.host}/ws/nexus?room=${roomId}&peerId=${localPeer.id}&username=${encodeURIComponent(localPeer.username)}&color=${encodeURIComponent(localPeer.avatarColor)}`;
      const targetUrl = options.wsUrl || defaultWsUrl;

      addLog('signaling', `Connecting to WebSocket signaling: ${roomId}...`);

      try {
        ws = new WebSocket(targetUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setWsConnected(true);
          wsFailCountRef.current = 0;
          addLog('signaling', `Connected to signaling hub. Authenticated as ${localPeer.username}`);
        };

        ws.onclose = () => {
          setWsConnected(false);
          wsFailCountRef.current += 1;

          // If repeated disconnects in static/preview environment, auto-activate simulation
          if (wsFailCountRef.current >= 2) {
            addLog('signaling', 'Signaling hub offline in preview environment. Auto-activating Simulation Mode...', 'System');
            initSimulationMode();
            return;
          }

          addLog('signaling', 'Disconnected from signaling hub. Reconnecting in 3s...');
          reconnectTimeout = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          addLog('error', 'WebSocket connection error');
        };

        ws.onmessage = async (event) => {
          try {
            const data = JSON.parse(event.data);
            const { type, senderId, senderName, payload } = data;

            switch (type) {
              case 'room-state': {
                const { hostId: currentHostId, peers: existingList } = payload;
                const amIHost = currentHostId === localPeer.id || existingList.length === 0;

                setHostId(currentHostId || localPeer.id);
                setLocalPeer(prev => ({
                  ...prev,
                  isHost: amIHost,
                  status: 'connected'
                }));

                const peerMap = new Map<string, NexusPeer>();
                existingList.forEach((p: any) => {
                  if (p.id !== localPeer.id) {
                    peerMap.set(p.id, {
                      id: p.id,
                      username: p.username,
                      avatarColor: p.avatarColor || 'bg-accent',
                      isHost: p.id === currentHostId,
                      joinedAt: p.joinedAt || Date.now(),
                      status: 'connecting',
                      bypassPeers: []
                    });
                  }
                });
                setPeers(peerMap);

                addLog('signaling', `Room state loaded. Central Host: ${amIHost ? 'You (Local)' : currentHostId}. Peers: ${peerMap.size}`);
                break;
              }

              case 'peer-joined': {
                const newPeer: NexusPeer = {
                  id: senderId,
                  username: senderName,
                  avatarColor: payload?.avatarColor || 'bg-accent',
                  isHost: false,
                  joinedAt: Date.now(),
                  status: 'connecting',
                  bypassPeers: []
                };

                setPeers(prev => new Map(prev).set(senderId, newPeer));
                addLog('connection', `Peer discovered: ${senderName} (${senderId})`, senderId);

                if (localPeer.isHost) {
                  getOrCreatePeerConnection(senderId, true);
                }
                break;
              }

              case 'peer-left': {
                const { peerId: leftPeerId, username: leftUsername } = payload || {};
                setPeers(prev => {
                  const next = new Map(prev);
                  next.delete(leftPeerId);
                  return next;
                });

                peerConnections.current.get(leftPeerId)?.close();
                peerConnections.current.delete(leftPeerId);
                bypassConnections.current.get(leftPeerId)?.close();
                bypassConnections.current.delete(leftPeerId);
                chatChannels.current.delete(leftPeerId);
                fileChannels.current.delete(leftPeerId);
                batchManagers.current.delete(leftPeerId);

                addLog('connection', `Peer disconnected: ${leftUsername || leftPeerId}`, leftPeerId);
                break;
              }

              case 'network-chat': {
                addLog('chat', `${payload?.senderName}: ${payload?.text}`, senderId);
                const newMsg: NexusChatMessage = {
                  id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                  senderId: senderId || 'network',
                  senderName: payload?.senderName || 'Peer',
                  text: payload?.text || '',
                  timestamp: Date.now()
                };
                setMessages(prev => [...prev.slice(-300), newMsg]);
                break;
              }

              case 'group-call-start': {
                const { callId, initiatorId, initiatorName, callType = 'video', participants = [] } = payload || {};
                addLog('call', `Broadcast: Group ${callType} call initiated by ${initiatorName}. Syncing all peers...`, 'Group Conference');

                setGlobalCallState(prev => ({
                  ...prev,
                  isActive: true,
                  callId: callId || `group-call-${Date.now()}`,
                  callType,
                  initiatorId,
                  initiatorName,
                  participants: participants.length > 0 ? participants : [initiatorId, localPeer.id],
                  isGroupCall: true
                }));

                // Auto-join media mesh if local stream not active yet
                if (!localStreamRef.current && initiatorId !== localPeer.id) {
                  navigator.mediaDevices?.getUserMedia({
                    video: callType === 'video',
                    audio: true
                  }).then(stream => {
                    localStreamRef.current = stream;
                    setGlobalCallState(curr => ({
                      ...curr,
                      localStream: stream,
                      streams: { ...curr.streams, [localPeer.id]: stream }
                    }));
                    setLocalPeer(p => ({ ...p, stream }));
                    peerConnections.current.forEach(pc => {
                      stream.getTracks().forEach(t => pc.addTrack(t, stream));
                    });
                    bypassConnections.current.forEach(pc => {
                      stream.getTracks().forEach(t => pc.addTrack(t, stream));
                    });
                  }).catch(err => {
                    console.warn('Could not auto-start group call stream:', err);
                  });
                }
                break;
              }

              case 'group-call-end': {
                const { initiatorName } = payload || {};
                addLog('call', `Group call ended by ${initiatorName || 'host'}.`, 'Group Conference');
                if (localStreamRef.current) {
                  localStreamRef.current.getTracks().forEach(t => t.stop());
                  localStreamRef.current = null;
                }
                setGlobalCallState({
                  isActive: false,
                  callId: null,
                  callType: null,
                  initiatorId: null,
                  initiatorName: null,
                  participants: [],
                  streams: {},
                  localStream: null,
                  isGroupCall: false
                });
                setPeers(prev => {
                  const next = new Map(prev);
                  next.forEach((p: NexusPeer, id: string) => {
                    next.set(id, { ...p, stream: undefined });
                  });
                  return next;
                });
                setLocalPeer(p => ({ ...p, stream: undefined }));
                break;
              }

              case 'private-call-start': {
                const { callerId, callerName, targetId, targetName, callType, callId } = payload;
                addLog('call', `Broadcast: Private ${callType} call initiated between ${callerName} and ${targetName}`, 'Call Engine');
                if (targetId === localPeer.id && senderId !== localPeer.id) {
                  setActiveCall({
                    active: true,
                    callId,
                    callerId,
                    callerName,
                    targetId,
                    targetName,
                    callType,
                    isOutgoing: false
                  });
                }
                break;
              }

              case 'private-call-end': {
                const { callerName, targetName, callId } = payload;
                addLog('call', `Broadcast: Private call between ${callerName} and ${targetName} ended.`, 'Call Engine');
                setActiveCall(prev => prev && prev.callId === callId ? null : prev);
                break;
              }

              default:
                break;
            }
          } catch (e) {
            console.error('Failed to parse WebSocket message:', e);
          }
        };
      } catch (err: any) {
        addLog('error', `WebSocket error: ${err.message}`);
      }
    };

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, [addLog, getOrCreatePeerConnection, initSimulationMode, isSimulation, localPeer.avatarColor, localPeer.id, localPeer.isHost, localPeer.username, options.wsUrl, roomId]);

  // Send Batch (Multiplexed file transfer)
  const sendBatch = useCallback((targetPeerId: string, files: File[]): string => {
    if (files.length === 0) return '';
    const targetPeer = peers.get(targetPeerId);
    const targetName = targetPeer?.username || targetPeerId;

    if (isSimulation) {
      const batchId = `batch-sim-${Date.now()}`;
      const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

      const simBatch: BatchTransferState = {
        batchId,
        targetId: targetPeerId,
        targetName,
        direction: 'outgoing',
        status: 'streaming',
        totalFiles: files.length,
        totalBytes,
        transferredBytes: 0,
        currentFileIndex: 0,
        currentFileName: files[0].name,
        progress: 0,
        speed: '8.4 MB/s',
        files: files.map(f => ({
          name: f.name,
          size: f.size,
          mimeType: f.type || 'application/octet-stream',
          status: 'pending',
          progress: 0
        }))
      };

      setActiveBatches(prev => new Map(prev).set(batchId, simBatch));
      addLog('transfer', `Batch manifest proposed to ${targetName} (${files.length} files, ${(totalBytes / 1024).toFixed(1)} KB)`, targetName, { batchId });

      let prog = 0;
      const timer = setInterval(() => {
        prog += 18;
        if (prog >= 100) {
          prog = 100;
          clearInterval(timer);
          simBatchTimers.current.delete(batchId);

          setActiveBatches(prev => {
            const next = new Map(prev);
            const curr = next.get(batchId) as BatchTransferState | undefined;
            if (curr) {
              next.set(batchId, {
                ...curr,
                progress: 100,
                status: 'completed',
                speed: '0 KB/s',
                files: curr.files.map(f => ({ ...f, status: 'completed', progress: 100 }))
              });
            }
            return next;
          });

          addLog('transfer', `Batch transfer to ${targetName} completed successfully (${files.length} files streamed)!`, targetName, { batchId });

          setTimeout(() => {
            setActiveBatches(curr => {
              const m = new Map(curr);
              m.delete(batchId);
              return m;
            });
          }, 2000);
        } else {
          const fileIdx = Math.min(files.length - 1, Math.floor((prog / 100) * files.length));
          setActiveBatches(prev => {
            const next = new Map(prev);
            const curr = next.get(batchId) as BatchTransferState | undefined;
            if (curr) {
              next.set(batchId, {
                ...curr,
                progress: prog,
                currentFileIndex: fileIdx,
                currentFileName: files[fileIdx].name,
                speed: `${(7.2 + Math.cos(prog) * 1.8).toFixed(1)} MB/s`,
                files: curr.files.map((f, i) => ({
                  ...f,
                  status: i < fileIdx ? 'completed' : i === fileIdx ? 'transferring' : 'pending',
                  progress: i < fileIdx ? 100 : i === fileIdx ? Math.min(100, Math.round((prog % 35) * 3)) : 0
                }))
              });
            }
            return next;
          });
        }
      }, 220);

      simBatchTimers.current.set(batchId, timer);
      return batchId;
    }

    // Live WebRTC batch manager
    let manager = batchManagers.current.get(targetPeerId);
    if (!manager) {
      const isTargetHost = targetPeerId === hostId;
      const isSenderHost = localPeer.isHost;
      const needsBypass = !isSenderHost && !isTargetHost;

      if (needsBypass) {
        getOrCreateBypassConnection(targetPeerId, true);
      } else {
        getOrCreatePeerConnection(targetPeerId, true);
      }
      manager = batchManagers.current.get(targetPeerId);
    }

    if (!manager) {
      addLog('error', `Cannot transfer batch: Link to ${targetName} is still initializing. Please try again.`, targetPeerId);
      return '';
    }

    return manager.enqueueBatch(files, targetPeerId, targetName);
  }, [addLog, getOrCreateBypassConnection, getOrCreatePeerConnection, hostId, isSimulation, localPeer.isHost, peers]);

  // Single file delegate
  const sendFile = useCallback((targetPeerId: string, file: File) => {
    return sendBatch(targetPeerId, [file]);
  }, [sendBatch]);

  // Cancel an active batch
  const cancelBatch = useCallback((targetPeerId: string, batchId: string) => {
    if (isSimulation) {
      const timer = simBatchTimers.current.get(batchId);
      if (timer) {
        clearInterval(timer);
        simBatchTimers.current.delete(batchId);
      }
      setActiveBatches(prev => {
        const next = new Map(prev);
        next.delete(batchId);
        return next;
      });
      addLog('transfer', `Batch ${batchId} cancelled by user.`, 'Simulation');
      return;
    }
    const manager = batchManagers.current.get(targetPeerId);
    if (manager) {
      manager.cancelBatch(batchId);
    }
  }, [addLog, isSimulation]);

  // Send real-time chat message (Isolated on [nexus-chat])
  const sendMessage = useCallback((text: string, targetPeerId?: string) => {
    if (!text.trim()) return;

    const localMsg: NexusChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      senderId: localPeer.id,
      senderName: localPeer.username,
      text,
      timestamp: Date.now(),
      targetId: targetPeerId,
      isDirect: Boolean(targetPeerId)
    };
    setMessages(prev => [...prev.slice(-300), localMsg]);

    if (isSimulation) {
      const recipientName = targetPeerId ? peers.get(targetPeerId)?.username || targetPeerId : 'Global Mesh';
      addLog('chat', `[nexus-chat] You: ${text}`, recipientName, { sender: 'You' });

      // Simulated peer responses with contextual intelligence
      setTimeout(() => {
        const simPeerList = Array.from(peers.values());
        const respondent = targetPeerId
          ? peers.get(targetPeerId) || simPeerList[0]
          : simPeerList[Math.floor(Math.random() * simPeerList.length)] || DEFAULT_SIM_PEERS[0];

        const responses = [
          `Packet acknowledged over [nexus-chat]. RTT: 12ms.`,
          `Throughput optimal (8.4 MB/s). Ready for multiplexed batch file transfer.`,
          `SCTP isolated data channel open and verified.`,
          `Received ping! Topology status normal.`,
          `A/V dynamic media renegotiation ready.`
        ];
        const reply = responses[Math.floor(Math.random() * responses.length)];

        addLog('chat', `[nexus-chat] ${respondent.username}: ${reply}`, respondent.username, {
          sender: respondent.username
        });

        const simMsg: NexusChatMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          senderId: respondent.id,
          senderName: respondent.username,
          text: reply,
          timestamp: Date.now(),
          targetId: localPeer.id,
          isDirect: Boolean(targetPeerId)
        };
        setMessages(prev => [...prev.slice(-300), simMsg]);
      }, 700 + Math.random() * 500);
      return;
    }

    // Live WebRTC send
    if (targetPeerId) {
      const dc = chatChannels.current.get(targetPeerId);
      if (dc && dc.readyState === 'open') {
        dc.send(JSON.stringify({
          type: 'chat',
          text,
          senderName: localPeer.username,
          senderId: localPeer.id,
          timestamp: Date.now()
        }));
        addLog('chat', `[nexus-chat] You -> ${peers.get(targetPeerId)?.username || targetPeerId}: ${text}`, targetPeerId);
        return;
      }
    }

    // Broadcast across all connected chat data channels
    let sentCount = 0;
    chatChannels.current.forEach(dc => {
      if (dc.readyState === 'open') {
        try {
          dc.send(JSON.stringify({
            type: 'chat',
            text,
            senderName: localPeer.username,
            senderId: localPeer.id,
            timestamp: Date.now()
          }));
          sentCount++;
        } catch (_) {}
      }
    });

    if (sentCount > 0) {
      addLog('chat', `[nexus-chat] You (Broadcast to ${sentCount} peers): ${text}`, 'Local');
    } else {
      sendSignal('network-chat', 'broadcast', { text, senderName: localPeer.username });
      addLog('chat', `[signaling-relay] You: ${text}`, 'Local');
    }
  }, [addLog, isSimulation, localPeer.id, localPeer.username, peers, sendSignal]);

  // Start Private Call: Dynamically adds media tracks without interrupting active file transfers
  const startCall = useCallback(async (targetPeerId: string, callType: 'audio' | 'video' = 'audio') => {
    const target = peers.get(targetPeerId);
    const targetName = target?.username || targetPeerId;
    const callId = `call-${Date.now()}`;

    if (isSimulation) {
      // Create outgoing call
      setActiveCall({
        active: true,
        callId,
        callerId: localPeer.id,
        callerName: localPeer.username,
        targetId: targetPeerId,
        targetName,
        callType,
        isOutgoing: true
      });

      addLog('call', `Calling ${targetName} over multiplexed ${callType} channel...`, targetName);

      // Simulated peer answers after 1.2 seconds
      setTimeout(() => {
        const synthetic = createSyntheticVideoStream(targetName, callType);
        syntheticCleanupRef.current = synthetic.cleanup;

        setActiveCall(prev => {
          if (!prev) return null;
          return {
            ...prev,
            remoteStream: synthetic.stream,
            stream: synthetic.stream
          };
        });

        addLog('call', `${targetName} answered ${callType} call! Synthetic 30 FPS media stream active.`, targetName);
      }, 1200);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video'
      });
      localStreamRef.current = stream;

      const callObj: NexusCall = {
        active: true,
        callId,
        callerId: localPeer.id,
        callerName: localPeer.username,
        targetId: targetPeerId,
        targetName,
        callType,
        isOutgoing: true,
        stream
      };

      setActiveCall(callObj);

      const isTargetHost = targetPeerId === hostId;
      const isSenderHost = localPeer.isHost;
      const needsBypass = !isSenderHost && !isTargetHost;

      const pc = needsBypass
        ? getOrCreateBypassConnection(targetPeerId, true)
        : getOrCreatePeerConnection(targetPeerId, true);

      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      addLog('call', `Started dynamic ${callType} call with ${targetName} (multiplexed over existing link)`, targetPeerId);

      sendSignal('private-call-start', targetPeerId, {
        callId,
        callerId: localPeer.id,
        callerName: localPeer.username,
        targetId: targetPeerId,
        targetName,
        callType
      });
    } catch (err: any) {
      addLog('error', `Microphone/Camera access error: ${err.message}`);
    }
  }, [addLog, getOrCreateBypassConnection, getOrCreatePeerConnection, hostId, isSimulation, localPeer.id, localPeer.isHost, localPeer.username, peers, sendSignal]);

  // Answer Incoming Call
  const answerCall = useCallback(async (callType: 'audio' | 'video' = 'audio') => {
    if (!activeCall) return;

    if (isSimulation) {
      const synthetic = createSyntheticVideoStream(activeCall.callerName, callType);
      syntheticCleanupRef.current = synthetic.cleanup;

      setActiveCall(prev => prev ? {
        ...prev,
        remoteStream: synthetic.stream,
        stream: synthetic.stream
      } : null);

      addLog('call', `Accepted ${callType} call from ${activeCall.callerName}. Synthetic A/V tracks linked.`, activeCall.callerName);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video'
      });
      localStreamRef.current = stream;

      setActiveCall(prev => prev ? { ...prev, stream } : null);

      const targetPeerId = activeCall.callerId;
      const isTargetHost = targetPeerId === hostId;
      const isSenderHost = localPeer.isHost;
      const needsBypass = !isSenderHost && !isTargetHost;

      const pc = needsBypass
        ? getOrCreateBypassConnection(targetPeerId, false)
        : getOrCreatePeerConnection(targetPeerId, false);

      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      addLog('call', `Answered ${callType} call from ${activeCall.callerName}. Media tracks multiplexed dynamically.`, targetPeerId);
    } catch (err: any) {
      addLog('error', `Microphone/Camera access error on answer: ${err.message}`);
    }
  }, [activeCall, addLog, getOrCreateBypassConnection, getOrCreatePeerConnection, hostId, isSimulation, localPeer.isHost]);

  // End Call
  const endCall = useCallback(() => {
    if (activeCall) {
      if (isSimulation) {
        if (syntheticCleanupRef.current) {
          syntheticCleanupRef.current();
          syntheticCleanupRef.current = null;
        }
        addLog('call', `Call with ${activeCall.isOutgoing ? activeCall.targetName : activeCall.callerName} ended.`, 'Call Engine');
        setActiveCall(null);
        return;
      }

      const targetPeerId = activeCall.isOutgoing ? activeCall.targetId : activeCall.callerId;
      sendSignal('private-call-end', targetPeerId, {
        callId: activeCall.callId,
        callerName: activeCall.callerName,
        targetName: activeCall.targetName
      });

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(tr => {
          tr.stop();
          const pc = bypassConnections.current.get(targetPeerId) || peerConnections.current.get(targetPeerId);
          if (pc) {
            const sender = pc.getSenders().find(s => s.track === tr);
            if (sender) pc.removeTrack(sender);
          }
        });
        localStreamRef.current = null;
      }

      addLog('call', `Call with ${activeCall.targetName} ended cleanly. File transfer channels remain open.`, targetPeerId);
      setActiveCall(null);
    }
  }, [activeCall, addLog, isSimulation, sendSignal]);

  // Start Group Call
  const startGroupCall = useCallback(async (callType: 'audio' | 'video' = 'video') => {
    const callId = `group-call-${Date.now()}`;
    addLog('call', `Initiating mesh group ${callType} conference...`, 'Group Conference');

    if (isSimulation) {
      // Create local stream
      let localStream: MediaStream;
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: callType === 'video',
          audio: true
        });
      } catch {
        const syntheticLocal = createSyntheticVideoStream(`You (${localPeer.username})`, callType);
        localStream = syntheticLocal.stream;
      }
      localStreamRef.current = localStream;

      // 4 simulated peers + local = 5 participants!
      const simPeersList: NexusPeer[] = Array.from(peers.values()) as NexusPeer[];
      const streamsMap: Record<string, MediaStream> = {
        [localPeer.id]: localStream
      };
      const cleanups: (() => void)[] = [];

      simPeersList.forEach((peer: NexusPeer) => {
        const syn = createSyntheticVideoStream(peer.username, callType);
        streamsMap[peer.id] = syn.stream;
        cleanups.push(syn.cleanup);
      });

      groupSyntheticCleanupsRef.current = cleanups;
      const participantIds = [localPeer.id, ...simPeersList.map(p => p.id)];

      setGlobalCallState({
        isActive: true,
        callId,
        callType,
        initiatorId: localPeer.id,
        initiatorName: localPeer.username,
        participants: participantIds,
        streams: streamsMap,
        localStream,
        isGroupCall: true
      });

      setPeers(prev => {
        const next = new Map(prev);
        simPeersList.forEach((p: NexusPeer) => {
          const stream = streamsMap[p.id];
          next.set(p.id, { ...p, stream });
        });
        return next;
      });

      setLocalPeer(prev => ({ ...prev, stream: localStream }));
      addLog('call', `Group ${callType} conference live! All 5 nodes connected in mesh topology.`, 'Group Conference');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: callType === 'video',
        audio: true
      });
      localStreamRef.current = stream;

      const participantIds = [localPeer.id, ...Array.from(peers.keys())];

      setGlobalCallState({
        isActive: true,
        callId,
        callType,
        initiatorId: localPeer.id,
        initiatorName: localPeer.username,
        participants: participantIds,
        streams: { [localPeer.id]: stream },
        localStream: stream,
        isGroupCall: true
      });

      setLocalPeer(prev => ({ ...prev, stream }));

      // Broadcast room-wide
      sendSignal('group-call-start', '', {
        callId,
        initiatorId: localPeer.id,
        initiatorName: localPeer.username,
        callType,
        participants: participantIds
      });

      // Add tracks to all open peer connections
      peerConnections.current.forEach(pc => {
        stream.getTracks().forEach(t => pc.addTrack(t, stream));
      });
      bypassConnections.current.forEach(pc => {
        stream.getTracks().forEach(t => pc.addTrack(t, stream));
      });

      addLog('call', `Broadcast group ${callType} call to room participants.`, 'Group Conference');
    } catch (err: any) {
      addLog('error', `Could not start group call: ${err.message}`, 'Group Conference');
    }
  }, [addLog, isSimulation, localPeer.id, localPeer.username, peers, sendSignal]);

  // End Group Call
  const endGroupCall = useCallback(() => {
    if (isSimulation) {
      if (groupSyntheticCleanupsRef.current) {
        groupSyntheticCleanupsRef.current.forEach(c => c());
        groupSyntheticCleanupsRef.current = [];
      }
    } else {
      sendSignal('group-call-end', '', {
        initiatorId: localPeer.id,
        initiatorName: localPeer.username
      });
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }

    setGlobalCallState({
      isActive: false,
      callId: null,
      callType: null,
      initiatorId: null,
      initiatorName: null,
      participants: [],
      streams: {},
      localStream: null,
      isGroupCall: false
    });

    setPeers(prev => {
      const next = new Map(prev);
      next.forEach((p: NexusPeer, id: string) => {
        next.set(id, { ...p, stream: undefined });
      });
      return next;
    });

    setLocalPeer(prev => ({ ...prev, stream: undefined }));
    addLog('call', 'Group conference ended cleanly.', 'Group Conference');
  }, [addLog, isSimulation, localPeer.id, localPeer.username, sendSignal]);

  // Simulate group call helper
  const simulateGroupCall = useCallback(() => {
    startGroupCall('video');
  }, [startGroupCall]);

  // Globally synced peers list (contains ID, name, connection status, and active MediaStreams)
  const peersList = useMemo<NexusPeer[]>(() => {
    return (Array.from(peers.values()) as NexusPeer[]).map((peer: NexusPeer) => {
      const stream = globalCallState.streams[peer.id] || peer.stream;
      return {
        ...peer,
        stream
      };
    });
  }, [peers, globalCallState.streams]);

  // Derived Concurrent States for Visualization
  const concurrentPeerStates = useMemo<ConcurrentBypassState[]>(() => {
    return (Array.from(peers.values()) as NexusPeer[]).map(peer => {
      const isCalling = Boolean(
        activeCall &&
        activeCall.active &&
        (activeCall.targetId === peer.id || activeCall.callerId === peer.id)
      );

      const activeBatch = (Array.from(activeBatches.values()) as BatchTransferState[]).find(
        b => b.targetId === peer.id && (b.status === 'streaming' || b.status === 'accepted' || b.status === 'negotiating')
      );

      return {
        targetId: peer.id,
        targetName: peer.username,
        isCalling,
        callType: isCalling ? activeCall?.callType : undefined,
        hasActiveBatch: Boolean(activeBatch),
        batchProgress: activeBatch?.progress,
        isHostLink: peer.isHost || localPeer.isHost
      };
    });
  }, [peers, activeCall, activeBatches, localPeer.isHost]);

  return {
    localPeer,
    peers,
    peersList,
    messages,
    globalCallState,
    hostId,
    wsConnected,
    isSimulation,
    setSimulationMode,
    simulateAddPeer,
    simulateIncomingCall,
    simulateIncomingBatch,
    simulateGroupCall,
    activeTransfers,
    activeBatches,
    concurrentPeerStates,
    logs,
    activeCall,
    sendFile,
    sendBatch,
    cancelBatch,
    sendMessage,
    startCall,
    answerCall,
    endCall,
    startGroupCall,
    endGroupCall
  };
}
