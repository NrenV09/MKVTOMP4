import React from 'react';
import { FileVideo, Music, Film, Volume2, X, RefreshCw, Layers } from 'lucide-react';
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
  return (
    <div className="bg-[#121215] border border-zinc-800 rounded-xl p-4 text-xs font-mono">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-zinc-850 pb-3 mb-3">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-zinc-800/80 border border-zinc-750 flex items-center justify-center text-zinc-300 shrink-0">
            {source.hasVideo ? (
              <FileVideo className="w-4 h-4 text-emerald-400" />
            ) : (
              <Music className="w-4 h-4 text-blue-400" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-zinc-100 font-sans font-medium text-sm truncate">
                {source.name}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-emerald-400 uppercase font-bold tracking-wider">
                {source.extension.toUpperCase().replace('.', '')}
              </span>
            </div>
            <div className="text-zinc-500 text-[11px] flex items-center gap-2 mt-0.5">
              <span>{formatBytes(source.size)}</span>
              <span>•</span>
              <span>{formatDuration(source.duration)}</span>
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
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700/50 transition-colors text-[11px]"
            title="Eject / load another file"
          >
            <X className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">EJECT</span>
          </button>
        )}
      </div>

      {/* Detected Stream Matrix */}
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
            CONTAINER TIME
          </div>
          <div className="text-zinc-200 font-semibold text-[13px]">
            {formatDuration(source.duration)}
          </div>
          <div className="text-[11px] text-zinc-400 mt-0.5">
            {source.duration ? `${Math.round(source.duration)} total sec` : 'Stream header'}
          </div>
        </div>

        {/* Bitrate / Density */}
        <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-2.5">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">
            EST. BITRATE
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
