import React, { useState } from 'react';
import { Terminal, Copy, Check, ChevronDown, ChevronUp, Play } from 'lucide-react';

interface CommandPreviewProps {
  commandArgs: string[];
  onExecute?: () => void;
  disabled?: boolean;
}

export const CommandPreview: React.FC<CommandPreviewProps> = ({
  commandArgs,
  onExecute,
  disabled = false,
}) => {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fullCommand = ['ffmpeg', ...commandArgs].join(' ');

  const handleCopy = () => {
    navigator.clipboard.writeText(fullCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="cyber-panel rounded-xl overflow-hidden font-mono text-xs">
      <div
        onClick={() => setExpanded(!expanded)}
        className="px-4 py-2.5 bg-[#060913]/90 flex items-center justify-between border-b border-cyan-500/20 cursor-pointer select-none hover:bg-cyan-950/20 transition-colors"
      >
        <div className="flex items-center gap-2 text-zinc-300">
          <Terminal className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-cyan-300">
            FFmpeg Stream Pipeline CLI
          </span>
          <span className="text-[10px] text-zinc-500 hidden sm:inline">
            ({commandArgs.length} args)
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onExecute && (
            <button
              type="button"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                onExecute();
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-400/40 text-[10px] font-bold uppercase transition-colors cursor-pointer disabled:opacity-40"
              title="Execute this FFmpeg pipeline now"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Run CLI</span>
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#0a0f1c] hover:bg-cyan-950/40 text-zinc-300 border border-cyan-500/25 text-[10px] font-semibold transition-colors cursor-pointer"
            title="Copy command to clipboard"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400">COPIED</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-cyan-400" />
                <span>COPY CLI</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="p-1 rounded bg-[#0a0f1c] border border-cyan-500/20 text-zinc-400 hover:text-cyan-300 transition-colors cursor-pointer"
            title={expanded ? 'Collapse command preview' : 'Expand command preview'}
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div className={`p-3.5 bg-[#04060c] transition-all ${expanded ? 'max-h-64' : 'max-h-20'} overflow-x-auto`}>
        <div className="flex items-start gap-2 text-cyan-300/95 leading-relaxed break-all select-all font-mono">
          <span className="text-emerald-400 font-bold select-none">$</span>
          <span>{fullCommand}</span>
        </div>
      </div>
    </div>
  );
};

