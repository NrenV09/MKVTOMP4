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
    <div className="bg-[#121215] border border-zinc-800 rounded-xl p-5 font-mono text-xs space-y-4 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-850 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
          <div>
            <div className="text-zinc-100 font-sans font-semibold text-sm">
              Converting: <span className="text-emerald-400 font-mono">{outputName}</span>
            </div>
            <div className="text-zinc-500 text-[11px] mt-0.5 flex items-center gap-2">
              <span>
                {telemetry.accelerationMode || 'Processing locally in browser'}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition-colors text-xs font-semibold"
          title="Cancel conversion"
        >
          <XCircle className="w-3.5 h-3.5" />
          <span>Cancel</span>
        </button>
      </div>

      {/* Main Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between items-baseline text-xs">
          <span className="text-zinc-400 font-medium">Progress</span>
          <span className="text-xl font-bold font-mono text-emerald-400">
            {percent}%
          </span>
        </div>

        <div className="w-full bg-zinc-950 rounded-full h-2.5 p-0.5 border border-zinc-800 overflow-hidden">
          <div
            className="bg-emerald-500 h-full rounded-full transition-all duration-300 ease-out shadow-[0_0_8px_rgba(16,185,129,0.4)]"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
        {/* Elapsed */}
        <div className="bg-zinc-950/70 border border-zinc-850 rounded-lg p-2.5">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Clock className="w-3 h-3 text-zinc-400" />
            Elapsed
          </div>
          <div className="text-zinc-200 font-semibold text-sm">
            {formatDuration(telemetry.elapsedMs / 1000)}
          </div>
        </div>

        {/* ETA */}
        <div className="bg-zinc-950/70 border border-zinc-850 rounded-lg p-2.5">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Clock className="w-3 h-3 text-emerald-400" />
            Remaining
          </div>
          <div className="text-emerald-400 font-semibold text-sm">
            {telemetry.etaSeconds !== null ? `~${formatDuration(telemetry.etaSeconds)}` : 'Calculating...'}
          </div>
        </div>

        {/* Speed */}
        <div className="bg-zinc-950/70 border border-zinc-850 rounded-lg p-2.5">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Zap className="w-3 h-3 text-amber-400" />
            Speed
          </div>
          <div className="text-zinc-200 font-semibold text-sm">
            {telemetry.speed || (telemetry.fps ? `${telemetry.fps} fps` : '--')}
          </div>
        </div>

        {/* Stream Position */}
        <div className="bg-zinc-950/70 border border-zinc-850 rounded-lg p-2.5">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">
            Position
          </div>
          <div className="text-zinc-200 font-semibold text-sm truncate">
            {telemetry.duration > 0
              ? `${formatDuration(telemetry.currentTime)} / ${formatDuration(telemetry.duration)}`
              : formatDuration(telemetry.currentTime)}
          </div>
        </div>
      </div>
    </div>
  );
};

