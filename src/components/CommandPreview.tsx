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
    <div className="bg-[#121215] border border-zinc-800 rounded-xl overflow-hidden font-mono text-xs">
      <div 
        onClick={() => setExpanded(!expanded)}
        className="px-4 py-2.5 bg-zinc-950/80 flex items-center justify-between border-b border-zinc-850 cursor-pointer select-none hover:bg-zinc-900/50 transition-colors"
      >
        <div className="flex items-center gap-2 text-zinc-400">
          <Terminal className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[11px] font-semibold tracking-wider uppercase text-zinc-300">
            FFMPEG CLI PIPELINE PREVIEW
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-[10px] transition-colors"
            title="Copy command to clipboard"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400">COPIED</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-zinc-400" />
                <span>COPY CLI</span>
              </>
            )}
          </button>
          <div className="text-zinc-500">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </div>

      <div className={`p-3 bg-zinc-950 transition-all ${expanded ? 'max-h-60' : 'max-h-20'} overflow-x-auto`}>
        <div className="flex items-start gap-2 text-emerald-400/90 leading-relaxed break-all select-all font-mono">
          <span className="text-zinc-600 select-none">$</span>
          <span>{fullCommand}</span>
        </div>
      </div>
    </div>
  );
};
