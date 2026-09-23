import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  NexusPeer,
  NexusTransfer,
  NexusLog,
  NexusCall,
  BatchTransferState,
  ConcurrentBypassState
} from './types';
import { BatchTransferManager } from './BatchTransferManager';

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
  onFileReceived?: (file: File, fromPeer: NexusPeer) => void;
}

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
  const [activeTransfers, setActiveTransfers] = useState<Map<string, NexusTransfer>>(new Map());
  const [activeBatches, setActiveBatches] = useState<Map<string, BatchTransferState>>(new Map());
  const [logs, setLogs] = useState<NexusLog[]>([]);
  const [activeCall, setActiveCall] = useState<NexusCall | null>(null);

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

  // Local A/V Media Stream Reference
  const localStreamRef = useRef<MediaStream | null>(null);

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
        payload,
        timestamp: Date.now()
      }));
    }
  }, [roomId, localPeer.id, localPeer.username]);

  // Setup isolated Control/Chat DataChannel (label: 'nexus-chat')
  const setupChatDataChannel = useCallback((dc: RTCDataChannel, remotePeerId: string, isBypass: boolean = false) => {
    chatChannels.current.set(remotePeerId, dc);

    dc.onopen = () => {
      addLog('connection', `Control/Chat channel [nexus-chat] opened with ${remotePeerId} ${isBypass ? '(Direct Bypass)' : ''}`, remotePeerId);
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
      addLog('error', `Chat channel error with ${remotePeerId}: ${err?.message || 'unknown'}`, remotePeerId);
    };

    dc.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'chat') {
            addLog('chat', `${msg.senderName || remotePeerId}: ${msg.text}`, remotePeerId);
          }
        } catch {
          addLog('chat', `${remotePeerId}: ${event.data}`, remotePeerId);
        }
      }
    };
  }, [addLog, localPeer.id]);

  // Setup isolated File Transfer DataChannel (label: 'nexus-file-transfer')
  const setupFileDataChannel = useCallback((dc: RTCDataChannel, remotePeerId: string, isBypass: boolean = false) => {
    fileChannels.current.set(remotePeerId, dc);

    // Instantiate or update standalone BatchTransferManager attached to this channel
    const existingManager = batchManagers.current.get(remotePeerId);
    if (existingManager) {
      existingManager.updateChannel(dc);
    } else {
      const manager = new BatchTransferManager(dc, localPeer.id, localPeer.username, {
        onStateChange: (state) => {
          setActiveBatches(prev => new Map(prev).set(state.batchId, state));

          // Also mirror individual files to activeTransfers for single file displays
          state.files.forEach((f, idx) => {
            const transferId = `${state.batchId}-${idx}`;
            if (f.status === 'transferring' || f.status === 'completed') {
              setActiveTransfers(prev => new Map(prev).set(transferId, {
                id: transferId,
                fileName: f.name,
                fileSize: f.size,
                progress: f.progress,
                speed: state.speed,
                fromPeerId: state.direction === 'outgoing' ? localPeer.id : remotePeerId,
                toPeerId: state.direction === 'outgoing' ? remotePeerId : localPeer.id,
                isBypass,
                status: f.status === 'completed' ? 'completed' : 'active',
                transferredBytes: Math.round((f.progress / 100) * f.size)
              }));
            }
          });
        },
        onFileReceived: (file, batchId, fileIndex) => {
          const senderPeer = peers.get(remotePeerId) || {
            id: remotePeerId,
            username: `Node-${remotePeerId.substring(0, 4)}`,
            avatarColor: 'bg-accent',
            isHost: remotePeerId === hostId,
            joinedAt: Date.now(),
            status: 'connected',
            bypassPeers: []
          };
          onFileReceived?.(file, senderPeer);
        },
        onBatchCompleted: (batchId, direction) => {
          setTimeout(() => {
            setActiveBatches(prev => {
              const next = new Map(prev);
              next.delete(batchId);
              return next;
            });
          }, 4000);
        },
        onLog: (type, text, metadata) => {
          const peer = peers.get(remotePeerId);
          addLog(type, text, peer?.username || remotePeerId, metadata);
        }
      });

      batchManagers.current.set(remotePeerId, manager);
    }

    addLog('connection', `File Transfer channel [nexus-file-transfer] ready with ${remotePeerId}`, remotePeerId);
  }, [peers, localPeer.id, localPeer.username, hostId, onFileReceived, addLog]);

  // Core Helper: Create/Configure RTCPeerConnection with Dynamic Renegotiation & Channel Isolation
  const createConnection = useCallback((remotePeerId: string, isInitiator: boolean, isBypass: boolean) => {
    const connectionMap = isBypass ? bypassConnections.current : peerConnections.current;
    if (connectionMap.has(remotePeerId)) {
      return connectionMap.get(remotePeerId)!;
    }

    addLog('signaling', `Creating ${isBypass ? 'Direct P2P Bypass' : 'Host Topology'} connection with ${remotePeerId}...`, remotePeerId);

    const pc = new RTCPeerConnection(RTC_CONFIG);
    connectionMap.set(remotePeerId, pc);

    makingOfferMap.current.set(remotePeerId, false);
    ignoreOfferMap.current.set(remotePeerId, false);

    // ICE Candidate generation
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal(isBypass ? 'bypass-ice' : 'signal-ice', remotePeerId, event.candidate);
      }
    };

    // Connection State Changes
    pc.onconnectionstatechange = () => {
      addLog('connection', `${isBypass ? 'Bypass' : 'Standard'} link to ${remotePeerId}: ${pc.connectionState}`, remotePeerId);
      if (pc.connectionState === 'connected') {
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

        if (isBypass) {
          setLocalPeer(prev => ({
            ...prev,
            bypassPeers: Array.from(new Set([...prev.bypassPeers, remotePeerId]))
          }));
        }
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        if (isBypass) {
          setLocalPeer(prev => ({
            ...prev,
            bypassPeers: prev.bypassPeers.filter(id => id !== remotePeerId)
          }));
        }
      }
    };

    // Dynamic Incoming Media Tracks (Audio / Video Call)
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        addLog('call', `Incoming media stream received from ${remotePeerId}`, remotePeerId);
        setActiveCall(prev => prev ? { ...prev, remoteStream: event.streams[0] } : null);
      }
    };

    // Dynamic Perfect Negotiation: onnegotiationneeded handler
    // Handles adding/removing media tracks, new data channels without interrupting ongoing file streams!
    pc.onnegotiationneeded = async () => {
      try {
        makingOfferMap.current.set(remotePeerId, true);
        await pc.setLocalDescription();
        sendSignal(isBypass ? 'bypass-offer' : 'signal-offer', remotePeerId, pc.localDescription);
      } catch (err: any) {
        console.error(`onnegotiationneeded error with ${remotePeerId}:`, err);
      } finally {
        makingOfferMap.current.set(remotePeerId, false);
      }
    };

    // Handle Incoming Isolated DataChannels
    pc.ondatachannel = (event) => {
      const dc = event.channel;
      if (dc.label === 'nexus-chat') {
        setupChatDataChannel(dc, remotePeerId, isBypass);
      } else if (dc.label === 'nexus-file-transfer') {
        setupFileDataChannel(dc, remotePeerId, isBypass);
      } else {
        // Fallback for legacy or custom labels
        if (dc.label.includes('file')) {
          setupFileDataChannel(dc, remotePeerId, isBypass);
        } else {
          setupChatDataChannel(dc, remotePeerId, isBypass);
        }
      }
    };

    // If active local call stream already exists, attach tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Channel Isolation: Initiator pre-creates isolated channels for Chat and File Transfers
    if (isInitiator) {
      const chatDc = pc.createDataChannel('nexus-chat');
      setupChatDataChannel(chatDc, remotePeerId, isBypass);

      const fileDc = pc.createDataChannel('nexus-file-transfer');
      setupFileDataChannel(fileDc, remotePeerId, isBypass);
    }

    return pc;
  }, [addLog, localPeer.id, sendSignal, setupChatDataChannel, setupFileDataChannel]);

  // Specific Get-or-Create functions
  const getOrCreatePeerConnection = useCallback((remotePeerId: string, isInitiator: boolean) => {
    return createConnection(remotePeerId, isInitiator, false);
  }, [createConnection]);

  const getOrCreateBypassConnection = useCallback((remotePeerId: string, isInitiator: boolean) => {
    return createConnection(remotePeerId, isInitiator, true);
  }, [createConnection]);

  // WebRTC Perfect Negotiation Offer Receiver
  const handleIncomingOffer = useCallback(async (senderId: string, description: RTCSessionDescriptionInit, isBypass: boolean) => {
    const pc = isBypass
      ? getOrCreateBypassConnection(senderId, false)
      : getOrCreatePeerConnection(senderId, false);

    // Polite peer determination: Peer ID with lexicographically lower value yields to collision
    const isPolite = localPeer.id < senderId;
    const isMakingOffer = makingOfferMap.current.get(senderId) || false;
    const offerCollision = (description.type === 'offer') && (isMakingOffer || pc.signalingState !== 'stable');

    if (!isPolite && offerCollision) {
      ignoreOfferMap.current.set(senderId, true);
      addLog('signaling', `Glare collision resolved (impolite peer ignored collision offer from ${senderId})`, senderId);
      return;
    }
    ignoreOfferMap.current.set(senderId, false);

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(description));
      if (description.type === 'offer') {
        await pc.setLocalDescription();
        sendSignal(isBypass ? 'bypass-answer' : 'signal-answer', senderId, pc.localDescription);
      }
    } catch (err: any) {
      console.error(`Error handling offer from ${senderId}:`, err);
    }
  }, [addLog, getOrCreateBypassConnection, getOrCreatePeerConnection, localPeer.id, sendSignal]);

  // WebRTC Answer Receiver
  const handleIncomingAnswer = useCallback(async (senderId: string, description: RTCSessionDescriptionInit, isBypass: boolean) => {
    const pc = isBypass ? bypassConnections.current.get(senderId) : peerConnections.current.get(senderId);
    if (pc) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(description));
      } catch (err: any) {
        console.error(`Error setting remote answer from ${senderId}:`, err);
      }
    }
  }, []);

  // WebRTC ICE Candidate Receiver
  const handleIncomingIce = useCallback(async (senderId: string, candidate: RTCIceCandidateInit, isBypass: boolean) => {
    const pc = isBypass ? bypassConnections.current.get(senderId) : peerConnections.current.get(senderId);
    if (pc && candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err: any) {
        if (!ignoreOfferMap.current.get(senderId)) {
          console.error(`Error adding ICE candidate from ${senderId}:`, err);
        }
      }
    }
  }, []);

  // Connect WebSocket signaling
  useEffect(() => {
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
          addLog('signaling', `Connected to signaling hub. Authenticated as ${localPeer.username}`);
        };

        ws.onclose = () => {
          setWsConnected(false);
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

                // If I am not host, connect with Host
                if (!amIHost && currentHostId) {
                  getOrCreatePeerConnection(currentHostId, true);
                }
                break;
              }

              case 'peer-joined': {
                if (senderId === localPeer.id) return;
                const newPeer: NexusPeer = {
                  id: payload.id,
                  username: payload.username,
                  avatarColor: payload.avatarColor || 'bg-accent',
                  isHost: payload.isHost,
                  joinedAt: payload.joinedAt || Date.now(),
                  status: 'connecting',
                  bypassPeers: []
                };

                setPeers(prev => new Map(prev).set(senderId, newPeer));
                addLog('connection', `Peer joined: ${newPeer.username} (${senderId})`, senderId);

                // If I am central Host, initiate connection
                if (localPeer.isHost) {
                  getOrCreatePeerConnection(senderId, true);
                }
                break;
              }

              case 'peer-left': {
                const { peerId: leftPeerId, username: leftUsername, newHostId } = payload;
                setPeers(prev => {
                  const next = new Map(prev);
                  next.delete(leftPeerId);
                  return next;
                });

                if (newHostId) {
                  setHostId(newHostId);
                  if (newHostId === localPeer.id) {
                    setLocalPeer(prev => ({ ...prev, isHost: true }));
                    addLog('connection', `Host disconnected! You are elected central Host.`, 'Failover');
                  } else {
                    addLog('connection', `Host disconnected! New Host: ${newHostId}`, 'Failover');
                  }
                }

                // Cleanup connections and channels
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

              // Standard Host WebRTC Handshake
              case 'signal-offer': {
                await handleIncomingOffer(senderId, payload, false);
                break;
              }
              case 'signal-answer': {
                await handleIncomingAnswer(senderId, payload, false);
                break;
              }
              case 'signal-ice': {
                await handleIncomingIce(senderId, payload, false);
                break;
              }

              // Direct P2P Bypass Handshake
              case 'bypass-offer': {
                await handleIncomingOffer(senderId, payload, true);
                break;
              }
              case 'bypass-answer': {
                await handleIncomingAnswer(senderId, payload, true);
                break;
              }
              case 'bypass-ice': {
                await handleIncomingIce(senderId, payload, true);
                break;
              }

              // Private Call Events (Broadcasted across room for network-wide logging)
              case 'private-call-start': {
                const { callerId, callerName, targetId, targetName, callType, callId } = payload;
                addLog('call', `Broadcast: Private ${callType} call initiated between ${callerName} and ${targetName}`, 'Call Engine', {
                  callId,
                  callerId,
                  targetId
                });

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
                addLog('call', `Broadcast: Private call between ${callerName} and ${targetName} ended.`, 'Call Engine', { callId });
                setActiveCall(prev => prev && prev.callId === callId ? null : prev);
                break;
              }

              case 'network-chat': {
                addLog('chat', `${senderName}: ${payload.text}`, senderId);
                break;
              }
            }
          } catch (e) {
            console.error('Signaling message error:', e);
          }
        };
      } catch (err) {
        console.error('WebSocket connection setup error:', err);
      }
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) ws.close();
      peerConnections.current.forEach(pc => pc.close());
      bypassConnections.current.forEach(pc => pc.close());
    };
  }, [roomId, localPeer.id, localPeer.username, localPeer.avatarColor, localPeer.isHost, options.wsUrl, addLog, getOrCreatePeerConnection, handleIncomingOffer, handleIncomingAnswer, handleIncomingIce]);

  // Send Chat message across network or direct peer channel
  const sendMessage = useCallback((text: string, directTargetId?: string) => {
    if (!text.trim()) return;

    // Check if direct isolated chat channel exists
    if (directTargetId) {
      const dc = chatChannels.current.get(directTargetId);
      if (dc && dc.readyState === 'open') {
        dc.send(JSON.stringify({
          type: 'chat',
          senderId: localPeer.id,
          senderName: localPeer.username,
          text,
          timestamp: Date.now()
        }));
        const targetPeer = peers.get(directTargetId);
        addLog('chat', `[Direct to ${targetPeer?.username || directTargetId}]: ${text}`, directTargetId);
        return;
      }
    }

    // Default broadcast over signaling server
    sendSignal('network-chat', '', { text });
  }, [localPeer.id, localPeer.username, peers, sendSignal, addLog]);

  // Send a Batch of Files with Manifest Handshake & Backpressure Flow Control
  const sendBatch = useCallback(async (targetPeerId: string, files: File[]): Promise<string> => {
    if (!files || files.length === 0 || !targetPeerId) return '';

    const targetPeer = peers.get(targetPeerId);
    const isTargetHost = targetPeerId === hostId;
    const isSenderHost = localPeer.isHost;
    const needsBypass = !isSenderHost && !isTargetHost;

    // Ensure connection is established
    if (needsBypass) {
      getOrCreateBypassConnection(targetPeerId, true);
    } else {
      getOrCreatePeerConnection(targetPeerId, true);
    }

    // Await BatchTransferManager readiness
    let manager = batchManagers.current.get(targetPeerId);
    if (!manager) {
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 250));
        manager = batchManagers.current.get(targetPeerId);
        if (manager) break;
      }
    }

    if (!manager) {
      addLog('error', `Cannot transfer batch: Link to ${targetPeer?.username || targetPeerId} is still initializing. Please try again.`, targetPeerId);
      return '';
    }

    return manager.enqueueBatch(files, targetPeerId, targetPeer?.username);
  }, [addLog, getOrCreateBypassConnection, getOrCreatePeerConnection, hostId, localPeer.isHost, peers]);

  // Single file transfer delegate
  const sendFile = useCallback((targetPeerId: string, file: File) => {
    return sendBatch(targetPeerId, [file]);
  }, [sendBatch]);

  // Cancel an active batch
  const cancelBatch = useCallback((targetPeerId: string, batchId: string) => {
    const manager = batchManagers.current.get(targetPeerId);
    if (manager) {
      manager.cancelBatch(batchId);
    }
  }, []);

  // Start Private Call: Dynamically adds media tracks without interrupting active file transfers
  const startCall = useCallback(async (targetPeerId: string, callType: 'audio' | 'video' = 'audio') => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video'
      });
      localStreamRef.current = stream;

      const callId = `call-${Date.now()}`;
      const target = peers.get(targetPeerId);

      const callObj: NexusCall = {
        active: true,
        callId,
        callerId: localPeer.id,
        callerName: localPeer.username,
        targetId: targetPeerId,
        targetName: target?.username || targetPeerId,
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

      // Dynamic Track Addition: onnegotiationneeded handles renegotiation smoothly
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      addLog('call', `Started dynamic ${callType} call with ${target?.username || targetPeerId} (multiplexed over existing link)`, targetPeerId);

      // Broadcast to room
      sendSignal('private-call-start', targetPeerId, {
        callId,
        callerId: localPeer.id,
        callerName: localPeer.username,
        targetId: targetPeerId,
        targetName: target?.username || targetPeerId,
        callType
      });
    } catch (err: any) {
      addLog('error', `Microphone/Camera access error: ${err.message}`);
    }
  }, [addLog, getOrCreateBypassConnection, getOrCreatePeerConnection, hostId, localPeer.id, localPeer.isHost, localPeer.username, peers, sendSignal]);

  // Answer Incoming Private Call
  const answerCall = useCallback(async (callType: 'audio' | 'video' = 'audio') => {
    if (!activeCall) return;

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
  }, [activeCall, addLog, getOrCreateBypassConnection, getOrCreatePeerConnection, hostId, localPeer.isHost]);

  // End Call: Removes media tracks and triggers negotiation needed to cleanly teardown A/V
  const endCall = useCallback(() => {
    if (activeCall) {
      const targetPeerId = activeCall.isOutgoing ? activeCall.targetId : activeCall.callerId;
      sendSignal('private-call-end', targetPeerId, {
        callId: activeCall.callId,
        callerName: activeCall.callerName,
        targetName: activeCall.targetName
      });

      const isTargetHost = targetPeerId === hostId;
      const isSenderHost = localPeer.isHost;
      const needsBypass = !isSenderHost && !isTargetHost;

      const pc = needsBypass
        ? bypassConnections.current.get(targetPeerId)
        : peerConnections.current.get(targetPeerId);

      if (pc) {
        pc.getSenders().forEach(sender => {
          if (sender.track) {
            try {
              pc.removeTrack(sender);
            } catch (e) {
              console.error('Error removing track:', e);
            }
          }
        });
      }
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }

    setActiveCall(null);
  }, [activeCall, hostId, localPeer.isHost, sendSignal]);

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
    hostId,
    wsConnected,
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
    addLog
  };
}
