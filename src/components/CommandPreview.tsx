import React, { useState } from 'react';
import { Terminal, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';

interface CommandPreviewProps {
  commandArgs: string[];
}

export const CommandPreview: React.FC<CommandPreviewProps> = ({ commandArgs }) => {
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
          <span className="text-xs font-bold text-cyan-300">
            FFmpeg Command
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#0a0f1c] hover:bg-cyan-950/40 text-zinc-300 border border-cyan-500/25 text-[10px] font-semibold transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-cyan-400" />
                <span>Copy</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            aria-label={expanded ? 'Collapse command' : 'Expand command'}
            className="p-1 rounded bg-[#0a0f1c] border border-cyan-500/20 text-zinc-400 hover:text-cyan-300 transition-colors cursor-pointer"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div className={`p-3 bg-[#04060c] transition-all ${expanded ? 'max-h-64' : 'max-h-20'} overflow-x-auto`}>
        <div className="flex items-start gap-2 text-cyan-300/95 leading-relaxed break-all select-all font-mono">
          <span className="text-emerald-400 font-bold select-none">$</span>
          <span>{fullCommand}</span>
        </div>
      </div>
    </div>
  );
};
