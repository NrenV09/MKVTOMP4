import React, { useMemo, useState } from 'react';
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
  Copy,
  Minimize2,
  Zap,
  Cpu,
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
  CompressionPreset,
} from '../types';
import {
  checkCompatibility,
  detectDeviceCapabilities,
  formatBytes,
} from '../utils/ffmpegBuilder';
import {
  estimateCompressedSizeBytes,
  HardwareCapabilities,
} from '../utils/hardwareEngine';

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

  const deviceCaps = useMemo(() => detectDeviceCapabilities(), []);
  const compatibility = checkCompatibility(source, config);

  const canUseHardwareGpu = Boolean(
    hardwareCaps?.webcodecs.hwH264 ||
      hardwareCaps?.webcodecs.hwHEVC ||
      hardwareCaps?.webcodecs.available
  );

  const isVideoMode = config.targetCategory === 'video' && config.container !== 'gif';
  const isRemuxMode = isVideoMode && config.videoCodec === 'copy';
  const isCompressMode = isVideoMode && config.videoCodec !== 'copy';
  const isHwContainer = config.container === 'mp4' || config.container === 'mov';
  const isHardwareActive =
    isCompressMode &&
    isHwContainer &&
    canUseHardwareGpu &&
    config.hardwareAcceleration !== false &&
    config.hardwareEngine !== 'cpu';

  const acceleratorLabel = useMemo(() => {
    const webgpuDesc = hardwareCaps?.webgpu.description;
    if (
      webgpuDesc &&
      webgpuDesc !== 'WebGPU Not Supported' &&
      webgpuDesc !== 'Unavailable' &&
      webgpuDesc.trim().length > 0
    ) {
      return webgpuDesc;
    }
    return deviceCaps.chipLabel;
  }, [hardwareCaps, deviceCaps]);

  const sizeEstimate = useMemo(
    () => estimateCompressedSizeBytes(source, config),
    [source, config]
  );

  const suggestedTargetMB = useMemo(() => {
    if (!source?.size) return 25;
    const srcMB = source.size / (1024 * 1024);
    if (srcMB <= 12) return Math.max(2, Math.round(srcMB * 0.5));
    if (srcMB <= 60) return Math.max(8, Math.round(srcMB * 0.45));
    return Math.max(15, Math.round((srcMB * 0.4) / 5) * 5);
  }, [source]);

  const applyCompressionPreset = (
    preset: CompressionPreset,
    overrideCodec?: VideoCodec
  ) => {
    const targetContainer: VideoContainer =
      config.targetCategory === 'video' && config.container !== 'gif'
        ? (config.container as VideoContainer)
        : 'mp4';

    const nextCodec: VideoCodec =
      overrideCodec ||
      (targetContainer === 'webm'
        ? 'libvpx-vp9'
        : config.videoCodec === 'libx265'
        ? 'libx265'
        : 'libx264');

    const hwSupportedForContainer = targetContainer === 'mp4' || targetContainer === 'mov';
    const enableHw = canUseHardwareGpu && hwSupportedForContainer && config.hardwareEngine !== 'cpu';

    if (preset === 'light') {
      updateConfig({
        targetCategory: 'video',
        container: targetContainer,
        videoCodec: nextCodec,
        compressionPreset: 'light',
        rateControl: 'crf',
        crf: 20,
        resolution: 'source',
        framerate: 'source',
        speedPreset: 'veryfast',
        audioCodec: targetContainer === 'webm' ? 'libopus' : 'aac',
        audioBitrate: '192k',
        fastStart: true,
        hardwareAcceleration: enableHw,
        hardwareEngine: enableHw ? 'webgpu' : 'cpu',
      });
    } else if (preset === 'balanced') {
      updateConfig({
        targetCategory: 'video',
        container: targetContainer,
        videoCodec: nextCodec,
        compressionPreset: 'balanced',
        rateControl: 'crf',
        crf: 24,
        resolution: 'source',
        framerate: 'source',
        speedPreset: 'ultrafast',
        audioCodec: targetContainer === 'webm' ? 'libopus' : 'aac',
        audioBitrate: '128k',
        fastStart: true,
        hardwareAcceleration: enableHw,
        hardwareEngine: enableHw ? 'webgpu' : 'cpu',
      });
    } else if (preset === 'strong') {
      const cap720p = Boolean((source?.height && source.height > 720) || (source?.width && source.width > 1280));
      updateConfig({
        targetCategory: 'video',
        container: targetContainer,
        videoCodec: nextCodec,
        compressionPreset: 'strong',
        rateControl: 'crf',
        crf: 28,
        resolution: cap720p ? '1280x720' : 'source',
        framerate: 'source',
        speedPreset: 'ultrafast',
        audioCodec: targetContainer === 'webm' ? 'libopus' : 'aac',
        audioBitrate: '96k',
        fastStart: true,
        hardwareAcceleration: enableHw,
        hardwareEngine: enableHw ? 'webgpu' : 'cpu',
      });
    } else if (preset === 'target-size') {
      updateConfig({
        targetCategory: 'video',
        container: targetContainer,
        videoCodec: nextCodec,
        compressionPreset: 'target-size',
        targetSizeMB: config.targetSizeMB || suggestedTargetMB,
        rateControl: 'bitrate',
        resolution: config.resolution,
        framerate: 'source',
        speedPreset: 'ultrafast',
        audioCodec: targetContainer === 'webm' ? 'libopus' : 'aac',
        audioBitrate: '128k',
        fastStart: true,
        hardwareAcceleration: enableHw,
        hardwareEngine: enableHw ? 'webgpu' : 'cpu',
      });
    }
  };

  const applyPreset = (presetName: string) => {
    if (presetName === 'remux') {
      const targetContainer: VideoContainer =
        config.targetCategory === 'video' &&
        (config.container === 'mp4' || config.container === 'mov' || config.container === 'mkv')
          ? (config.container as VideoContainer)
          : 'mp4';
      const srcAudio = (source?.audioCodec || '').toLowerCase();
      const isMp4SafeAudio = ['aac', 'alac', 'mp3', 'ac3', 'eac3'].some((a) =>
        srcAudio.includes(a)
      );
      updateConfig({
        targetCategory: 'video',
        container: targetContainer,
        videoCodec: 'copy',
        audioCodec: targetContainer === 'mkv' || isMp4SafeAudio || !srcAudio ? 'copy' : 'aac',
        compressionPreset: undefined,
        resolution: 'source',
        framerate: 'source',
        fastStart: true,
        hardwareEngine: 'stream-copy',
      });
    } else if (presetName === 'compress') {
      applyCompressionPreset(config.compressionPreset || 'balanced');
    } else if (presetName === 'web-h264') {
      applyCompressionPreset('balanced', 'libx264');
    } else if (presetName === 'hevc') {
      applyCompressionPreset('balanced', 'libx265');
    } else if (presetName === 'webm-vp9') {
      updateConfig({
        targetCategory: 'video',
        container: 'webm',
        videoCodec: 'libvpx-vp9',
        compressionPreset: 'balanced',
        rateControl: 'crf',
        crf: 30,
        resolution: 'source',
        audioCodec: 'libopus',
        audioBitrate: '128k',
        hardwareAcceleration: false,
        hardwareEngine: 'cpu',
      });
    } else if (presetName === 'gif') {
      updateConfig({
        targetCategory: 'video',
        container: 'gif',
        videoCodec: 'gif',
        compressionPreset: undefined,
        resolution: '854x480',
        framerate: '24',
        audioCodec: 'none',
        hardwareEngine: 'cpu',
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

  const handleSelectVideoContainer = (container: 'mp4' | 'mov' | 'mkv' | 'avi') => {
    const srcVid = (source?.videoCodec || '').toLowerCase();
    const canCopy =
      container === 'mkv' ||
      container === 'avi' ||
      ['h264', 'avc1', 'hevc', 'h265', 'mpeg4', 'av1', 'prores'].some((c) => srcVid.includes(c));
    const srcAudio = (source?.audioCodec || '').toLowerCase();
    const isSafeAudio =
      container === 'mkv' ||
      ['aac', 'alac', 'mp3', 'ac3', 'eac3'].some((a) => srcAudio.includes(a));

    if (isCompressMode) {
      const nextCodec: VideoCodec =
        config.videoCodec === 'libx265' || config.videoCodec === 'libx264'
          ? config.videoCodec
          : 'libx264';
      const allowHw = canUseHardwareGpu && (container === 'mp4' || container === 'mov');
      updateConfig({
        targetCategory: 'video',
        container,
        videoCodec: nextCodec,
        audioCodec: config.audioCodec === 'none' ? 'none' : 'aac',
        fastStart: container === 'mp4' || container === 'mov',
        hardwareAcceleration: allowHw ? config.hardwareAcceleration !== false : false,
        hardwareEngine: allowHw && config.hardwareEngine !== 'cpu' ? 'webgpu' : 'cpu',
      });
    } else {
      const useCopy = canCopy;
      const allowHw = !useCopy && canUseHardwareGpu && (container === 'mp4' || container === 'mov');
      updateConfig({
        targetCategory: 'video',
        container,
        videoCodec: useCopy ? 'copy' : 'libx264',
        audioCodec: useCopy ? (isSafeAudio || !srcAudio ? 'copy' : 'aac') : 'aac',
        speedPreset: 'ultrafast',
        fastStart: container === 'mp4' || container === 'mov',
        hardwareAcceleration: allowHw,
        hardwareEngine: useCopy ? 'stream-copy' : allowHw ? 'webgpu' : 'cpu',
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
            {isRemuxMode && (
              <span className="ml-1.5 text-emerald-400 font-bold">(Remux)</span>
            )}
            {isCompressMode && (
              <span className="ml-1.5 text-cyan-400 font-bold">
                ({isHardwareActive ? 'GPU Compress' : 'CPU Compress'})
              </span>
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
          {/* 1. Primary Workflow: Remux vs Compress (for Video files) */}
          {source?.hasVideo !== false && (
            <div>
              <label className="text-xs font-mono text-zinc-300 font-semibold block mb-2.5">
                1. Mode
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono">
                <button
                  type="button"
                  onClick={() => applyPreset('remux')}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-start justify-between gap-3 ${
                    isRemuxMode
                      ? 'bg-emerald-500/10 border-emerald-500/60 ring-1 ring-emerald-500/30 text-zinc-100'
                      : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`p-2 rounded-lg border shrink-0 ${
                        isRemuxMode
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                      }`}
                    >
                      <Copy className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-zinc-100 flex items-center gap-2">
                        <span>Remux (Stream Copy)</span>
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">
                        Fastest container swap, original quality
                      </div>
                    </div>
                  </div>
                  {isRemuxMode && <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
                </button>

                <button
                  type="button"
                  onClick={() => applyPreset('compress')}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-start justify-between gap-3 ${
                    isCompressMode
                      ? 'bg-cyan-500/10 border-cyan-500/60 ring-1 ring-cyan-500/30 text-zinc-100'
                      : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`p-2 rounded-lg border shrink-0 ${
                        isCompressMode
                          ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                      }`}
                    >
                      <Minimize2 className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-zinc-100 flex items-center gap-1.5 flex-wrap">
                        <span>Compress Video</span>
                        {canUseHardwareGpu && (
                          <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/40 text-[10px] text-cyan-300 flex items-center gap-1">
                            <Zap className="w-2.5 h-2.5" />
                            <span>GPU</span>
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">
                        Reduce file size with hardware acceleration
                      </div>
                    </div>
                  </div>
                  {isCompressMode && <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />}
                </button>
              </div>
            </div>
          )}

          {/* 2. Output Format */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-xs font-mono text-zinc-300 font-semibold">
                {source?.hasVideo !== false ? '2. Format' : '1. Format'}
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
                onClick={() => handleSelectVideoContainer('mp4')}
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
                onClick={() => handleSelectVideoContainer('mov')}
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
                {(['mkv', 'avi'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => handleSelectVideoContainer(fmt)}
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
                      if (fmt === 'flac') {
                        updateConfig({
                          targetCategory: 'audio',
                          container: fmt,
                          audioCodec: 'flac',
                          audioBitrate: 'lossless',
                        });
                      } else if (fmt === 'ogg') {
                        updateConfig({
                          targetCategory: 'audio',
                          container: fmt,
                          audioCodec: 'libopus',
                        });
                      } else {
                        updateConfig({
                          targetCategory: 'audio',
                          container: fmt,
                          audioCodec: 'aac',
                        });
                      }
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

          {/* 3. Compression Controls (Active when Compress Video is selected) */}
          {isCompressMode && (
            <div className="p-4 rounded-xl bg-zinc-950/70 border border-cyan-500/25 space-y-4 font-mono">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs text-zinc-200 font-semibold">
                  3. Compression Level
                </label>
                {sizeEstimate && (
                  <div className="text-[11px] flex items-center gap-1.5">
                    <span className="text-zinc-400">Est:</span>
                    <strong className="text-cyan-300">
                      {formatBytes(sizeEstimate.estimatedBytes)}
                    </strong>
                    {sizeEstimate.savingsPercent > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 font-bold text-[10px]">
                        -{sizeEstimate.savingsPercent}%
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {(
                  [
                    {
                      id: 'light',
                      label: 'Light',
                      desc: 'High quality',
                    },
                    {
                      id: 'balanced',
                      label: 'Balanced',
                      desc: 'Best size & quality',
                    },
                    {
                      id: 'strong',
                      label: 'Strong',
                      desc: 'Smallest file',
                    },
                    {
                      id: 'target-size',
                      label: 'Target MB',
                      desc: 'Exact size cap',
                    },
                  ] as const
                ).map((item) => {
                  const active =
                    config.compressionPreset === item.id ||
                    (!config.compressionPreset && item.id === 'balanced');
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => applyCompressionPreset(item.id)}
                      className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                        active
                          ? 'bg-cyan-500/12 border-cyan-400/60 ring-1 ring-cyan-400/30'
                          : 'bg-zinc-900/70 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div className="font-semibold text-zinc-100 flex items-center justify-between">
                        <span>{item.label}</span>
                        {active && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-1">{item.desc}</div>
                    </button>
                  );
                })}
              </div>

              {/* Target Size MB Controls */}
              {config.compressionPreset === 'target-size' && (
                <div className="p-3 rounded-lg bg-zinc-900/80 border border-zinc-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-zinc-400">Target size:</label>
                    <input
                      type="number"
                      min={1}
                      max={4000}
                      step={1}
                      value={config.targetSizeMB || suggestedTargetMB}
                      onChange={(e) => {
                        const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                        updateConfig({
                          compressionPreset: 'target-size',
                          targetSizeMB: val,
                          rateControl: 'bitrate',
                        });
                      }}
                      className="w-20 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs text-cyan-300 font-bold focus:outline-none focus:border-cyan-400"
                    />
                    <span className="text-[11px] text-zinc-400">MB</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[10, 25, 50, 100].map((mb) => (
                      <button
                        key={mb}
                        type="button"
                        onClick={() =>
                          updateConfig({
                            compressionPreset: 'target-size',
                            targetSizeMB: mb,
                            rateControl: 'bitrate',
                          })
                        }
                        className={`px-2 py-1 rounded border text-[10px] cursor-pointer transition-colors ${
                          config.targetSizeMB === mb
                            ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-300 font-bold'
                            : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {mb} MB
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Resolution & Video Codec Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                <div>
                  <label className="text-zinc-400 block mb-1.5">Resolution</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(
                      [
                        { value: 'source', label: 'Original' },
                        { value: '1920x1080', label: '1080p' },
                        { value: '1280x720', label: '720p' },
                        { value: '854x480', label: '480p' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => updateConfig({ resolution: opt.value })}
                        className={`py-1.5 px-2 rounded-lg border text-center transition-colors cursor-pointer ${
                          config.resolution === opt.value
                            ? 'bg-cyan-500/15 border-cyan-400/60 text-cyan-300 font-bold'
                            : 'bg-zinc-900/70 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {config.container !== 'webm' && (
                  <div>
                    <label className="text-zinc-400 block mb-1.5">Video Codec</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateConfig({ videoCodec: 'libx264' })}
                        className={`py-1.5 px-2.5 rounded-lg border text-left transition-colors cursor-pointer flex items-center justify-between ${
                          config.videoCodec === 'libx264'
                            ? 'bg-cyan-500/15 border-cyan-400/60 text-cyan-300 font-bold'
                            : 'bg-zinc-900/70 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <span>H.264</span>
                        {hardwareCaps?.webcodecs.hwH264 && isHwContainer && (
                          <span className="text-[9px] text-emerald-400">GPU</span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateConfig({ videoCodec: 'libx265' })}
                        className={`py-1.5 px-2.5 rounded-lg border text-left transition-colors cursor-pointer flex items-center justify-between ${
                          config.videoCodec === 'libx265'
                            ? 'bg-purple-500/15 border-purple-400/60 text-purple-300 font-bold'
                            : 'bg-zinc-900/70 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <span>H.265 / HEVC</span>
                        {hardwareCaps?.webcodecs.hwHEVC && isHwContainer && (
                          <span className="text-[9px] text-emerald-400">GPU</span>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Hardware Accelerator Control */}
              <div className="p-3 rounded-lg bg-zinc-900/70 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                {canUseHardwareGpu && isHwContainer ? (
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isHardwareActive}
                      onChange={(e) =>
                        updateConfig({
                          hardwareAcceleration: e.target.checked,
                          hardwareEngine: e.target.checked ? 'webgpu' : 'cpu',
                        })
                      }
                      className="rounded bg-zinc-800 border-zinc-700 text-cyan-500 focus:ring-0 w-3.5 h-3.5 mt-0.5 cursor-pointer"
                    />
                    <div>
                      <div className="text-xs text-zinc-100 font-semibold flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Hardware GPU Accelerator</span>
                      </div>
                      <div className="text-[10px] text-zinc-400 mt-0.5">
                        {isHardwareActive
                          ? `Active on ${acceleratorLabel}`
                          : 'Disabled — using CPU software encoder'}
                      </div>
                    </div>
                  </label>
                ) : (
                  <div className="flex items-start gap-2.5">
                    <Cpu className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs text-zinc-200 font-semibold">
                        {!isHwContainer
                          ? 'CPU Encoder for .' + config.container.toUpperCase()
                          : 'CPU Software Encoder'}
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">
                        {!isHwContainer && canUseHardwareGpu
                          ? 'Hardware GPU acceleration is available for MP4 and MOV.'
                          : 'Hardware WebCodecs encoder not available in this browser.'}
                      </div>
                    </div>
                  </div>
                )}

                {!isHwContainer && canUseHardwareGpu && (
                  <button
                    type="button"
                    onClick={() => handleSelectVideoContainer('mp4')}
                    className="px-2.5 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 text-[11px] font-bold shrink-0 cursor-pointer transition-colors"
                  >
                    Use MP4 (GPU)
                  </button>
                )}

                {sizeEstimate && isHwContainer && (
                  <div className="text-[10px] text-zinc-400 sm:text-right shrink-0">
                    <div>
                      Video target:{' '}
                      <span className="text-zinc-200 font-semibold">
                        {(sizeEstimate.targetVideoBps / 1_000_000).toFixed(2)} Mbps
                      </span>
                    </div>
                    {source?.size ? (
                      <div>
                        {formatBytes(source.size)} → {formatBytes(sizeEstimate.estimatedBytes)}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Remux & Subtitle Options */}
          {isVideoMode && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px] font-mono">
              {isHwContainer && (
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
                      hardwareAcceleration: canUseHardwareGpu,
                      hardwareEngine: canUseHardwareGpu ? 'webgpu' : 'cpu',
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
                  Remux
                </button>
                <button
                  type="button"
                  onClick={() => applyCompressionPreset('balanced', 'libx264')}
                  className={`px-2 py-1 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                    config.videoCodec === 'libx264'
                      ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Compress H.264
                </button>
                <button
                  type="button"
                  onClick={() => applyCompressionPreset('balanced', 'libx265')}
                  className={`px-2 py-1 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                    config.videoCodec === 'libx265'
                      ? 'bg-purple-500/10 border-purple-500/40 text-purple-300'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Compress HEVC
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
                          updateConfig({
                            container: fmt,
                            videoCodec: 'libvpx-vp9',
                            audioCodec: 'libopus',
                            hardwareAcceleration: false,
                            hardwareEngine: 'cpu',
                          });
                        } else if (fmt === 'gif') {
                          updateConfig({
                            container: fmt,
                            videoCodec: 'gif',
                            audioCodec: 'none',
                            hardwareEngine: 'cpu',
                          });
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
                        else if (fmt === 'wav') {
                          updateConfig({ container: fmt, audioCodec: 'pcm_s16le', audioBitrate: 'lossless' });
                        } else if (fmt === 'flac') {
                          updateConfig({ container: fmt, audioCodec: 'flac', audioBitrate: 'lossless' });
                        } else if (fmt === 'ogg') {
                          updateConfig({ container: fmt, audioCodec: 'libopus' });
                        } else {
                          updateConfig({ container: fmt });
                        }
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
            {isVideoMode && (
              <div className="cyber-panel rounded-xl p-4 font-mono text-xs space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-850 pb-2">
                  <div className="flex items-center gap-2 font-semibold text-sm text-zinc-200">
                    <Film className="w-4 h-4 text-emerald-400" />
                    <span>Video</span>
                  </div>
                  {sizeEstimate && isCompressMode && (
                    <span className="text-[11px] text-cyan-300">
                      Est. {formatBytes(sizeEstimate.estimatedBytes)}
                    </span>
                  )}
                </div>

                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1.5">Codec</label>
                  <select
                    value={config.videoCodec}
                    onChange={(e) => {
                      const next = e.target.value as VideoCodec;
                      if (next === 'copy') {
                        updateConfig({
                          videoCodec: 'copy',
                          compressionPreset: undefined,
                          hardwareEngine: 'stream-copy',
                        });
                      } else {
                        const allowHw = canUseHardwareGpu && isHwContainer;
                        updateConfig({
                          videoCodec: next,
                          compressionPreset: config.compressionPreset || 'balanced',
                          hardwareAcceleration: allowHw,
                          hardwareEngine: allowHw ? 'webgpu' : 'cpu',
                        });
                      }
                    }}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-emerald-500/80"
                  >
                    <option value="copy">Copy (Remux — no re-encode)</option>
                    <option value="libx264">H.264 (AVC / Hardware GPU)</option>
                    <option value="libx265">H.265 / HEVC (Smaller file)</option>
                    <option value="libvpx-vp9">VP9 (WebM)</option>
                  </select>
                </div>

                {config.videoCodec !== 'copy' && (
                  <>
                    {canUseHardwareGpu && isHwContainer && (
                      <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-zinc-950/70 border border-cyan-500/30 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isHardwareActive}
                          onChange={(e) =>
                            updateConfig({
                              hardwareAcceleration: e.target.checked,
                              hardwareEngine: e.target.checked ? 'webgpu' : 'cpu',
                            })
                          }
                          className="rounded bg-zinc-800 border-zinc-700 text-cyan-500 focus:ring-0 w-3.5 h-3.5 mt-0.5 cursor-pointer"
                        />
                        <div>
                          <div className="text-[11px] text-cyan-300 font-semibold flex items-center gap-1.5">
                            <Zap className="w-3 h-3" />
                            <span>Hardware GPU Accelerator</span>
                          </div>
                          <div className="text-[10px] text-zinc-400 mt-0.5">{acceleratorLabel}</div>
                        </div>
                      </label>
                    )}

                    <div className="space-y-2 bg-zinc-950/60 border border-zinc-800/60 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-zinc-400">Rate Control</span>
                        <div className="flex items-center gap-1 bg-zinc-900 rounded p-0.5 border border-zinc-800">
                          <button
                            type="button"
                            onClick={() =>
                              updateConfig({
                                rateControl: 'crf',
                                compressionPreset:
                                  config.compressionPreset === 'target-size'
                                    ? 'balanced'
                                    : config.compressionPreset,
                              })
                            }
                            className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                              config.rateControl === 'crf' && config.compressionPreset !== 'target-size'
                                ? 'bg-zinc-800 text-emerald-400'
                                : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                          >
                            CRF
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateConfig({
                                rateControl: 'bitrate',
                                compressionPreset:
                                  config.compressionPreset === 'target-size'
                                    ? 'balanced'
                                    : config.compressionPreset,
                              })
                            }
                            className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                              config.rateControl === 'bitrate' && config.compressionPreset !== 'target-size'
                                ? 'bg-zinc-800 text-emerald-400'
                                : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                          >
                            Bitrate
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateConfig({
                                compressionPreset: 'target-size',
                                targetSizeMB: config.targetSizeMB || suggestedTargetMB,
                                rateControl: 'bitrate',
                              })
                            }
                            className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                              config.compressionPreset === 'target-size'
                                ? 'bg-zinc-800 text-cyan-400'
                                : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                          >
                            Target MB
                          </button>
                        </div>
                      </div>

                      {config.compressionPreset === 'target-size' ? (
                        <div>
                          <label className="text-[10px] text-zinc-400 block mb-1">Target File Size (MB)</label>
                          <input
                            type="number"
                            min={1}
                            max={4000}
                            value={config.targetSizeMB || suggestedTargetMB}
                            onChange={(e) =>
                              updateConfig({
                                compressionPreset: 'target-size',
                                targetSizeMB: Math.max(1, parseInt(e.target.value, 10) || 1),
                                rateControl: 'bitrate',
                              })
                            }
                            className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-cyan-300 font-bold"
                          />
                        </div>
                      ) : config.rateControl === 'crf' ? (
                        <div>
                          <div className="flex justify-between items-center text-xs mt-2 mb-1.5">
                            <span className="text-zinc-300">
                              CRF: <strong className="text-emerald-400">{config.crf}</strong>
                            </span>
                            <span className="text-[10px] text-zinc-500">Higher = smaller file</span>
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
                              placeholder="2500k"
                              className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-200"
                            />
                            <button
                              type="button"
                              onClick={() => updateConfig({ videoBitrate: '1500k' })}
                              className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 rounded border border-zinc-800 text-[10px] cursor-pointer"
                            >
                              1.5M
                            </button>
                            <button
                              type="button"
                              onClick={() => updateConfig({ videoBitrate: '3000k' })}
                              className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 rounded border border-zinc-800 text-[10px] cursor-pointer"
                            >
                              3M
                            </button>
                            <button
                              type="button"
                              onClick={() => updateConfig({ videoBitrate: '6000k' })}
                              className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 rounded border border-zinc-800 text-[10px] cursor-pointer"
                            >
                              6M
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
                      <label className="text-[11px] text-zinc-400 block mb-1.5">CPU Speed Preset</label>
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
            <div
              className={`cyber-panel rounded-xl p-4 font-mono text-xs space-y-4 ${
                config.targetCategory === 'audio' ? 'lg:col-span-2' : ''
              }`}
            >
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
