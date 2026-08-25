import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Users, Send } from 'lucide-react';
import { cn } from '../lib/utils';
import { ChatMessage, NodeRole } from '../types';

interface SecureChatNodeProps {
  messages: ChatMessage[];
  sendMessage: (text: string) => void;
  connectedPeers: number;
  role: NodeRole;
  onClickProfile?: (senderId: string) => void;
}

export const SecureChatNode: React.FC<SecureChatNodeProps> = ({ 
  messages, 
  sendMessage, 
  connectedPeers, 
  role,
  onClickProfile
}) => {
  const [text, setText] = useState("");
  const isConnected = connectedPeers > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !isConnected) return;
    sendMessage(text);
    setText("");
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full flex flex-col w-full max-w-none mx-auto glass-panel shadow-sm overflow-hidden"
    >
      {/* Header */}
      <div className="p-3 border-b border-white/30 dark:border-transparent dark:border-white/10 dark:border-transparent bg-white/20 dark:bg-transparent backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-accent" />
          <h2 className="text-base font-bold text-text">
            Secure Group Chat
          </h2>
        </div>
        <div className="flex items-center gap-2 bg-white/40 dark:bg-transparent px-3 py-1 rounded-full border border-white/50 dark:border-transparent dark:border-white/10 dark:border-transparent ">
          <span className={cn(
            "h-2 w-2 rounded-full animate-pulse",
            isConnected ? "bg-success" : "bg-red-500"
          )} />
          <span className="text-[10px] text-text font-semibold uppercase tracking-wider">
            {isConnected ? "P2P DIRECT LINK" : "OFFLINE"}
          </span>
        </div>
      </div>

      {/* Role Banner */}
      <div className={cn(
        "border-b border-white/20 dark:border-transparent dark:border-white/10 dark:border-transparent p-2 flex gap-3 text-[11px] font-medium items-center justify-center transition-colors shadow-sm",
        role === 'host' ? "bg-accent/10 text-accent border-accent/20" : "bg-success/10 text-success border-success/20"
      )}>
        <Users className="w-3.5 h-3.5" />
        <span>
          {role === 'host' 
            ? `Host Node: Relaying secure messages between ${connectedPeers} active peer(s).` 
            : role === 'join' && isConnected
              ? "Join Node: Connected to Host. Messages are relayed to the group."
              : "No active connections. Please establish a tunnel in the Transceiver tab."}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 flex flex-col bg-white/10 dark:bg-transparent ">
        <AnimatePresence>
          {messages.length === 0 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex flex-col items-center justify-center opacity-40 text-muted"
            >
              <Shield className="w-12 h-12 mb-3 text-muted" />
              <span className="text-xs font-semibold uppercase tracking-widest">High-Speed Direct Transfer</span>
              <span className="text-[10px] mt-1 font-medium">Awaiting secure messages...</span>
            </motion.div>
          )}

          {messages.map((msg) => {
            // Apply sender color fully, falling back to accent or success 
            const colorClass = msg.senderColor || (msg.sender === 'me' ? 'bg-accent' : 'bg-success');
            
            return (
              <motion.div 
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "max-w-[85%] sm:max-w-[75%] p-3 text-sm shadow-[0_4px_24px_rgba(0,0,0,0.05)]",
                  msg.sender === "system" 
                    ? "max-w-full text-center bg-white/40 dark:bg-transparent border border-white/50 dark:border-transparent dark:border-white/10 dark:border-transparent text-muted w-full my-2 font-semibold rounded-2xl" 
                    : cn(
                        "text-white", 
                        colorClass, 
                        msg.sender === "me" ? "self-end rounded-2xl rounded-tr-sm" : "self-start rounded-2xl rounded-tl-sm"
                      )
                )}
              >
                {msg.sender !== "system" && (
                  <div 
                    className={cn(
                      "text-[9px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5",
                      "text-white/80",
                      msg.sender !== "me" && msg.senderId && "cursor-pointer hover:opacity-80 transition-opacity"
                    )}
                    onClick={() => msg.sender !== "me" && msg.senderId && onClickProfile?.(msg.senderId)}
                  >
                    {msg.senderName || (msg.sender === "me" ? "LOCAL" : "PEER")} • {msg.timestamp.toLocaleTimeString([], { hour12: false })}
                  </div>
                )}
                <div className="whitespace-pre-wrap break-words leading-relaxed font-medium">
                  {msg.text}
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* Input */}
      <div className="p-3 bg-white/30 dark:bg-transparent backdrop-blur-md border-t border-white/40 dark:border-transparent dark:border-white/10 dark:border-transparent rounded-b-3xl">
        <form className="flex gap-2" onSubmit={handleSubmit}>
          <input 
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!isConnected}
            className="flex-1 bg-white dark:bg-transparent border border-white/60 dark:border-transparent dark:border-white/10 dark:border-transparent rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-accent disabled:opacity-50 transition-all placeholder:text-muted/60 text-text shadow-sm"
            placeholder={isConnected ? "Type message to peer..." : "Tunnel unavailable. Connect in Transceiver."}
          />
          <button 
            disabled={!isConnected || !text.trim()}
            className="px-4 py-2.5 rounded-xl bg-accent text-white hover:bg-accent/90 disabled:opacity-50 disabled:hover:bg-accent transition-colors flex items-center justify-center shadow-md font-semibold gap-2"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline text-sm">Send</span>
          </button>
        </form>
      </div>
    </motion.div>
  );
};
