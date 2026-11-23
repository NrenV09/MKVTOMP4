import React, { useState } from 'react';
import {
  Sliders,
  Film,
  Volume2,
  AlertTriangle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Music,
  Check,
  ArrowRight,
} from 'lucide-react';
import {
  EncodingConfig,
  SourceMetadata,
  VideoContainer,
  AudioContainer,
  VideoCodec,
  AudioCodec,
  ResolutionPreset,
  FrameratePreset,
  PresetSpeed,
  AudioBitrate,
  ChannelLayout,
} from '../types';
import { checkCompatibility } from '../utils/ffmpegBuilder';
import { HardwareCapabilities } from '../utils/hardwareEngine';

interface EncodingControlsProps {
  config: EncodingConfig;
  onChange: (newConfig: EncodingConfig) => void;
  source: SourceMetadata | null;
  disabled?: boolean;
  hardwareCaps?: HardwareCapabilities | null;
}

export const EncodingControls: React.FC<EncodingControlsProps> = ({
  config,
  onChange,
  source,
  disabled = false,
  hardwareCaps,
}) => {
  const [mode, setMode] = useState<'simple' | 'pro'>('simple');
  const [showAllFormats, setShowAllFormats] = useState(false);

  const updateConfig = (patch: Partial<EncodingConfig>) => {
    onChange({ ...config, ...patch });
  };

  const compatibility = checkCompatibility(source, config);
  const canUseHardwareGpu = Boolean(
    hardwareCaps?.webcodecs.hwH264 || hardwareCaps?.webcodecs.available
  );

  const applyPreset = (presetName: string) => {
    if (presetName === 'remux') {
      const srcAudio = (source?.audioCodec || '').toLowerCase();
      const isMp4SafeAudio = ['aac', 'alac', 'mp3'].some((a) => srcAudio.includes(a));
      updateConfig({
        targetCategory: 'video',
        container: 'mp4',
        videoCodec: 'copy',
        audioCodec: isMp4SafeAudio ? 'copy' : 'aac',
        resolution: 'source',
        framerate: 'source',
        fastStart: true,
        hardwareEngine: 'stream-copy',
      });
    } else if (presetName === 'fast') {
      updateConfig({
        targetCategory: 'video',
        container: 'mp4',
        videoCodec: 'libx264',
        rateControl: 'crf',
        crf: 23,
        resolution: 'source',
        framerate: 'source',
        speedPreset: 'ultrafast',
        audioCodec: 'aac',
        audioBitrate: '192k',
        audioChannels: 'source',
        fastStart: true,
      });
    } else if (presetName === 'web-h264') {
      updateConfig({
        targetCategory: 'video',
        container: 'mp4',
        videoCodec: 'libx264',
        rateControl: 'crf',
        crf: 23,
        resolution: 'source',
        framerate: 'source',
        speedPreset: 'veryfast',
        audioCodec: 'aac',
        audioBitrate: '192k',
        audioChannels: 'source',
        fastStart: true,
      });
    } else if (presetName === 'high-quality') {
      updateConfig({
        targetCategory: 'video',
        container: 'mp4',
        videoCodec: 'libx264',
        rateControl: 'crf',
        crf: 18,
        resolution: 'source',
        framerate: 'source',
        speedPreset: 'fast',
        audioCodec: 'aac',
        audioBitrate: '256k',
        fastStart: true,
      });
    } else if (presetName === 'hevc') {
      updateConfig({
        targetCategory: 'video',
        container: 'mp4',
        videoCodec: 'libx265',
        rateControl: 'crf',
        crf: 24,
        resolution: 'source',
        framerate: 'source',
        speedPreset: 'ultrafast',
        audioCodec: 'aac',
        audioBitrate: '192k',
        fastStart: true,
      });
    } else if (presetName === 'compact') {
      updateConfig({
        targetCategory: 'video',
        container: 'mp4',
        videoCodec: 'libx264',
        rateControl: 'crf',
        crf: 24,
        resolution: '1280x720',
        framerate: 'source',
        speedPreset: 'ultrafast',
        audioCodec: 'aac',
        audioBitrate: '128k',
        fastStart: true,
      });
    } else if (presetName === 'webm-vp9') {
      updateConfig({
        targetCategory: 'video',
        container: 'webm',
        videoCodec: 'libvpx-vp9',
        rateControl: 'crf',
        crf: 30,
        resolution: 'source',
        audioCodec: 'libopus',
        audioBitrate: '128k',
      });
    } else if (presetName === 'gif') {
      updateConfig({
        targetCategory: 'video',
        container: 'gif',
        videoCodec: 'gif',
        resolution: '854x480',
        framerate: '24',
        audioCodec: 'none',
      });
    } else if (presetName === 'audio-mp3') {
      updateConfig({
        targetCategory: 'audio',
        container: 'mp3',
        audioCodec: 'libmp3lame',
        audioBitrate: '320k',
        audioChannels: 'stereo',
      });
    } else if (presetName === 'audio-lossless') {
      updateConfig({
        targetCategory: 'audio',
        container: 'wav',
        audioCodec: 'pcm_s16le',
        audioBitrate: 'lossless',
        audioChannels: 'stereo',
      });
    }
  };

  return (
    <div className={`space-y-4 ${disabled ? 'opacity-60 pointer-events-none' : ''}`}>
      {/* Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2 cyber-panel rounded-xl px-4 py-2.5 select-none">
        <div className="flex items-center gap-1 bg-zinc-950/90 p-1 rounded-lg border border-cyan-500/30">
          <button
            type="button"
            onClick={() => setMode('simple')}
            className={`px-3 py-1 rounded-md text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              mode === 'simple'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50'
                : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Simple</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('pro')}
            className={`px-3 py-1 rounded-md text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              mode === 'pro'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/50'
                : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Advanced</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-xs font-mono text-zinc-400">
            Output: <strong className="text-cyan-300">.{config.container.toUpperCase()}</strong>
            {config.videoCodec === 'copy' && config.audioCodec === 'copy' && (
              <span className="ml-1.5 text-emerald-400 font-bold">(Copy)</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => applyPreset('remux')}
            className="px-2.5 py-1 rounded-md bg-zinc-900/90 hover:bg-cyan-950/50 text-zinc-300 hover:text-cyan-300 border border-zinc-800 hover:border-cyan-500/40 text-[11px] font-mono transition-colors cursor-pointer"
          >
            Reset
          </button>
        </div>
      </div>

      {/* SIMPLE MODE */}
      {mode === 'simple' && (
        <div className="cyber-panel rounded-xl p-4 sm:p-5 space-y-5">
          {/* 1. Output Format */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-mono text-zinc-300 font-semibold">
                1. Format
              </label>
              <button
                type="button"
                onClick={() => setShowAllFormats(!showAllFormats)}
                className="text-[11px] font-mono text-zinc-400 hover:text-emerald-400 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span>{showAllFormats ? 'Less formats' : 'More formats'}</span>
                {showAllFormats ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {/* MP4 */}
              <button
                type="button"
                onClick={() => {
                  const srcVid = (source?.videoCodec || '').toLowerCase();
                  const canCopy = ['h264', 'avc1', 'hevc', 'h265', 'mpeg4', 'av1'].some((c) => srcVid.includes(c));
                  const srcAudio = (source?.audioCodec || '').toLowerCase();
                  const isMp4SafeAudio = ['aac', 'alac', 'mp3'].some((a) => srcAudio.includes(a));
                  updateConfig({
                    targetCategory: 'video',
                    container: 'mp4',
                    videoCodec: canCopy ? 'copy' : 'libx264',
                    audioCodec: canCopy ? (isMp4SafeAudio ? 'copy' : 'aac') : 'aac',
                    speedPreset: 'ultrafast',
                    fastStart: true,
                  });
                }}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                  config.targetCategory === 'video' && config.container === 'mp4'
                    ? 'bg-emerald-500/10 border-emerald-500/60 ring-1 ring-emerald-500/30 text-zinc-100'
                    : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="font-mono font-bold text-sm text-emerald-400">MP4</span>
                  <Film className="w-3.5 h-3.5 text-zinc-400" />
                </div>
                <div className="text-[10px] text-zinc-500">Standard video</div>
              </button>

              {/* MOV */}
              <button
                type="button"
                onClick={() => {
                  const srcVid = (source?.videoCodec || '').toLowerCase();
                  const canCopy = ['h264', 'avc1', 'hevc', 'h265', 'prores', 'mpeg4'].some((c) => srcVid.includes(c));
                  const srcAudio = (source?.audioCodec || '').toLowerCase();
                  const isMovSafeAudio = ['aac', 'alac', 'pcm_s16le', 'mp3'].some((a) => srcAudio.includes(a));
                  updateConfig({
                    targetCategory: 'video',
                    container: 'mov',
                    videoCodec: canCopy ? 'copy' : 'libx264',
                    audioCodec: canCopy ? (isMovSafeAudio ? 'copy' : 'aac') : 'aac',
                    speedPreset: 'ultrafast',
                    fastStart: true,
                  });
                }}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                  config.targetCategory === 'video' && config.container === 'mov'
                    ? 'bg-emerald-500/10 border-emerald-500/60 ring-1 ring-emerald-500/30 text-zinc-100'
                    : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="font-mono font-bold text-sm text-amber-400">MOV</span>
                  <Film className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="text-[10px] text-zinc-500">QuickTime</div>
              </button>

              {/* WebM */}
              <button
                type="button"
                onClick={() => applyPreset('webm-vp9')}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                  config.targetCategory === 'video' && config.container === 'webm'
                    ? 'bg-emerald-500/10 border-emerald-500/60 ring-1 ring-emerald-500/30 text-zinc-100'
                    : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="font-mono font-bold text-sm text-purple-400">WebM</span>
                  <Film className="w-3.5 h-3.5 text-zinc-400" />
                </div>
                <div className="text-[10px] text-zinc-500">VP9 / Opus</div>
              </button>

              {/* MP3 */}
              <button
                type="button"
                onClick={() => applyPreset('audio-mp3')}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                  config.targetCategory === 'audio' && config.container === 'mp3'
                    ? 'bg-blue-500/10 border-blue-500/60 ring-1 ring-blue-500/30 text-zinc-100'
                    : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="font-mono font-bold text-sm text-blue-400">MP3</span>
                  <Music className="w-3.5 h-3.5 text-zinc-400" />
                </div>
                <div className="text-[10px] text-zinc-500">Audio</div>
              </button>

              {/* WAV */}
              <button
                type="button"
                onClick={() => applyPreset('audio-lossless')}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                  config.targetCategory === 'audio' && config.container === 'wav'
                    ? 'bg-blue-500/10 border-blue-500/60 ring-1 ring-blue-500/30 text-zinc-100'
                    : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="font-mono font-bold text-sm text-cyan-400">WAV</span>
                  <Volume2 className="w-3.5 h-3.5 text-zinc-400" />
                </div>
                <div className="text-[10px] text-zinc-500">Lossless audio</div>
              </button>

              {/* GIF */}
              <button
                type="button"
                onClick={() => applyPreset('gif')}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                  config.targetCategory === 'video' && config.container === 'gif'
                    ? 'bg-amber-500/10 border-amber-500/60 ring-1 ring-amber-500/30 text-zinc-100'
                    : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="font-mono font-bold text-sm text-amber-400">GIF</span>
                  <Sparkles className="w-3.5 h-3.5 text-zinc-400" />
                </div>
                <div className="text-[10px] text-zinc-500">Animated</div>
              </button>
            </div>

            {showAllFormats && (
              <div className="mt-3 p-3 bg-zinc-950/80 border border-zinc-800 rounded-xl flex flex-wrap gap-1.5">
                {(['mkv', 'avi'] as VideoContainer[]).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => updateConfig({ targetCategory: 'video', container: fmt })}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-medium transition-colors cursor-pointer ${
                      config.container === fmt
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    .{fmt.toUpperCase()}
                  </button>
                ))}
                {(['m4a', 'flac', 'ogg'] as AudioContainer[]).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => {
                      if (fmt === 'flac') updateConfig({ targetCategory: 'audio', container: fmt, audioCodec: 'flac', audioBitrate: 'lossless' });
                      else if (fmt === 'ogg') updateConfig({ targetCategory: 'audio', container: fmt, audioCodec: 'libopus' });
                      else updateConfig({ targetCategory: 'audio', container: fmt, audioCodec: 'aac' });
                    }}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-medium transition-colors cursor-pointer ${
                      config.container === fmt
                        ? 'bg-blue-500/20 border-blue-500 text-blue-300'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    .{fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 2. Quality Profile (For Video) */}
          {config.targetCategory === 'video' && config.container !== 'gif' && (
            <div>
              <label className="text-xs font-mono text-zinc-300 font-semibold block mb-2.5">
                2. Quality
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 font-mono text-xs">
                <button
                  type="button"
                  onClick={() => applyPreset('remux')}
                  className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                    config.videoCodec === 'copy'
                      ? 'bg-emerald-500/10 border-emerald-500/60 ring-1 ring-emerald-500/30'
                      : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700'
                  }`}
                >
                  <div className="font-semibold text-zinc-200 flex items-center justify-between">
                    <span className="text-emerald-400 font-bold">Copy</span>
                    {config.videoCodec === 'copy' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-1">Fastest, original quality</div>
                </button>

                <button
                  type="button"
                  onClick={() => applyPreset('fast')}
                  className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                    config.videoCodec === 'libx264' && config.speedPreset === 'ultrafast' && config.resolution === 'source'
                      ? 'bg-emerald-500/10 border-emerald-500/60 ring-1 ring-emerald-500/30'
                      : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700'
                  }`}
                >
                  <div className="font-semibold text-zinc-200 flex items-center justify-between">
                    <span>Fast</span>
                    {config.videoCodec === 'libx264' && config.speedPreset === 'ultrafast' && config.resolution === 'source' && (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-1">H.264 quick encode</div>
                </button>

                <button
                  type="button"
                  onClick={() => applyPreset('web-h264')}
                  className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                    config.videoCodec === 'libx264' && config.crf === 23 && config.speedPreset === 'veryfast'
                      ? 'bg-emerald-500/10 border-emerald-500/60 ring-1 ring-emerald-500/30'
                      : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700'
                  }`}
                >
                  <div className="font-semibold text-zinc-200 flex items-center justify-between">
                    <span>Balanced</span>
                    {config.videoCodec === 'libx264' && config.crf === 23 && config.speedPreset === 'veryfast' && (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-1">H.264 standard</div>
                </button>

                <button
                  type="button"
                  onClick={() => applyPreset('high-quality')}
                  className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                    config.videoCodec === 'libx264' && config.crf === 18
                      ? 'bg-emerald-500/10 border-emerald-500/60 ring-1 ring-emerald-500/30'
                      : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700'
                  }`}
                >
                  <div className="font-semibold text-zinc-200 flex items-center justify-between">
                    <span>High</span>
                    {config.videoCodec === 'libx264' && config.crf === 18 && (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-1">H.264 CRF 18</div>
                </button>

                <button
                  type="button"
                  onClick={() => applyPreset('hevc')}
                  className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                    config.videoCodec === 'libx265'
                      ? 'bg-purple-500/10 border-purple-500/60 ring-1 ring-purple-500/30'
                      : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700'
                  }`}
                >
                  <div className="font-semibold text-zinc-200 flex items-center justify-between">
                    <span>HEVC</span>
                    {config.videoCodec === 'libx265' && (
                      <Check className="w-3.5 h-3.5 text-purple-400" />
                    )}
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-1">H.265 smaller size</div>
                </button>

                <button
                  type="button"
                  onClick={() => applyPreset('compact')}
                  className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                    config.resolution === '1280x720'
                      ? 'bg-emerald-500/10 border-emerald-500/60 ring-1 ring-emerald-500/30'
                      : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700'
                  }`}
                >
                  <div className="font-semibold text-zinc-200 flex items-center justify-between">
                    <span>720p</span>
                    {config.resolution === '1280x720' && (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-1">Compact HD</div>
                </button>
              </div>
            </div>
          )}

          {/* Remux & Subtitle Options */}
          {config.targetCategory === 'video' && config.container !== 'gif' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px] font-mono">
              {(config.container === 'mp4' || config.container === 'mov') && (
                <label className="flex items-start gap-2 p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={config.fastStart !== false}
                    onChange={(e) => updateConfig({ fastStart: e.target.checked })}
                    className="rounded bg-zinc-800 border-zinc-700 text-emerald-500 focus:ring-0 w-3.5 h-3.5 mt-0.5 cursor-pointer"
                  />
                  <div>
                    <div className="text-zinc-200 font-semibold">Fast start</div>
                    <div className="text-[10px] text-zinc-500">Faster playback start</div>
                  </div>
                </label>
              )}

              <label className="flex items-start gap-2 p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={config.conditionalAudioTranscode !== false}
                  onChange={(e) => updateConfig({ conditionalAudioTranscode: e.target.checked })}
                  className="rounded bg-zinc-800 border-zinc-700 text-emerald-500 focus:ring-0 w-3.5 h-3.5 mt-0.5 cursor-pointer"
                />
                <div>
                  <div className="text-zinc-200 font-semibold">Auto-fix audio</div>
                  <div className="text-[10px] text-zinc-500">Convert unsupported audio to AAC</div>
                </div>
              </label>

              <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 flex flex-col justify-between">
                <div className="text-zinc-200 font-semibold mb-1">Subtitles</div>
                <select
                  value={config.subtitleMode || 'convert'}
                  onChange={(e) => updateConfig({ subtitleMode: e.target.value as any })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[11px] text-zinc-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="convert">Convert text subtitles</option>
                  <option value="copy">Copy subtitles</option>
                  <option value="drop">Remove subtitles</option>
                </select>
              </div>

              {canUseHardwareGpu && config.videoCodec !== 'copy' && config.container === 'mp4' && (
                <label className="flex items-start gap-2 p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 cursor-pointer select-none sm:col-span-3">
                  <input
                    type="checkbox"
                    checked={config.hardwareAcceleration !== false && config.hardwareEngine === 'webgpu'}
                    onChange={(e) =>
                      updateConfig({
                        hardwareAcceleration: e.target.checked,
                        hardwareEngine: e.target.checked ? 'webgpu' : 'cpu',
                      })
                    }
                    className="rounded bg-zinc-800 border-zinc-700 text-emerald-500 focus:ring-0 w-3.5 h-3.5 mt-0.5 cursor-pointer"
                  />
                  <div>
                    <div className="text-zinc-200 font-semibold">Hardware encoder</div>
                    <div className="text-[10px] text-zinc-500">Use GPU encoding for smaller MP4 files</div>
                  </div>
                </label>
              )}
            </div>
          )}

          {compatibility.autoRemuxNote && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-2 text-xs text-emerald-200 font-mono">
              <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>{compatibility.autoRemuxNote}</div>
            </div>
          )}

          {!compatibility.isCompatible && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2 text-xs text-amber-200 font-mono">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-amber-400">{compatibility.warning}</div>
                {compatibility.suggestion && (
                  <div className="text-[11px] text-amber-300/80 mt-0.5">{compatibility.suggestion}</div>
                )}
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-end">
            <button
              type="button"
              onClick={() => setMode('pro')}
              className="text-xs font-mono text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors font-medium cursor-pointer"
            >
              <span>Advanced settings</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ADVANCED MODE */}
      {mode === 'pro' && (
        <div className="space-y-4">
          <div className="cyber-panel rounded-xl p-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
              <div className="flex items-center gap-1.5 p-1 bg-zinc-950/80 rounded-lg border border-zinc-800 w-fit">
                <button
                  type="button"
                  onClick={() =>
                    updateConfig({
                      targetCategory: 'video',
                      container: 'mp4',
                      videoCodec: 'libx264',
                      audioCodec: 'aac',
                    })
                  }
                  className={`px-3 py-1.5 rounded-md text-xs font-mono font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                    config.targetCategory === 'video'
                      ? 'bg-zinc-800 text-emerald-400'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>Video</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateConfig({
                      targetCategory: 'audio',
                      container: 'mp3',
                      audioCodec: 'libmp3lame',
                    })
                  }
                  className={`px-3 py-1.5 rounded-md text-xs font-mono font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                    config.targetCategory === 'audio'
                      ? 'bg-zinc-800 text-blue-400'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Audio</span>
                </button>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => applyPreset('remux')}
                  className={`px-2 py-1 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                    config.videoCodec === 'copy'
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('web-h264')}
                  className="px-2 py-1 rounded text-[11px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  H.264
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('hevc')}
                  className="px-2 py-1 rounded text-[11px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  HEVC
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('webm-vp9')}
                  className="px-2 py-1 rounded text-[11px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  WebM
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('gif')}
                  className="px-2 py-1 rounded text-[11px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  GIF
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('audio-mp3')}
                  className="px-2 py-1 rounded text-[11px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  MP3
                </button>
              </div>
            </div>

            <div className="pt-3">
              <div className="text-[10px] font-mono text-zinc-500 mb-2">Container</div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {config.targetCategory === 'video' ? (
                  (['mp4', 'webm', 'mkv', 'mov', 'avi', 'gif'] as VideoContainer[]).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => {
                        if (fmt === 'webm') {
                          updateConfig({ container: fmt, videoCodec: 'libvpx-vp9', audioCodec: 'libopus' });
                        } else if (fmt === 'gif') {
                          updateConfig({ container: fmt, videoCodec: 'gif', audioCodec: 'none' });
                        } else {
                          updateConfig({ container: fmt });
                        }
                      }}
                      className={`py-2 px-3 rounded-lg border text-xs font-mono font-semibold uppercase transition-all cursor-pointer ${
                        config.container === fmt
                          ? 'bg-zinc-800/90 border-emerald-500/60 text-emerald-400'
                          : 'bg-zinc-950/60 border-zinc-800/80 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      .{fmt}
                    </button>
                  ))
                ) : (
                  (['mp3', 'm4a', 'wav', 'flac', 'ogg'] as AudioContainer[]).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => {
                        if (fmt === 'mp3') updateConfig({ container: fmt, audioCodec: 'libmp3lame' });
                        else if (fmt === 'm4a') updateConfig({ container: fmt, audioCodec: 'aac' });
                        else if (fmt === 'wav') updateConfig({ container: fmt, audioCodec: 'pcm_s16le', audioBitrate: 'lossless' });
                        else if (fmt === 'flac') updateConfig({ container: fmt, audioCodec: 'flac', audioBitrate: 'lossless' });
                        else if (fmt === 'ogg') updateConfig({ container: fmt, audioCodec: 'libopus' });
                        else updateConfig({ container: fmt });
                      }}
                      className={`py-2 px-3 rounded-lg border text-xs font-mono font-semibold uppercase transition-all cursor-pointer ${
                        config.container === fmt
                          ? 'bg-zinc-800/90 border-blue-500/60 text-blue-400'
                          : 'bg-zinc-950/60 border-zinc-800/80 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      .{fmt}
                    </button>
                  ))
                )}
              </div>
            </div>

            {!compatibility.isCompatible && (
              <div className="mt-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2 text-xs text-amber-200 font-mono">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-semibold text-amber-400">{compatibility.warning}</div>
                  {compatibility.suggestion && (
                    <div className="text-[11px] text-amber-300/80 mt-0.5">{compatibility.suggestion}</div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Video Parameters */}
            {config.targetCategory === 'video' && config.container !== 'gif' && (
              <div className="cyber-panel rounded-xl p-4 font-mono text-xs space-y-4">
                <div className="flex items-center gap-2 font-semibold text-sm text-zinc-200 border-b border-zinc-850 pb-2">
                  <Film className="w-4 h-4 text-emerald-400" />
                  <span>Video</span>
                </div>

                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1.5">Codec</label>
                  <select
                    value={config.videoCodec}
                    onChange={(e) => updateConfig({ videoCodec: e.target.value as VideoCodec })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-emerald-500/80"
                  >
                    <option value="copy">Copy (no re-encode)</option>
                    <option value="libx264">H.264 (libx264)</option>
                    <option value="libx265">H.265 / HEVC (libx265)</option>
                    <option value="libvpx-vp9">VP9 (WebM)</option>
                  </select>
                </div>

                {config.videoCodec !== 'copy' && (
                  <>
                    <div className="space-y-2 bg-zinc-950/60 border border-zinc-800/60 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-zinc-400">Rate Control</span>
                        <div className="flex items-center gap-1 bg-zinc-900 rounded p-0.5 border border-zinc-800">
                          <button
                            type="button"
                            onClick={() => updateConfig({ rateControl: 'crf' })}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                              config.rateControl === 'crf'
                                ? 'bg-zinc-800 text-emerald-400'
                                : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                          >
                            CRF
                          </button>
                          <button
                            type="button"
                            onClick={() => updateConfig({ rateControl: 'bitrate' })}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                              config.rateControl === 'bitrate'
                                ? 'bg-zinc-800 text-emerald-400'
                                : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                          >
                            Bitrate
                          </button>
                        </div>
                      </div>

                      {config.rateControl === 'crf' ? (
                        <div>
                          <div className="flex justify-between items-center text-xs mt-2 mb-1.5">
                            <span className="text-zinc-300">
                              CRF: <strong className="text-emerald-400">{config.crf}</strong>
                            </span>
                            <span className="text-[10px] text-zinc-500">Lower = better quality</span>
                          </div>
                          <input
                            type="range"
                            min="16"
                            max="34"
                            step="1"
                            value={config.crf}
                            onChange={(e) => updateConfig({ crf: parseInt(e.target.value, 10) })}
                            className="w-full accent-emerald-500 cursor-pointer"
                          />
                        </div>
                      ) : (
                        <div>
                          <label className="text-[10px] text-zinc-400 block mb-1">Bitrate</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={config.videoBitrate}
                              onChange={(e) => updateConfig({ videoBitrate: e.target.value })}
                              placeholder="4000k"
                              className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-200"
                            />
                            <button
                              type="button"
                              onClick={() => updateConfig({ videoBitrate: '2500k' })}
                              className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 rounded border border-zinc-800 text-[10px] cursor-pointer"
                            >
                              2.5M
                            </button>
                            <button
                              type="button"
                              onClick={() => updateConfig({ videoBitrate: '5000k' })}
                              className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 rounded border border-zinc-800 text-[10px] cursor-pointer"
                            >
                              5M
                            </button>
                            <button
                              type="button"
                              onClick={() => updateConfig({ videoBitrate: '8000k' })}
                              className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 rounded border border-zinc-800 text-[10px] cursor-pointer"
                            >
                              8M
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-zinc-400 block mb-1.5">Resolution</label>
                        <select
                          value={config.resolution}
                          onChange={(e) => updateConfig({ resolution: e.target.value as ResolutionPreset })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200"
                        >
                          <option value="source">Original</option>
                          <option value="3840x2160">4K (2160p)</option>
                          <option value="2560x1440">1440p</option>
                          <option value="1920x1080">1080p</option>
                          <option value="1280x720">720p</option>
                          <option value="854x480">480p</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] text-zinc-400 block mb-1.5">FPS</label>
                        <select
                          value={config.framerate}
                          onChange={(e) => updateConfig({ framerate: e.target.value as FrameratePreset })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200"
                        >
                          <option value="source">Original</option>
                          <option value="24">24 fps</option>
                          <option value="30">30 fps</option>
                          <option value="60">60 fps</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] text-zinc-400 block mb-1.5">Speed Preset</label>
                      <select
                        value={config.speedPreset}
                        onChange={(e) => updateConfig({ speedPreset: e.target.value as PresetSpeed })}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200"
                      >
                        <option value="ultrafast">Ultrafast</option>
                        <option value="superfast">Superfast</option>
                        <option value="veryfast">Veryfast</option>
                        <option value="faster">Faster</option>
                        <option value="fast">Fast</option>
                        <option value="medium">Medium</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Audio Parameters */}
            <div className={`cyber-panel rounded-xl p-4 font-mono text-xs space-y-4 ${
              config.targetCategory === 'audio' ? 'lg:col-span-2' : ''
            }`}>
              <div className="flex items-center gap-2 font-semibold text-sm text-zinc-200 border-b border-zinc-850 pb-2">
                <Volume2 className="w-4 h-4 text-blue-400" />
                <span>Audio</span>
              </div>

              <div>
                <label className="text-[11px] text-zinc-400 block mb-1.5">Codec</label>
                <select
                  value={config.audioCodec}
                  onChange={(e) => updateConfig({ audioCodec: e.target.value as AudioCodec })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-blue-500/80"
                >
                  {config.targetCategory === 'video' && (
                    <option value="copy">Copy (no re-encode)</option>
                  )}
                  <option value="aac">AAC</option>
                  <option value="libmp3lame">MP3</option>
                  <option value="libopus">Opus</option>
                  <option value="flac">FLAC (lossless)</option>
                  <option value="pcm_s16le">WAV PCM</option>
                  {config.targetCategory === 'video' && (
                    <option value="none">No audio</option>
                  )}
                </select>
              </div>

              {config.audioCodec !== 'none' && config.audioCodec !== 'copy' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-zinc-400 block mb-1.5">Bitrate</label>
                      {['flac', 'pcm_s16le'].includes(config.audioCodec) ? (
                        <div className="py-1.5 px-3 rounded bg-zinc-950 border border-zinc-800 text-zinc-400 text-[11px]">
                          Lossless
                        </div>
                      ) : (
                        <select
                          value={config.audioBitrate}
                          onChange={(e) => updateConfig({ audioBitrate: e.target.value as AudioBitrate })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200"
                        >
                          <option value="96k">96 kbps</option>
                          <option value="128k">128 kbps</option>
                          <option value="192k">192 kbps</option>
                          <option value="256k">256 kbps</option>
                          <option value="320k">320 kbps</option>
                        </select>
                      )}
                    </div>

                    <div>
                      <label className="text-[11px] text-zinc-400 block mb-1.5">Channels</label>
                      <select
                        value={config.audioChannels}
                        onChange={(e) => updateConfig({ audioChannels: e.target.value as ChannelLayout })}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200"
                      >
                        <option value="source">Original</option>
                        <option value="stereo">Stereo</option>
                        <option value="mono">Mono</option>
                        <option value="5.1">5.1</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1.5">Sample Rate</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => updateConfig({ audioSampleRate: 'source' })}
                        className={`flex-1 py-1.5 px-2 rounded border text-[11px] cursor-pointer ${
                          config.audioSampleRate === 'source'
                            ? 'bg-zinc-800 border-zinc-700 text-zinc-200 font-bold'
                            : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        Original
                      </button>
                      <button
                        type="button"
                        onClick={() => updateConfig({ audioSampleRate: '48000' })}
                        className={`flex-1 py-1.5 px-2 rounded border text-[11px] cursor-pointer ${
                          config.audioSampleRate === '48000'
                            ? 'bg-zinc-800 border-zinc-700 text-zinc-200 font-bold'
                            : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        48 kHz
                      </button>
                      <button
                        type="button"
                        onClick={() => updateConfig({ audioSampleRate: '44100' })}
                        className={`flex-1 py-1.5 px-2 rounded border text-[11px] cursor-pointer ${
                          config.audioSampleRate === '44100'
                            ? 'bg-zinc-800 border-zinc-700 text-zinc-200 font-bold'
                            : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        44.1 kHz
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
