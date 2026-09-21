import React from 'react';
import { Terminal, Trash2, Cpu, Zap, HardDrive, ShieldCheck, Film, Archive, Columns2, Database } from 'lucide-react';
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
  wasmCacheStats,
  onOpenCompliance,
  activeWorkspace = 'media',
  onSelectWorkspace,
}) => {
  return (
    <header className="border-b border-zinc-800 bg-[#0c0c0e] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs select-none sticky top-0 z-30">
      {/* Left: Title & Engine Status */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-mono font-bold text-xs shrink-0">
          MP4
        </div>
        <div>
          <h1 className="font-semibold text-zinc-100 tracking-tight text-sm">
            MKV to MP4 Converter
          </h1>
          <div className="text-[11px] text-zinc-500 flex items-center gap-1.5 mt-0.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                engineReady ? 'bg-emerald-500' : engineLoading ? 'bg-amber-500 animate-pulse' : 'bg-zinc-600'
              }`}
            />
            <span>
              {engineReady
                ? 'Offline Ready'
                : engineLoading
                ? 'Loading engine...'
                : 'Offline'}
            </span>
          </div>
        </div>
      </div>

      {/* Center: Workspace Mode Switcher */}
      {onSelectWorkspace && (
        <div className="flex items-center p-1 rounded-xl bg-zinc-950 border border-zinc-800/90 shadow-inner">
          <button
            onClick={() => onSelectWorkspace('compressor')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeWorkspace === 'compressor'
                ? 'bg-emerald-500 text-zinc-950 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            <span>Compressor</span>
          </button>

          <button
            onClick={() => onSelectWorkspace('media')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeWorkspace === 'media'
                ? 'bg-emerald-500 text-zinc-950 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Media</span>
          </button>
        </div>
      )}

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <PWAInstallButton />

        {wasmCacheStats && wasmCacheStats.itemCount > 0 && (
          <div
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-zinc-300 select-none"
            title={`IndexedDB Engine Cache: ${wasmCacheStats.itemCount} component${wasmCacheStats.itemCount > 1 ? 's' : ''} (${wasmCacheStats.formattedSize})`}
          >
            <Database className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-zinc-400">IDB:</span>
            <span className="text-emerald-400 font-semibold">{wasmCacheStats.formattedSize}</span>
          </div>
        )}

        {onPurgeCache && (
          <button
            onClick={onPurgeCache}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            title="Reset"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset</span>
          </button>
        )}

        <button
          onClick={toggleTerminal}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-colors border focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
            terminalOpen
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
              : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300'
          }`}
          title="Toggle log console"
          aria-label="Toggle telemetry log console"
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Console</span>
          {logCount > 0 && (
            <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 text-[10px]">
              {logCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};

