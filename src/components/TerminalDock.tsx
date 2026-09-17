import React, { useState, useRef, useEffect } from 'react';
import { 
  Terminal, 
  X, 
  Trash2, 
  Copy, 
  Check, 
  ArrowDown, 
  Filter, 
  ChevronUp, 
  ChevronDown 
} from 'lucide-react';
import { LogMessage } from '../types';

interface TerminalDockProps {
  logs: LogMessage[];
  isOpen: boolean;
  onClose: () => void;
  onClear: () => void;
}

export const TerminalDock: React.FC<TerminalDockProps> = ({
  logs,
  isOpen,
  onClose,
  onClear,
}) => {
  const [filter, setFilter] = useState<'all' | 'error' | 'stream'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll, isOpen]);

  if (!isOpen) return null;

  const filteredLogs = logs.filter((log) => {
    if (filter === 'error') {
      return log.type === 'error' || log.text.toLowerCase().includes('error') || log.text.toLowerCase().includes('fail');
    }
    if (filter === 'stream') {
      return log.text.includes('Stream #') || log.text.includes('Duration:') || log.text.includes('fps');
    }
    return true;
  });

  const handleCopyLogs = () => {
    const text = logs.map((l) => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.text}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <aside aria-label="FFmpeg Terminal" className="fixed bottom-0 left-0 right-0 z-40 bg-[#09090b] border-t border-zinc-800 shadow-2xl font-mono text-xs flex flex-col h-64 md:h-72">
      {/* Dock Bar */}
      <div className="px-4 py-2 bg-[#0d0d10] border-b border-zinc-800 flex items-center justify-between select-none">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-semibold text-zinc-200 uppercase tracking-wider text-[11px]">
            FFMPEG WASM CONSOLE TELEMETRY
          </span>
          <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-[10px] text-zinc-400">
            {logs.length} entries
          </span>
        </div>

        {/* Filter buttons & Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-zinc-900 rounded border border-zinc-800 p-0.5 text-[10px]">
            <button
              onClick={() => setFilter('all')}
              className={`px-2 py-0.5 rounded transition-colors ${
                filter === 'all' ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('stream')}
              className={`px-2 py-0.5 rounded transition-colors ${
                filter === 'stream' ? 'bg-zinc-800 text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Streams
            </button>
            <button
              onClick={() => setFilter('error')}
              className={`px-2 py-0.5 rounded transition-colors ${
                filter === 'error' ? 'bg-zinc-800 text-red-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Errors
            </button>
          </div>

          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`px-2 py-1 rounded border text-[10px] flex items-center gap-1 transition-colors ${
              autoScroll ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-zinc-950 border-zinc-800 text-zinc-500'
            }`}
            title="Auto-scroll lock"
          >
            <ArrowDown className="w-3 h-3" />
            <span className="hidden sm:inline">AUTOSCROLL</span>
          </button>

          <button
            onClick={handleCopyLogs}
            className="p-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Copy all logs"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={onClear}
            className="p-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Clear logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onClose}
            className="p-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Close dock"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Log Feed */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 space-y-1 bg-[#09090b] text-[11px] leading-relaxed select-text"
      >
        {filteredLogs.length === 0 ? (
          <div className="text-zinc-600 italic text-center py-8">
            No telemetry logs recorded. Initialize engine or trigger conversion to view execution stream.
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isError = log.type === 'error' || log.text.toLowerCase().includes('error') || log.text.toLowerCase().includes('fail');
            const isStream = log.text.includes('Stream #') || log.text.includes('Duration:');

            return (
              <div
                key={log.id}
                className={`flex items-start gap-2 break-all ${
                  isError
                    ? 'text-red-400 bg-red-950/20 py-0.5 px-1 rounded'
                    : isStream
                    ? 'text-emerald-400 font-semibold'
                    : 'text-zinc-400'
                }`}
              >
                <span className="text-zinc-600 select-none shrink-0 font-normal">
                  {log.timestamp}
                </span>
                <span className="shrink-0 text-zinc-500 uppercase text-[9px] px-1 bg-zinc-900 rounded border border-zinc-800">
                  {log.type}
                </span>
                <span className="flex-1">{log.text}</span>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
