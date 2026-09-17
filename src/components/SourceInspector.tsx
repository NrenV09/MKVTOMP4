import React from 'react';
import { 
  FileVideo, 
  Music, 
  Film, 
  Volume2, 
  X, 
  RefreshCw, 
  Sparkles, 
  Zap, 
  ShieldAlert, 
  Cpu 
} from 'lucide-react';
import { SourceMetadata } from '../types';
import { formatBytes, formatDuration, detectDeviceCapabilities } from '../utils/ffmpegBuilder';

interface SourceInspectorProps {
  source: SourceMetadata;
  isProbing: boolean;
  onClear: () => void;
  disabled?: boolean;
}

export const SourceInspector: React.FC<SourceInspectorProps> = ({
  source,
  isProbing,
  onClear,
  disabled = false,
}) => {
  const dev = detectDeviceCapabilities();
  const isHevc = source.videoCodec?.toLowerCase().includes('hevc') || source.videoCodec?.toLowerCase().includes('h265');
  const isH264 = source.videoCodec?.toLowerCase().includes('h264') || source.videoCodec?.toLowerCase().includes('avc');
  const is4K = source.is4K || (source.width && source.width >= 3840) || (source.height && source.height >= 2160);
  const is10Bit = source.is10Bit || (source.pixelFormat && source.pixelFormat.includes('10'));
  const isHighBitrate = source.isHighBitrate || (source.bitrate && source.bitrate >= 15000);
  const isLargeFile = source.size > 1.5 * 1024 * 1024 * 1024; // > 1.5 GB

  // Can be fast remuxed directly to native iPad/Apple MP4
  const canDirectRemux = source.extension.toLowerCase() === '.mkv' && (isHevc || isH264);

  return (
    <div className="bg-[#121215] border border-zinc-800 rounded-xl p-4 text-xs font-mono space-y-3">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-zinc-850 pb-3">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-9 h-9 rounded-lg bg-zinc-800/80 border border-zinc-750 flex items-center justify-center text-zinc-300 shrink-0">
            {source.hasVideo ? (
              <FileVideo className="w-5 h-5 text-emerald-400" />
            ) : (
              <Music className="w-5 h-5 text-blue-400" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-zinc-100 font-sans font-semibold text-sm truncate max-w-xs sm:max-w-md">
                {source.name}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-emerald-400 uppercase font-bold tracking-wider">
                {source.extension.toUpperCase().replace('.', '')}
              </span>

              {/* Special Tag Badges */}
              {is4K && (
                <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold">
                  4K UHD
                </span>
              )}
              {is10Bit && (
                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                  10-BIT HDR
                </span>
              )}
              {isHighBitrate && (
                <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30 text-[10px] font-bold">
                  HIGH BITRATE
                </span>
              )}
            </div>

            <div className="text-zinc-500 text-[11px] flex items-center gap-2 mt-0.5">
              <span>{formatBytes(source.size)}</span>
              <span>•</span>
              <span>{formatDuration(source.duration)}</span>
              {source.pixelFormat && (
                <>
                  <span>•</span>
                  <span className="text-zinc-400">{source.pixelFormat}</span>
                </>
              )}
              {isProbing && (
                <span className="flex items-center gap-1 text-amber-400 text-[10px]">
                  <RefreshCw className="w-3 h-3 animate-spin" /> PROBING STREAMS...
                </span>
              )}
            </div>
          </div>
        </div>

        {!disabled && (
          <button
            onClick={onClear}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/60 transition-colors text-xs font-semibold"
            title="Eject / load another file"
          >
            <X className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">EJECT</span>
          </button>
        )}
      </div>

      {/* Stream Metric Matrix */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
        {/* Video Stream */}
        <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-2.5">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider flex items-center gap-1 mb-1">
            <Film className="w-3 h-3 text-emerald-400" />
            VIDEO STREAM
          </div>
          <div className="text-zinc-200 font-semibold text-[13px] truncate">
            {source.hasVideo ? (
              source.videoCodec ? source.videoCodec.toUpperCase() : 'DETECTED'
            ) : (
              <span className="text-zinc-600">NONE (AUDIO ONLY)</span>
            )}
          </div>
          <div className="text-[11px] text-zinc-400 mt-0.5 truncate">
            {source.width && source.height ? `${source.width}×${source.height}` : '--'}
            {source.fps ? ` • ${source.fps} fps` : ''}
          </div>
        </div>

        {/* Audio Stream */}
        <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-2.5">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider flex items-center gap-1 mb-1">
            <Volume2 className="w-3 h-3 text-blue-400" />
            AUDIO STREAM
          </div>
          <div className="text-zinc-200 font-semibold text-[13px] truncate">
            {source.hasAudio ? (
              source.audioCodec ? source.audioCodec.toUpperCase() : 'DETECTED'
            ) : (
              <span className="text-zinc-600">MUTED / NO AUDIO</span>
            )}
          </div>
          <div className="text-[11px] text-zinc-400 mt-0.5 truncate">
            {source.audioSampleRate ? `${source.audioSampleRate / 1000} kHz` : '--'}
            {source.audioChannels ? ` • ${source.audioChannels === 2 ? 'Stereo' : source.audioChannels === 1 ? 'Mono' : `${source.audioChannels}ch`}` : ''}
          </div>
        </div>

        {/* Container / Duration */}
        <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-2.5">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">
            CONTAINER DURATION
          </div>
          <div className="text-zinc-200 font-semibold text-[13px]">
            {formatDuration(source.duration)}
          </div>
          <div className="text-[11px] text-zinc-400 mt-0.5">
            {source.duration ? `${Math.round(source.duration)} total sec` : 'Header verified'}
          </div>
        </div>

        {/* Bitrate / Density */}
        <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-2.5">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">
            BITRATE & SIZE
          </div>
          <div className="text-zinc-200 font-semibold text-[13px]">
            {source.bitrate ? `${source.bitrate} kbps` : (
              source.duration && source.size ? (
                `${Math.round((source.size * 8) / (source.duration * 1000))} kbps`
              ) : '--'
            )}
          </div>
          <div className="text-[11px] text-zinc-400 mt-0.5">
            {formatBytes(source.size)}
          </div>
        </div>
      </div>

      {/* Advisory Banner for Apple Silicon & High Encoded Files */}
      {canDirectRemux && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-2.5 text-xs text-emerald-200 font-mono">
          <Zap className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
              <span>Apple Silicon & iPad Native Remux Optimized</span>
              {dev.isIPad && <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-[10px]">iPadOS Ready</span>}
            </div>
            <div className="text-[11px] text-emerald-300/80 mt-0.5 leading-relaxed">
              This MKV already contains native {source.videoCodec?.toUpperCase()} video. Selecting <strong>Fast Remux</strong> will repackage it into an Apple QuickTime-compliant MP4 in seconds with 0% re-encoding quality loss, tagging with <code>-tag:v hvc1</code> and <code>-movflags +faststart</code> for immediate playback in iPad Photos & Files.
            </div>
          </div>
        </div>
      )}

      {is4K && !canDirectRemux && (
        <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-start gap-2.5 text-xs text-purple-200 font-mono">
          <Cpu className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-purple-400">4K High-Resolution Transcode Acceleration</div>
            <div className="text-[11px] text-purple-300/80 mt-0.5 leading-relaxed">
              4K UHD content uses multi-threaded WebAssembly with all {dev.cores} available CPU threads. To balance rendering speed on battery or mobile devices, you can keep 4K or downscale to 1080p FHD in encoding options.
            </div>
          </div>
        </div>
      )}

      {isLargeFile && (
        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-start gap-2.5 text-xs text-blue-200 font-mono">
          <Sparkles className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-blue-400">Large File Memory Optimization ({formatBytes(source.size)})</div>
            <div className="text-[11px] text-blue-300/80 mt-0.5 leading-relaxed">
              Virtual MEMFS garbage collection is active. Intermediate blocks are automatically purged to remain well within WebKit memory constraints.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
