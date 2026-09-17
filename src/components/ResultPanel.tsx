import React, { useState, useEffect, useRef } from 'react';
import { 
  Download, 
  CheckCircle2, 
  RotateCcw, 
  ArrowRight, 
  Play, 
  Trash2, 
  Check, 
  ShieldCheck,
  HardDrive
} from 'lucide-react';
import { ConversionResult, SourceMetadata } from '../types';
import { formatBytes, formatDuration } from '../utils/ffmpegBuilder';

interface ResultPanelProps {
  result: ConversionResult;
  source: SourceMetadata;
  onReset: () => void;
  onAdjustSettings: () => void;
  onPurgeCache: () => void;
  isPurged?: boolean;
}

export const ResultPanel: React.FC<ResultPanelProps> = ({
  result,
  source,
  onReset,
  onAdjustSettings,
  onPurgeCache,
  isPurged = false,
}) => {
  const [autoPurge, setAutoPurge] = useState(true);
  const [downloaded, setDownloaded] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const sizeDiff = result.outputSize - source.size;
  const percentChange = ((sizeDiff / source.size) * 100).toFixed(1);
  const isVideo = ['mp4', 'webm', 'mkv', 'mov', 'avi', 'gif'].includes(result.container);
  const isAudioOnly = ['mp3', 'm4a', 'wav', 'flac', 'ogg'].includes(result.container);

  // Unload media decoders safely on unmount
  useEffect(() => {
    return () => {
      if (videoRef.current) {
        try {
          videoRef.current.pause();
          videoRef.current.removeAttribute('src');
          videoRef.current.load();
        } catch {}
      }
      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.removeAttribute('src');
          audioRef.current.load();
        } catch {}
      }
    };
  }, []);

  // Handle countdown for automatic cache eviction
  useEffect(() => {
    if (countdown === null) return;

    if (countdown <= 0) {
      setCountdown(null);
      handleExecutePurge();
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown]);

  const handleExecutePurge = () => {
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      } catch {}
    }
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
      } catch {}
    }
    onPurgeCache();
  };

  const handleDownload = () => {
    if (isPurged) return;

    // Trigger download
    const link = document.createElement('a');
    link.href = result.outputUrl;
    link.download = result.outputName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setDownloaded(true);

    if (autoPurge) {
      // 3-second grace period for download pipe to start before revoking blob URL
      setCountdown(3);
    }
  };

  return (
    <div className="bg-[#121215] border border-zinc-800 rounded-xl p-5 font-mono text-xs space-y-5 shadow-2xl">
      {/* Status Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-850 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-zinc-100 font-sans font-semibold text-base">
              Conversion Completed
            </div>
            <div className="text-zinc-500 text-[11px] flex items-center gap-2 mt-0.5">
              <span>Duration: {formatDuration(result.elapsedMs / 1000)}</span>
              <span>•</span>
              <span className={isPurged ? 'text-zinc-400' : 'text-emerald-400'}>
                {isPurged ? 'Cache Purged (0 B in memory)' : 'Ready for download'}
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {!isPurged ? (
            <>
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-sans font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20"
              >
                <Download className="w-4 h-4" />
                <span>SAVE FILE</span>
              </button>

              <button
                onClick={handleExecutePurge}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-red-300 border border-zinc-800 hover:border-red-900/50 transition-colors text-xs font-semibold"
                title="Purge cache and free system storage immediately"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                <span>PURGE CACHE</span>
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-sans">Cache Purged</span>
            </div>
          )}
        </div>
      </div>

      {/* Auto-Purge Notification / Countdown Banner */}
      {!isPurged && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80 text-[11px]">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoPurge}
              onChange={(e) => setAutoPurge(e.target.checked)}
              className="rounded bg-zinc-800 border-zinc-700 text-emerald-500 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
            />
            <span className="text-zinc-300">Auto-purge cache after saving</span>
            <span className="text-zinc-500">(prevents system data accumulation)</span>
          </label>

          {countdown !== null && (
            <div className="flex items-center gap-2 text-amber-400 font-semibold animate-pulse">
              <span>Purging cache in {countdown}s...</span>
              <button
                onClick={handleExecutePurge}
                className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] uppercase border border-amber-500/30"
              >
                Purge Now
              </button>
            </div>
          )}
        </div>
      )}

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

        {/* Efficiency & Cache stats */}
        <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-3">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>STORAGE & CACHE</span>
            <HardDrive className="w-3.5 h-3.5 text-zinc-500" />
          </div>
          <div className="text-zinc-200 font-semibold text-sm">
            {isPurged ? (
              <span className="text-emerald-400">0 B Active Cache</span>
            ) : (
              <span>{formatBytes(result.outputSize)} Buffer</span>
            )}
          </div>
          <div className="text-[11px] text-zinc-400 mt-1">
            {isPurged ? 'Cache evicted • System Data clean' : 'MEMFS unlinked • Blob in cache'}
          </div>
        </div>
      </div>

      {/* In-Browser Preview (if playable format and not purged) */}
      <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-3">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Play className="w-3 h-3 text-emerald-400" />
            <span>VERIFICATION PREVIEW</span>
          </div>
          {isPurged && (
            <span className="text-zinc-500 text-[10px]">DECODER DETACHED</span>
          )}
        </div>

        {!isPurged ? (
          <>
            {isVideo && result.container !== 'gif' && (
              <video
                ref={videoRef}
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
                  ref={audioRef}
                  src={result.outputUrl}
                  controls
                  className="w-full"
                />
              </div>
            )}
          </>
        ) : (
          <div className="p-6 text-center space-y-2 border border-dashed border-zinc-800 rounded-md bg-zinc-900/30">
            <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto" />
            <div className="text-zinc-300 font-sans font-medium text-sm">
              Buffer Evicted & Cache Cleared
            </div>
            <div className="text-zinc-500 text-[11px] max-w-md mx-auto">
              The converted media stream was freed from browser cache and memory to prevent system data growth.
            </div>
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
