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
  compact?: boolean;
}

export const EncodingControls: React.FC<EncodingControlsProps> = ({
  config,
  onChange,
  source,
  disabled = false,
  hardwareCaps,
  compact = false,
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
      hardwareCaps?.webcodecs.hwAV1 ||
      hardwareCaps?.webcodecs.available
  );
  const canUseAv1WebCodecs = Boolean(
    hardwareCaps?.webcodecs.av1Available ||
      hardwareCaps?.webcodecs.hwAV1 ||
      hardwareCaps?.webcodecs.swAV1 ||
      hardwareCaps?.webcodecs.available
  );

  const isVideoMode = config.targetCategory === 'video' && config.container !== 'gif';
  const isRemuxMode = isVideoMode && config.videoCodec === 'copy';
  const isReencodeMode = isVideoMode && config.videoCodec !== 'copy';
  const isCompressorOn = isReencodeMode && config.compressEnabled === true;
  const isAv1Selected = config.videoCodec === 'av01';
  const isSourceAv1 = Boolean(
    source?.videoCodec &&
      (source.videoCodec.toLowerCase().includes('av1') ||
        source.videoCodec.toLowerCase().includes('av01'))
  );
  const isHwContainer = config.container === 'mp4' || config.container === 'mov';
  const isAv1Container =
    config.container === 'mp4' ||
    config.container === 'mov' ||
    config.container === 'mkv' ||
    config.container === 'webm';
  const isHardwareActive =
    isReencodeMode &&
    ((isAv1Selected && isAv1Container && canUseAv1WebCodecs) ||
      (!isAv1Selected && isHwContainer && canUseHardwareGpu)) &&
    config.hardwareAcceleration !== false &&
    config.hardwareEngine !== 'cpu';

  const activeCodecLabel =
    config.videoCodec === 'copy'
      ? 'Copy'
      : config.videoCodec === 'libx264'
      ? 'H.264'
      : config.videoCodec === 'libx265'
      ? 'HEVC'
      : config.videoCodec === 'av01'
      ? 'AV1'
      : config.videoCodec === 'libvpx-vp9'
      ? 'VP9'
      : config.videoCodec.toUpperCase();

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

  const applyCodecSelection = (nextCodec: VideoCodec, keepCompression?: boolean) => {
    const currentContainer: VideoContainer =
      config.targetCategory === 'video' && config.container !== 'gif'
        ? (config.container as VideoContainer)
        : 'mp4';

    if (nextCodec === 'copy') {
      const targetContainer: VideoContainer =
        currentContainer === 'webm' && !isSourceAv1 ? 'mp4' : currentContainer;
      const srcAudio = (source?.audioCodec || '').toLowerCase();
      const isSafeAudio =
        targetContainer === 'mkv' ||
        (targetContainer === 'webm'
          ? ['opus', 'vorbis'].some((a) => srcAudio.includes(a))
          : ['aac', 'alac', 'mp3', 'ac3', 'eac3'].some((a) => srcAudio.includes(a)));
      updateConfig({
        targetCategory: 'video',
        container: targetContainer,
        videoCodec: 'copy',
        audioCodec: isSafeAudio || !srcAudio ? 'copy' : targetContainer === 'webm' ? 'libopus' : 'aac',
        compressEnabled: false,
        compressionPreset: undefined,
        resolution: 'source',
        framerate: 'source',
        fastStart: targetContainer === 'mp4' || targetContainer === 'mov',
        hardwareEngine: 'stream-copy',
      });
      return;
    }

    let targetContainer: VideoContainer = currentContainer;
    if (nextCodec === 'av01' && targetContainer === 'avi') {
      targetContainer = 'mp4';
    } else if (nextCodec === 'libvpx-vp9' && targetContainer !== 'webm' && targetContainer !== 'mkv') {
      targetContainer = 'webm';
    } else if ((nextCodec === 'libx264' || nextCodec === 'libx265') && targetContainer === 'webm') {
      targetContainer = 'mp4';
    }

    const compressOn = keepCompression !== undefined ? keepCompression : isCompressorOn;
    const hwSupportedForTarget =
      nextCodec === 'av01'
        ? ['mp4', 'mov', 'mkv', 'webm'].includes(targetContainer) && canUseAv1WebCodecs
        : (targetContainer === 'mp4' || targetContainer === 'mov') && canUseHardwareGpu;
    const enableHw =
      nextCodec === 'av01'
        ? hwSupportedForTarget
        : hwSupportedForTarget && config.hardwareEngine !== 'cpu';

    const defaultAudio: AudioCodec =
      config.audioCodec === 'none'
        ? 'none'
        : targetContainer === 'webm'
        ? 'libopus'
        : config.audioCodec === 'copy'
        ? 'aac'
        : config.audioCodec;

    updateConfig({
      targetCategory: 'video',
      container: targetContainer,
      videoCodec: nextCodec,
      compressEnabled: compressOn,
      compressionPreset: compressOn ? config.compressionPreset || 'balanced' : undefined,
      rateControl: compressOn && config.compressionPreset === 'target-size' ? 'bitrate' : 'crf',
      crf: compressOn ? config.crf || 24 : 19,
      resolution: compressOn ? config.resolution : 'source',
      framerate: 'source',
      speedPreset: compressOn ? 'ultrafast' : 'veryfast',
      audioCodec: defaultAudio,
      audioBitrate: compressOn ? config.audioBitrate || '128k' : '192k',
      fastStart: targetContainer === 'mp4' || targetContainer === 'mov',
      hardwareAcceleration: enableHw,
      hardwareEngine: enableHw ? 'webgpu' : 'cpu',
    });
  };

  const applyCompressionPreset = (
    preset: CompressionPreset,
    overrideCodec?: VideoCodec
  ) => {
    const rawContainer: VideoContainer =
      config.targetCategory === 'video' && config.container !== 'gif'
        ? (config.container as VideoContainer)
        : 'mp4';
    const targetContainer: VideoContainer =
      overrideCodec === 'av01' && rawContainer === 'avi' ? 'mp4' : rawContainer;

    const nextCodec: VideoCodec =
      overrideCodec ||
      (config.videoCodec !== 'copy' && config.videoCodec !== 'gif'
        ? config.videoCodec
        : targetContainer === 'webm'
        ? canUseAv1WebCodecs
          ? 'av01'
          : 'libvpx-vp9'
        : 'libx264');

    const hwSupportedForTarget =
      nextCodec === 'av01'
        ? ['mp4', 'mov', 'mkv', 'webm'].includes(targetContainer) && canUseAv1WebCodecs
        : (targetContainer === 'mp4' || targetContainer === 'mov') && canUseHardwareGpu;
    const enableHw =
      nextCodec === 'av01'
        ? hwSupportedForTarget
        : hwSupportedForTarget && config.hardwareEngine !== 'cpu';

    if (preset === 'light') {
      updateConfig({
        targetCategory: 'video',
        container: targetContainer,
        videoCodec: nextCodec,
        compressEnabled: true,
        compressionPreset: 'light',
        rateControl: 'crf',
        crf: 20,
        resolution: 'source',
        framerate: 'source',
        speedPreset: 'veryfast',
        audioCodec: targetContainer === 'webm' ? 'libopus' : 'aac',
        audioBitrate: '192k',
        fastStart: targetContainer === 'mp4' || targetContainer === 'mov',
        hardwareAcceleration: enableHw,
        hardwareEngine: enableHw ? 'webgpu' : 'cpu',
      });
    } else if (preset === 'balanced') {
      updateConfig({
        targetCategory: 'video',
        container: targetContainer,
        videoCodec: nextCodec,
        compressEnabled: true,
        compressionPreset: 'balanced',
        rateControl: 'crf',
        crf: 24,
        resolution: 'source',
        framerate: 'source',
        speedPreset: 'ultrafast',
        audioCodec: targetContainer === 'webm' ? 'libopus' : 'aac',
        audioBitrate: '128k',
        fastStart: targetContainer === 'mp4' || targetContainer === 'mov',
        hardwareAcceleration: enableHw,
        hardwareEngine: enableHw ? 'webgpu' : 'cpu',
      });
    } else if (preset === 'strong') {
      const cap720p = Boolean((source?.height && source.height > 720) || (source?.width && source.width > 1280));
      updateConfig({
        targetCategory: 'video',
        container: targetContainer,
        videoCodec: nextCodec,
        compressEnabled: true,
        compressionPreset: 'strong',
        rateControl: 'crf',
        crf: 28,
        resolution: cap720p ? '1280x720' : 'source',
        framerate: 'source',
        speedPreset: 'ultrafast',
        audioCodec: targetContainer === 'webm' ? 'libopus' : 'aac',
        audioBitrate: '96k',
        fastStart: targetContainer === 'mp4' || targetContainer === 'mov',
        hardwareAcceleration: enableHw,
        hardwareEngine: enableHw ? 'webgpu' : 'cpu',
      });
    } else if (preset === 'target-size') {
      updateConfig({
        targetCategory: 'video',
        container: targetContainer,
        videoCodec: nextCodec,
        compressEnabled: true,
        compressionPreset: 'target-size',
        targetSizeMB: config.targetSizeMB || suggestedTargetMB,
        rateControl: 'bitrate',
        resolution: config.resolution,
        framerate: 'source',
        speedPreset: 'ultrafast',
        audioCodec: targetContainer === 'webm' ? 'libopus' : 'aac',
        audioBitrate: '128k',
        fastStart: targetContainer === 'mp4' || targetContainer === 'mov',
        hardwareAcceleration: enableHw,
        hardwareEngine: enableHw ? 'webgpu' : 'cpu',
      });
    }
  };

  const toggleCompressor = (enable: boolean) => {
    if (enable) {
      applyCompressionPreset(config.compressionPreset || 'balanced');
    } else {
      if (config.videoCodec === 'copy') {
        updateConfig({ compressEnabled: false, compressionPreset: undefined });
      } else {
        updateConfig({
          compressEnabled: false,
          compressionPreset: undefined,
          rateControl: 'crf',
          crf: 19,
          resolution: 'source',
          audioBitrate: '192k',
        });
      }
    }
  };

  const applyPreset = (presetName: string) => {
    if (presetName === 'remux') {
      applyCodecSelection('copy', false);
    } else if (presetName === 'compress') {
      const nextCodec: VideoCodec =
        config.videoCodec === 'libx265' || config.videoCodec === 'av01'
          ? config.videoCodec
          : 'libx264';
      applyCompressionPreset(config.compressionPreset || 'balanced', nextCodec);
    } else if (presetName === 'web-h264') {
      applyCodecSelection('libx264', isCompressorOn);
    } else if (presetName === 'hevc') {
      applyCodecSelection('libx265', isCompressorOn);
    } else if (presetName === 'av01') {
      applyCodecSelection('av01', isCompressorOn);
    } else if (presetName === 'webm-vp9') {
      const keepAv1 = config.videoCodec === 'av01' && canUseAv1WebCodecs;
      const keepCopy = config.videoCodec === 'copy' && isSourceAv1;
      updateConfig({
        targetCategory: 'video',
        container: 'webm',
        videoCodec: keepCopy ? 'copy' : keepAv1 ? 'av01' : 'libvpx-vp9',
        compressEnabled: keepCopy ? false : isCompressorOn,
        compressionPreset: isCompressorOn && !keepCopy ? config.compressionPreset || 'balanced' : undefined,
        rateControl: 'crf',
        crf: isCompressorOn ? (keepAv1 ? 26 : 30) : 20,
        resolution: isCompressorOn ? config.resolution : 'source',
        audioCodec: keepCopy ? 'copy' : 'libopus',
        audioBitrate: isCompressorOn ? '128k' : '192k',
        hardwareAcceleration: keepAv1,
        hardwareEngine: keepCopy ? 'stream-copy' : keepAv1 ? 'webgpu' : 'cpu',
      });
    } else if (presetName === 'gif') {
      updateConfig({
        targetCategory: 'video',
        container: 'gif',
        videoCodec: 'gif',
        compressEnabled: false,
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
        compressEnabled: false,
      });
    } else if (presetName === 'audio-lossless') {
      updateConfig({
        targetCategory: 'audio',
        container: 'wav',
        audioCodec: 'pcm_s16le',
        audioBitrate: 'lossless',
        audioChannels: 'stereo',
        compressEnabled: false,
      });
    }
  };

  const handleSelectVideoContainer = (container: 'mp4' | 'mov' | 'mkv' | 'avi') => {
    const srcVid = (source?.videoCodec || '').toLowerCase();
    const canCopy =
      container === 'mkv' ||
      container === 'avi' ||
      ['h264', 'avc1', 'hevc', 'h265', 'mpeg4', 'av1', 'av01', 'prores'].some((c) => srcVid.includes(c));
    const srcAudio = (source?.audioCodec || '').toLowerCase();
    const isSafeAudio =
      container === 'mkv' ||
      ['aac', 'alac', 'mp3', 'ac3', 'eac3'].some((a) => srcAudio.includes(a));

    if (isReencodeMode) {
      const nextCodec: VideoCodec =
        config.videoCodec === 'av01' && container !== 'avi'
          ? 'av01'
          : config.videoCodec === 'libx265' || config.videoCodec === 'libx264'
          ? config.videoCodec
          : 'libx264';
      const allowHw =
        nextCodec === 'av01'
          ? canUseAv1WebCodecs && container !== 'avi'
          : canUseHardwareGpu && (container === 'mp4' || container === 'mov');
      updateConfig({
        targetCategory: 'video',
        container,
        videoCodec: nextCodec,
        audioCodec: config.audioCodec === 'none' ? 'none' : 'aac',
        fastStart: container === 'mp4' || container === 'mov',
        hardwareAcceleration: allowHw ? config.hardwareAcceleration !== false : false,
        hardwareEngine: allowHw && (nextCodec === 'av01' || config.hardwareEngine !== 'cpu') ? 'webgpu' : 'cpu',
      });
    } else {
      const useCopy = canCopy;
      const allowHw = !useCopy && canUseHardwareGpu && (container === 'mp4' || container === 'mov');
      updateConfig({
        targetCategory: 'video',
        container,
        videoCodec: useCopy ? 'copy' : 'libx264',
        audioCodec: useCopy ? (isSafeAudio || !srcAudio ? 'copy' : 'aac') : 'aac',
        compressEnabled: false,
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
            className={`px-3 py-1 rounded-md text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
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
            className={`px-3 py-1 rounded-md text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
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
          <div className="text-xs font-mono text-zinc-400 tabular-nums flex items-center gap-1.5 flex-wrap">
            <span>
              Output: <strong className="text-cyan-300">.{config.container.toUpperCase()}</strong>
            </span>
            {isVideoMode && (
              <>
                <span aria-hidden="true" className="text-zinc-600">·</span>
                <span className={isRemuxMode ? 'text-emerald-400 font-semibold' : 'text-zinc-200 font-semibold'}>
                  {isRemuxMode ? 'Remux' : activeCodecLabel}
                </span>
                {isCompressorOn && (
                  <>
                    <span aria-hidden="true" className="text-zinc-600">·</span>
                    <span className="text-cyan-300 font-semibold">Compressor On</span>
                  </>
                )}
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => applyPreset('remux')}
            className="px-2.5 py-1 rounded-md bg-zinc-900/90 hover:bg-cyan-950/50 text-zinc-300 hover:text-cyan-300 border border-zinc-800 hover:border-cyan-500/40 text-[11px] font-mono transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Reset
          </button>
        </div>
      </div>

      {/* SIMPLE MODE */}
      {mode === 'simple' && (
        <div className="cyber-panel rounded-xl p-4 sm:p-5 space-y-5">
          {/* Primary Side-by-Side Workspace: Codec Converter + Optional Video Compressor */}
          <div
            className={`grid grid-cols-1 ${
              source?.hasVideo !== false && isVideoMode && !compact ? 'lg:grid-cols-12' : ''
            } gap-5 items-start`}
          >
            {/* LEFT: Codec Converter & Output Format */}
            <div
              className={`${
                source?.hasVideo !== false && isVideoMode && !compact ? 'lg:col-span-7' : ''
              } space-y-4`}
            >
              {source?.hasVideo !== false && isVideoMode && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-mono text-zinc-200 font-semibold">
                      1. Codec Converter
                    </label>
                    <span className="text-[11px] font-mono text-zinc-500">
                      {isRemuxMode
                        ? 'Direct stream copy'
                        : isCompressorOn
                        ? `Re-encoding to ${activeCodecLabel} + compressing`
                        : `High-quality ${activeCodecLabel} conversion`}
                    </span>
                  </div>

                  {config.container === 'webm' ? (
                    <div className="grid grid-cols-3 gap-2 font-mono">
                      <button
                        type="button"
                        onClick={() => applyCodecSelection('copy', false)}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          config.videoCodec === 'copy'
                            ? 'bg-emerald-500/10 border-emerald-500/60 ring-1 ring-emerald-500/30 text-zinc-100'
                            : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold whitespace-nowrap">Copy</span>
                          {config.videoCodec === 'copy' && (
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-1">Remux only</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => applyCodecSelection('av01')}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          config.videoCodec === 'av01'
                            ? 'bg-emerald-500/10 border-emerald-400/60 ring-1 ring-emerald-400/30 text-zinc-100'
                            : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold whitespace-nowrap">AV1</span>
                          {config.videoCodec === 'av01' && (
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-1">
                          {hardwareCaps?.webcodecs.hwAV1 ? 'av01 · GPU' : 'av01 · WebCodecs'}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => applyCodecSelection('libvpx-vp9')}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          config.videoCodec === 'libvpx-vp9'
                            ? 'bg-purple-500/10 border-purple-400/60 ring-1 ring-purple-400/30 text-zinc-100'
                            : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold whitespace-nowrap">VP9</span>
                          {config.videoCodec === 'libvpx-vp9' && (
                            <Check className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-1">WebM standard</div>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">
                      <button
                        type="button"
                        onClick={() => applyCodecSelection('copy', false)}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          config.videoCodec === 'copy'
                            ? 'bg-emerald-500/10 border-emerald-500/60 ring-1 ring-emerald-500/30 text-zinc-100'
                            : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold flex items-center gap-1.5 whitespace-nowrap">
                            <Copy className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Remux</span>
                          </span>
                          {config.videoCodec === 'copy' && (
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-1">Keep codec</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => applyCodecSelection('libx264')}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          config.videoCodec === 'libx264'
                            ? 'bg-cyan-500/10 border-cyan-400/60 ring-1 ring-cyan-400/30 text-zinc-100'
                            : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold whitespace-nowrap">H.264</span>
                          {config.videoCodec === 'libx264' && (
                            <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-1">
                          {hardwareCaps?.webcodecs.hwH264 && isHwContainer
                            ? 'AVC · GPU'
                            : 'Universal AVC'}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => applyCodecSelection('libx265')}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          config.videoCodec === 'libx265'
                            ? 'bg-purple-500/10 border-purple-400/60 ring-1 ring-purple-400/30 text-zinc-100'
                            : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold whitespace-nowrap">HEVC</span>
                          {config.videoCodec === 'libx265' && (
                            <Check className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-1">
                          {hardwareCaps?.webcodecs.hwHEVC && isHwContainer
                            ? 'H.265 · GPU'
                            : 'H.265 efficient'}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => applyCodecSelection('av01')}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          config.videoCodec === 'av01'
                            ? 'bg-emerald-500/10 border-emerald-400/60 ring-1 ring-emerald-400/30 text-zinc-100'
                            : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold whitespace-nowrap">AV1</span>
                          {config.videoCodec === 'av01' && (
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-1">
                          {hardwareCaps?.webcodecs.hwAV1 ? 'av01 · GPU' : 'av01 · Modern'}
                        </div>
                      </button>
                    </div>
                  )}

                  {isSourceAv1 && config.videoCodec !== 'libx264' && (
                    <div className="px-3 py-2.5 rounded-lg bg-zinc-950/80 border border-cyan-500/30 flex flex-wrap items-center justify-between gap-2 font-mono">
                      <div className="text-[11px] text-zinc-300">
                        <span className="text-cyan-300 font-semibold">AV1 (av01) source detected</span>
                        <span className="text-zinc-500 ml-1.5">· Decode for universal playback</span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          updateConfig({
                            targetCategory: 'video',
                            container: 'mp4',
                            videoCodec: 'libx264',
                            compressEnabled: isCompressorOn,
                            compressionPreset: isCompressorOn ? config.compressionPreset || 'balanced' : undefined,
                            rateControl: 'crf',
                            crf: isCompressorOn ? config.crf || 23 : 19,
                            resolution: isCompressorOn ? config.resolution : 'source',
                            framerate: 'source',
                            audioCodec: 'aac',
                            audioBitrate: '192k',
                            fastStart: true,
                            hardwareAcceleration: canUseHardwareGpu,
                            hardwareEngine: canUseHardwareGpu ? 'webgpu' : 'cpu',
                          })
                        }
                        className="px-2.5 py-1 rounded-md bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-cyan-200 text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        AV1 → H.264 MP4
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Output Format */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-mono text-zinc-200 font-semibold">
                    {source?.hasVideo !== false && isVideoMode ? '2. Output Format' : '1. Output Format'}
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAllFormats(!showAllFormats)}
                    className="text-[11px] font-mono text-zinc-400 hover:text-emerald-400 transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span>{showAllFormats ? 'Less formats' : 'More formats'}</span>
                    {showAllFormats ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {/* MP4 */}
                  <button
                    type="button"
                    onClick={() => handleSelectVideoContainer('mp4')}
                    className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                      config.targetCategory === 'video' && config.container === 'mp4'
                        ? 'bg-emerald-500/10 border-emerald-500/60 ring-1 ring-emerald-500/30 text-zinc-100'
                        : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-0.5">
                      <span className="font-mono font-bold text-xs text-emerald-400">MP4</span>
                      <Film className="w-3 h-3 text-zinc-500" />
                    </div>
                    <div className="text-[10px] text-zinc-500 truncate">Standard</div>
                  </button>

                  {/* MOV */}
                  <button
                    type="button"
                    onClick={() => handleSelectVideoContainer('mov')}
                    className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                      config.targetCategory === 'video' && config.container === 'mov'
                        ? 'bg-emerald-500/10 border-emerald-500/60 ring-1 ring-emerald-500/30 text-zinc-100'
                        : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-0.5">
                      <span className="font-mono font-bold text-xs text-amber-400">MOV</span>
                      <Film className="w-3 h-3 text-amber-400/70" />
                    </div>
                    <div className="text-[10px] text-zinc-500 truncate">QuickTime</div>
                  </button>

                  {/* WebM */}
                  <button
                    type="button"
                    onClick={() => applyPreset('webm-vp9')}
                    className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                      config.targetCategory === 'video' && config.container === 'webm'
                        ? 'bg-emerald-500/10 border-emerald-500/60 ring-1 ring-emerald-500/30 text-zinc-100'
                        : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-0.5">
                      <span className="font-mono font-bold text-xs text-purple-400">WebM</span>
                      <Film className="w-3 h-3 text-zinc-500" />
                    </div>
                    <div className="text-[10px] text-zinc-500 truncate">AV1 / VP9</div>
                  </button>

                  {/* MP3 */}
                  <button
                    type="button"
                    onClick={() => applyPreset('audio-mp3')}
                    className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                      config.targetCategory === 'audio' && config.container === 'mp3'
                        ? 'bg-blue-500/10 border-blue-500/60 ring-1 ring-blue-500/30 text-zinc-100'
                        : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-0.5">
                      <span className="font-mono font-bold text-xs text-blue-400">MP3</span>
                      <Music className="w-3 h-3 text-zinc-500" />
                    </div>
                    <div className="text-[10px] text-zinc-500 truncate">Audio</div>
                  </button>

                  {/* WAV */}
                  <button
                    type="button"
                    onClick={() => applyPreset('audio-lossless')}
                    className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                      config.targetCategory === 'audio' && config.container === 'wav'
                        ? 'bg-blue-500/10 border-blue-500/60 ring-1 ring-blue-500/30 text-zinc-100'
                        : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-0.5">
                      <span className="font-mono font-bold text-xs text-cyan-400">WAV</span>
                      <Volume2 className="w-3 h-3 text-zinc-500" />
                    </div>
                    <div className="text-[10px] text-zinc-500 truncate">Lossless</div>
                  </button>

                  {/* GIF */}
                  <button
                    type="button"
                    onClick={() => applyPreset('gif')}
                    className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                      config.targetCategory === 'video' && config.container === 'gif'
                        ? 'bg-amber-500/10 border-amber-500/60 ring-1 ring-amber-500/30 text-zinc-100'
                        : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-0.5">
                      <span className="font-mono font-bold text-xs text-amber-400">GIF</span>
                      <Sparkles className="w-3 h-3 text-zinc-500" />
                    </div>
                    <div className="text-[10px] text-zinc-500 truncate">Animated</div>
                  </button>
                </div>

                {showAllFormats && (
                  <div className="mt-2.5 p-2.5 bg-zinc-950/80 border border-zinc-800 rounded-xl flex flex-wrap gap-1.5">
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
                              compressEnabled: false,
                            });
                          } else if (fmt === 'ogg') {
                            updateConfig({
                              targetCategory: 'audio',
                              container: fmt,
                              audioCodec: 'libopus',
                              compressEnabled: false,
                            });
                          } else {
                            updateConfig({
                              targetCategory: 'audio',
                              container: fmt,
                              audioCodec: 'aac',
                              compressEnabled: false,
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

              {/* Hardware Accelerator Row (visible whenever re-encoding) */}
              {isReencodeMode && (
                <div className="p-3 rounded-lg bg-zinc-900/70 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 font-mono">
                  {isAv1Selected && isAv1Container ? (
                    canUseAv1WebCodecs ? (
                      <label className="flex items-start gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={config.hardwareAcceleration !== false}
                          onChange={(e) =>
                            updateConfig({
                              hardwareAcceleration: e.target.checked,
                              hardwareEngine: 'webgpu',
                            })
                          }
                          className="rounded bg-zinc-800 border-zinc-700 text-emerald-500 focus:ring-0 w-3.5 h-3.5 mt-0.5 cursor-pointer"
                        />
                        <div>
                          <div className="text-xs text-zinc-100 font-semibold flex items-center gap-1.5">
                            <Zap className="w-3.5 h-3.5 text-emerald-400" />
                            <span>
                              {hardwareCaps?.webcodecs.hwAV1
                                ? 'Hardware GPU AV1 (av01)'
                                : 'WebCodecs AV1 (av01) Encoder'}
                            </span>
                          </div>
                          <div className="text-[10px] text-zinc-400 mt-0.5">
                            {hardwareCaps?.webcodecs.hwAV1 && config.hardwareAcceleration !== false
                              ? `Active on ${acceleratorLabel}`
                              : 'Encoding av01 via browser WebCodecs engine'}
                          </div>
                        </div>
                      </label>
                    ) : (
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-xs text-amber-300 font-semibold">
                            AV1 (av01) Encoding Unavailable
                          </div>
                          <div className="text-[10px] text-zinc-400 mt-0.5">
                            This browser does not expose WebCodecs AV1 encoding. Switch to H.264/HEVC or Remux.
                          </div>
                        </div>
                      </div>
                    )
                  ) : canUseHardwareGpu && isHwContainer ? (
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
                            ? `CPU Encoder for .${config.container.toUpperCase()}`
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

                  {!isHwContainer && !isAv1Selected && canUseHardwareGpu && (
                    <button
                      type="button"
                      onClick={() => handleSelectVideoContainer('mp4')}
                      className="px-2.5 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 text-[11px] font-bold shrink-0 cursor-pointer transition-colors whitespace-nowrap"
                    >
                      Use MP4 (GPU)
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT: Optional Video Compressor alongside Codec Converter */}
            {source?.hasVideo !== false && isVideoMode && (
              <div
                className={`${
                  !compact ? 'lg:col-span-5' : ''
                } rounded-xl border p-4 space-y-4 font-mono transition-colors ${
                  isCompressorOn
                    ? 'bg-zinc-950/75 border-cyan-500/45'
                    : 'bg-zinc-950/50 border-zinc-800/90'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Minimize2
                      className={`w-4 h-4 shrink-0 ${
                        isCompressorOn ? 'text-cyan-400' : 'text-zinc-500'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-zinc-100 truncate">
                        Video Compressor
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        {isCompressorOn ? 'Active alongside converter' : 'Optional size reduction'}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={isCompressorOn}
                    onClick={() => toggleCompressor(!isCompressorOn)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                      isCompressorOn
                        ? 'bg-cyan-500/30 border-cyan-400'
                        : 'bg-zinc-900 border-zinc-700'
                    }`}
                  >
                    <span className="sr-only">Toggle video compressor</span>
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
                        isCompressorOn
                          ? 'translate-x-5.5 bg-cyan-300'
                          : 'translate-x-1 bg-zinc-500'
                      }`}
                    />
                  </button>
                </div>

                {!isCompressorOn ? (
                  <div className="space-y-3 pt-1 border-t border-zinc-800/80">
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      {isRemuxMode
                        ? 'Currently remuxing without re-encoding. Enable the compressor to shrink file size or set an exact MB cap.'
                        : `Converting to ${activeCodecLabel} at full source resolution and high quality. Enable the compressor to shrink file size further.`}
                    </p>
                    <button
                      type="button"
                      onClick={() => toggleCompressor(true)}
                      className="w-full py-2 px-3 rounded-lg bg-zinc-900 hover:bg-cyan-500/15 border border-zinc-700 hover:border-cyan-400/50 text-xs font-semibold text-zinc-200 hover:text-cyan-200 transition-colors cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Minimize2 className="w-3.5 h-3.5 text-cyan-400" />
                      <span>
                        {isRemuxMode ? 'Enable Compressor (H.264)' : `Compress ${activeCodecLabel} Output`}
                      </span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3.5 pt-2 border-t border-zinc-800/80">
                    {/* Strength Grid */}
                    <div>
                      <div className="flex items-center justify-between text-[11px] mb-1.5">
                        <span className="text-zinc-400">Strength</span>
                        {sizeEstimate && (
                          <span className="text-zinc-300 tabular-nums">
                            Est. <strong className="text-cyan-300">{formatBytes(sizeEstimate.estimatedBytes)}</strong>
                            {sizeEstimate.savingsPercent > 0 && (
                              <span className="text-emerald-400 ml-1.5">-{sizeEstimate.savingsPercent}%</span>
                            )}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 text-xs">
                        {(
                          [
                            { id: 'light', label: 'Light', desc: 'High quality' },
                            { id: 'balanced', label: 'Balanced', desc: 'Size & clarity' },
                            { id: 'strong', label: 'Strong', desc: 'Smallest file' },
                            { id: 'target-size', label: 'Target MB', desc: 'Exact cap' },
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
                              className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                                active
                                  ? 'bg-cyan-500/12 border-cyan-400/60 ring-1 ring-cyan-400/25'
                                  : 'bg-zinc-900/70 border-zinc-800 hover:border-zinc-700'
                              }`}
                            >
                              <div className="font-semibold text-zinc-100 flex items-center justify-between">
                                <span>{item.label}</span>
                                {active && <Check className="w-3 h-3 text-cyan-400" />}
                              </div>
                              <div className="text-[10px] text-zinc-500 mt-0.5">{item.desc}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Target Size MB Input */}
                    {config.compressionPreset === 'target-size' && (
                      <div className="p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-[11px] text-zinc-400">Target size</label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={1}
                              max={4000}
                              step={1}
                              value={config.targetSizeMB || suggestedTargetMB}
                              onChange={(e) => {
                                const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                                updateConfig({
                                  compressEnabled: true,
                                  compressionPreset: 'target-size',
                                  targetSizeMB: val,
                                  rateControl: 'bitrate',
                                });
                              }}
                              className="w-20 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs text-cyan-300 font-bold tabular-nums focus:outline-none focus:border-cyan-400"
                            />
                            <span className="text-[11px] text-zinc-400">MB</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {[10, 25, 50, 100].map((mb) => (
                            <button
                              key={mb}
                              type="button"
                              onClick={() =>
                                updateConfig({
                                  compressEnabled: true,
                                  compressionPreset: 'target-size',
                                  targetSizeMB: mb,
                                  rateControl: 'bitrate',
                                })
                              }
                              className={`py-1 rounded border text-[10px] tabular-nums cursor-pointer transition-colors ${
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

                    {/* Resolution Downscale */}
                    <div>
                      <label className="text-[11px] text-zinc-400 block mb-1.5">Resolution</label>
                      <div className="grid grid-cols-4 gap-1.5 text-[11px]">
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
                            className={`py-1.5 px-1.5 rounded-lg border text-center transition-colors cursor-pointer ${
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

                    {/* Live Target Metrics */}
                    {sizeEstimate && (
                      <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-400 tabular-nums">
                        <span>
                          Video {(sizeEstimate.targetVideoBps / 1_000_000).toFixed(2)} Mbps
                        </span>
                        {source?.size ? (
                          <span>
                            {formatBytes(source.size)} → {formatBytes(sizeEstimate.estimatedBytes)}
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

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
                      compressEnabled: isCompressorOn,
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
                      compressEnabled: false,
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
                  onClick={() => applyCodecSelection('libx264')}
                  className={`px-2 py-1 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                    config.videoCodec === 'libx264'
                      ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  H.264
                </button>
                <button
                  type="button"
                  onClick={() => applyCodecSelection('libx265')}
                  className={`px-2 py-1 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                    config.videoCodec === 'libx265'
                      ? 'bg-purple-500/10 border-purple-500/40 text-purple-300'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  HEVC
                </button>
                <button
                  type="button"
                  onClick={() => applyCodecSelection('av01')}
                  className={`px-2 py-1 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                    config.videoCodec === 'av01'
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  AV1 (av01)
                </button>
                <button
                  type="button"
                  onClick={() => toggleCompressor(!isCompressorOn)}
                  className={`px-2 py-1 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                    isCompressorOn
                      ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200 font-semibold'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {isCompressorOn ? 'Compressor: On' : 'Compressor: Off'}
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
                          const keepAv1 = config.videoCodec === 'av01' && canUseAv1WebCodecs;
                          updateConfig({
                            container: fmt,
                            videoCodec: keepAv1 ? 'av01' : 'libvpx-vp9',
                            audioCodec: 'libopus',
                            hardwareAcceleration: keepAv1,
                            hardwareEngine: keepAv1 ? 'webgpu' : 'cpu',
                          });
                        } else if (fmt === 'gif') {
                          updateConfig({
                            container: fmt,
                            videoCodec: 'gif',
                            audioCodec: 'none',
                            compressEnabled: false,
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
                  {sizeEstimate && isReencodeMode && (
                    <span className="text-[11px] text-cyan-300 tabular-nums">
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
                      applyCodecSelection(next);
                    }}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-emerald-500/80"
                  >
                    <option value="copy">Copy (Remux — no re-encode)</option>
                    <option value="libx264">H.264 (AVC / Hardware GPU)</option>
                    <option value="libx265">H.265 / HEVC (Smaller file)</option>
                    <option value="av01">AV1 (av01 — Highest compression)</option>
                    <option value="libvpx-vp9">VP9 (WebM)</option>
                  </select>
                </div>

                {config.videoCodec !== 'copy' && (
                  <>
                    {/* Optional Compressor Switch inside Advanced Video Panel */}
                    <label className="flex items-center justify-between gap-2.5 p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800 cursor-pointer select-none">
                      <div>
                        <div className="text-[11px] text-zinc-100 font-semibold flex items-center gap-1.5">
                          <Minimize2 className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Video Compressor</span>
                        </div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">
                          {isCompressorOn
                            ? 'Applying size reduction & target bitrate cap'
                            : 'Off — preserving high quality during codec conversion'}
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={isCompressorOn}
                        onChange={(e) => toggleCompressor(e.target.checked)}
                        className="rounded bg-zinc-800 border-zinc-700 text-cyan-500 focus:ring-0 w-4 h-4 cursor-pointer"
                      />
                    </label>

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
                                compressEnabled: true,
                                compressionPreset: 'target-size',
                                targetSizeMB: config.targetSizeMB || suggestedTargetMB,
                                rateControl: 'bitrate',
                              })
                            }
                            className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                              isCompressorOn && config.compressionPreset === 'target-size'
                                ? 'bg-zinc-800 text-cyan-400'
                                : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                          >
                            Target MB
                          </button>
                        </div>
                      </div>

                      {isCompressorOn && config.compressionPreset === 'target-size' ? (
                        <div>
                          <label className="text-[10px] text-zinc-400 block mb-1">Target File Size (MB)</label>
                          <input
                            type="number"
                            min={1}
                            max={4000}
                            value={config.targetSizeMB || suggestedTargetMB}
                            onChange={(e) =>
                              updateConfig({
                                compressEnabled: true,
                                compressionPreset: 'target-size',
                                targetSizeMB: Math.max(1, parseInt(e.target.value, 10) || 1),
                                rateControl: 'bitrate',
                              })
                            }
                            className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-cyan-300 font-bold tabular-nums"
                          />
                        </div>
                      ) : config.rateControl === 'crf' ? (
                        <div>
                          <div className="flex justify-between items-center text-xs mt-2 mb-1.5">
                            <span className="text-zinc-300 tabular-nums">
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
                              className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-200 tabular-nums"
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
