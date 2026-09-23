import React, { useState } from 'react';
import { useNexusRTC } from './useNexusRTC';
import { NetworkMap } from './NetworkMap';
import { GlobalLog } from './GlobalLog';
import { NexusPeer, NexusTransfer } from './types';
import { Phone, Video, PhoneOff, Send, Zap, HardDrive, Users, Radio, ShieldAlert } from 'lucide-react';

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
    logs,
    activeCall,
    sendFile,
    sendMessage,
    startCall,
    endCall,
    addLog
  } = useNexusRTC({
    roomId,
    username: localUsername,
    avatarColor: localAvatarColor,
    peerId: localPeerId,
    onFileReceived
  });

  const [selectedPeer, setSelectedPeer] = useState<NexusPeer | null>(null);

  const handleFileDrop = (targetPeerId: string, file: File) => {
    sendFile(targetPeerId, file);
  };

  return (
    <div className="flex flex-col h-full w-full gap-4 overflow-hidden p-2 lg:p-4">
      {/* Top Banner Status */}
      <div className="flex items-center justify-between bg-black/40 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10 shadow-sm flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${wsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span className="text-xs font-semibold text-white">
              {wsConnected ? 'WebSocket Signaling Online' : 'Connecting to Hub...'}
            </span>
          </div>
          <span className="text-slate-500">|</span>
          <div className="text-xs text-slate-300 font-mono">
            Room: <span className="text-accent">{roomId}</span>
          </div>
          <div className="text-xs text-slate-300 font-mono hidden sm:block">
            You: <span className="text-purple-400 font-bold">{localPeer.username}</span>
            {localPeer.isHost && <span className="ml-1 text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded border border-blue-500/30">HOST</span>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-mono">
            Connected Peers: <strong className="text-white">{peers.size}</strong>
          </span>
          <button
            onClick={() => {
              const dummyMsg = `Hello from ${localPeer.username}!`;
              sendMessage(dummyMsg);
            }}
            className="text-[11px] px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-colors cursor-pointer"
          >
            Broadcast Ping
          </button>
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
            onFileDrop={handleFileDrop}
            onNodeClick={(peer) => setSelectedPeer(peer)}
          />

          {/* Active Transfers Bar */}
          {activeTransfers.size > 0 && (
            <div className="absolute bottom-4 right-4 z-20 bg-slate-950/90 backdrop-blur-md p-3 rounded-2xl border border-white/15 shadow-2xl w-72">
              <div className="text-xs font-semibold text-white mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-accent animate-spin" />
                  Active File Transfer
                </span>
                <span className="text-[10px] font-mono text-accent">
                  {(Array.from(activeTransfers.values()) as NexusTransfer[])[0]?.progress || 0}%
                </span>
              </div>
              {(Array.from(activeTransfers.values()) as NexusTransfer[]).map(t => (
                <div key={t.id} className="space-y-1">
                  <div className="text-[11px] text-slate-300 truncate font-mono">{t.fileName}</div>
                  <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${t.isBypass ? 'bg-emerald-500' : 'bg-accent'}`}
                      style={{ width: `${t.progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                    <span>{t.isBypass ? '⚡ Direct Bypass Link' : 'Standard WebRTC Link'}</span>
                    <span>{t.speed}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Global Event & Message Log Section */}
        <div className="col-span-1 lg:col-span-5 xl:col-span-4 flex flex-col h-full min-h-[380px]">
          <GlobalLog
            logs={logs}
            onSendMessage={sendMessage}
            onClearLogs={() => {}}
          />
        </div>
      </div>

      {/* Selected Peer Action Modal / Panel */}
      {selectedPeer && selectedPeer.id !== localPeer.id && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/15 p-5 rounded-3xl shadow-2xl max-w-sm w-full space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white font-bold text-sm">
                  {selectedPeer.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">{selectedPeer.username}</h4>
                  <p className="text-[10px] font-mono text-slate-400">ID: {selectedPeer.id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPeer(null)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded-lg bg-white/5"
              >
                Close
              </button>
            </div>

            <div className="p-3 bg-white/5 rounded-2xl space-y-1 text-xs font-mono text-slate-300">
              <div className="flex justify-between">
                <span>Role:</span>
                <span className="font-semibold text-white">{selectedPeer.id === hostId ? 'Central Host' : 'Peer'}</span>
              </div>
              <div className="flex justify-between">
                <span>Direct Bypass:</span>
                <span className={selectedPeer.bypassPeers?.includes(localPeer.id) ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                  {selectedPeer.bypassPeers?.includes(localPeer.id) ? 'Active' : 'Standby'}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  startCall(selectedPeer.id, 'audio');
                  setSelectedPeer(null);
                }}
                className="py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Audio Call</span>
              </button>
              <button
                onClick={() => {
                  startCall(selectedPeer.id, 'video');
                  setSelectedPeer(null);
                }}
                className="py-2.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Video className="w-3.5 h-3.5" />
                <span>Video Call</span>
              </button>
            </div>

            {/* File Drop Area inside modal for convenience */}
            <label className="border-2 border-dashed border-white/20 hover:border-accent p-4 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-colors text-center">
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    sendFile(selectedPeer.id, e.target.files[0]);
                    setSelectedPeer(null);
                  }
                }}
              />
              <HardDrive className="w-6 h-6 text-accent mb-1" />
              <span className="text-xs font-medium text-white">Click to send file directly</span>
              <span className="text-[10px] text-slate-400 mt-0.5">Or drag & drop file onto node on map</span>
            </label>
          </div>
        </div>
      )}

      {/* Active Call Floating Widget */}
      {activeCall && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-rose-500/40 p-4 rounded-3xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-5">
          <div className="w-10 h-10 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center animate-pulse">
            {activeCall.callType === 'video' ? <Video className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
          </div>
          <div>
            <div className="text-xs font-bold text-white">
              Private {activeCall.callType === 'video' ? 'Video' : 'Audio'} Call Active
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              With {activeCall.isOutgoing ? activeCall.targetName : activeCall.callerName}
            </div>
            <div className="text-[9px] text-rose-400 font-mono mt-0.5">
              Broadcasted to Global Network Log
            </div>
          </div>
          <button
            onClick={endCall}
            className="p-2.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer ml-2"
            title="End Call"
          >
            <PhoneOff className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
