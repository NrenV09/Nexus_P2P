import React, { useState, useRef, useEffect } from 'react';
import { NexusLog } from './types';
import { Terminal, PhoneCall, ArrowUpRight, MessageSquare, Shield, Activity, Send, Trash2, Package } from 'lucide-react';

interface GlobalLogProps {
  logs: NexusLog[];
  onSendMessage?: (text: string) => void;
  onClearLogs?: () => void;
}

export const GlobalLog: React.FC<GlobalLogProps> = ({ logs, onSendMessage, onClearLogs }) => {
  const [filter, setFilter] = useState<'all' | 'connection' | 'call' | 'transfer' | 'chat'>('all');
  const [inputMessage, setInputMessage] = useState('');
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef<boolean>(true);
  const [hasNewUnseen, setHasNewUnseen] = useState(false);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const threshold = 50;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
    isAtBottomRef.current = atBottom;
    if (atBottom) {
      setHasNewUnseen(false);
    }
  };

  const scrollToBottom = (smooth = true) => {
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      });
      isAtBottomRef.current = true;
      setHasNewUnseen(false);
    }
  };

  // Stabilized Auto-scroll: Only auto-scrolls if the user is already at the bottom
  // This prevents the violent scroll glitching and allows reading earlier logs
  useEffect(() => {
    if (isAtBottomRef.current) {
      const el = scrollContainerRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    } else {
      setHasNewUnseen(true);
    }
  }, [logs]);

  const filteredLogs = logs.filter(log => {
    if (filter === 'all') return true;
    if (filter === 'connection') return log.type === 'connection' || log.type === 'signaling';
    return log.type === filter;
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;
    onSendMessage?.(inputMessage);
    setInputMessage('');
  };

  const getLogBadge = (log: NexusLog) => {
    switch (log.type) {
      case 'call':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
            <PhoneCall className="w-2.5 h-2.5" />
            PRIVATE CALL
          </span>
        );
      case 'transfer':
        if (log.text.toLowerCase().includes('batch') || log.metadata?.batchId) {
          return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <Package className="w-2.5 h-2.5" />
              BATCH TRANSFER
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <ArrowUpRight className="w-2.5 h-2.5" />
            TRANSFER
          </span>
        );
      case 'connection':
      case 'signaling':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
            <Activity className="w-2.5 h-2.5" />
            SIGNAL
          </span>
        );
      case 'chat':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
            <MessageSquare className="w-2.5 h-2.5" />
            CHAT
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            <Shield className="w-2.5 h-2.5" />
            ERROR
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950/80 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/10 bg-white/5 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-accent" />
          <h3 className="text-xs font-semibold text-white tracking-wide">Global Event & Multiplexed Log</h3>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
            {logs.length} events
          </span>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/5 text-[10px] font-medium">
          {(['all', 'connection', 'call', 'transfer', 'chat'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-0.5 rounded-lg capitalize transition-all cursor-pointer ${
                filter === f ? 'bg-accent text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              {f}
            </button>
          ))}
          {onClearLogs && (
            <button
              onClick={onClearLogs}
              className="p-1 text-slate-400 hover:text-rose-400 rounded-lg transition-colors ml-1 cursor-pointer"
              title="Clear Logs"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Log Feed */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-xs scrollbar-thin scrollbar-thumb-white/10 relative"
      >
        {filteredLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs text-center py-12">
            <Activity className="w-6 h-6 mb-2 opacity-50" />
            <span>No network events recorded for filter "{filter}".</span>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isCall = log.type === 'call';
            const isBatch = log.type === 'transfer' && (log.text.toLowerCase().includes('batch') || Boolean(log.metadata?.batchId));

            return (
              <div
                key={log.id}
                className={`p-2.5 rounded-xl border transition-all ${
                  isCall
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-200 shadow-md shadow-rose-950/20'
                    : isBatch
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200 shadow-sm'
                    : 'bg-white/[0.03] border-white/5 text-slate-300 hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    {getLogBadge(log)}
                    {log.source && (
                      <span className="text-[10px] text-slate-500">[{log.source}]</span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
                <div className="text-slate-200 break-words leading-relaxed pl-0.5">
                  {log.text}
                </div>
              </div>
            );
          })
        )}

        {/* Floating Jump to Bottom Button when scrolled up */}
        {hasNewUnseen && (
          <button
            onClick={() => scrollToBottom(true)}
            className="sticky bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-accent/90 hover:bg-accent text-white text-[11px] font-sans font-semibold shadow-lg backdrop-blur-md border border-white/20 flex items-center gap-1.5 cursor-pointer transition-all hover:scale-105 animate-bounce"
          >
            <span>Jump to latest</span>
            <span className="text-[10px]">↓</span>
          </button>
        )}
      </div>

      {/* Message Input Footer (Multiplexed text channel) */}
      <form onSubmit={handleSend} className="p-3 bg-white/5 border-t border-white/10 flex items-center gap-2">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder="Send real-time chat (multiplexed on [nexus-chat])..."
          className="flex-1 bg-black/50 border border-white/10 rounded-2xl px-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-accent font-sans transition-colors"
        />
        <button
          type="submit"
          disabled={!inputMessage.trim()}
          className="p-2.5 rounded-2xl bg-accent hover:bg-accent/80 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-md shadow-accent/20"
          title="Send"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
