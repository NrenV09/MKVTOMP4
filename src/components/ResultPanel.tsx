import React from 'react';
import { 
  Download, 
  CheckCircle2, 
  RotateCcw, 
  FileCheck, 
  ArrowRight, 
  Play, 
  HardDrive,
  Clock
} from 'lucide-react';
import { ConversionResult, SourceMetadata } from '../types';
import { formatBytes, formatDuration } from '../utils/ffmpegBuilder';

interface ResultPanelProps {
  result: ConversionResult;
  source: SourceMetadata;
  onReset: () => void;
  onAdjustSettings: () => void;
}

export const ResultPanel: React.FC<ResultPanelProps> = ({
  result,
  source,
  onReset,
  onAdjustSettings,
}) => {
  const sizeDiff = result.outputSize - source.size;
  const percentChange = ((sizeDiff / source.size) * 100).toFixed(1);
  const isVideo = ['mp4', 'webm', 'mkv', 'mov', 'avi', 'gif'].includes(result.container);
  const isAudioOnly = ['mp3', 'm4a', 'wav', 'flac', 'ogg'].includes(result.container);

  return (
    <div className="bg-[#121215] border border-zinc-800 rounded-xl p-5 font-mono text-xs space-y-5 shadow-2xl">
      {/* Status Banner */}
      <div className="flex items-center justify-between border-b border-zinc-850 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-zinc-100 font-sans font-semibold text-base">
              Conversion Completed Successfully
            </div>
            <div className="text-zinc-500 text-[11px] flex items-center gap-2 mt-0.5">
              <span>Ready for instant local download</span>
              <span>•</span>
              <span>Total render time: {formatDuration(result.elapsedMs / 1000)}</span>
            </div>
          </div>
        </div>

        <a
          href={result.outputUrl}
          download={result.outputName}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-sans font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20"
        >
          <Download className="w-4 h-4" />
          <span>SAVE FILE</span>
        </a>
      </div>

      {/* Comparison Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Source stats */}
        <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-3">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">
            SOURCE SPEC
          </div>
          <div className="text-zinc-200 font-semibold text-sm truncate">
            {source.name}
          </div>
          <div className="text-[11px] text-zinc-400 mt-1 flex items-center justify-between">
            <span>Size: {formatBytes(source.size)}</span>
            <span>Duration: {formatDuration(source.duration)}</span>
          </div>
        </div>

        {/* Output stats */}
        <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-3">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>OUTPUT FILE</span>
            <span className="text-emerald-400 font-bold uppercase">.{result.container}</span>
          </div>
          <div className="text-emerald-400 font-semibold text-sm truncate">
            {result.outputName}
          </div>
          <div className="text-[11px] text-zinc-400 mt-1 flex items-center justify-between">
            <span>Size: {formatBytes(result.outputSize)}</span>
            <span className={sizeDiff <= 0 ? 'text-emerald-400' : 'text-amber-400'}>
              {sizeDiff <= 0 ? `${percentChange}% (Smaller)` : `+${percentChange}% (Larger)`}
            </span>
          </div>
        </div>

        {/* Efficiency telemetry */}
        <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-3">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">
            RENDER STATS
          </div>
          <div className="text-zinc-200 font-semibold text-sm">
            {formatDuration(result.elapsedMs / 1000)} wall-clock
          </div>
          <div className="text-[11px] text-zinc-400 mt-1">
            Memory Freed • Virtual MEMFS Unlinked
          </div>
        </div>
      </div>

      {/* In-Browser Preview (if playable format) */}
      <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-3">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Play className="w-3 h-3 text-emerald-400" />
          <span>IN-BROWSER VERIFICATION PREVIEW</span>
        </div>

        {isVideo && result.container !== 'gif' && (
          <video
            src={result.outputUrl}
            controls
            className="w-full max-h-72 rounded-md bg-black border border-zinc-850"
          />
        )}

        {result.container === 'gif' && (
          <div className="flex justify-center p-2 bg-black/40 rounded border border-zinc-850">
            <img
              src={result.outputUrl}
              alt="Converted GIF preview"
              className="max-h-72 rounded object-contain"
            />
          </div>
        )}

        {isAudioOnly && (
          <div className="p-2">
            <audio
              src={result.outputUrl}
              controls
              className="w-full"
            />
          </div>
        )}
      </div>

      {/* Footer action buttons */}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-850">
        <button
          onClick={onAdjustSettings}
          className="px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-colors flex items-center gap-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Adjust Settings & Re-encode</span>
        </button>

        <button
          onClick={onReset}
          className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-750 text-zinc-100 border border-zinc-700 transition-colors font-semibold flex items-center gap-1.5"
        >
          <span>Convert Another File</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
