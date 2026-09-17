import React from 'react';
import { Cpu, Terminal, ShieldCheck, Zap, HardDrive, Sparkles, Sun } from 'lucide-react';
import { detectDeviceCapabilities } from '../utils/ffmpegBuilder';

interface HeaderProps {
  engineReady: boolean;
  engineLoading: boolean;
  terminalOpen: boolean;
  toggleTerminal: () => void;
  logCount: number;
  wakeLockActive?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  engineReady,
  engineLoading,
  terminalOpen,
  toggleTerminal,
  logCount,
  wakeLockActive = false,
}) => {
  const dev = detectDeviceCapabilities();

  return (
    <header className="border-b border-zinc-800 bg-[#0c0c0e] px-3 sm:px-4 py-2.5 flex items-center justify-between text-xs select-none sticky top-0 z-30">
      {/* Left: Branding & Core Mode */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-mono font-bold text-xs shrink-0 shadow-sm">
          FF
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-100 tracking-tight text-sm">
              MKV to MP4 Converter
            </span>
            <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] font-mono text-zinc-400 uppercase tracking-wider hidden sm:inline">
              PRO WORKSTATION
            </span>
          </div>
          <div className="text-[11px] text-zinc-500 font-mono flex items-center gap-1.5">
            <span>FFmpeg WebAssembly Core v0.12</span>
            {dev.isIPad && (
              <span className="text-emerald-400 font-medium">• Optimized for iPadOS</span>
            )}
          </div>
        </div>
      </div>

      {/* Middle: Real-time Telemetry Pills */}
      <div className="hidden lg:flex items-center gap-2">
        {/* Device Optimization badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono text-[11px]">
          <Cpu className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-zinc-400">HARDWARE:</span>
          <span className="text-emerald-400 font-semibold">
            {dev.isMSeries ? 'Apple M-Series' : dev.isIPad ? 'iPad Silicon' : 'Multi-Core'} ({dev.cores}T)
          </span>
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
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-[11px] animate-pulse">
            <Sun className="w-3.5 h-3.5 text-amber-400" />
            <span>WAKE LOCK ON</span>
          </div>
        )}

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono text-[11px]">
          <HardDrive className="w-3.5 h-3.5 text-purple-400" />
          <span>STORAGE:</span>
          <span className="text-zinc-200">LOCAL MEMFS</span>
        </div>
      </div>

      {/* Right: Quick actions & Console dock toggle */}
      <div className="flex items-center gap-2">
        {dev.isIPad && (
          <span className="px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono hidden sm:inline">
            ⚡ M-Series Multi-Threading
          </span>
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
