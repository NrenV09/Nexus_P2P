import { useState, useEffect, useRef, useCallback } from 'react';
import { NexusPeer, NexusTransfer, NexusLog, NexusCall } from './types';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ]
};

const CHUNK_SIZE = 32 * 1024; // 32 KB chunk for optimal DataChannel throughput

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
  const [logs, setLogs] = useState<NexusLog[]>([]);
  const [activeCall, setActiveCall] = useState<NexusCall | null>(null);

  // References
  const wsRef = useRef<WebSocket | null>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const dataChannels = useRef<Map<string, RTCDataChannel>>(new Map());
  const bypassConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const bypassDataChannels = useRef<Map<string, RTCDataChannel>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const activeTransfersRef = useRef<Map<string, NexusTransfer>>(new Map());
  const receivingBuffers = useRef<Map<string, { chunks: ArrayBuffer[]; received: number; total: number; name: string; from: string }>>(new Map());

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
    setLogs(prev => [...prev.slice(-250), newLog]);
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

  // Setup DataChannel listeners
  const setupDataChannel = useCallback((dc: RTCDataChannel, remotePeerId: string, isBypass: boolean = false) => {
    dc.binaryType = 'arraybuffer';

    dc.onopen = () => {
      addLog('connection', `DataChannel opened with ${remotePeerId} ${isBypass ? '(Direct Bypass)' : ''}`, remotePeerId);
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
      addLog('connection', `DataChannel closed with ${remotePeerId}`, remotePeerId);
    };

    dc.onerror = (err: any) => {
      addLog('error', `DataChannel error with ${remotePeerId}: ${err?.message || 'unknown'}`, remotePeerId);
    };

    dc.onmessage = (event) => {
      // 1. If string: control/chat message
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'file-meta') {
            // Incoming file header
            const { transferId, name, size } = msg;
            receivingBuffers.current.set(transferId, {
              chunks: [],
              received: 0,
              total: size,
              name,
              from: remotePeerId
            });

            const transferObj: NexusTransfer = {
              id: transferId,
              fileName: name,
              fileSize: size,
              progress: 0,
              speed: 'Connecting...',
              fromPeerId: remotePeerId,
              toPeerId: localPeer.id,
              isBypass,
              status: 'active',
              transferredBytes: 0
            };

            setActiveTransfers(prev => new Map(prev).set(transferId, transferObj));
            activeTransfersRef.current.set(transferId, transferObj);
            addLog('transfer', `Incoming transfer: "${name}" (${(size / (1024 * 1024)).toFixed(2)} MB) from ${remotePeerId}`, remotePeerId);
          } else if (msg.type === 'transfer-complete') {
            const { transferId } = msg;
            const buf = receivingBuffers.current.get(transferId);
            if (buf) {
              const blob = new Blob(buf.chunks);
              const file = new File([blob], buf.name);
              const senderPeer = peers.get(buf.from) || {
                id: buf.from,
                username: `Peer-${buf.from.substring(0, 4)}`,
                avatarColor: 'bg-accent',
                isHost: buf.from === hostId,
                joinedAt: Date.now(),
                status: 'connected',
                bypassPeers: []
              };

              addLog('transfer', `Received "${buf.name}" successfully! Saved to memory.`, buf.from);
              onFileReceived?.(file, senderPeer);
              receivingBuffers.current.delete(transferId);

              setActiveTransfers(prev => {
                const next = new Map(prev);
                const t = next.get(transferId) as NexusTransfer | undefined;
                if (t) next.set(transferId, { ...t, progress: 100, status: 'completed' });
                return next;
              });

              setTimeout(() => {
                setActiveTransfers(prev => {
                  const next = new Map(prev);
                  next.delete(transferId);
                  return next;
                });
              }, 4000);
            }
          }
        } catch (_) {}
        return;
      }

      // 2. If ArrayBuffer: chunk of file
      if (event.data instanceof ArrayBuffer) {
        // First 36 bytes contains transferId string
        const transferIdBytes = new Uint8Array(event.data, 0, 36);
        const transferId = new TextDecoder().decode(transferIdBytes).trim();
        const chunkData = event.data.slice(36);

        const buf = receivingBuffers.current.get(transferId);
        if (buf) {
          buf.chunks.push(chunkData);
          buf.received += chunkData.byteLength;
          const progress = Math.min(100, Math.round((buf.received / buf.total) * 100));

          setActiveTransfers(prev => {
            const next = new Map(prev);
            const t = next.get(transferId) as NexusTransfer | undefined;
            if (t) {
              next.set(transferId, {
                ...t,
                progress,
                transferredBytes: buf.received,
                speed: `${(chunkData.byteLength / 1024).toFixed(0)} KB/pkt`
              });
            }
            return next;
          });
        }
      }
    };
  }, [addLog, localPeer.id, onFileReceived, peers, hostId]);

  // Create standard WebRTC connection with a peer
  const createPeerConnection = useCallback((remotePeerId: string, isInitiator: boolean) => {
    if (peerConnections.current.has(remotePeerId)) {
      return peerConnections.current.get(remotePeerId)!;
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnections.current.set(remotePeerId, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal('signal-ice', remotePeerId, event.candidate);
      }
    };

    pc.onconnectionstatechange = () => {
      addLog('connection', `Connection to ${remotePeerId}: ${pc.connectionState}`, remotePeerId);
      setPeers(prev => {
        const next = new Map(prev);
        const p = next.get(remotePeerId) as NexusPeer | undefined;
        if (p) {
          next.set(remotePeerId, {
            ...p,
            status: pc.connectionState === 'connected' ? 'connected' : 'connecting'
          });
        }
        return next;
      });
    };

    // If active call stream exists, attach tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setActiveCall(prev => prev ? { ...prev, remoteStream: event.streams[0] } : null);
      }
    };

    if (isInitiator) {
      const dc = pc.createDataChannel('nexus-data');
      dataChannels.current.set(remotePeerId, dc);
      setupDataChannel(dc, remotePeerId, false);

      pc.createOffer().then(offer => pc.setLocalDescription(offer)).then(() => {
        sendSignal('signal-offer', remotePeerId, pc.localDescription);
      }).catch(err => {
        addLog('error', `Failed to create offer: ${err.message}`, remotePeerId);
      });
    } else {
      pc.ondatachannel = (event) => {
        const dc = event.channel;
        dataChannels.current.set(remotePeerId, dc);
        setupDataChannel(dc, remotePeerId, false);
      };
    }

    return pc;
  }, [addLog, sendSignal, setupDataChannel]);

  // Create direct Peer-to-Peer Bypass WebRTC Connection between two non-host peers
  const createBypassConnection = useCallback((remotePeerId: string, isInitiator: boolean) => {
    if (bypassConnections.current.has(remotePeerId)) {
      return bypassConnections.current.get(remotePeerId)!;
    }

    addLog('signaling', `Negotiating direct P2P bypass connection with ${remotePeerId}...`, remotePeerId);

    const pc = new RTCPeerConnection(RTC_CONFIG);
    bypassConnections.current.set(remotePeerId, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal('bypass-ice', remotePeerId, event.candidate);
      }
    };

    pc.onconnectionstatechange = () => {
      addLog('connection', `Bypass link to ${remotePeerId}: ${pc.connectionState}`, remotePeerId);
      if (pc.connectionState === 'connected') {
        // Mark bypass active
        setPeers(prev => {
          const next = new Map(prev);
          const p = next.get(remotePeerId) as NexusPeer | undefined;
          if (p) {
            next.set(remotePeerId, {
              ...p,
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

    if (isInitiator) {
      const dc = pc.createDataChannel('nexus-bypass-data');
      bypassDataChannels.current.set(remotePeerId, dc);
      setupDataChannel(dc, remotePeerId, true);

      pc.createOffer().then(offer => pc.setLocalDescription(offer)).then(() => {
        sendSignal('bypass-offer', remotePeerId, pc.localDescription);
      }).catch(err => {
        addLog('error', `Failed bypass offer: ${err.message}`, remotePeerId);
      });
    } else {
      pc.ondatachannel = (event) => {
        const dc = event.channel;
        bypassDataChannels.current.set(remotePeerId, dc);
        setupDataChannel(dc, remotePeerId, true);
      };
    }

    return pc;
  }, [addLog, localPeer.id, sendSignal, setupDataChannel]);

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

                // If I am Host, wait for peers to connect or if Peer, connect to Host
                if (!amIHost && currentHostId) {
                  createPeerConnection(currentHostId, true);
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

                // If I am Host, connect with this new peer
                if (localPeer.isHost) {
                  createPeerConnection(senderId, true);
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
                    addLog('connection', `Host disconnected! You are promoted to central Host node.`, 'Failover');
                  } else {
                    addLog('connection', `Host disconnected! New Host elected: ${newHostId}`, 'Failover');
                  }
                }

                // Cleanup connections
                peerConnections.current.get(leftPeerId)?.close();
                peerConnections.current.delete(leftPeerId);
                dataChannels.current.delete(leftPeerId);
                bypassConnections.current.get(leftPeerId)?.close();
                bypassConnections.current.delete(leftPeerId);
                bypassDataChannels.current.delete(leftPeerId);

                addLog('connection', `Peer disconnected: ${leftUsername || leftPeerId}`, leftPeerId);
                break;
              }

              // Standard WebRTC Handshake
              case 'signal-offer': {
                const pc = createPeerConnection(senderId, false);
                await pc.setRemoteDescription(new RTCSessionDescription(payload));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                sendSignal('signal-answer', senderId, answer);
                break;
              }

              case 'signal-answer': {
                const pc = peerConnections.current.get(senderId);
                if (pc) {
                  await pc.setRemoteDescription(new RTCSessionDescription(payload));
                }
                break;
              }

              case 'signal-ice': {
                const pc = peerConnections.current.get(senderId);
                if (pc && payload) {
                  await pc.addIceCandidate(new RTCIceCandidate(payload));
                }
                break;
              }

              // Direct P2P Bypass Handshake
              case 'bypass-offer': {
                const pc = createBypassConnection(senderId, false);
                await pc.setRemoteDescription(new RTCSessionDescription(payload));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                sendSignal('bypass-answer', senderId, answer);
                break;
              }

              case 'bypass-answer': {
                const pc = bypassConnections.current.get(senderId);
                if (pc) {
                  await pc.setRemoteDescription(new RTCSessionDescription(payload));
                }
                break;
              }

              case 'bypass-ice': {
                const pc = bypassConnections.current.get(senderId);
                if (pc && payload) {
                  await pc.addIceCandidate(new RTCIceCandidate(payload));
                }
                break;
              }

              // Private Call Events broadcasted to everyone
              case 'private-call-start': {
                const { callerId, callerName, targetId, targetName, callType, callId } = payload;
                addLog('call', `Broadcast: Private ${callType} call initiated between ${callerName} and ${targetName}`, 'Call Engine', {
                  callId,
                  callerId,
                  targetId
                });

                // If I am the recipient of this call
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
            console.error('Signaling processing error:', e);
          }
        };
      } catch (err) {
        console.error('WS initialization error:', err);
      }
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) ws.close();
      peerConnections.current.forEach(pc => pc.close());
      bypassConnections.current.forEach(pc => pc.close());
    };
  }, [roomId, localPeer.id, localPeer.username, localPeer.avatarColor, localPeer.isHost, options.wsUrl, addLog, createPeerConnection, createBypassConnection, sendSignal]);

  // Send Chat message across network
  const sendMessage = useCallback((text: string) => {
    if (!text.trim()) return;
    sendSignal('network-chat', '', { text });
  }, [sendSignal]);

  // Send File to target peer: uses direct bypass if non-host to non-host, or standard channel
  const sendFile = useCallback(async (targetPeerId: string, file: File) => {
    if (!file || !targetPeerId) return;

    const targetPeer = peers.get(targetPeerId);
    const isTargetHost = targetPeerId === hostId;
    const isSenderHost = localPeer.isHost;

    // If transfer is between two non-host peers, use direct P2P bypass!
    const needsBypass = !isSenderHost && !isTargetHost;

    addLog('transfer', `Initiating file transfer "${file.name}" to ${targetPeer?.username || targetPeerId} ${needsBypass ? '(Dynamically Bypassing Host)' : ''}`, targetPeerId);

    // Get or create appropriate DataChannel
    let dc: RTCDataChannel | undefined;
    if (needsBypass) {
      if (!bypassDataChannels.current.has(targetPeerId)) {
        createBypassConnection(targetPeerId, true);
        // Wait briefly for channel opening
        await new Promise(r => setTimeout(r, 600));
      }
      dc = bypassDataChannels.current.get(targetPeerId);
    } else {
      dc = dataChannels.current.get(targetPeerId);
    }

    if (!dc || dc.readyState !== 'open') {
      addLog('error', `Cannot send file: DataChannel with ${targetPeerId} is not ready yet. Please retry in 1s.`, targetPeerId);
      return;
    }

    const transferId = Math.random().toString(36).substring(2, 10).padEnd(36, ' ');

    const newTransfer: NexusTransfer = {
      id: transferId.trim(),
      fileName: file.name,
      fileSize: file.size,
      progress: 0,
      speed: 'Sending...',
      fromPeerId: localPeer.id,
      toPeerId: targetPeerId,
      isBypass: needsBypass,
      status: 'active',
      transferredBytes: 0
    };

    setActiveTransfers(prev => new Map(prev).set(transferId.trim(), newTransfer));

    // Send metadata header
    dc.send(JSON.stringify({
      type: 'file-meta',
      transferId: transferId.trim(),
      name: file.name,
      size: file.size
    }));

    // Chunk reading & sending
    const reader = file.stream().getReader();
    let sentBytes = 0;
    const idBuffer = new TextEncoder().encode(transferId); // 36 bytes fixed length

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Sub-chunk to CHUNK_SIZE
        for (let i = 0; i < value.byteLength; i += CHUNK_SIZE) {
          const slice = value.subarray(i, Math.min(i + CHUNK_SIZE, value.byteLength));
          const packet = new Uint8Array(36 + slice.byteLength);
          packet.set(idBuffer, 0);
          packet.set(slice, 36);

          // Backpressure check
          if (dc.bufferedAmount > 4 * 1024 * 1024) {
            await new Promise(r => setTimeout(r, 20));
          }

          dc.send(packet.buffer);
          sentBytes += slice.byteLength;

          const progress = Math.min(100, Math.round((sentBytes / file.size) * 100));
          setActiveTransfers(prev => {
            const next = new Map(prev);
            const t = next.get(transferId.trim()) as NexusTransfer | undefined;
            if (t) {
              next.set(transferId.trim(), {
                ...t,
                progress,
                transferredBytes: sentBytes,
                speed: `${(sentBytes / (1024 * 1024)).toFixed(1)} MB`
              });
            }
            return next;
          });
        }
      }

      // Signal completion
      dc.send(JSON.stringify({ type: 'transfer-complete', transferId: transferId.trim() }));
      addLog('transfer', `File "${file.name}" transfer completed successfully!`, targetPeerId);

      setActiveTransfers(prev => {
        const next = new Map(prev);
        const t = next.get(transferId.trim()) as NexusTransfer | undefined;
        if (t) next.set(transferId.trim(), { ...t, progress: 100, status: 'completed' });
        return next;
      });

      setTimeout(() => {
        setActiveTransfers(prev => {
          const next = new Map(prev);
          next.delete(transferId.trim());
          return next;
        });
      }, 4000);
    } catch (err: any) {
      addLog('error', `Transfer failed: ${err.message}`, targetPeerId);
      setActiveTransfers(prev => {
        const next = new Map(prev);
        next.delete(transferId.trim());
        return next;
      });
    }
  }, [addLog, createBypassConnection, hostId, localPeer.id, localPeer.isHost, peers]);

  // Start Private Call with network-wide announcement
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

      // Broadcast to signaling server so everyone on network logs this private call
      sendSignal('private-call-start', targetPeerId, {
        callId,
        callerId: localPeer.id,
        callerName: localPeer.username,
        targetId: targetPeerId,
        targetName: target?.username || targetPeerId,
        callType
      });

      // Attach stream to peer connection
      const pc = createPeerConnection(targetPeerId, true);
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
    } catch (err: any) {
      addLog('error', `Could not access microphone/camera: ${err.message}`);
    }
  }, [addLog, createPeerConnection, localPeer.id, localPeer.username, peers, sendSignal]);

  // End Call
  const endCall = useCallback(() => {
    if (activeCall) {
      sendSignal('private-call-end', activeCall.targetId, {
        callId: activeCall.callId,
        callerName: activeCall.callerName,
        targetName: activeCall.targetName
      });
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }

    setActiveCall(null);
  }, [activeCall, sendSignal]);

  return {
    localPeer,
    peers,
    hostId,
    wsConnected,
    activeTransfers,
    logs,
    activeCall,
    sendFile,
    sendMessage,
    startCall,
    endCall,
    addLog
  };
}
