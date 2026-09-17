import React from 'react';
import { 
  FileVideo, 
  Music, 
  Film, 
  Volume2, 
  X, 
  RefreshCw 
} from 'lucide-react';
import { SourceMetadata } from '../types';
import { formatBytes, formatDuration } from '../utils/ffmpegBuilder';

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
  const is4K = source.is4K || (source.width && source.width >= 3840) || (source.height && source.height >= 2160);
  const is10Bit = source.is10Bit || (source.pixelFormat && source.pixelFormat.includes('10'));
  const isHighBitrate = source.isHighBitrate || (source.bitrate && source.bitrate >= 15000);

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

              {/* Badges */}
              {is4K && (
                <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold">
                  4K UHD
                </span>
              )}
              {is10Bit && (
                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                  10-BIT
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
    </div>
  );
};
