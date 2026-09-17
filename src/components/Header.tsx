import React from 'react';
import { Cpu, Terminal, HardDrive, Sun, Trash2 } from 'lucide-react';
import { detectDeviceCapabilities } from '../utils/ffmpegBuilder';

interface HeaderProps {
  engineReady: boolean;
  engineLoading: boolean;
  terminalOpen: boolean;
  toggleTerminal: () => void;
  logCount: number;
  wakeLockActive?: boolean;
  onPurgeCache?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  engineReady,
  engineLoading,
  terminalOpen,
  toggleTerminal,
  logCount,
  wakeLockActive = false,
  onPurgeCache,
}) => {
  const dev = detectDeviceCapabilities();

  return (
    <header className="border-b border-zinc-800 bg-[#0c0c0e] px-3 sm:px-4 py-2.5 flex items-center justify-between text-xs select-none sticky top-0 z-30">
      {/* Left: Branding */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-mono font-bold text-xs shrink-0 shadow-sm">
          FF
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-100 tracking-tight text-sm">
              MKV to MP4 Converter
            </span>
          </div>
          <div className="text-[11px] text-zinc-500 font-mono">
            FFmpeg WebAssembly Core v0.12
          </div>
        </div>
      </div>

      {/* Middle: Telemetry */}
      <div className="hidden lg:flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono text-[11px]">
          <Cpu className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-zinc-400">THREADS:</span>
          <span className="text-emerald-400 font-semibold">{dev.cores}</span>
        </div>

        {/* Engine status */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono text-[11px]">
          <span
            className={`w-2 h-2 rounded-full ${
              engineReady
                ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]'
                : engineLoading
                ? 'bg-amber-500 animate-pulse'
                : 'bg-red-500'
            }`}
          />
          <span className="text-zinc-400">ENGINE:</span>
          <span className={engineReady ? 'text-emerald-400' : 'text-amber-400'}>
            {engineReady ? 'ONLINE' : engineLoading ? 'INITIALIZING...' : 'OFFLINE'}
          </span>
        </div>

        {wakeLockActive && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-[11px]">
            <Sun className="w-3.5 h-3.5 text-amber-400" />
            <span>WAKE LOCK</span>
          </div>
        )}

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono text-[11px]">
          <HardDrive className="w-3.5 h-3.5 text-purple-400" />
          <span>STORAGE:</span>
          <span className="text-zinc-200">MEMFS</span>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {onPurgeCache && (
          <button
            onClick={onPurgeCache}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors border bg-zinc-900 hover:bg-zinc-800 hover:text-red-300 border-zinc-800 text-zinc-400"
            title="Purge media buffers, MEMFS files, and browser cache"
          >
            <Trash2 className="w-3.5 h-3.5 text-zinc-500 hover:text-red-400" />
            <span className="hidden sm:inline">PURGE CACHE</span>
          </button>
        )}

        <button
          onClick={toggleTerminal}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-colors border ${
            terminalOpen
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
              : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300'
          }`}
          title="Toggle FFmpeg telemetry terminal"
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>CONSOLE</span>
          {logCount > 0 && (
            <span className="px-1 py-0.2 rounded bg-zinc-800 text-zinc-400 text-[10px]">
              {logCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};
