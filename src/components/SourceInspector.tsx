import React, { useState } from 'react';
import {
  FileVideo,
  Music,
  Film,
  Volume2,
  Subtitles,
  Bookmark,
  Paperclip,
  Download,
  AlertTriangle,
  CheckCircle2,
  X,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import {
  SourceMetadata,
  EncodingConfig,
  SubtitleTrackInfo,
} from '../types';
import { formatBytes, formatDuration } from '../utils/ffmpegBuilder';

interface SourceInspectorProps {
  source: SourceMetadata;
  isProbing: boolean;
  onClear: () => void;
  disabled?: boolean;
  config?: EncodingConfig;
  onChangeConfig?: (newConfig: EncodingConfig) => void;
  onExtractSubtitle?: (track: SubtitleTrackInfo) => void;
  extractingSubtitleIndex?: number | null;
}

export const SourceInspector: React.FC<SourceInspectorProps> = ({
  source,
  isProbing,
  onClear,
  disabled = false,
  config,
  onChangeConfig,
  onExtractSubtitle,
  extractingSubtitleIndex = null,
}) => {
  const [showChapters, setShowChapters] = useState(false);

  const is4K = source.is4K || (source.width && source.width >= 3840) || (source.height && source.height >= 2160);
  const is10Bit = source.is10Bit || (source.pixelFormat && source.pixelFormat.includes('10'));
  const isHighBitrate = source.isHighBitrate || (source.bitrate && source.bitrate >= 15000);

  const videoTracks = source.videoTracks || [];
  const audioTracks = source.audioTracks || [];
  const subtitleTracks = source.subtitleTracks || [];
  const chapters = source.chapters || [];
  const attachments = source.attachments || [];

  const isMp4OrMov = config ? config.container === 'mp4' || config.container === 'mov' : true;

  const selectedVideoIndices =
    config?.selectedVideoTrackIndices ??
    (videoTracks.length > 0 ? [videoTracks[0].typeIndex] : [0]);

  const selectedAudioIndices =
    config?.audioCodec === 'none'
      ? []
      : config?.selectedAudioTrackIndices ?? audioTracks.map((a) => a.typeIndex);

  const selectedSubtitleIndices =
    config?.subtitleMode === 'drop'
      ? []
      : config?.selectedSubtitleTrackIndices ??
        subtitleTracks
          .filter((s) => (isMp4OrMov ? s.formatType === 'text' : true))
          .map((s) => s.typeIndex);

  const toggleVideoTrack = (typeIdx: number) => {
    if (!config || !onChangeConfig || disabled) return;
    const exists = selectedVideoIndices.includes(typeIdx);
    const next = exists
      ? selectedVideoIndices.filter((i) => i !== typeIdx)
      : [...selectedVideoIndices, typeIdx].sort((a, b) => a - b);
    if (next.length === 0) return; // Keep at least 1 video track active
    onChangeConfig({
      ...config,
      selectedVideoTrackIndices: next,
    });
  };

  const toggleAudioTrack = (typeIdx: number) => {
    if (!config || !onChangeConfig || disabled) return;
    const exists = selectedAudioIndices.includes(typeIdx);
    const next = exists
      ? selectedAudioIndices.filter((i) => i !== typeIdx)
      : [...selectedAudioIndices, typeIdx].sort((a, b) => a - b);

    onChangeConfig({
      ...config,
      selectedAudioTrackIndices: next,
      audioCodec: next.length === 0 ? 'none' : config.audioCodec === 'none' ? 'copy' : config.audioCodec,
    });
  };

  const toggleSubtitleTrack = (typeIdx: number) => {
    if (!config || !onChangeConfig || disabled) return;
    const exists = selectedSubtitleIndices.includes(typeIdx);
    const next = exists
      ? selectedSubtitleIndices.filter((i) => i !== typeIdx)
      : [...selectedSubtitleIndices, typeIdx].sort((a, b) => a - b);

    onChangeConfig({
      ...config,
      selectedSubtitleTrackIndices: next,
      subtitleMode: next.length === 0 ? 'drop' : config.subtitleMode === 'drop' ? 'convert' : config.subtitleMode,
    });
  };

  const hasBitmapSubtitles = subtitleTracks.some((s) => s.formatType === 'bitmap');
  const hasIncompatibleMp4Audio =
    isMp4OrMov &&
    audioTracks.some((a) => selectedAudioIndices.includes(a.typeIndex) && !a.isMp4Compatible);

  return (
    <div className="bg-[#121215] border border-zinc-800 rounded-xl p-4 text-xs font-mono space-y-4">
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
                {(source.extension || 'FILE').toUpperCase().replace('.', '')}
              </span>

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

            <div className="text-zinc-500 text-[11px] flex items-center gap-2 mt-0.5 tabular-nums flex-wrap">
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
                  <RefreshCw className="w-3 h-3 animate-spin" /> PROBING CONTAINER STREAMS...
                </span>
              )}
            </div>
          </div>
        </div>

        {!disabled && (
          <button
            onClick={onClear}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/60 transition-colors text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 shrink-0"
            title="Remove current file and choose another"
            aria-label="Remove current media file and choose another"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Remove File</span>
          </button>
        )}
      </div>

      {/* Top-Level Stream Metric Matrix */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 tabular-nums">
        {/* Video Stream */}
        <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-2.5">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider flex items-center justify-between mb-1">
            <span className="flex items-center gap-1">
              <Film className="w-3 h-3 text-emerald-400" />
              Video
            </span>
            {videoTracks.length > 0 && (
              <span className="text-zinc-400">{videoTracks.length} track{videoTracks.length > 1 ? 's' : ''}</span>
            )}
          </div>
          <div className="text-zinc-200 font-semibold text-[13px] truncate">
            {source.hasVideo ? (
              source.videoCodec ? source.videoCodec.toUpperCase() : 'Detected'
            ) : (
              <span className="text-zinc-600">None (Audio only)</span>
            )}
          </div>
          <div className="text-[11px] text-zinc-400 mt-0.5 truncate">
            {source.width && source.height ? `${source.width}×${source.height}` : '--'}
            {source.fps ? ` • ${source.fps} fps` : ''}
          </div>
        </div>

        {/* Audio Stream */}
        <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-2.5">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider flex items-center justify-between mb-1">
            <span className="flex items-center gap-1">
              <Volume2 className="w-3 h-3 text-blue-400" />
              Audio
            </span>
            {audioTracks.length > 0 && (
              <span className="text-blue-400 font-semibold">
                {selectedAudioIndices.length}/{audioTracks.length} kept
              </span>
            )}
          </div>
          <div className="text-zinc-200 font-semibold text-[13px] truncate">
            {source.hasAudio ? (
              source.audioCodec ? source.audioCodec.toUpperCase() : 'Detected'
            ) : (
              <span className="text-zinc-600">Muted / None</span>
            )}
          </div>
          <div className="text-[11px] text-zinc-400 mt-0.5 truncate">
            {source.audioSampleRate ? `${source.audioSampleRate / 1000} kHz` : '--'}
            {source.audioChannels ? ` • ${source.audioChannels === 2 ? 'Stereo' : source.audioChannels === 1 ? 'Mono' : `${source.audioChannels}ch`}` : ''}
          </div>
        </div>

        {/* Subtitles & Chapters */}
        <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-2.5">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider flex items-center justify-between mb-1">
            <span className="flex items-center gap-1">
              <Subtitles className="w-3 h-3 text-amber-400" />
              Subtitles
            </span>
            {subtitleTracks.length > 0 && (
              <span className="text-amber-400 font-semibold">
                {selectedSubtitleIndices.length}/{subtitleTracks.length} kept
              </span>
            )}
          </div>
          <div className="text-zinc-200 font-semibold text-[13px]">
            {subtitleTracks.length > 0
              ? `${subtitleTracks.length} Track${subtitleTracks.length > 1 ? 's' : ''}`
              : 'None'}
          </div>
          <div className="text-[11px] text-zinc-400 mt-0.5 truncate">
            {chapters.length > 0 ? `${chapters.length} Chapters` : 'No chapters'}
            {attachments.length > 0 ? ` • ${attachments.length} Fonts` : ''}
          </div>
        </div>

        {/* Bitrate / Density */}
        <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-2.5">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">
            Container Bitrate
          </div>
          <div className="text-zinc-200 font-semibold text-[13px]">
            {source.bitrate
              ? `${source.bitrate} kbps`
              : source.duration && source.size
              ? `${Math.round((source.size * 8) / (source.duration * 1000))} kbps`
              : '--'}
          </div>
          <div className="text-[11px] text-zinc-400 mt-0.5">
            {formatDuration(source.duration)} • {formatBytes(source.size)}
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* INTERACTIVE MULTI-TRACK STREAM INSPECTOR & SELECTIVE MAPPER */}
      {/* ===================================================================== */}
      {(videoTracks.length > 0 || audioTracks.length > 0 || subtitleTracks.length > 0) && (
        <div className="border-t border-zinc-800/80 pt-3 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="text-[11px] font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
              <span>Container Stream Map & Track Selector</span>
              <span className="text-[10px] font-normal text-zinc-400">
                (Check/uncheck audio & subtitle tracks to include in output)
              </span>
            </div>

            {config && onChangeConfig && (
              <label className="flex items-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={config.preserveMetadataTags !== false}
                  onChange={(e) =>
                    onChangeConfig({
                      ...config,
                      preserveMetadataTags: e.target.checked,
                    })
                  }
                  disabled={disabled}
                  className="rounded bg-zinc-900 border-zinc-700 text-emerald-500 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                />
                <span>Retain Language, Title & Chapter Metadata</span>
              </label>
            )}
          </div>

          {/* 1. VIDEO TRACKS */}
          {videoTracks.length > 0 && (
            <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-3 space-y-2">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Video Streams ({videoTracks.length})</span>
                </span>
                <span className="text-emerald-400">
                  {config?.videoCodec === 'copy' ? '-c:v copy (Zero Re-encoding)' : `Encode: ${config?.videoCodec || 'copy'}`}
                </span>
              </div>

              <div className="space-y-1.5">
                {videoTracks.map((v) => {
                  const isSelected = selectedVideoIndices.includes(v.typeIndex);
                  const isMp4CopySafe = ['h264', 'avc1', 'hevc', 'h265', 'hvc1', 'av1', 'mpeg4'].some((c) =>
                    v.codec.includes(c)
                  );
                  return (
                    <div
                      key={`v-${v.streamIndex}`}
                      onClick={() => videoTracks.length > 1 && toggleVideoTrack(v.typeIndex)}
                      className={`flex flex-wrap items-center justify-between gap-2 p-2 rounded-md border transition-colors ${
                        isSelected
                          ? 'bg-emerald-500/5 border-emerald-500/30 text-zinc-200'
                          : 'bg-zinc-900/40 border-zinc-800/60 text-zinc-500'
                      } ${videoTracks.length > 1 ? 'cursor-pointer' : ''}`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleVideoTrack(v.typeIndex)}
                          disabled={disabled || videoTracks.length <= 1}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded bg-zinc-900 border-zinc-700 text-emerald-500 focus:ring-0 w-3.5 h-3.5"
                        />
                        <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] text-emerald-400 font-bold tabular-nums">
                          0:v:{v.typeIndex}
                        </span>
                        <span className="font-bold text-zinc-100 uppercase">
                          {v.codec}
                        </span>
                        {v.profile && (
                          <span className="text-[11px] text-zinc-400">({v.profile})</span>
                        )}
                        {v.width && v.height && (
                          <span className="text-zinc-300 tabular-nums">
                            {v.width}×{v.height}
                          </span>
                        )}
                        {v.fps && (
                          <span className="text-zinc-400 tabular-nums">{v.fps} fps</span>
                        )}
                        {v.pixelFormat && (
                          <span className="text-zinc-500 text-[10px]">{v.pixelFormat}</span>
                        )}
                        {v.language && (
                          <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] uppercase">
                            {v.language}
                          </span>
                        )}
                        {v.title && (
                          <span className="text-zinc-400 truncate max-w-[200px]" title={v.title}>
                            "{v.title}"
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[10px]">
                        {v.isDefault && (
                          <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 uppercase">
                            Default
                          </span>
                        )}
                        {isMp4CopySafe ? (
                          <span className="text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> MP4 Stream-Copy Ready
                          </span>
                        ) : (
                          <span className="text-amber-400 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Requires Re-encode for MP4
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. AUDIO TRACKS (Selective Mapping + Smart Conditional AAC Transcode) */}
          {audioTracks.length > 0 && (
            <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-blue-400" />
                  <span>Audio Tracks ({selectedAudioIndices.length} of {audioTracks.length} selected)</span>
                </div>

                {config && onChangeConfig && (
                  <div className="flex items-center gap-2 text-[10px]">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        onChangeConfig({
                          ...config,
                          selectedAudioTrackIndices: audioTracks.map((a) => a.typeIndex),
                          audioCodec: config.audioCodec === 'none' ? 'copy' : config.audioCodec,
                        })
                      }
                      className="text-zinc-400 hover:text-blue-400 transition-colors"
                    >
                      Select All
                    </button>
                    <span className="text-zinc-700">|</span>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        onChangeConfig({
                          ...config,
                          selectedAudioTrackIndices: [],
                          audioCodec: 'none',
                        })
                      }
                      className="text-zinc-400 hover:text-red-400 transition-colors"
                    >
                      Mute All (-an)
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                {audioTracks.map((a) => {
                  const isSelected = selectedAudioIndices.includes(a.typeIndex);
                  const needsConditionalAac = isMp4OrMov && !a.isMp4Compatible && config?.audioCodec === 'copy';
                  return (
                    <div
                      key={`a-${a.streamIndex}`}
                      onClick={() => toggleAudioTrack(a.typeIndex)}
                      className={`flex flex-wrap items-center justify-between gap-2 p-2 rounded-md border cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-500/5 border-blue-500/30 text-zinc-200'
                          : 'bg-zinc-900/40 border-zinc-800/60 text-zinc-500 opacity-70'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleAudioTrack(a.typeIndex)}
                          disabled={disabled}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded bg-zinc-900 border-zinc-700 text-blue-500 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                        />
                        <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] text-blue-400 font-bold tabular-nums">
                          0:a:{a.typeIndex}
                        </span>
                        <span className="font-bold text-zinc-100 uppercase">
                          {a.codec}
                        </span>
                        {a.profile && (
                          <span className="text-[11px] text-zinc-400">({a.profile})</span>
                        )}
                        {a.channelLayout && (
                          <span className="text-zinc-300">{a.channelLayout}</span>
                        )}
                        {a.sampleRate && (
                          <span className="text-zinc-400 tabular-nums">{(a.sampleRate / 1000).toFixed(1)} kHz</span>
                        )}
                        {a.bitrate && (
                          <span className="text-zinc-500 tabular-nums">{a.bitrate} kbps</span>
                        )}
                        {a.language && (
                          <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 text-[10px] uppercase font-semibold">
                            {a.language}
                          </span>
                        )}
                        {a.title && (
                          <span className="text-zinc-300 truncate max-w-[220px]" title={a.title}>
                            "{a.title}"
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[10px]">
                        {a.isDefault && (
                          <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 uppercase">
                            Default
                          </span>
                        )}
                        {isSelected && (
                          needsConditionalAac ? (
                            <span className="text-amber-400 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              {config?.conditionalAudioTranscode !== false
                                ? 'Auto-Transcode → AAC (Video stays copy)'
                                : 'Incompatible with MP4 copy'}
                            </span>
                          ) : (
                            <span className="text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              {config?.audioCodec === 'copy' ? 'Direct Stream Copy (-c:a copy)' : `Encode → ${config?.audioCodec}`}
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Conditional Audio Transcode Smart Banner */}
              {hasIncompatibleMp4Audio && config && onChangeConfig && (
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-amber-200">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-amber-300">Smart Audio Remux Active: </span>
                      <span>
                        Selected audio ({audioTracks.filter((a) => selectedAudioIndices.includes(a.typeIndex) && !a.isMp4Compatible).map((a) => a.codec.toUpperCase()).join(', ')}) is not natively supported by standard MP4 players. Only incompatible audio will transcode to AAC (`-c:a aac`) while video stays on lossless stream-copy (`-c:v copy`).
                      </span>
                    </div>
                  </div>
                  <label className="flex items-center gap-1.5 shrink-0 cursor-pointer select-none bg-zinc-900/90 px-2.5 py-1 rounded border border-amber-500/30">
                    <input
                      type="checkbox"
                      checked={config.conditionalAudioTranscode !== false}
                      onChange={(e) =>
                        onChangeConfig({
                          ...config,
                          conditionalAudioTranscode: e.target.checked,
                        })
                      }
                      className="rounded bg-zinc-800 border-zinc-700 text-emerald-500 focus:ring-0 w-3.5 h-3.5"
                    />
                    <span className="text-amber-300 font-semibold">Auto-Convert Audio to AAC</span>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* 3. SUBTITLE TRACKS (Selective Mapping + mov_text conversion + Standalone .SRT Export) */}
          {subtitleTracks.length > 0 && (
            <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                  <Subtitles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Subtitle Tracks ({selectedSubtitleIndices.length} of {subtitleTracks.length} selected)</span>
                </div>

                {config && onChangeConfig && (
                  <div className="flex items-center gap-2 text-[10px]">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        onChangeConfig({
                          ...config,
                          selectedSubtitleTrackIndices: subtitleTracks
                            .filter((s) => (isMp4OrMov ? s.formatType === 'text' : true))
                            .map((s) => s.typeIndex),
                          subtitleMode: 'convert',
                        })
                      }
                      className="text-zinc-400 hover:text-amber-400 transition-colors"
                    >
                      Select Compatible
                    </button>
                    <span className="text-zinc-700">|</span>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        onChangeConfig({
                          ...config,
                          selectedSubtitleTrackIndices: [],
                          subtitleMode: 'drop',
                        })
                      }
                      className="text-zinc-400 hover:text-red-400 transition-colors"
                    >
                      Drop All Subtitles (-sn)
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                {subtitleTracks.map((s) => {
                  const isSelected = selectedSubtitleIndices.includes(s.typeIndex);
                  const isBitmapInMp4 = isMp4OrMov && s.formatType === 'bitmap';
                  const isExtracting = extractingSubtitleIndex === s.typeIndex;

                  return (
                    <div
                      key={`s-${s.streamIndex}`}
                      onClick={() => !isBitmapInMp4 && toggleSubtitleTrack(s.typeIndex)}
                      className={`flex flex-wrap items-center justify-between gap-2 p-2 rounded-md border transition-colors ${
                        isBitmapInMp4
                          ? 'bg-red-950/20 border-red-900/40 text-zinc-400'
                          : isSelected
                          ? 'bg-amber-500/5 border-amber-500/30 text-zinc-200 cursor-pointer'
                          : 'bg-zinc-900/40 border-zinc-800/60 text-zinc-500 opacity-70 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                        <input
                          type="checkbox"
                          checked={isSelected && !isBitmapInMp4}
                          onChange={() => toggleSubtitleTrack(s.typeIndex)}
                          disabled={disabled || isBitmapInMp4}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded bg-zinc-900 border-zinc-700 text-amber-500 focus:ring-0 w-3.5 h-3.5 cursor-pointer disabled:opacity-40"
                        />
                        <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] text-amber-400 font-bold tabular-nums">
                          0:s:{s.typeIndex}
                        </span>
                        <span className="font-bold text-zinc-100 uppercase">
                          {s.codec}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            s.formatType === 'text'
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : 'bg-red-500/15 text-red-300 border border-red-500/30'
                          }`}
                        >
                          {s.formatType === 'text' ? 'TextSub' : 'Bitmap (Image)'}
                        </span>
                        {s.language && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] uppercase font-semibold">
                            {s.language}
                          </span>
                        )}
                        {s.title && (
                          <span className="text-zinc-300 truncate max-w-[200px]" title={s.title}>
                            "{s.title}"
                          </span>
                        )}
                        {s.isDefault && (
                          <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] uppercase">
                            Default
                          </span>
                        )}
                        {s.isForced && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] uppercase">
                            Forced
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[10px]">
                        {s.formatType === 'text' ? (
                          <>
                            {isSelected && (
                              <span className="text-emerald-400 hidden sm:inline">
                                {isMp4OrMov
                                  ? '→ MP4 Timed Text (-c:s mov_text)'
                                  : config?.container === 'webm'
                                  ? '→ WebVTT (-c:s webvtt)'
                                  : '→ Stream Copy'}
                              </span>
                            )}
                            {onExtractSubtitle && (
                              <button
                                type="button"
                                disabled={disabled || isExtracting}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onExtractSubtitle(s);
                                }}
                                className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-emerald-300 border border-zinc-700 flex items-center gap-1 font-semibold transition-colors disabled:opacity-50"
                                title="Extract and download this subtitle track as a standalone .srt file"
                              >
                                {isExtracting ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <span>Extracting...</span>
                                  </>
                                ) : (
                                  <>
                                    <Download className="w-3 h-3" />
                                    <span>Export .SRT</span>
                                  </>
                                )}
                              </button>
                            )}
                          </>
                        ) : (
                          <span className="text-red-300 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-red-400" />
                            {isMp4OrMov
                              ? 'Bitmap (PGS/VobSub) unsupported in MP4 (Auto-skipped)'
                              : 'Preserved in MKV'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {isMp4OrMov && hasBitmapSubtitles && (
                <div className="p-2.5 rounded-lg bg-red-950/30 border border-red-800/50 flex items-start gap-2 text-[11px] text-red-200">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-red-300">Bitmap Subtitle Notice: </span>
                    MP4 containers cannot store image-based subtitles (PGS / VobSub) natively. Bitmap subtitle tracks are automatically omitted for MP4 output so your remux job never crashes. Switch target container to <strong>.MKV</strong> if you want to retain PGS/VobSub bitmap subtitles.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4. CHAPTERS & ATTACHMENTS */}
          {(chapters.length > 0 || attachments.length > 0) && (
            <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-[11px] text-zinc-300">
                  {chapters.length > 0 && (
                    <span className="flex items-center gap-1.5">
                      <Bookmark className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{chapters.length} Chapters Detected</span>
                    </span>
                  )}
                  {attachments.length > 0 && (
                    <span className="flex items-center gap-1.5">
                      <Paperclip className="w-3.5 h-3.5 text-purple-400" />
                      <span>
                        {attachments.length} Attachment{attachments.length > 1 ? 's' : ''} (
                        {attachments
                          .slice(0, 3)
                          .map((att) => att.filename || att.codec.toUpperCase())
                          .join(', ')}
                        {attachments.length > 3 ? ` +${attachments.length - 3} more` : ''})
                      </span>
                    </span>
                  )}
                </div>

                {chapters.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowChapters(!showChapters)}
                    className="text-[11px] text-zinc-400 hover:text-emerald-400 flex items-center gap-1 transition-colors"
                  >
                    <span>{showChapters ? 'Hide Chapters' : 'View Chapters'}</span>
                    {showChapters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>

              {showChapters && chapters.length > 0 && (
                <div className="mt-2.5 pt-2.5 border-t border-zinc-800/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto">
                  {chapters.map((ch) => (
                    <div
                      key={`ch-${ch.index}`}
                      className="px-2 py-1 rounded bg-zinc-900/70 border border-zinc-800/70 flex items-center justify-between gap-2 text-[11px]"
                    >
                      <span className="text-zinc-300 truncate">
                        <strong className="text-emerald-400 mr-1.5">#{ch.index + 1}</strong>
                        {ch.title || `Chapter ${ch.index + 1}`}
                      </span>
                      <span className="text-zinc-500 tabular-nums shrink-0">
                        {formatDuration(ch.start)} – {formatDuration(ch.end)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

