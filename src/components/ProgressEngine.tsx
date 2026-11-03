import React from 'react';
import { Loader2, Clock, Zap, XCircle } from 'lucide-react';
import { ProgressTelemetry } from '../types';
import { formatDuration } from '../utils/ffmpegBuilder';

interface ProgressEngineProps {
  telemetry: ProgressTelemetry;
  onCancel: () => void;
  outputName: string;
}

export const ProgressEngine: React.FC<ProgressEngineProps> = ({
  telemetry,
  onCancel,
  outputName,
}) => {
  const percent = Math.min(100, Math.max(0, Math.round(telemetry.percent)));

  return (
    <div className="cyber-panel rounded-xl p-5 font-mono text-xs space-y-4 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shadow-[0_0_15px_rgba(0,240,255,0.2)]">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
          <div>
            <div className="text-zinc-100 font-mono font-bold text-sm uppercase tracking-wide">
              ACTIVE PIPELINE: <span className="text-cyan-300">{outputName}</span>
            </div>
            <div className="text-emerald-400 text-[11px] mt-0.5 flex items-center gap-2">
              <span>
                {telemetry.accelerationMode || 'Worker Thread Execution Active'}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/40 transition-colors text-xs font-bold uppercase cursor-pointer"
          title="Abort active worker process"
        >
          <XCircle className="w-3.5 h-3.5" />
          <span>Abort Job</span>
        </button>
      </div>

      {/* Main Cyber Progress Bar */}
      <div className="space-y-2 tabular-nums">
        <div className="flex justify-between items-baseline text-xs">
          <span className="text-cyan-300/90 font-semibold uppercase tracking-wider">
            Stream Completion
          </span>
          <span className="text-2xl font-black font-mono text-cyan-300 cyber-glow-text">
            {percent}%
          </span>
        </div>

        <div className="w-full bg-[#04060c] rounded-full h-3 p-0.5 border border-cyan-500/30 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300 ease-out bg-gradient-to-r from-cyan-400 via-emerald-400 to-cyan-300 shadow-[0_0_14px_rgba(0,240,255,0.6)]"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 tabular-nums">
        {/* Elapsed */}
        <div className="bg-[#060913] border border-cyan-500/20 rounded-lg p-2.5">
          <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Clock className="w-3 h-3 text-cyan-400" />
            Elapsed
          </div>
          <div className="text-zinc-100 font-bold text-sm">
            {formatDuration(telemetry.elapsedMs / 1000)}
          </div>
        </div>

        {/* ETA */}
        <div className="bg-[#060913] border border-cyan-500/20 rounded-lg p-2.5">
          <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Clock className="w-3 h-3 text-emerald-400" />
            Remaining
          </div>
          <div className="text-emerald-400 font-bold text-sm">
            {telemetry.etaSeconds !== null ? `~${formatDuration(telemetry.etaSeconds)}` : 'Calculating...'}
          </div>
        </div>

        {/* Speed */}
        <div className="bg-[#060913] border border-cyan-500/20 rounded-lg p-2.5">
          <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Zap className="w-3 h-3 text-amber-400" />
            Throughput
          </div>
          <div className="text-cyan-300 font-bold text-sm">
            {telemetry.speed || (telemetry.fps ? `${telemetry.fps} fps` : '--')}
          </div>
        </div>

        {/* Stream Position */}
        <div className="bg-[#060913] border border-cyan-500/20 rounded-lg p-2.5">
          <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1">
            Timecode
          </div>
          <div className="text-zinc-100 font-bold text-sm truncate">
            {telemetry.duration > 0
              ? `${formatDuration(telemetry.currentTime)} / ${formatDuration(telemetry.duration)}`
              : formatDuration(telemetry.currentTime)}
          </div>
        </div>
      </div>
    </div>
  );
};


