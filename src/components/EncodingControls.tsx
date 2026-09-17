import React from 'react';
import { 
  Sliders, 
  Film, 
  Volume2, 
  Zap, 
  AlertTriangle, 
  CheckCircle2, 
  Sparkles,
  Layers,
  Settings,
  HelpCircle
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
import { checkCompatibility } from '../utils/ffmpegBuilder';

interface EncodingControlsProps {
  config: EncodingConfig;
  onChange: (newConfig: EncodingConfig) => void;
  source: SourceMetadata | null;
  disabled?: boolean;
}

export const EncodingControls: React.FC<EncodingControlsProps> = ({
  config,
  onChange,
  source,
  disabled = false,
}) => {
  const updateConfig = (patch: Partial<EncodingConfig>) => {
    onChange({ ...config, ...patch });
  };

  const compatibility = checkCompatibility(source, config);

  // Quick Preset Handlers
  const applyPreset = (presetName: string) => {
    if (presetName === 'remux') {
      updateConfig({
        targetCategory: 'video',
        container: 'mp4',
        videoCodec: 'copy',
        audioCodec: 'copy',
        resolution: 'source',
        framerate: 'source',
      });
    } else if (presetName === 'web-h264') {
      updateConfig({
        targetCategory: 'video',
        container: 'mp4',
        videoCodec: 'libx264',
        rateControl: 'crf',
        crf: 23,
        resolution: '1920x1080',
        framerate: 'source',
        speedPreset: 'veryfast',
        audioCodec: 'aac',
        audioBitrate: '192k',
        audioChannels: 'stereo',
      });
    } else if (presetName === 'hevc') {
      updateConfig({
        targetCategory: 'video',
        container: 'mp4',
        videoCodec: 'libx265',
        rateControl: 'crf',
        crf: 26,
        resolution: 'source',
        speedPreset: 'fast',
        audioCodec: 'aac',
        audioBitrate: '192k',
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
              <span>VIDEO CONVERSION</span>
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
              <span>AUDIO EXTRACTION</span>
            </button>
          </div>

          {/* Quick Preset Selector */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mr-1">
              PRESETS:
            </span>
            <button
              onClick={() => applyPreset('remux')}
              className={`px-2 py-1 rounded text-[11px] font-mono border transition-colors ${
                config.videoCodec === 'copy' && config.audioCodec === 'copy'
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
              title="Instant stream copy without re-encoding (Lossless)"
            >
              ⚡ Fast Remux
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

        {/* Container Target Pills */}
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
                    // Update container & sensible default codecs
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
        {/* Left Column: Video Parameters (Only if Target = Video) */}
        {config.targetCategory === 'video' && config.container !== 'gif' && (
          <div className="bg-[#121215] border border-zinc-800 rounded-xl p-4 font-mono text-xs space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-850 pb-2.5 text-zinc-300">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Film className="w-4 h-4 text-emerald-400" />
                <span>VIDEO ENCODING PIPELINE</span>
              </div>
              {config.videoCodec === 'copy' && (
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                  STREAM PASS-THROUGH (NO RE-ENCODE)
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
                {/* Rate Control: CRF vs Bitrate */}
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
                        <span>16 (Max Quality / Huge)</span>
                        <span>23 (Default)</span>
                        <span>34 (Smallest / Heavy Comp.)</span>
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
                      <option value="24">24 fps (Cinema Standard)</option>
                      <option value="30">30 fps (Web / TV)</option>
                      <option value="60">60 fps (High Motion)</option>
                    </select>
                  </div>
                </div>

                {/* Encoder Preset Speed */}
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
  );
};
