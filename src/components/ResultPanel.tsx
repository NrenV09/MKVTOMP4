import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  CheckCircle2,
  RotateCcw,
  ArrowRight,
  Play,
  Trash2,
  ShieldCheck,
  HardDrive,
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
  const isLargeOutput = result.outputSize > 150 * 1024 * 1024;
  const [autoPurge, setAutoPurge] = useState(!isLargeOutput);
  const [downloaded, setDownloaded] = useState(false);
  const [isStreamingSave, setIsStreamingSave] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [forcePreview, setForcePreview] = useState(false);
  const supportsFileSystemAccess =
    typeof window !== 'undefined' && typeof (window as any).showSaveFilePicker === 'function';

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const sizeDiff = result.outputSize - source.size;
  const percentChange = ((sizeDiff / source.size) * 100).toFixed(1);
  const isVideo = ['mp4', 'webm', 'mkv', 'mov', 'avi', 'gif'].includes(result.container);
  const isAudioOnly = ['mp3', 'm4a', 'wav', 'flac', 'ogg'].includes(result.container);

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

    const link = document.createElement('a');
    link.href = result.outputUrl;
    link.download = result.outputName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setDownloaded(true);

    if (autoPurge) {
      setCountdown(isLargeOutput ? 20 : 8);
    }
  };

  const handleStreamSaveToDisk = async () => {
    if (isPurged || !supportsFileSystemAccess) {
      handleDownload();
      return;
    }

    try {
      setIsStreamingSave(true);
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: result.outputName,
      });
      const writable = await handle.createWritable();
      await result.blob.stream().pipeTo(writable);
      setDownloaded(true);
      if (autoPurge) {
        setCountdown(5);
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        handleDownload();
      }
    } finally {
      setIsStreamingSave(false);
    }
  };

  return (
    <div className="cyber-panel-emerald rounded-xl p-5 font-mono text-xs space-y-4 shadow-2xl">
      {/* Status Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-emerald-500/20 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-400/50 flex items-center justify-center text-emerald-400 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-zinc-100 font-bold text-base flex items-center gap-2">
              <span>Done</span>
              {downloaded && (
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px]">
                  Saved
                </span>
              )}
            </div>
            <div className="text-zinc-400 text-[11px] flex items-center gap-2 mt-0.5 tabular-nums">
              <span>{formatDuration(result.elapsedMs / 1000)}</span>
              <span>•</span>
              <span className={isPurged ? 'text-zinc-400' : 'text-cyan-300'}>
                {isPurged ? 'Memory cleared' : 'Ready to download'}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {!isPurged ? (
            <>
              <button
                type="button"
                onClick={handleDownload}
                className="cyber-btn-primary flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" aria-hidden="true" />
                <span>Download</span>
              </button>

              {supportsFileSystemAccess && (
                <button
                  type="button"
                  onClick={handleStreamSaveToDisk}
                  disabled={isStreamingSave}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 transition-colors text-xs font-semibold cursor-pointer"
                >
                  <HardDrive className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                  <span>{isStreamingSave ? 'Saving...' : 'Save As'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleExecutePurge}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-red-300 border border-zinc-800 hover:border-red-900/50 transition-colors text-xs font-semibold cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" aria-hidden="true" />
                <span>Clear Memory</span>
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300">
              <ShieldCheck className="w-4 h-4 text-emerald-400" aria-hidden="true" />
              <span className="text-xs font-sans">Memory Cleared</span>
            </div>
          )}
        </div>
      </div>

      {/* Auto-Clear Toggle */}
      {!isPurged && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80 text-[11px]">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoPurge}
              onChange={(e) => setAutoPurge(e.target.checked)}
              className="rounded bg-zinc-800 border-zinc-700 text-emerald-500 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
            />
            <span className="text-zinc-300">Auto-clear memory after download</span>
          </label>

          {countdown !== null && (
            <div className="flex items-center gap-2 text-amber-400 font-semibold">
              <span>Clearing in {countdown}s...</span>
              <button
                type="button"
                onClick={handleExecutePurge}
                className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] border border-amber-500/30 cursor-pointer"
              >
                Clear Now
              </button>
            </div>
          )}
        </div>
      )}

      {/* Comparison Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-3">
          <div className="text-[10px] text-zinc-500 mb-1">Source</div>
          <div className="text-zinc-200 font-semibold text-sm truncate">{source.name}</div>
          <div className="text-[11px] text-zinc-400 mt-1 flex items-center justify-between">
            <span>{formatBytes(source.size)}</span>
            <span>{formatDuration(source.duration)}</span>
          </div>
        </div>

        <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-3">
          <div className="text-[10px] text-zinc-500 mb-1 flex items-center justify-between">
            <span>Output</span>
            <span className="text-emerald-400 font-bold uppercase">.{result.container}</span>
          </div>
          <div className="text-emerald-400 font-semibold text-sm truncate">{result.outputName}</div>
          <div className="text-[11px] text-zinc-400 mt-1 flex items-center justify-between">
            <span>{formatBytes(result.outputSize)}</span>
            <span className={sizeDiff <= 0 ? 'text-emerald-400' : 'text-amber-400'}>
              {sizeDiff <= 0 ? `${percentChange}%` : `+${percentChange}%`}
            </span>
          </div>
        </div>

        <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-3">
          <div className="text-[10px] text-zinc-500 mb-1">Memory</div>
          <div className="text-zinc-200 font-semibold text-sm">
            {isPurged ? (
              <span className="text-emerald-400">Freed</span>
            ) : (
              <span>{formatBytes(result.outputSize)}</span>
            )}
          </div>
          <div className="text-[11px] text-zinc-400 mt-1">
            {isPurged ? 'Cleared' : 'In buffer'}
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-3">
        <div className="text-[10px] text-zinc-500 mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Play className="w-3 h-3 text-emerald-400" />
            <span>Preview</span>
          </div>
          {isPurged && <span className="text-zinc-500">Cleared</span>}
        </div>

        {!isPurged ? (
          <>
            {isVideo && result.container !== 'gif' && (
              isLargeOutput && !forcePreview ? (
                <div className="p-5 text-center space-y-2.5 border border-zinc-800 rounded-md bg-zinc-900/40">
                  <div className="text-zinc-200 font-sans font-medium text-sm">
                    Preview paused for large file ({formatBytes(result.outputSize)})
                  </div>
                  <div className="pt-1 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-sans font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setForcePreview(true)}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 text-xs transition-colors cursor-pointer"
                    >
                      Load Preview
                    </button>
                  </div>
                </div>
              ) : (
                <video
                  ref={videoRef}
                  src={result.outputUrl}
                  preload="metadata"
                  controls
                  playsInline
                  className="w-full max-h-72 rounded-md bg-black border border-zinc-850"
                />
              )
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
          <div className="p-5 text-center text-zinc-400 text-xs border border-dashed border-zinc-800 rounded-md bg-zinc-900/30">
            Memory cleared.
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-850">
        <button
          type="button"
          onClick={onAdjustSettings}
          className="px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Edit Settings</span>
        </button>

        <button
          type="button"
          onClick={onReset}
          className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 transition-colors font-semibold flex items-center gap-1.5 cursor-pointer"
        >
          <span>New File</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
