import React, { useState, useRef, useEffect } from 'react';
import { useNexusRTC } from './useNexusRTC';
import { NetworkMap } from './NetworkMap';
import { GlobalLog } from './GlobalLog';
import { NexusPeer, BatchTransferState } from './types';
import {
  Phone,
  Video,
  PhoneOff,
  Send,
  Zap,
  HardDrive,
  Radio,
  Package,
  Layers,
  CheckCircle2,
  AlertCircle,
  X
} from 'lucide-react';

interface NexusContainerProps {
  localUsername?: string;
  localAvatarColor?: string;
  localPeerId?: string;
  roomId?: string;
  onFileReceived?: (file: File, fromPeer: NexusPeer) => void;
}

export const NexusContainer: React.FC<NexusContainerProps> = ({
  localUsername,
  localAvatarColor,
  localPeerId,
  roomId = 'nexus-main',
  onFileReceived
}) => {
  const {
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
    endCall
  } = useNexusRTC({
    roomId,
    username: localUsername,
    avatarColor: localAvatarColor,
    peerId: localPeerId,
    onFileReceived
  });

  const [selectedPeer, setSelectedPeer] = useState<NexusPeer | null>(null);
  const [directChatMessage, setDirectChatMessage] = useState('');
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  // Bind video streams when activeCall changes
  useEffect(() => {
    if (activeCall?.remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = activeCall.remoteStream;
    }
  }, [activeCall?.remoteStream]);

  useEffect(() => {
    if (activeCall?.stream && localVideoRef.current) {
      localVideoRef.current.srcObject = activeCall.stream;
    }
  }, [activeCall?.stream]);

  const handleFilesDrop = (targetPeerId: string, files: File[]) => {
    if (files.length === 1) {
      sendFile(targetPeerId, files[0]);
    } else {
      sendBatch(targetPeerId, files);
    }
  };

  const handleDirectSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!directChatMessage.trim() || !selectedPeer) return;
    sendMessage(directChatMessage, selectedPeer.id);
    setDirectChatMessage('');
  };

  // Convert batches Map to Array
  const batchList: BatchTransferState[] = Array.from(activeBatches.values());

  return (
    <div className="flex flex-col h-full w-full gap-4 overflow-hidden p-2 lg:p-4">
      {/* Top Banner Status */}
      <div className="flex items-center justify-between bg-black/40 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10 shadow-sm flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${wsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span className="text-xs font-semibold text-white">
              {wsConnected ? 'Signaling Hub Connected' : 'Connecting...'}
            </span>
          </div>
          <span className="text-slate-500">|</span>
          <div className="text-xs text-slate-300 font-mono">
            Room: <span className="text-accent font-semibold">{roomId}</span>
          </div>
          <div className="text-xs text-slate-300 font-mono">
            Node: <span className="text-purple-400 font-bold">{localPeer.username}</span>
            {localPeer.isHost && (
              <span className="ml-1.5 text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded border border-blue-500/30">
                CENTRAL HOST
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 font-mono">
            Mesh Peers: <strong className="text-white">{peers.size}</strong>
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/10 text-emerald-300 border border-white/5 flex items-center gap-1">
              <Zap className="w-3 h-3 text-emerald-400" />
              SCTP Multiplexing Active
            </span>
            <button
              onClick={() => sendMessage(`Ping from ${localPeer.username}`)}
              className="text-[11px] px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-colors cursor-pointer"
            >
              Broadcast Ping
            </button>
          </div>
        </div>
      </div>

      {/* Main Split Grid: Dynamic Network Map (Left/Center) + Global Event Log (Right) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0 overflow-hidden">
        {/* Network Map Section */}
        <div className="col-span-1 lg:col-span-7 xl:col-span-8 flex flex-col h-full min-h-[420px] relative">
          <NetworkMap
            localPeer={localPeer}
            connectedPeers={peers}
            hostId={hostId}
            activeTransfers={activeTransfers}
            activeBatches={activeBatches}
            activeCall={activeCall}
            concurrentPeerStates={concurrentPeerStates}
            onFileDrop={(targetId, file) => sendFile(targetId, file)}
            onFilesDrop={handleFilesDrop}
            onNodeClick={(peer) => setSelectedPeer(peer)}
          />

          {/* Active Batched File Transfers Drawer (Concurrent Feedback) */}
          {batchList.length > 0 && (
            <div className="absolute bottom-4 right-4 z-20 bg-slate-950/95 backdrop-blur-xl p-3.5 rounded-2xl border border-white/20 shadow-2xl w-80 max-h-72 overflow-y-auto scrollbar-thin">
              <div className="text-xs font-semibold text-white mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-emerald-400 animate-pulse" />
                  Batched File Transfers ({batchList.length})
                </span>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                  Backpressure Controlled
                </span>
              </div>

              <div className="space-y-3">
                {batchList.map(b => (
                  <div key={b.batchId} className="p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-white truncate max-w-[170px]">
                        {b.direction === 'outgoing' ? `To: ${b.targetName || b.targetId}` : `From: ${b.targetName || b.targetId}`}
                      </span>
                      <span className="text-[10px] font-mono text-emerald-400 font-bold">
                        {b.progress}%
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-300 truncate font-mono">
                      File ({b.currentFileIndex + 1}/{b.totalFiles}): {b.currentFileName}
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-200"
                        style={{ width: `${b.progress}%` }}
                      />
                    </div>

                    <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                      <span>Status: <strong className="text-white capitalize">{b.status}</strong></span>
                      <span className="text-accent">{b.speed}</span>
                    </div>

                    {/* File Checklist */}
                    <div className="pt-1 border-t border-white/10 space-y-1 max-h-24 overflow-y-auto">
                      {b.files.map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between text-[9px] text-slate-400">
                          <span className="truncate max-w-[150px]">{file.name}</span>
                          <span className={file.status === 'completed' ? 'text-emerald-400' : file.status === 'transferring' ? 'text-accent animate-pulse' : 'text-slate-500'}>
                            {file.status === 'completed' ? '✓' : `${file.progress}%`}
                          </span>
                        </div>
                      ))}
                    </div>

                    {b.status === 'streaming' && (
                      <button
                        onClick={() => cancelBatch(b.targetId, b.batchId)}
                        className="w-full mt-1 py-1 text-[10px] bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded border border-rose-500/30 cursor-pointer"
                      >
                        Cancel Batch
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Global Event & Message Log Section */}
        <div className="col-span-1 lg:col-span-5 xl:col-span-4 flex flex-col h-full min-h-[380px]">
          <GlobalLog
            logs={logs}
            onSendMessage={(msg) => sendMessage(msg)}
            onClearLogs={() => {}}
          />
        </div>
      </div>

      {/* Selected Peer Action Modal / Dynamic Control Panel */}
      {selectedPeer && selectedPeer.id !== localPeer.id && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-slate-900 border border-white/20 p-5 rounded-3xl shadow-2xl max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-white font-bold text-base shadow-md">
                  {selectedPeer.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    {selectedPeer.username}
                    {selectedPeer.id === hostId && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                        HOST
                      </span>
                    )}
                  </h4>
                  <p className="text-[10px] font-mono text-slate-400">Node ID: {selectedPeer.id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPeer(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg bg-white/5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-white/5 rounded-2xl space-y-1.5 text-xs font-mono text-slate-300 border border-white/5">
              <div className="flex justify-between">
                <span>Direct Bypass:</span>
                <span className={selectedPeer.bypassPeers?.includes(localPeer.id) ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                  {selectedPeer.bypassPeers?.includes(localPeer.id) ? '⚡ Active P2P Bypass' : 'Standby / Dynamic'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Data Channels:</span>
                <span className="text-slate-200">[nexus-chat] • [nexus-file-transfer]</span>
              </div>
            </div>

            {/* Direct Real-time Chat over Isolated [nexus-chat] DataChannel */}
            <form onSubmit={handleDirectSend} className="space-y-1.5">
              <label className="text-[11px] text-slate-400 font-medium">Direct Isolated Chat Channel:</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={directChatMessage}
                  onChange={(e) => setDirectChatMessage(e.target.value)}
                  placeholder={`Send direct message to ${selectedPeer.username}...`}
                  className="flex-1 bg-black/50 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={!directChatMessage.trim()}
                  className="px-3 py-1.5 rounded-xl bg-accent text-white text-xs font-semibold disabled:opacity-40 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>

            {/* Dynamic A/V Calling Controls (Seamlessly renegotiates SDP) */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-slate-400 font-medium">Multiplexed Audio/Video Call:</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    startCall(selectedPeer.id, 'audio');
                    setSelectedPeer(null);
                  }}
                  className="py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-md shadow-blue-900/30"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Audio Call</span>
                </button>
                <button
                  onClick={() => {
                    startCall(selectedPeer.id, 'video');
                    setSelectedPeer(null);
                  }}
                  className="py-2.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-md shadow-purple-900/30"
                >
                  <Video className="w-3.5 h-3.5" />
                  <span>Video Call</span>
                </button>
              </div>
            </div>

            {/* Multi-file Batch Transmission Drop Area */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-slate-400 font-medium">Batched File Transfer (Manifest Handshake):</label>
              <label className="border-2 border-dashed border-white/20 hover:border-emerald-500 p-4 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-colors text-center bg-white/[0.02]">
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      const files = Array.from(e.target.files);
                      sendBatch(selectedPeer.id, files);
                      setSelectedPeer(null);
                    }
                  }}
                />
                <Package className="w-7 h-7 text-emerald-400 mb-1.5" />
                <span className="text-xs font-medium text-white">Select One or Multiple Files</span>
                <span className="text-[10px] text-slate-400 mt-0.5">
                  Sends JSON Batch Manifest & streams chunks with backpressure
                </span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Incoming Call Dialog */}
      {activeCall && !activeCall.isOutgoing && !activeCall.stream && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 border border-rose-500/40 p-6 rounded-3xl shadow-2xl max-w-sm w-full text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center mx-auto animate-bounce">
              {activeCall.callType === 'video' ? <Video className="w-8 h-8" /> : <Phone className="w-8 h-8" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Incoming {activeCall.callType} Call</h3>
              <p className="text-xs text-slate-400 mt-1">From {activeCall.callerName}</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                onClick={() => answerCall(activeCall.callType)}
                className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all cursor-pointer shadow-lg shadow-emerald-900/40"
              >
                Accept
              </button>
              <button
                onClick={endCall}
                className="py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all cursor-pointer shadow-lg shadow-rose-900/40"
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Call Floating Live Widget & Stream Elements */}
      {activeCall && (activeCall.stream || activeCall.isOutgoing) && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900/95 border border-rose-500/50 p-4 rounded-3xl shadow-2xl flex flex-col gap-3 max-w-sm backdrop-blur-xl animate-in slide-in-from-bottom-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center animate-pulse">
                {activeCall.callType === 'video' ? <Video className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  Live {activeCall.callType === 'video' ? 'Video' : 'Audio'} Call
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  {activeCall.callerName} ↔ {activeCall.targetName}
                </div>
              </div>
            </div>
            <button
              onClick={endCall}
              className="p-2.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer shadow-lg shadow-rose-900/40"
              title="Hang Up"
            >
              <PhoneOff className="w-4 h-4" />
            </button>
          </div>

          {/* Video Streams Container */}
          {activeCall.callType === 'video' && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border border-white/10">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <span className="absolute bottom-1 left-2 text-[9px] font-mono text-white/80 bg-black/60 px-1 rounded">
                  You
                </span>
              </div>
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border border-white/10">
                {activeCall.remoteStream ? (
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-500 text-[10px] font-mono animate-pulse">
                    Connecting...
                  </div>
                )}
                <span className="absolute bottom-1 left-2 text-[9px] font-mono text-white/80 bg-black/60 px-1 rounded">
                  Remote
                </span>
              </div>
            </div>
          )}

          {/* Audio stream hidden audio element */}
          {activeCall.callType === 'audio' && activeCall.remoteStream && (
            <audio
              ref={(el) => {
                if (el && activeCall.remoteStream) el.srcObject = activeCall.remoteStream;
              }}
              autoPlay
            />
          )}

          <div className="text-[9px] font-mono text-slate-400 bg-white/5 px-2.5 py-1 rounded-xl flex items-center justify-between">
            <span>Dynamic Renegotiation</span>
            <span className="text-emerald-400">File & Chat Channels Intact</span>
          </div>
        </div>
      )}
    </div>
  );
};
