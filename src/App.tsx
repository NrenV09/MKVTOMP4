import { useState, useRef, useEffect, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { 
  Play, 
  Settings2, 
  RotateCcw, 
  AlertCircle, 
  Zap, 
  Sliders, 
  Loader2,
  HardDrive,
  FileVideo,
  CheckCircle2
} from 'lucide-react';

import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';
import workerURL from '@ffmpeg/ffmpeg/worker?worker&url';

import { 
  SourceMetadata, 
  EncodingConfig, 
  ProgressTelemetry, 
  LogMessage, 
  ConversionResult 
} from './types';
import { 
  buildFFmpegArgs, 
  getRecommendedExtension, 
  getMimeType, 
  formatDuration,
  checkCompatibility
} from './utils/ffmpegBuilder';
import { parseFFmpegProbeLogs, probeMediaElement, AUDIO_EXTENSIONS, getFileExtension } from './utils/probe';

import { Header } from './components/Header';
import { MediaDropzone } from './components/MediaDropzone';
import { SourceInspector } from './components/SourceInspector';
import { EncodingControls } from './components/EncodingControls';
import { CommandPreview } from './components/CommandPreview';
import { ProgressEngine } from './components/ProgressEngine';
import { ResultPanel } from './components/ResultPanel';
import { TerminalDock } from './components/TerminalDock';

const DEFAULT_CONFIG: EncodingConfig = {
  targetCategory: 'video',
  container: 'mp4',
  videoCodec: 'libx264',
  rateControl: 'crf',
  crf: 23,
  videoBitrate: '4000k',
  resolution: 'source',
  framerate: 'source',
  speedPreset: 'veryfast',
  audioCodec: 'aac',
  audioBitrate: '192k',
  audioChannels: 'source',
  audioSampleRate: 'source',
};

export default function App() {
  const [engineReady, setEngineReady] = useState(false);
  const [engineLoading, setEngineLoading] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);

  const [rawFile, setRawFile] = useState<File | null>(null);
  const [sourceMeta, setSourceMeta] = useState<SourceMetadata | null>(null);
  const [isProbing, setIsProbing] = useState(false);

  const [config, setConfig] = useState<EncodingConfig>(DEFAULT_CONFIG);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionError, setConversionError] = useState<string | null>(null);

  const [telemetry, setTelemetry] = useState<ProgressTelemetry>({
    percent: 0,
    currentTime: 0,
    duration: 0,
    fps: 0,
    speed: '',
    elapsedMs: 0,
    etaSeconds: null,
  });

  const [result, setResult] = useState<ConversionResult | null>(null);
  const [isPurged, setIsPurged] = useState(false);

  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);

  const ffmpegRef = useRef<FFmpeg | null>(null);
  const startTimeRef = useRef<number>(0);
  const probeLogsBuffer = useRef<string[]>([]);
  const activeVirtualFiles = useRef<{ inName?: string; outName?: string }>({});
  const activeOutputUrlRef = useRef<string | null>(null);
  const wakeLockSentinelRef = useRef<any>(null);

  const addLog = useCallback((type: 'stdout' | 'stderr' | 'system' | 'error', text: string) => {
    const time = new Date().toTimeString().split(' ')[0] + '.' + String(new Date().getMilliseconds()).padStart(3, '0');
    setLogs((prev) => [
      ...prev.slice(-400), // Keep last 400 entries to maintain high performance
      {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: time,
        type,
        text,
      },
    ]);
  }, []);

  // Safely revoke object URLs to prevent browser/WebKit disk cache & System Data growth
  const revokeActiveUrl = useCallback(() => {
    if (activeOutputUrlRef.current) {
      try {
        URL.revokeObjectURL(activeOutputUrlRef.current);
      } catch {}
      activeOutputUrlRef.current = null;
    }
  }, []);

  const purgeAllCaches = useCallback(async () => {
    // 1. Revoke active object URL
    revokeActiveUrl();

    // 2. Unload hardware decoders on any active video/audio elements in DOM
    if (typeof document !== 'undefined') {
      document.querySelectorAll('video, audio').forEach((el) => {
        try {
          (el as HTMLMediaElement).pause();
          el.removeAttribute('src');
          (el as HTMLMediaElement).load();
        } catch {}
      });
    }

    // 3. Unlink any lingering files in MEMFS
    if (ffmpegRef.current) {
      try {
        const active = activeVirtualFiles.current;
        if (active.inName) await ffmpegRef.current.deleteFile(active.inName).catch(() => {});
        if (active.outName) await ffmpegRef.current.deleteFile(active.outName).catch(() => {});
        activeVirtualFiles.current = {};
      } catch {}
    }

    // 4. Purge browser CacheStorage if present
    if (typeof window !== 'undefined' && 'caches' in window) {
      try {
        const keys = await window.caches.keys();
        for (const key of keys) {
          await window.caches.delete(key);
        }
      } catch {}
    }

    setIsPurged(true);
    addLog('system', 'Purged media cache and released memory buffers.');
  }, [addLog, revokeActiveUrl]);

  // Initialize FFmpeg WebAssembly core
  const initEngine = async () => {
    if (ffmpegRef.current && ffmpegRef.current.loaded) {
      setEngineReady(true);
      return;
    }

    setEngineLoading(true);
    setEngineError(null);
    addLog('system', 'Bootstrapping FFmpeg WebAssembly Core v0.12...');

    try {
      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;

      ffmpeg.on('log', ({ type, message }) => {
        addLog(type || 'stderr', message);

        // Feed into probe log buffer during file inspection
        if (probeLogsBuffer.current) {
          probeLogsBuffer.current.push(message);
        }

        // Live speed / frame parsing from ffmpeg stderr
        if (message.includes('frame=') && message.includes('fps=')) {
          const fpsMatch = message.match(/fps=\s*([\d.]+)/);
          const speedMatch = message.match(/speed=\s*([\d.x]+)/);
          const timeMatch = message.match(/time=\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);

          if (fpsMatch || speedMatch || timeMatch) {
            setTelemetry((prev) => {
              let curTime = prev.currentTime;
              if (timeMatch) {
                const h = parseFloat(timeMatch[1]);
                const m = parseFloat(timeMatch[2]);
                const s = parseFloat(timeMatch[3]);
                curTime = h * 3600 + m * 60 + s;
              }

              return {
                ...prev,
                fps: fpsMatch ? Math.round(parseFloat(fpsMatch[1])) : prev.fps,
                speed: speedMatch ? speedMatch[1] : prev.speed,
                currentTime: curTime,
              };
            });
          }
        }
      });

      ffmpeg.on('progress', ({ progress, time }) => {
        const rawPercent = progress > 1 ? progress : progress * 100;
        const now = Date.now();
        const elapsed = now - startTimeRef.current;

        setTelemetry((prev) => {
          const newPercent = Math.min(99.9, Math.max(prev.percent, rawPercent));
          let eta: number | null = null;
          if (newPercent > 2 && elapsed > 1000) {
            const totalEst = (elapsed / (newPercent / 100));
            eta = Math.max(0, Math.round((totalEst - elapsed) / 1000));
          }

          return {
            ...prev,
            percent: newPercent,
            elapsedMs: elapsed,
            etaSeconds: eta,
            currentTime: time ? time / 1000000 : prev.currentTime,
          };
        });
      });

      await ffmpeg.load({
        coreURL,
        wasmURL,
        classWorkerURL: workerURL,
      });

      setEngineReady(true);
      addLog('system', 'FFmpeg WebAssembly Core successfully mounted. MEMFS ready.');
    } catch (err: any) {
      console.error('FFmpeg load error:', err);
      const msg = err?.message || 'Failed to initialize WebAssembly engine.';
      setEngineError(msg);
      addLog('error', `Engine init failure: ${msg}`);
    } finally {
      setEngineLoading(false);
    }
  };

  useEffect(() => {
    initEngine();
    return () => {
      revokeActiveUrl();
    };
  }, [revokeActiveUrl]);

  // Inspect source media file
  const handleFileSelected = async (file: File) => {
    revokeActiveUrl();
    setIsPurged(false);
    setRawFile(file);
    setResult(null);
    setConversionError(null);
    setIsProbing(true);

    const ext = getFileExtension(file.name);
    const isAudioOnly = AUDIO_EXTENSIONS.includes(ext) || (file.type ? file.type.startsWith('audio/') : false);

    addLog('system', `Loaded source file: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

    // 1. Initial fast HTML5 probe
    const htmlMeta = await probeMediaElement(file);

    let initialMeta: SourceMetadata = {
      name: file.name,
      size: file.size,
      type: file.type || 'media/unknown',
      extension: ext || (isAudioOnly ? '.mp3' : ''),
      duration: htmlMeta.duration,
      width: htmlMeta.width,
      height: htmlMeta.height,
      hasVideo: isAudioOnly ? false : (htmlMeta.hasVideo ?? true),
      hasAudio: htmlMeta.hasAudio ?? true,
    };

    setSourceMeta(initialMeta);

    // Adapt default configuration intelligently
    if (isAudioOnly) {
      setConfig((prev) => ({
        ...prev,
        targetCategory: 'audio',
        container: 'mp3',
        audioCodec: 'libmp3lame',
      }));
    } else if (ext === '.mkv') {
      // Default MKV to MP4 with Remux (Stream Copy) or H.264
      setConfig((prev) => ({
        ...prev,
        targetCategory: 'video',
        container: 'mp4',
        videoCodec: 'copy',
        audioCodec: 'copy',
      }));
    } else {
      // For any other file format (WMV, AVI, FLV, M2TS, VOB, TS, WEBM, MOV, etc.) from Files
      // default to universal H.264 / AAC MP4 for guaranteed compatibility
      setConfig((prev) => ({
        ...prev,
        targetCategory: 'video',
        container: 'mp4',
        videoCodec: 'libx264',
        audioCodec: 'aac',
      }));
    }

    // 2. Comprehensive stream inspection via FFmpeg
    if (ffmpegRef.current && ffmpegRef.current.loaded) {
      try {
        probeLogsBuffer.current = [];
        const tempName = `probe_${Date.now()}${ext || ''}`;
        addLog('system', `Probing stream headers for ${file.name}...`);

        // Write small chunk or full file for header parsing
        await ffmpegRef.current.writeFile(tempName, await fetchFile(file));
        // Calling ffmpeg -i tempName will dump stream layout to logs and return 1
        await ffmpegRef.current.exec(['-i', tempName]);

        const parsed = parseFFmpegProbeLogs(probeLogsBuffer.current);

        setSourceMeta((prev) => {
          if (!prev) return null;
          const hasV = parsed.hasVideo ?? prev.hasVideo;
          const hasA = parsed.hasAudio ?? prev.hasAudio;
          return {
            ...prev,
            duration: parsed.duration || prev.duration,
            width: parsed.width || prev.width,
            height: parsed.height || prev.height,
            fps: parsed.fps || prev.fps,
            videoCodec: parsed.videoCodec,
            audioCodec: parsed.audioCodec,
            audioSampleRate: parsed.audioSampleRate,
            audioChannels: parsed.audioChannels,
            bitrate: parsed.bitrate,
            parsedStreams: parsed.parsedStreams,
            hasVideo: hasV,
            hasAudio: hasA,
          };
        });

        // If deep probe determined it has no video and only audio, adjust to audio
        if (!parsed.hasVideo && parsed.hasAudio) {
          setConfig((prev) => ({
            ...prev,
            targetCategory: 'audio',
            container: prev.targetCategory === 'audio' ? prev.container : 'mp3',
            audioCodec: prev.targetCategory === 'audio' ? prev.audioCodec : 'libmp3lame',
          }));
          addLog('system', 'Detected audio-only stream layout. Configured target for audio export.');
        } else if (parsed.hasVideo) {
          // If video was found, check if copy mode is safe for MP4
          const srcVid = (parsed.videoCodec || '').toLowerCase();
          const isCopySafe = ['h264', 'avc1', 'hevc', 'h265'].some((c) => srcVid.includes(c));
          if (!isCopySafe && config.videoCodec === 'copy') {
            setConfig((prev) => ({
              ...prev,
              videoCodec: 'libx264',
            }));
            addLog('system', `Source video codec (${srcVid || 'unknown'}) requires transcoding. Switched encoder to H.264.`);
          }
        }

        // Clean up temporary probe file from virtual MEMFS
        try {
          await ffmpegRef.current.deleteFile(tempName);
        } catch {
          // ignore cleanup err
        }

        addLog('system', 'Stream layout inspection complete.');
      } catch (err) {
        // Handled silently since probe logs contain what we need
      }
    }

    setIsProbing(false);
  };

  const handleClearFile = () => {
    revokeActiveUrl();
    setIsPurged(false);
    setRawFile(null);
    setSourceMeta(null);
    setResult(null);
    setConversionError(null);
    setTelemetry({
      percent: 0,
      currentTime: 0,
      duration: 0,
      fps: 0,
      speed: '',
      elapsedMs: 0,
      etaSeconds: null,
    });
  };

  // Convert execution
  const handleStartConversion = async () => {
    if (!rawFile || !sourceMeta || !ffmpegRef.current) return;

    // Safety validation
    const compat = checkCompatibility(sourceMeta, config);
    if (!compat.isCompatible && compat.warning?.includes('does not contain an audio track')) {
      setConversionError(compat.warning);
      return;
    }

    revokeActiveUrl();
    setIsPurged(false);
    setIsConverting(true);
    setConversionError(null);
    setResult(null);

    // Acquire Screen Wake Lock so display/thread does not sleep during active encode
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        const lock = await (navigator as any).wakeLock.request('screen');
        wakeLockSentinelRef.current = lock;
        setWakeLockActive(true);
        addLog('system', 'Acquired Screen Wake Lock.');
      } catch (wakeErr) {
        console.warn('Wake Lock request skipped:', wakeErr);
      }
    }

    startTimeRef.current = Date.now();
    setTelemetry({
      percent: 0,
      currentTime: 0,
      duration: sourceMeta.duration || 0,
      fps: 0,
      speed: '',
      elapsedMs: 0,
      etaSeconds: null,
    });

    const extIn = sourceMeta.extension || '';
    const extOut = getRecommendedExtension(config.container);
    const virtualIn = `input_${Date.now()}${extIn}`;
    const virtualOut = `output_${Date.now()}${extOut}`;
    activeVirtualFiles.current = { inName: virtualIn, outName: virtualOut };

    addLog('system', `Mounting ${rawFile.name} to MEMFS as ${virtualIn}...`);

    try {
      const ffmpeg = ffmpegRef.current;

      // 1. Write file into WebAssembly MEMFS
      await ffmpeg.writeFile(virtualIn, await fetchFile(rawFile));

      // 2. Build parameter vector
      const args = buildFFmpegArgs(virtualIn, virtualOut, config, sourceMeta);
      addLog('system', `Executing: ffmpeg ${args.join(' ')}`);

      // 3. Execute FFmpeg command
      const returnCode = await ffmpeg.exec(args);

      if (returnCode !== 0) {
        throw new Error(
          `FFmpeg conversion returned exit code ${returnCode}. ` +
          (config.videoCodec === 'copy' || config.audioCodec === 'copy'
            ? 'Stream copy failed because source codecs are incompatible with target container. Try switching to re-encode (H.264/AAC).'
            : 'Check console telemetry for detailed codec diagnostics.')
        );
      }

      // Unlink input file immediately to free virtual memory before loading output
      try {
        await ffmpeg.deleteFile(virtualIn);
        addLog('system', `Unlinked virtual input buffer ${virtualIn}.`);
      } catch {
        // ignore
      }

      // 5. Read generated output from virtual filesystem
      addLog('system', `Reading output file ${virtualOut} from MEMFS...`);
      const outputData = await ffmpeg.readFile(virtualOut);
      const mimeType = getMimeType(config.container);
      const blob = new Blob([(outputData as Uint8Array).buffer], { type: mimeType });
      const outputUrl = URL.createObjectURL(blob);
      activeOutputUrlRef.current = outputUrl;
      setIsPurged(false);

      const baseName = sourceMeta.name.replace(/\.[^/.]+$/, '');
      const finalOutputName = `${baseName}_converted${extOut}`;
      const elapsed = Date.now() - startTimeRef.current;

      setResult({
        outputUrl,
        blob,
        outputName: finalOutputName,
        outputSize: blob.size,
        durationSeconds: sourceMeta.duration,
        container: config.container,
        elapsedMs: elapsed,
        command: args,
      });

      addLog('system', `Conversion finished successfully in ${(elapsed / 1000).toFixed(1)}s.`);

      // 6. Cleanup output file from MEMFS
      try {
        await ffmpeg.deleteFile(virtualOut);
        addLog('system', `MEMFS garbage collection: Unlinked ${virtualOut}.`);
      } catch (cleanupErr) {
        console.warn('Cleanup non-fatal warning:', cleanupErr);
      }
    } catch (err: any) {
      console.error('Conversion failed:', err);
      const errorMsg = err?.message || 'Media conversion failed.';
      setConversionError(errorMsg);
      addLog('error', `Execution failed: ${errorMsg}`);
    } finally {
      // Release Screen Wake Lock
      if (wakeLockSentinelRef.current) {
        try {
          await wakeLockSentinelRef.current.release();
        } catch {
          // ignore
        }
        wakeLockSentinelRef.current = null;
        setWakeLockActive(false);
      }
      setIsConverting(false);
    }
  };

  // Abort ongoing job
  const handleAbort = async () => {
    addLog('error', 'User aborted conversion process. Terminating WebAssembly worker...');
    if (wakeLockSentinelRef.current) {
      try {
        await wakeLockSentinelRef.current.release();
      } catch {
        // ignore
      }
      wakeLockSentinelRef.current = null;
      setWakeLockActive(false);
    }
    if (ffmpegRef.current) {
      try {
        ffmpegRef.current.terminate();
      } catch {
        // ignore
      }
    }
    setIsConverting(false);
    setConversionError('Conversion process was terminated by user.');
    setEngineReady(false);
    // Reboot engine
    initEngine();
  };

  // Generate current command preview args
  const currentCommandArgs = buildFFmpegArgs(
    sourceMeta ? `input${sourceMeta.extension || ''}` : 'input.media',
    `output${getRecommendedExtension(config.container)}`,
    config,
    sourceMeta
  );

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col font-sans selection:bg-emerald-500/20 selection:text-emerald-300">
      {/* Workstation Header */}
      <Header
        engineReady={engineReady}
        engineLoading={engineLoading}
        terminalOpen={terminalOpen}
        toggleTerminal={() => setTerminalOpen(!terminalOpen)}
        logCount={logs.length}
        wakeLockActive={wakeLockActive}
        onPurgeCache={purgeAllCaches}
      />

      {/* Main Workstation Canvas */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 lg:p-6 space-y-4">
        {/* Engine Alert (if loading error) */}
        {engineError && (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/80 text-red-200 text-xs font-mono flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-red-400 text-sm">Media Engine Failed to Initialize</div>
              <p className="mt-1 text-red-300/90">{engineError}</p>
              <button
                onClick={initEngine}
                className="mt-2.5 px-3 py-1 rounded bg-red-900 hover:bg-red-800 text-red-100 border border-red-700 transition-colors"
              >
                Retry Initialization
              </button>
            </div>
          </div>
        )}

        {/* Global Conversion Error */}
        {conversionError && (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/80 text-red-200 text-xs font-mono flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-red-400 text-sm">Conversion Pipeline Error</div>
              <p className="mt-1 text-red-300/90">{conversionError}</p>
              <div className="mt-2 text-[11px] text-zinc-400">
                Tip: If you used "Stream Copy", the source video/audio codecs may not fit into the chosen container. Select "H.264 / AAC" under encoding controls to re-encode.
              </div>
            </div>
          </div>
        )}

        {/* 1. SOURCE SELECTION / INSPECTOR */}
        {!sourceMeta ? (
          <div className="space-y-3">
            <MediaDropzone
              onFileSelected={handleFileSelected}
              disabled={!engineReady || engineLoading}
            />

            {!engineReady && !engineError && (
              <div className="flex items-center justify-center gap-2 text-xs font-mono text-zinc-500 py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                <span>Mounting WebAssembly engine in background...</span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <SourceInspector
              source={sourceMeta}
              isProbing={isProbing}
              onClear={handleClearFile}
              disabled={isConverting}
            />

            {/* 2. RESULT PANEL (If completed) */}
            {result ? (
              <ResultPanel
                result={result}
                source={sourceMeta}
                onReset={handleClearFile}
                onAdjustSettings={() => {
                  revokeActiveUrl();
                  setIsPurged(false);
                  setResult(null);
                }}
                onPurgeCache={purgeAllCaches}
                isPurged={isPurged}
              />
            ) : isConverting ? (
              /* 3. ACTIVE CONVERSION PROGRESS ENGINE */
              <ProgressEngine
                telemetry={telemetry}
                onCancel={handleAbort}
                outputName={sourceMeta.name.replace(/\.[^/.]+$/, '') + getRecommendedExtension(config.container)}
              />
            ) : (
              /* 4. ENCODING CONTROLS & COMMAND PREVIEW */
              <div className="space-y-4">
                <EncodingControls
                  config={config}
                  onChange={setConfig}
                  source={sourceMeta}
                  disabled={isConverting}
                />

                {/* Primary Action Button & Summary */}
                <div className="bg-[#121215] border border-zinc-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                      <Zap className="w-5 h-5 fill-current" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                        <span>Ready to convert to</span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-xs uppercase font-bold">
                          .{config.container}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-400 font-mono mt-0.5">
                        {config.videoCodec === 'copy' && config.audioCodec === 'copy'
                          ? '⚡ Instant Stream Pass-Through (Lossless, 0% quality loss)'
                          : `${config.videoCodec} • ${config.audioCodec} • Local WebAssembly`}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleStartConversion}
                    disabled={!engineReady || isConverting}
                    className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-zinc-950 font-sans font-bold text-sm tracking-wide transition-all shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <Zap className="w-4 h-4 fill-current" />
                    <span>
                      {config.videoCodec === 'copy' && config.audioCodec === 'copy'
                        ? `CONVERT TO .${config.container.toUpperCase()} (FAST REMUX)`
                        : `CONVERT TO .${config.container.toUpperCase()} NOW`}
                    </span>
                  </button>
                </div>

                <CommandPreview commandArgs={currentCommandArgs} />
              </div>
            )}
          </div>
        )}
      </main>

      {/* Terminal Telemetry Dock */}
      <TerminalDock
        logs={logs}
        isOpen={terminalOpen}
        onClose={() => setTerminalOpen(false)}
        onClear={() => setLogs([])}
      />
    </div>
  );
}
