import React from 'react';
import { Terminal, Trash2, Cpu, Zap, HardDrive, ShieldCheck } from 'lucide-react';
import { HardwareCapabilities } from '../utils/hardwareEngine';
import { WasmCacheStats } from '../utils/wasmCache';
import { ComplianceTab } from './ComplianceModal';

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
}) => {
  return (
    <header className="border-b border-zinc-800 bg-[#0c0c0e] px-4 py-3 flex items-center justify-between text-xs select-none sticky top-0 z-30">
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
                ? `In-App Engine Ready (${engineMode === 'mt' ? 'Multi-Thread' : 'Standard'} · Offline)`
                : engineLoading
                ? 'Loading in-app binaries...'
                : 'Offline'}
            </span>
            {engineReady && (
              <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60 text-[10px] text-emerald-300 font-medium ml-1">
                Zero-Network
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Middle: WebGPU & Hardware Acceleration Status */}
      {hardwareCaps && (
        <div className="hidden md:flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-zinc-950/80 border border-zinc-800/80 font-mono text-[11px]">
          <div className="flex items-center gap-1.5">
            <Cpu className={`w-3.5 h-3.5 ${hardwareCaps.webgpu.available ? 'text-emerald-400' : 'text-zinc-500'}`} />
            <span className="text-zinc-400">WebGPU:</span>
            <span className={hardwareCaps.webgpu.available ? 'text-emerald-300 font-semibold' : 'text-zinc-500'}>
              {hardwareCaps.webgpu.available
                ? hardwareCaps.webgpu.adapterName.replace('Apple ', '').replace(' Corporation', '') || 'Active'
                : 'Inactive'}
            </span>
          </div>
          <span className="text-zinc-700">|</span>
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-zinc-400">Acceleration:</span>
            <span className="text-amber-300 font-semibold">
              {hardwareCaps.webcodecs.hwH264 || hardwareCaps.webcodecs.hwHEVC
                ? 'Hardware Media Engine'
                : 'Direct Stream Copy'}
            </span>
          </div>
        </div>
      )}

      {/* Right: Actions & Cache Info */}
      <div className="flex items-center gap-2">
        {wasmCacheStats && wasmCacheStats.itemCount > 0 && (
          <div
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-950/80 border border-zinc-800/80 font-mono text-[11px] text-zinc-300"
            title={`WebAssembly FFmpeg engine is stored in browser cache: ${wasmCacheStats.itemCount} files (${wasmCacheStats.formattedSize})`}
          >
            <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-zinc-400">Wasm Cache:</span>
            <span className="text-cyan-300 font-medium">{wasmCacheStats.formattedSize}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
          </div>
        )}

        {onOpenCompliance && (
          <button
            onClick={() => onOpenCompliance('privacy')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-emerald-400 border-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            title="Privacy, Terms, Cookies & Legal details"
            aria-label="View Privacy, Terms, Cookies and Compliance details"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Privacy & Legal</span>
          </button>
        )}

        {onPurgeCache && (
          <button
            onClick={onPurgeCache}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            title="Reset active media buffers (WebAssembly engine stays safely cached)"
            aria-label="Reset active media buffers"
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

