import React, { useState, useRef, useEffect } from 'react';
import {
  Terminal,
  X,
  Trash2,
  Copy,
  Check,
  ArrowDown,
  Download,
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

  const handleExportLogs = () => {
    const text = logs.map((l) => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.text}`).join('\n');
    const blob = new Blob([text || 'No logs recorded.'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs_${Date.now()}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }, 5000);
  };

  return (
    <aside
      aria-label="Logs"
      className="fixed bottom-0 left-0 right-0 z-40 bg-[#05070e]/95 backdrop-blur-md border-t border-cyan-500/35 shadow-[0_-10px_40px_rgba(0,0,0,0.85)] font-mono text-xs flex flex-col h-64 md:h-72"
    >
      {/* Bar */}
      <div className="px-4 py-2 bg-[#080c17] border-b border-cyan-500/20 flex flex-wrap items-center justify-between gap-2 select-none">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-bold text-cyan-300 text-[11px]">Logs</span>
          <span className="px-1.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-[10px] text-cyan-300 tabular-nums">
            {logs.length}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 bg-[#04060c] rounded border border-cyan-500/25 p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                filter === 'all' ? 'bg-cyan-500/20 text-cyan-300' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilter('stream')}
              className={`px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                filter === 'stream' ? 'bg-emerald-500/20 text-emerald-300' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Streams
            </button>
            <button
              type="button"
              onClick={() => setFilter('error')}
              className={`px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                filter === 'error' ? 'bg-red-500/20 text-red-300' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Errors
            </button>
          </div>

          <button
            type="button"
            onClick={() => setAutoScroll(!autoScroll)}
            className={`px-2 py-1 rounded border text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
              autoScroll
                ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                : 'bg-[#04060c] border-zinc-800 text-zinc-500'
            }`}
          >
            <ArrowDown className="w-3 h-3" />
            <span className="hidden sm:inline">Auto-scroll</span>
          </button>

          <button
            type="button"
            onClick={handleExportLogs}
            className="px-2 py-1 rounded bg-[#0a0f1c] hover:bg-cyan-950/40 border border-cyan-500/25 text-cyan-300 text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
          >
            <Download className="w-3 h-3" />
            <span className="hidden sm:inline">Save</span>
          </button>

          <button
            type="button"
            onClick={handleCopyLogs}
            className="p-1.5 rounded bg-[#0a0f1c] hover:bg-cyan-950/40 border border-cyan-500/25 text-zinc-300 hover:text-cyan-300 transition-colors cursor-pointer"
            title="Copy logs"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={onClear}
            className="p-1.5 rounded bg-[#0a0f1c] hover:bg-red-950/40 border border-cyan-500/25 hover:border-red-500/40 text-zinc-300 hover:text-red-300 transition-colors cursor-pointer"
            title="Clear logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded bg-[#0a0f1c] hover:bg-cyan-950/40 border border-cyan-500/25 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Log Feed */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 space-y-1 bg-[#04060b] text-[11px] leading-relaxed select-text tabular-nums"
      >
        {filteredLogs.length === 0 ? (
          <div className="text-zinc-500 text-center py-8">
            No logs yet.
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
                    ? 'text-red-300 bg-red-950/25 py-0.5 px-1.5 rounded border border-red-500/20'
                    : isStream
                    ? 'text-cyan-300 font-semibold'
                    : 'text-zinc-300'
                }`}
              >
                <span className="text-zinc-500 select-none shrink-0 font-normal">
                  {log.timestamp}
                </span>
                <span className="shrink-0 text-cyan-400/80 uppercase text-[9px] px-1 bg-[#0a0f1c] rounded border border-cyan-500/20">
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
