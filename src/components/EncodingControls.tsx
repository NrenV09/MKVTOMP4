import React, { useState } from 'react';
import { 
  Sliders, 
  Film, 
  Volume2, 
  Zap, 
  AlertTriangle, 
  CheckCircle2, 
  Sparkles,
  Settings,
  ChevronDown,
  ChevronUp,
  Music,
  Check,
  Flame,
  ArrowRight,
  Cpu
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
  ChannelLayout
} from '../types';
import { checkCompatibility, detectDeviceCapabilities } from '../utils/ffmpegBuilder';
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
  // Default to simple mode so casual users have a clean, friendly experience
  const [mode, setMode] = useState<'simple' | 'pro'>('simple');
  const [showAllFormats, setShowAllFormats] = useState(false);
  const dev = detectDeviceCapabilities();

  const updateConfig = (patch: Partial<EncodingConfig>) => {
    onChange({ ...config, ...patch });
  };

  const compatibility = checkCompatibility(source, config);

  // Quick Preset Actions
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
      });
    } else if (presetName === 'fast' || presetName === 'm3-turbo') {
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
      {/* Mode Switcher: Simple vs Pro */}
      <div className="flex items-center justify-between bg-[#121215] border border-zinc-800 rounded-xl px-4 py-2.5 select-none">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider hidden sm:inline">
            CONFIGURATION MODE:
          </span>
          <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
            <button
              onClick={() => setMode('simple')}
              className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${
                mode === 'simple'
                  ? 'bg-emerald-500 text-zinc-950 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Simple (Recommended)</span>
            </button>
            <button
              onClick={() => setMode('pro')}
              className={`px-3 py-1 rounded-md text-xs font-mono flex items-center gap-1.5 transition-all ${
                mode === 'pro'
                  ? 'bg-zinc-800 text-emerald-400 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Pro Parameters</span>
            </button>
          </div>
        </div>

        <div className="text-xs font-mono text-zinc-500">
          Target: <strong className="text-emerald-400">.{config.container.toUpperCase()}</strong>
          {config.videoCodec === 'copy' && config.audioCodec === 'copy' && (
            <span className="ml-1 text-emerald-300 font-bold">(Stream Copy)</span>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SIMPLE MODE (Easy, 1-Click friendly, zero clutter) */}
      {/* ========================================================================= */}
      {mode === 'simple' && (
        <div className="bg-[#121215] border border-zinc-800 rounded-xl p-4 sm:p-5 space-y-5">
          {/* 1. Choose Target Format */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-mono text-zinc-300 font-semibold uppercase tracking-wider flex items-center gap-2">
                <span>1. Select Output Format</span>
              </label>
              <button
                onClick={() => setShowAllFormats(!showAllFormats)}
                className="text-[11px] font-mono text-zinc-400 hover:text-emerald-400 transition-colors flex items-center gap-1"
              >
                <span>{showAllFormats ? 'Show Popular Only' : 'More Formats (MOV, AVI, FLAC...)'}</span>
                {showAllFormats ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>

            {/* Popular primary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {/* Universal MP4 */}
              <button
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
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                  config.targetCategory === 'video' && config.container === 'mp4'
                    ? 'bg-emerald-500/10 border-emerald-500/60 ring-1 ring-emerald-500/30 text-zinc-100'
                    : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="font-mono font-bold text-sm text-emerald-400">MP4</span>
                  <Film className="w-3.5 h-3.5 text-zinc-400" />
                </div>
                <div>
                  <div className="text-xs font-medium text-zinc-200">MP4 Video</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Universal format</div>
                </div>
              </button>

              {/* MOV Video */}
              <button
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
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                  config.targetCategory === 'video' && config.container === 'mov'
                    ? 'bg-emerald-500/10 border-emerald-500/60 ring-1 ring-emerald-500/30 text-zinc-100'
                    : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="font-mono font-bold text-sm text-amber-400">MOV</span>
                  <Film className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div>
                  <div className="text-xs font-medium text-zinc-200">QuickTime (MOV)</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Apple ecosystem</div>
                </div>
              </button>

              {/* WebM Video */}
              <button
                onClick={() => applyPreset('webm-vp9')}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                  config.targetCategory === 'video' && config.container === 'webm'
                    ? 'bg-emerald-500/10 border-emerald-500/60 ring-1 ring-emerald-500/30 text-zinc-100'
                    : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="font-mono font-bold text-sm text-purple-400">WebM</span>
                  <Film className="w-3.5 h-3.5 text-zinc-400" />
                </div>
                <div>
                  <div className="text-xs font-medium text-zinc-200">Video (WebM)</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">VP9 / Opus</div>
                </div>
              </button>

              {/* MP3 Audio */}
              <button
                onClick={() => applyPreset('audio-mp3')}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                  config.targetCategory === 'audio' && config.container === 'mp3'
                    ? 'bg-blue-500/10 border-blue-500/60 ring-1 ring-blue-500/30 text-zinc-100'
                    : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="font-mono font-bold text-sm text-blue-400">MP3</span>
                  <Music className="w-3.5 h-3.5 text-zinc-400" />
                </div>
                <div>
                  <div className="text-xs font-medium text-zinc-200">Audio (MP3)</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Extract audio</div>
                </div>
              </button>

              {/* Lossless WAV */}
              <button
                onClick={() => applyPreset('audio-lossless')}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                  config.targetCategory === 'audio' && config.container === 'wav'
                    ? 'bg-blue-500/10 border-blue-500/60 ring-1 ring-blue-500/30 text-zinc-100'
                    : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="font-mono font-bold text-sm text-cyan-400">WAV</span>
                  <Volume2 className="w-3.5 h-3.5 text-zinc-400" />
                </div>
                <div>
                  <div className="text-xs font-medium text-zinc-200">Audio (WAV)</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">PCM 16-bit</div>
                </div>
              </button>

              {/* Animated GIF */}
              <button
                onClick={() => applyPreset('gif')}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                  config.targetCategory === 'video' && config.container === 'gif'
                    ? 'bg-amber-500/10 border-amber-500/60 ring-1 ring-amber-500/30 text-zinc-100'
                    : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="font-mono font-bold text-sm text-amber-400">GIF</span>
                  <Sparkles className="w-3.5 h-3.5 text-zinc-400" />
                </div>
                <div>
                  <div className="text-xs font-medium text-zinc-200">Animated GIF</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Paletted 256 colors</div>
                </div>
              </button>
            </div>

            {/* Extended format pills (if expanded) */}
            {showAllFormats && (
              <div className="mt-3 p-3 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-2">
                <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
                  Additional Supported Containers:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(['mkv', 'mov', 'avi'] as VideoContainer[]).map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => updateConfig({ targetCategory: 'video', container: fmt })}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-medium transition-colors ${
                        config.container === fmt
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      .{fmt.toUpperCase()} (Video)
                    </button>
                  ))}
                  {(['m4a', 'flac', 'ogg'] as AudioContainer[]).map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => {
                        if (fmt === 'flac') updateConfig({ targetCategory: 'audio', container: fmt, audioCodec: 'flac', audioBitrate: 'lossless' });
                        else if (fmt === 'ogg') updateConfig({ targetCategory: 'audio', container: fmt, audioCodec: 'libopus' });
                        else updateConfig({ targetCategory: 'audio', container: fmt, audioCodec: 'aac' });
                      }}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-medium transition-colors ${
                        config.container === fmt
                          ? 'bg-blue-500/20 border-blue-500 text-blue-300'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      .{fmt.toUpperCase()} (Audio)
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Hardware Acceleration & WebGPU Access Controls */}
          <div className="bg-zinc-950/80 border border-zinc-800/90 rounded-xl p-3.5 sm:p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-zinc-800/60">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-mono font-semibold text-zinc-200 flex items-center gap-2">
                    <span>Hardware Acceleration & WebGPU</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      hardwareCaps?.webgpu.available
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}>
                      {hardwareCaps?.webgpu.available ? 'WebGPU Active' : 'Fallback Mode'}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">
                    {hardwareCaps?.webgpu.available
                      ? `${hardwareCaps.webgpu.description || hardwareCaps.webgpu.adapterName} • Media Engine Ready`
                      : 'WebCodecs & Multi-threaded Wasm Pipeline'}
                  </div>
                </div>
              </div>

              <div className="text-right font-mono text-[11px] text-zinc-400">
                Mode:{' '}
                <span className="text-emerald-400 font-semibold">
                  {config.videoCodec === 'copy'
                    ? 'Direct Stream Copy'
                    : config.hardwareAcceleration !== false
                    ? 'WebGPU / WebCodecs HW'
                    : 'CPU Software'}
                </span>
              </div>
            </div>

            {/* Mode selection cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono">
              {/* Option 1: Direct Stream Copy */}
              <button
                type="button"
                onClick={() => {
                  applyPreset('remux');
                  updateConfig({ hardwareAcceleration: true, hardwareEngine: 'stream-copy' });
                }}
                className={`p-3 rounded-lg border text-left transition-all ${
                  config.videoCodec === 'copy'
                    ? 'bg-emerald-500/15 border-emerald-500/60 text-zinc-100 ring-1 ring-emerald-500/30 shadow-sm'
                    : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                }`}
              >
                <div className="font-semibold flex items-center justify-between">
                  <span className="text-emerald-400 font-bold">1. Direct Stream Copy</span>
                  {config.videoCodec === 'copy' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                </div>
                <div className="text-[11px] text-zinc-200 mt-1">Instant Passthrough (100x)</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">Zero CPU re-encoding • 100% original quality</div>
              </button>

              {/* Option 2: WebGPU & WebCodecs Hardware */}
              <button
                type="button"
                onClick={() => {
                  updateConfig({ 
                    hardwareAcceleration: true, 
                    hardwareEngine: 'webgpu', 
                    videoCodec: 'libx264',
                    speedPreset: 'ultrafast',
                  });
                }}
                className={`p-3 rounded-lg border text-left transition-all ${
                  config.videoCodec !== 'copy' && config.hardwareAcceleration !== false
                    ? 'bg-amber-500/15 border-amber-500/60 text-zinc-100 ring-1 ring-amber-500/30 shadow-sm'
                    : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                }`}
              >
                <div className="font-semibold flex items-center justify-between">
                  <span className="text-amber-400 font-bold">2. WebGPU & WebCodecs</span>
                  {config.videoCodec !== 'copy' && config.hardwareAcceleration !== false && (
                    <Check className="w-3.5 h-3.5 text-amber-400" />
                  )}
                </div>
                <div className="text-[11px] text-zinc-200 mt-1">GPU Hardware Engine</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">Apple VideoToolbox / GPU acceleration</div>
              </button>

              {/* Option 3: Multi-core CPU software */}
              <button
                type="button"
                onClick={() => {
                  updateConfig({ 
                    hardwareAcceleration: false, 
                    hardwareEngine: 'cpu',
                    videoCodec: 'libx264',
                    speedPreset: 'ultrafast',
                  });
                }}
                className={`p-3 rounded-lg border text-left transition-all ${
                  config.videoCodec !== 'copy' && config.hardwareAcceleration === false
                    ? 'bg-blue-500/15 border-blue-500/60 text-zinc-100 ring-1 ring-blue-500/30 shadow-sm'
                    : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                }`}
              >
                <div className="font-semibold flex items-center justify-between">
                  <span className="text-zinc-300 font-bold">3. Multi-core CPU</span>
                  {config.videoCodec !== 'copy' && config.hardwareAcceleration === false && (
                    <Check className="w-3.5 h-3.5 text-blue-400" />
                  )}
                </div>
                <div className="text-[11px] text-zinc-200 mt-1">x264 Wasm Fallback</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">Multi-threaded software transcoding</div>
              </button>
            </div>

            {/* WebGPU Zero-Copy Filter Options */}
            {config.hardwareAcceleration !== false && config.videoCodec !== 'copy' && hardwareCaps?.webgpu.available && (
              <div className="mt-4 pt-3 border-t border-zinc-800/60">
                <div className="text-xs font-mono font-semibold text-zinc-300 mb-2">WebGPU Compute Shader Filters</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => updateConfig({ webgpuFilter: 'none' })}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-medium transition-colors ${
                      (!config.webgpuFilter || config.webgpuFilter === 'none')
                        ? 'bg-zinc-800 border-zinc-600 text-zinc-200'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-300'
                    }`}
                  >
                    No Filter
                  </button>
                  <button
                    type="button"
                    onClick={() => updateConfig({ webgpuFilter: 'grayscale' })}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-medium transition-colors ${
                      config.webgpuFilter === 'grayscale'
                        ? 'bg-fuchsia-500/20 border-fuchsia-500 text-fuchsia-300'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-300'
                    }`}
                  >
                    Grayscale + Brightness
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 2. Choose Quality Profile (For Video) */}
          {config.targetCategory === 'video' && config.container !== 'gif' && (
            <div>
              <label className="text-xs font-mono text-zinc-300 font-semibold uppercase tracking-wider block mb-2.5">
                2. Profile
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 font-mono text-xs">
                {/* Passthrough / Copy */}
                <button
                  onClick={() => applyPreset('remux')}
                  className={`p-3 rounded-lg border text-left transition-all min-h-[52px] ${
                    config.videoCodec === 'copy'
                      ? 'bg-emerald-500/10 border-emerald-500/60 ring-1 ring-emerald-500/30'
                      : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700'
                  }`}
                >
                  <div className="font-semibold text-zinc-200 flex items-center justify-between">
                    <span className="text-emerald-400 font-bold">Passthrough</span>
                    {config.videoCodec === 'copy' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                  </div>
                  <div className="text-[11px] text-zinc-300 mt-1">Direct stream copy</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Instant • Original quality</div>
                </button>

                {/* Fast Transcode */}
                <button
                  onClick={() => applyPreset('fast')}
                  className={`p-3 rounded-lg border text-left transition-all min-h-[52px] ${
                    config.videoCodec === 'libx264' && config.speedPreset === 'ultrafast'
                      ? 'bg-emerald-500/10 border-emerald-500/60 ring-1 ring-emerald-500/30'
                      : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700'
                  }`}
                >
                  <div className="font-semibold text-zinc-200 flex items-center justify-between">
                    <span>Fast</span>
                    {config.videoCodec === 'libx264' && config.speedPreset === 'ultrafast' && (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-300 mt-1">H.264 ultrafast</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Fastest re-encode</div>
                </button>

                {/* H.264 Balanced */}
                <button
                  onClick={() => applyPreset('web-h264')}
                  className={`p-3 rounded-lg border text-left transition-all min-h-[52px] ${
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
                  <div className="text-[11px] text-zinc-400 mt-1">H.264 • CRF 23</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Standard quality</div>
                </button>

                {/* High Quality */}
                <button
                  onClick={() => applyPreset('high-quality')}
                  className={`p-3 rounded-lg border text-left transition-all min-h-[52px] ${
                    config.videoCodec === 'libx264' && config.crf === 18
                      ? 'bg-emerald-500/10 border-emerald-500/60 ring-1 ring-emerald-500/30'
                      : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700'
                  }`}
                >
                  <div className="font-semibold text-zinc-200 flex items-center justify-between">
                    <span>High Quality</span>
                    {config.videoCodec === 'libx264' && config.crf === 18 && (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-1">H.264 • CRF 18</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Maximum detail</div>
                </button>

                {/* HEVC / H.265 */}
                <button
                  onClick={() => applyPreset('hevc')}
                  className={`p-3 rounded-lg border text-left transition-all min-h-[52px] ${
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
                  <div className="text-[11px] text-zinc-400 mt-1">H.265 • CRF 24</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">High compression</div>
                </button>

                {/* Compact 720p */}
                <button
                  onClick={() => applyPreset('compact')}
                  className={`p-3 rounded-lg border text-left transition-all min-h-[52px] ${
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
                  <div className="text-[11px] text-zinc-400 mt-1">1280×720 downscale</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Compact file size</div>
                </button>
              </div>
            </div>
          )}

          {/* Compatibility Alert (if any) */}
          {!compatibility.isCompatible && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-200 font-mono">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-amber-400">{compatibility.warning}</div>
                {compatibility.suggestion && (
                  <div className="text-[11px] text-amber-300/80 mt-0.5">
                    Recommendation: {compatibility.suggestion}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Link to Open Pro Settings */}
          <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between">
            <span className="text-[11px] text-zinc-500 font-mono">
              Advanced parameters (CRF, custom bitrate, resolution, audio channels)
            </span>
            <button
              onClick={() => setMode('pro')}
              className="text-xs font-mono text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors font-medium"
            >
              <span>Advanced Settings</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PRO WORKSTATION MODE (Full granular controls) */}
      {/* ========================================================================= */}
      {mode === 'pro' && (
        <div className="space-y-4">
          {/* 1. Category & Container Navigation Tabs */}
          <div className="bg-[#121215] border border-zinc-800 rounded-xl p-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
              <div className="flex items-center gap-1.5 p-1 bg-zinc-950/80 rounded-lg border border-zinc-800 w-fit">
                <button
                  onClick={() => {
                    updateConfig({
                      targetCategory: 'video',
                      container: 'mp4',
                      videoCodec: 'libx264',
                      audioCodec: 'aac',
                    });
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-mono font-medium flex items-center gap-1.5 transition-all ${
                    config.targetCategory === 'video'
                      ? 'bg-zinc-800 text-emerald-400 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>VIDEO</span>
                </button>
                <button
                  onClick={() => {
                    updateConfig({
                      targetCategory: 'audio',
                      container: 'mp3',
                      audioCodec: 'libmp3lame',
                    });
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-mono font-medium flex items-center gap-1.5 transition-all ${
                    config.targetCategory === 'audio'
                      ? 'bg-zinc-800 text-blue-400 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>AUDIO</span>
                </button>
              </div>

              {/* Quick Presets Toolbar */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mr-1">
                  PRESETS:
                </span>
                <button
                  onClick={() => applyPreset('remux')}
                  className={`px-2 py-1 rounded text-[11px] font-mono border transition-colors ${
                    config.videoCodec === 'copy'
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                  title="Direct stream copy without re-encoding"
                >
                  Passthrough
                </button>
                <button
                  onClick={() => applyPreset('web-h264')}
                  className="px-2 py-1 rounded text-[11px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
                >
                  Web 1080p
                </button>
                <button
                  onClick={() => applyPreset('hevc')}
                  className="px-2 py-1 rounded text-[11px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
                >
                  HEVC
                </button>
                <button
                  onClick={() => applyPreset('webm-vp9')}
                  className="px-2 py-1 rounded text-[11px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
                >
                  VP9 WebM
                </button>
                <button
                  onClick={() => applyPreset('gif')}
                  className="px-2 py-1 rounded text-[11px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
                >
                  GIF
                </button>
                <button
                  onClick={() => applyPreset('audio-mp3')}
                  className="px-2 py-1 rounded text-[11px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
                >
                  MP3 320k
                </button>
              </div>
            </div>

            {/* Container Format Selectors */}
            <div className="pt-3">
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>TARGET CONTAINER FORMAT:</span>
                <span className="text-zinc-400 font-normal">
                  Output Extension: <strong className="text-emerald-400">.{config.container}</strong>
                </span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {config.targetCategory === 'video' ? (
                  (['mp4', 'webm', 'mkv', 'mov', 'avi', 'gif'] as VideoContainer[]).map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => {
                        if (fmt === 'webm') {
                          updateConfig({ container: fmt, videoCodec: 'libvpx-vp9', audioCodec: 'libopus' });
                        } else if (fmt === 'gif') {
                          updateConfig({ container: fmt, videoCodec: 'gif', audioCodec: 'none' });
                        } else {
                          updateConfig({ container: fmt });
                        }
                      }}
                      className={`py-2 px-3 rounded-lg border text-xs font-mono font-semibold transition-all flex flex-col items-center justify-center ${
                        config.container === fmt
                          ? 'bg-zinc-800/90 border-emerald-500/60 text-emerald-400 shadow-sm ring-1 ring-emerald-500/20'
                          : 'bg-zinc-950/60 border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                      }`}
                    >
                      <span className="uppercase tracking-wider">.{fmt}</span>
                      <span className="text-[9px] font-normal text-zinc-500 mt-0.5">
                        {fmt === 'mp4' && 'Universal'}
                        {fmt === 'webm' && 'HTML5 Web'}
                        {fmt === 'mkv' && 'All Codecs'}
                        {fmt === 'mov' && 'Apple QuickTime'}
                        {fmt === 'avi' && 'Legacy AVI'}
                        {fmt === 'gif' && 'Animation'}
                      </span>
                    </button>
                  ))
                ) : (
                  (['mp3', 'm4a', 'wav', 'flac', 'ogg'] as AudioContainer[]).map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => {
                        if (fmt === 'mp3') updateConfig({ container: fmt, audioCodec: 'libmp3lame' });
                        else if (fmt === 'm4a') updateConfig({ container: fmt, audioCodec: 'aac' });
                        else if (fmt === 'wav') updateConfig({ container: fmt, audioCodec: 'pcm_s16le', audioBitrate: 'lossless' });
                        else if (fmt === 'flac') updateConfig({ container: fmt, audioCodec: 'flac', audioBitrate: 'lossless' });
                        else if (fmt === 'ogg') updateConfig({ container: fmt, audioCodec: 'libopus' });
                        else updateConfig({ container: fmt });
                      }}
                      className={`py-2 px-3 rounded-lg border text-xs font-mono font-semibold transition-all flex flex-col items-center justify-center ${
                        config.container === fmt
                          ? 'bg-zinc-800/90 border-blue-500/60 text-blue-400 shadow-sm ring-1 ring-blue-500/20'
                          : 'bg-zinc-950/60 border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                      }`}
                    >
                      <span className="uppercase tracking-wider">.{fmt}</span>
                      <span className="text-[9px] font-normal text-zinc-500 mt-0.5">
                        {fmt === 'mp3' && 'Universal MP3'}
                        {fmt === 'm4a' && 'Apple AAC'}
                        {fmt === 'wav' && 'Uncompressed PCM'}
                        {fmt === 'flac' && 'Lossless Audio'}
                        {fmt === 'ogg' && 'Opus Container'}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Compatibility Alert */}
            {!compatibility.isCompatible && (
              <div className="mt-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-200 font-mono">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-semibold text-amber-400">{compatibility.warning}</div>
                  {compatibility.suggestion && (
                    <div className="text-[11px] text-amber-300/80 mt-0.5">
                      Recommendation: {compatibility.suggestion}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 2. Granular Parameters Panels (Video & Audio) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left Column: Video Parameters */}
            {config.targetCategory === 'video' && config.container !== 'gif' && (
              <div className="bg-[#121215] border border-zinc-800 rounded-xl p-4 font-mono text-xs space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-850 pb-2.5 text-zinc-300">
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    <Film className="w-4 h-4 text-emerald-400" />
                    <span>VIDEO ENCODING PIPELINE</span>
                  </div>
                  {config.videoCodec === 'copy' && (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                      STREAM PASS-THROUGH
                    </span>
                  )}
                </div>

                {/* Video Codec */}
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1.5 uppercase tracking-wider">
                    Video Codec:
                  </label>
                  <select
                    value={config.videoCodec}
                    onChange={(e) => updateConfig({ videoCodec: e.target.value as VideoCodec })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-emerald-500/80 transition-colors"
                  >
                    <option value="copy">Stream Copy (-c:v copy, Instant & Lossless)</option>
                    <option value="libx264">H.264 / AVC (libx264 - Maximum Web Compatibility)</option>
                    <option value="libx265">H.265 / HEVC (libx265 - Modern High Compression)</option>
                    <option value="libvpx-vp9">VP9 (libvpx-vp9 - Open WebM Standard)</option>
                    <option value="prores">Apple ProRes (prores - High-Bitrate Master)</option>
                  </select>
                </div>

                {config.videoCodec !== 'copy' && (
                  <>
                    {/* Rate Control */}
                    <div className="space-y-2 bg-zinc-950/60 border border-zinc-800/60 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-zinc-400 uppercase tracking-wider">
                          Rate Control Mode:
                        </span>
                        <div className="flex items-center gap-1 bg-zinc-900 rounded p-0.5 border border-zinc-800">
                          <button
                            onClick={() => updateConfig({ rateControl: 'crf' })}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                              config.rateControl === 'crf'
                                ? 'bg-zinc-800 text-emerald-400'
                                : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                          >
                            CRF (Constant Quality)
                          </button>
                          <button
                            onClick={() => updateConfig({ rateControl: 'bitrate' })}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                              config.rateControl === 'bitrate'
                                ? 'bg-zinc-800 text-emerald-400'
                                : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                          >
                            Target Bitrate
                          </button>
                        </div>
                      </div>

                      {config.rateControl === 'crf' ? (
                        <div>
                          <div className="flex justify-between items-center text-xs mt-2 mb-1.5">
                            <span className="text-zinc-300">
                              CRF Factor: <strong className="text-emerald-400 font-bold">{config.crf}</strong>
                            </span>
                            <span className="text-[10px] text-zinc-500">
                              {config.crf <= 19 && 'Visually Near-Lossless'}
                              {config.crf > 19 && config.crf <= 24 && 'Recommended Default (Crisp)'}
                              {config.crf > 24 && config.crf <= 28 && 'Compact Web'}
                              {config.crf > 28 && 'High Compression'}
                            </span>
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
                          <div className="flex justify-between text-[10px] text-zinc-600 mt-0.5">
                            <span>16 (Max Quality)</span>
                            <span>23 (Default)</span>
                            <span>34 (Smallest File)</span>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label className="text-[10px] text-zinc-400 block mb-1">
                            Video Bitrate (e.g. 2500k, 5000k, 8000k):
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={config.videoBitrate}
                              onChange={(e) => updateConfig({ videoBitrate: e.target.value })}
                              placeholder="4000k"
                              className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-200"
                            />
                            <button
                              onClick={() => updateConfig({ videoBitrate: '2500k' })}
                              className="px-2 py-1 bg-zinc-900 hover:bg-zinc-850 rounded border border-zinc-800 text-[10px]"
                            >
                              2.5M
                            </button>
                            <button
                              onClick={() => updateConfig({ videoBitrate: '5000k' })}
                              className="px-2 py-1 bg-zinc-900 hover:bg-zinc-850 rounded border border-zinc-800 text-[10px]"
                            >
                              5.0M
                            </button>
                            <button
                              onClick={() => updateConfig({ videoBitrate: '8000k' })}
                              className="px-2 py-1 bg-zinc-900 hover:bg-zinc-850 rounded border border-zinc-800 text-[10px]"
                            >
                              8.0M
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Resolution & Framerate Overrides */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-zinc-400 block mb-1.5 uppercase tracking-wider">
                          Resolution:
                        </label>
                        <select
                          value={config.resolution}
                          onChange={(e) => updateConfig({ resolution: e.target.value as ResolutionPreset })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200"
                        >
                          <option value="source">Source (Keep Original)</option>
                          <option value="3840x2160">3840×2160 (4K UHD)</option>
                          <option value="2560x1440">2560×1440 (1440p QHD)</option>
                          <option value="1920x1080">1920×1080 (1080p FHD)</option>
                          <option value="1280x720">1280×720 (720p HD)</option>
                          <option value="854x480">854×480 (480p SD)</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] text-zinc-400 block mb-1.5 uppercase tracking-wider">
                          Framerate:
                        </label>
                        <select
                          value={config.framerate}
                          onChange={(e) => updateConfig({ framerate: e.target.value as FrameratePreset })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200"
                        >
                          <option value="source">Source (Keep Original)</option>
                          <option value="24">24 fps (Cinema)</option>
                          <option value="30">30 fps (Web / TV)</option>
                          <option value="60">60 fps (Smooth)</option>
                        </select>
                      </div>
                    </div>

                    {/* Speed Preset */}
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[11px] text-zinc-400 uppercase tracking-wider">
                          Encoder Preset Speed:
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          {config.speedPreset === 'ultrafast' && 'Fastest processing, slightly larger file'}
                          {config.speedPreset === 'veryfast' && 'Optimal for browser WebAssembly'}
                          {config.speedPreset === 'medium' && 'Slower, best compression'}
                        </span>
                      </div>
                      <select
                        value={config.speedPreset}
                        onChange={(e) => updateConfig({ speedPreset: e.target.value as PresetSpeed })}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200"
                      >
                        <option value="ultrafast">ultrafast (Fastest CPU time)</option>
                        <option value="superfast">superfast</option>
                        <option value="veryfast">veryfast (Default Balanced)</option>
                        <option value="faster">faster</option>
                        <option value="fast">fast</option>
                        <option value="medium">medium (Higher CPU Load)</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Right Column: Audio Parameters */}
            <div className={`bg-[#121215] border border-zinc-800 rounded-xl p-4 font-mono text-xs space-y-4 ${
              config.targetCategory === 'audio' ? 'lg:col-span-2' : ''
            }`}>
              <div className="flex items-center justify-between border-b border-zinc-850 pb-2.5 text-zinc-300">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <Volume2 className="w-4 h-4 text-blue-400" />
                  <span>
                    {config.targetCategory === 'audio'
                      ? 'AUDIO EXTRACTION PIPELINE'
                      : 'AUDIO STREAM PIPELINE'}
                  </span>
                </div>
                {config.audioCodec === 'copy' && (
                  <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] font-bold">
                    STREAM PASS-THROUGH
                  </span>
                )}
              </div>

              {/* Audio Codec */}
              <div>
                <label className="text-[11px] text-zinc-400 block mb-1.5 uppercase tracking-wider">
                  Audio Encoder:
                </label>
                <select
                  value={config.audioCodec}
                  onChange={(e) => updateConfig({ audioCodec: e.target.value as AudioCodec })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-blue-500/80 transition-colors"
                >
                  {config.targetCategory === 'video' && (
                    <option value="copy">Stream Copy (-c:a copy, Lossless Pass-through)</option>
                  )}
                  <option value="aac">AAC (aac - Universal High-Fidelity)</option>
                  <option value="libmp3lame">MP3 (libmp3lame - Universal Compatibility)</option>
                  <option value="libopus">Opus (libopus - Modern High-Efficiency Audio)</option>
                  <option value="flac">FLAC (flac - Lossless Compressed Audio)</option>
                  <option value="pcm_s16le">PCM 16-bit WAV (pcm_s16le - Studio Uncompressed)</option>
                  {config.targetCategory === 'video' && (
                    <option value="none">Mute / Strip Audio Stream (-an)</option>
                  )}
                </select>
              </div>

              {config.audioCodec !== 'none' && config.audioCodec !== 'copy' && (
                <>
                  {/* Bitrate & Channels */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-zinc-400 block mb-1.5 uppercase tracking-wider">
                        Audio Bitrate:
                      </label>
                      {['flac', 'pcm_s16le'].includes(config.audioCodec) ? (
                        <div className="py-1.5 px-3 rounded bg-zinc-950 border border-zinc-800 text-zinc-400 text-[11px]">
                          Lossless (Auto-Determined)
                        </div>
                      ) : (
                        <select
                          value={config.audioBitrate}
                          onChange={(e) => updateConfig({ audioBitrate: e.target.value as AudioBitrate })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200"
                        >
                          <option value="96k">96 kbps (Voice / Low)</option>
                          <option value="128k">128 kbps (Standard)</option>
                          <option value="192k">192 kbps (High Fidelity)</option>
                          <option value="256k">256 kbps (Audiophile)</option>
                          <option value="320k">320 kbps (Maximum MP3/AAC)</option>
                        </select>
                      )}
                    </div>

                    <div>
                      <label className="text-[11px] text-zinc-400 block mb-1.5 uppercase tracking-wider">
                        Channel Layout:
                      </label>
                      <select
                        value={config.audioChannels}
                        onChange={(e) => updateConfig({ audioChannels: e.target.value as ChannelLayout })}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200"
                      >
                        <option value="source">Source (Keep Input Channels)</option>
                        <option value="stereo">Stereo (2.0)</option>
                        <option value="mono">Mono Downmix (1.0)</option>
                        <option value="5.1">5.1 Surround (6ch)</option>
                      </select>
                    </div>
                  </div>

                  {/* Sample Rate */}
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1.5 uppercase tracking-wider">
                      Sample Rate Override:
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => updateConfig({ audioSampleRate: 'source' })}
                        className={`flex-1 py-1.5 px-2 rounded text-center border text-[11px] transition-colors ${
                          config.audioSampleRate === 'source'
                            ? 'bg-zinc-800 border-zinc-700 text-zinc-200 font-bold'
                            : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        Source (Auto)
                      </button>
                      <button
                        onClick={() => updateConfig({ audioSampleRate: '48000' })}
                        className={`flex-1 py-1.5 px-2 rounded text-center border text-[11px] transition-colors ${
                          config.audioSampleRate === '48000'
                            ? 'bg-zinc-800 border-zinc-700 text-zinc-200 font-bold'
                            : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        48.0 kHz (Broadcast)
                      </button>
                      <button
                        onClick={() => updateConfig({ audioSampleRate: '44100' })}
                        className={`flex-1 py-1.5 px-2 rounded text-center border text-[11px] transition-colors ${
                          config.audioSampleRate === '44100'
                            ? 'bg-zinc-800 border-zinc-700 text-zinc-200 font-bold'
                            : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        44.1 kHz (CD Audio)
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
