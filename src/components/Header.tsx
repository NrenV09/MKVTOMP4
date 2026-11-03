import React from 'react';
import {
  Terminal,
  Trash2,
  Cpu,
  Zap,
  Film,
  Archive,
  Columns2,
  Database,
  Loader2,
} from 'lucide-react';
import { HardwareCapabilities } from '../utils/hardwareEngine';
import { WasmCacheStats } from '../utils/wasmCache';
import { ComplianceTab } from './ComplianceModal';
import { PWAInstallButton } from './PWAInstallButton';

export type WorkspaceMode = 'media' | 'compressor' | 'split';

interface HeaderProps {
  engineReady: boolean;
  engineLoading: boolean;
  engineMode?: 'mt' | 'st';
  terminalOpen: boolean;
  toggleTerminal: () => void;
  logCount: number;
  wakeLockActive?: boolean;
  hardwareCaps?: HardwareCapabilities | null;
  onPurgeCache?: () => void;
  onInitEngine?: () => void;
  wasmCacheStats?: WasmCacheStats | null;
  onOpenCompliance?: (tab: ComplianceTab) => void;
  activeWorkspace?: WorkspaceMode;
  onSelectWorkspace?: (mode: WorkspaceMode) => void;
}

export const Header: React.FC<HeaderProps> = ({
  engineReady,
  engineLoading,
  engineMode,
  terminalOpen,
  toggleTerminal,
  logCount,
  hardwareCaps,
  onPurgeCache,
  onInitEngine,
  wasmCacheStats,
  onOpenCompliance,
  activeWorkspace = 'media',
  onSelectWorkspace,
}) => {
  return (
    <header className="border-b border-cyan-500/25 bg-[#060811]/95 backdrop-blur-md px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs select-none sticky top-0 z-30 shadow-[0_4px_24px_rgba(0,0,0,0.65)]">
      {/* Left: Cyber Brand & Interactive Engine Status Button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onSelectWorkspace && onSelectWorkspace('media')}
          className="flex items-center gap-3 text-left group focus:outline-none"
          title="Switch to Media Remux & Transcode Deck"
        >
          <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-400/40 flex items-center justify-center text-cyan-300 font-mono font-black text-xs shrink-0 shadow-[0_0_15px_rgba(0,240,255,0.2)] group-hover:border-cyan-300 transition-all">
            MUX
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-mono font-bold text-zinc-100 tracking-wider text-sm uppercase cyber-glow-text">
                CYBER<span className="text-cyan-400">//</span>MUX
              </h1>
              <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-400/30 text-[9px] font-mono font-bold text-cyan-300 uppercase tracking-widest">
                v2.4 WASM
              </span>
            </div>
            <div className="text-[10px] font-mono text-zinc-400 flex items-center gap-2 mt-0.5">
              <span>Zero-Cloud Client Media Workstation</span>
            </div>
          </div>
        </button>

        {/* Interactive Engine Mount / Status Button */}
        <button
          type="button"
          onClick={() => {
            if (!engineReady && !engineLoading && onInitEngine) {
              onInitEngine();
            } else {
              toggleTerminal();
            }
          }}
          className={`hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border font-mono text-[11px] transition-all cursor-pointer ${
            engineLoading
              ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
              : engineReady
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20'
              : 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/20'
          }`}
          title={
            engineReady
              ? `FFmpeg Wasm Core Mounted (${engineMode === 'mt' ? 'Multi-Threaded' : 'Single-Threaded'}) — Click to view telemetry`
              : 'Click to pre-mount FFmpeg WebAssembly Core now'
          }
        >
          {engineLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
          ) : (
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
          )}
          <span className="font-semibold">
            {engineLoading
              ? 'MOUNTING WASM...'
              : engineReady
              ? `CORE ONLINE (${engineMode === 'mt' ? 'MT-SAB' : 'ST'})`
              : 'MOUNT ENGINE'}
          </span>
        </button>
      </div>

      {/* Center: 3-Way Cyber Workspace Switcher */}
      {onSelectWorkspace && (
        <div className="flex items-center p-1 rounded-xl bg-[#04060c] border border-cyan-500/25 shadow-inner font-mono">
          <button
            type="button"
            onClick={() => onSelectWorkspace('media')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all cursor-pointer ${
              activeWorkspace === 'media'
                ? 'cyber-btn-primary shadow-md'
                : 'text-zinc-400 hover:text-cyan-300 hover:bg-cyan-500/10'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>MEDIA REMUX</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectWorkspace('compressor')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all cursor-pointer ${
              activeWorkspace === 'compressor'
                ? 'cyber-btn-primary shadow-md'
                : 'text-zinc-400 hover:text-cyan-300 hover:bg-cyan-500/10'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            <span>ARCHIVE LAB</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectWorkspace('split')}
            className={`hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all cursor-pointer ${
              activeWorkspace === 'split'
                ? 'cyber-btn-primary shadow-md'
                : 'text-zinc-400 hover:text-cyan-300 hover:bg-cyan-500/10'
            }`}
            title="Open Media Converter and Archive Lab side by side"
          >
            <Columns2 className="w-3.5 h-3.5" />
            <span>SPLIT DECK</span>
          </button>
        </div>
      )}

      {/* Right: Actions */}
      <div className="flex items-center gap-2 font-mono">
        <PWAInstallButton />

        {hardwareCaps?.webgpu.available && (
          <button
            type="button"
            onClick={toggleTerminal}
            className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-[11px] text-cyan-300 transition-colors cursor-pointer"
            title="Hardware WebGPU & WebCodecs Detected — Click to inspect in console"
          >
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
            <span>GPU READY</span>
          </button>
        )}

        {wasmCacheStats && wasmCacheStats.itemCount > 0 && (
          <button
            type="button"
            onClick={() => onOpenCompliance && onOpenCompliance('cookies')}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0a0f1c] hover:bg-cyan-950/50 border border-cyan-500/25 hover:border-cyan-400/50 text-[11px] font-mono text-zinc-300 transition-all cursor-pointer tabular-nums"
            title="Inspect offline WebAssembly CacheStorage & IndexedDB status"
          >
            <Database className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="text-zinc-400">CACHE:</span>
            <span className="text-cyan-300 font-bold">{wasmCacheStats.formattedSize}</span>
          </button>
        )}

        {onPurgeCache && (
          <button
            type="button"
            onClick={onPurgeCache}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border bg-[#0a0f1c] hover:bg-red-950/40 text-zinc-300 hover:text-red-300 border-cyan-500/25 hover:border-red-500/50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            title="Purge temporary RAM buffers and reset active file"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
            <span className="hidden sm:inline">PURGE RAM</span>
          </button>
        )}

        <button
          type="button"
          onClick={toggleTerminal}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all border cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 tabular-nums ${
            terminalOpen
              ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_15px_rgba(0,240,255,0.25)]'
              : 'bg-[#0a0f1c] hover:bg-cyan-950/40 border-cyan-500/25 hover:border-cyan-400/50 text-zinc-200'
          }`}
          title="Toggle live FFmpeg Wasm telemetry console"
          aria-label="Toggle telemetry log console"
        >
          <Terminal className="w-3.5 h-3.5 text-cyan-400" />
          <span>CONSOLE</span>
          <span className="px-1.5 py-0.2 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[10px]">
            {logCount}
          </span>
        </button>
      </div>
    </header>
  );
};


