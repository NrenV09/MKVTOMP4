import React from 'react';
import { Cpu, Terminal, ShieldCheck, Zap, HardDrive } from 'lucide-react';

interface HeaderProps {
  engineReady: boolean;
  engineLoading: boolean;
  terminalOpen: boolean;
  toggleTerminal: () => void;
  logCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  engineReady,
  engineLoading,
  terminalOpen,
  toggleTerminal,
  logCount,
}) => {
  return (
    <header className="border-b border-zinc-800 bg-[#0c0c0e] px-4 py-2.5 flex items-center justify-between text-xs select-none">
      {/* Left: Branding & Core Mode */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-mono font-bold text-xs">
            FF
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-zinc-100 tracking-tight text-sm">
                MKV to MP4 Converter
              </span>
              <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                PRO WORKSTATION
              </span>
            </div>
            <div className="text-[11px] text-zinc-500 font-mono">
              FFmpeg WebAssembly Core v0.12 • Zero Cloud Transfer
            </div>
          </div>
        </div>
      </div>

      {/* Middle: Real-time Telemetry Pills */}
      <div className="hidden md:flex items-center gap-2">
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
            {engineReady ? 'WASM ONLINE' : engineLoading ? 'INITIALIZING...' : 'OFFLINE'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono text-[11px]">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
          <span>COOP/COEP:</span>
          <span className="text-zinc-200">ISOLATED</span>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono text-[11px]">
          <HardDrive className="w-3.5 h-3.5 text-purple-400" />
          <span>STORAGE:</span>
          <span className="text-zinc-200">LOCAL MEMFS</span>
        </div>
      </div>

      {/* Right: Quick actions & Console dock toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={toggleTerminal}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition-colors border ${
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
