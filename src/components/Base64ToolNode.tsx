import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, ArrowDown, Copy, Check } from 'lucide-react';
import { cn } from '../lib/utils';

export const Base64ToolNode: React.FC = () => {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [mode, setMode] = useState<'encode' | 'decode'>('encode');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (output) {
      navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const processData = () => {
    if (!input) {
      setOutput("");
      return;
    }

    try {
      if (mode === 'encode') {
        const encoded = btoa(encodeURIComponent(input).replace(/%([0-9A-F]{2})/g, (match, p1) => {
          return String.fromCharCode(parseInt(p1, 16));
        }));
        setOutput(encoded);
      } else {
        const decoded = decodeURIComponent(Array.prototype.map.call(atob(input), (c) => {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        setOutput(decoded);
      }
    } catch (err) {
      setOutput("ERROR: FAILED TO PROCESS STRING. PLEASE MAKE SURE THE INPUT IS VALID BASE64.");
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full flex flex-col gap-6 w-full max-w-5xl mx-auto overflow-y-auto pb-20 lg:pb-0"
    >
      <div className="glass-panel p-8 flex flex-col gap-6 shadow-sm">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold text-text">
            Base64 Encoder / Decoder
          </h2>
          <p className="text-sm font-medium text-muted">
            Encode and Decode strings instantly to and from Base64 in your local workspace.
          </p>
        </div>

        <div className="flex gap-3">
          <button 
            type="button"
            onClick={() => { setMode('encode'); setOutput(""); }}
            className={cn(
              "px-5 py-2.5 text-sm font-semibold rounded-xl transition-all",
              mode === 'encode' 
                ? "bg-accent/10 text-accent border border-accent shadow-sm" 
                : "bg-white/40 dark:bg-transparent border border-white/50 dark:border-transparent dark:border-white/10 dark:border-transparent text-muted hover:bg-white/60 dark:bg-transparent "
            )}
          >
            Encode Mode
          </button>
          <button 
            type="button"
            onClick={() => { setMode('decode'); setOutput(""); }}
            className={cn(
              "px-5 py-2.5 text-sm font-semibold rounded-xl transition-all",
              mode === 'decode' 
                ? "bg-success/10 text-success border border-success shadow-sm" 
                : "bg-white/40 dark:bg-transparent border border-white/50 dark:border-transparent dark:border-white/10 dark:border-transparent text-muted hover:bg-white/60 dark:bg-transparent "
            )}
          >
            Decode Mode
          </button>
        </div>

        <div className="flex flex-col lg:flex-row h-auto lg:h-96 mt-2 relative gap-6">
          <div className="flex flex-col gap-3 flex-1">
            <label className="text-sm font-semibold text-text pl-2">Input String</label>
            <textarea 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={mode === 'encode' ? "Paste raw text to encode..." : "Paste Base64 encoded payload to decode..."}
              className="flex-1 bg-white/30 dark:bg-transparent border border-white/50 dark:border-transparent dark:border-white/10 dark:border-transparent rounded-2xl resize-none p-5 text-sm text-text font-mono focus:border-accent focus:outline-none transition-colors shadow-inner min-h-[200px]"
            />
          </div>

          <div className="hidden lg:flex items-center justify-center -translate-y-2">
            <button 
              type="button"
              onClick={processData}
              className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center bg-white dark:bg-transparent shadow-md border hover:scale-105 transition-transform flex-shrink-0 mt-8",
                mode === 'encode' ? "border-accent text-accent" : "border-success text-success"
              )}
            >
              <ArrowRight className="w-6 h-6" />
            </button>
          </div>

          <div className="flex lg:hidden items-center justify-center my-2">
            <button 
              type="button"
              onClick={processData}
              className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center bg-white dark:bg-transparent shadow-md border hover:scale-105 transition-transform flex-shrink-0",
                mode === 'encode' ? "border-accent text-accent" : "border-success text-success"
              )}
            >
              <ArrowDown className="w-6 h-6" />
            </button>
          </div>

          <div className="flex flex-col gap-3 flex-1 relative">
            <div className="flex items-center justify-between pl-2 pr-1">
              <label className="text-sm font-semibold text-text">Output String</label>
              <button 
                type="button"
                onClick={handleCopy}
                className={cn(
                  "px-4 py-1.5 rounded-lg border text-xs font-semibold transition-colors bg-white/80 dark:bg-transparent backdrop-blur-md shadow-sm",
                  copied ? "text-success border-success" : "border-white border border-gray-200 text-text hover:text-accent hover:border-accent"
                )}
              >
                {copied ? "Copied!" : "Copy Output"}
              </button>
            </div>
            <textarea 
              readOnly
              value={output}
              placeholder="Output will appear here..."
              className="flex-1 bg-white/50 dark:bg-transparent border border-white/60 dark:border-transparent dark:border-white/10 dark:border-transparent rounded-2xl resize-none p-5 text-sm text-text font-mono focus:outline-none shadow-sm min-h-[200px]"
            />
          </div>
        </div>

        <button 
          type="button"
          onClick={processData}
          className={cn(
            "lg:hidden mt-4 py-4 rounded-xl font-bold text-sm shadow-sm transition-colors",
            mode === 'encode' ? "bg-accent/10 border border-accent text-accent" : "bg-success/10 border border-success text-success"
          )}
        >
          Process Data
        </button>
      </div>
    </motion.div>
  );
};
