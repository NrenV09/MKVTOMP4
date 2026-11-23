import React from 'react';
import {
  Terminal,
  Film,
  Archive,
  Columns2,
  Lock,
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

export type WorkspaceMode = 'media' | 'compressor' | 'pdf' | 'split';

interface HeaderProps {
  terminalOpen: boolean;
  toggleTerminal: () => void;
  logCount: number;
  activeWorkspace?: WorkspaceMode;
  onSelectWorkspace?: (mode: WorkspaceMode) => void;
}

export const Header: React.FC<HeaderProps> = ({
  terminalOpen,
  toggleTerminal,
  logCount,
  activeWorkspace = 'media',
  onSelectWorkspace,
}) => {
  return (
    <header className="border-b border-cyan-500/25 bg-[#060811]/95 backdrop-blur-md px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs select-none sticky top-0 z-30 shadow-[0_4px_24px_rgba(0,0,0,0.65)]">
      {/* Brand */}
      <button
        type="button"
        onClick={() => onSelectWorkspace && onSelectWorkspace('media')}
        className="flex items-center gap-2.5 text-left group focus:outline-none cursor-pointer"
      >
        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-400/40 flex items-center justify-center text-cyan-300 font-mono font-black text-xs shrink-0 group-hover:border-cyan-300 transition-all">
          MUX
        </div>
        <div>
          <h1 className="font-mono font-bold text-zinc-100 tracking-wider text-sm uppercase cyber-glow-text">
            CYBER<span className="text-cyan-400">//</span>MUX
          </h1>
          <div className="text-[10px] font-mono text-zinc-400">
            Local Media & File Tools
          </div>
        </div>
      </button>

      {/* Workspace Switcher */}
      {onSelectWorkspace && (
        <nav className="flex items-center p-1 rounded-xl bg-[#04060c] border border-cyan-500/25 font-mono">
          <button
            type="button"
            onClick={() => onSelectWorkspace('media')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeWorkspace === 'media'
                ? 'cyber-btn-primary shadow-md'
                : 'text-zinc-400 hover:text-cyan-300 hover:bg-cyan-500/10'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Media</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectWorkspace('compressor')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeWorkspace === 'compressor'
                ? 'cyber-btn-primary shadow-md'
                : 'text-zinc-400 hover:text-cyan-300 hover:bg-cyan-500/10'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            <span>Archive</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectWorkspace('pdf')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeWorkspace === 'pdf'
                ? 'cyber-btn-primary shadow-md'
                : 'text-zinc-400 hover:text-cyan-300 hover:bg-cyan-500/10'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>PDF</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectWorkspace('split')}
            className={`hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeWorkspace === 'split'
                ? 'cyber-btn-primary shadow-md'
                : 'text-zinc-400 hover:text-cyan-300 hover:bg-cyan-500/10'
            }`}
          >
            <Columns2 className="w-3.5 h-3.5" />
            <span>Split</span>
          </button>
        </nav>
      )}

      {/* Right Actions */}
      <div className="flex items-center gap-2 font-mono">
        <PWAInstallButton />

        <button
          type="button"
          onClick={toggleTerminal}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all border cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 tabular-nums ${
            terminalOpen
              ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
              : 'bg-[#0a0f1c] hover:bg-cyan-950/40 border-cyan-500/25 hover:border-cyan-400/50 text-zinc-200'
          }`}
          aria-label="Toggle logs"
        >
          <Terminal className="w-3.5 h-3.5 text-cyan-400" />
          <span>Logs</span>
          {logCount > 0 && (
            <span className="px-1.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[10px]">
              {logCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};
