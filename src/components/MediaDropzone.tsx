import React, { useRef, useState, DragEvent, ChangeEvent } from 'react';
import {
  UploadCloud,
  FileVideo,
  Music,
  Sparkles,
  FolderOpen,
  Cpu,
  HardDrive,
  Loader2,
  Subtitles,
} from 'lucide-react';

interface MediaDropzoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
  onGenerateSample?: (kind: 'mkv-multitrack' | 'mp4-stream' | 'wav-audio') => void;
  generatingSample?: string | null;
}

const POPULAR_EXTS = [
  'MKV', 'MP4', 'MOV', 'WEBM', 'AVI', 'TS', 'M2TS', 'MP3', 'WAV', 'FLAC', 'M4A', 'OPUS'
];

export const MediaDropzone: React.FC<MediaDropzoneProps> = ({
  onFileSelected,
  disabled = false,
  onGenerateSample,
  generatingSample = null,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      onFileSelected(file);
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelected(file);
    }
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Select or drop media file for local in-browser conversion"
        onKeyDown={handleKeyDown}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`cyber-panel rounded-2xl p-7 md:p-10 text-center transition-all cursor-pointer select-none group focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
          isDragging
            ? 'border-cyan-400 bg-cyan-500/10 shadow-[0_0_35px_rgba(0,240,255,0.25)]'
            : 'hover:border-cyan-400/60'
        } ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
      >
        {/* Corner Cyber HUD Brackets */}
        <div className="pointer-events-none absolute top-2.5 left-2.5 w-3.5 h-3.5 border-t-2 border-l-2 border-cyan-400/60 rounded-tl-sm" />
        <div className="pointer-events-none absolute top-2.5 right-2.5 w-3.5 h-3.5 border-t-2 border-r-2 border-cyan-400/60 rounded-tr-sm" />
        <div className="pointer-events-none absolute bottom-2.5 left-2.5 w-3.5 h-3.5 border-b-2 border-l-2 border-cyan-400/60 rounded-bl-sm" />
        <div className="pointer-events-none absolute bottom-2.5 right-2.5 w-3.5 h-3.5 border-b-2 border-r-2 border-cyan-400/60 rounded-br-sm" />

        <input
          ref={inputRef}
          type="file"
          aria-label="Choose media file"
          onChange={handleInputChange}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center max-w-2xl mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-[#070b16] border border-cyan-500/35 flex items-center justify-center text-cyan-300 group-hover:text-cyan-200 group-hover:border-cyan-400 group-hover:scale-105 transition-all mb-4 shadow-[0_0_25px_rgba(0,240,255,0.15)]">
            <UploadCloud className="w-8 h-8" aria-hidden="true" />
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-[10px] font-mono font-bold text-cyan-300 uppercase tracking-widest mb-2.5">
            <HardDrive className="w-3 h-3 text-cyan-400" />
            <span>ZERO-COPY WORKERFS + OPFS MULTI-GB ENGINE</span>
          </div>

          <h2 className="text-lg sm:text-xl font-mono font-bold text-zinc-100 mb-1.5 tracking-wide uppercase cyber-glow-text">
            Drop Media Container or Browse Local Storage
          </h2>
          <p className="text-xs font-mono text-zinc-400 mb-5 max-w-lg">
            Supports 2–10+ GB MKV, MP4, MOV, WebM, AVI & Lossless Audio. Instant Stream-Copy Remuxing, Multi-Track Selection & .SRT Subtitle Extraction.
          </p>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!disabled) inputRef.current?.click();
            }}
            aria-label="Browse files on your local device"
            className="cyber-btn-primary px-6 py-3 rounded-xl font-mono text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <FolderOpen className="w-4 h-4" aria-hidden="true" />
            <span>Select Local Media File</span>
          </button>

          {/* Interactive Supported Format Matrix */}
          <div className="mt-6 pt-4 border-t border-cyan-500/15 w-full">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2">
              Click any container format to browse local files:
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {POPULAR_EXTS.map((ext) => (
                <button
                  key={ext}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!disabled) inputRef.current?.click();
                  }}
                  className="px-2 py-1 rounded bg-[#070b14] hover:bg-cyan-500/15 border border-cyan-500/20 hover:border-cyan-400/50 text-[10px] font-mono font-semibold text-zinc-300 hover:text-cyan-300 transition-colors cursor-pointer"
                >
                  .{ext}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Instant Offline Cyber Sample Generators (So users can test every feature with 1 click!) */}
      {onGenerateSample && (
        <div className="cyber-panel rounded-xl p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 font-mono text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="text-zinc-200 font-bold text-xs uppercase tracking-wider">
                Instant Test Stream Synthesizer
              </div>
              <div className="text-[11px] text-zinc-400">
                Generate a real multi-track container offline in-browser to test Stream Inspection, Remuxing & .SRT Export
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              disabled={disabled || Boolean(generatingSample)}
              onClick={() => onGenerateSample('mkv-multitrack')}
              className="px-3 py-2 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/40 text-cyan-300 font-semibold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              title="Synthesize a real MKV video with H.264 video, AAC audio, and embedded SRT subtitles"
            >
              {generatingSample === 'mkv-multitrack' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Subtitles className="w-3.5 h-3.5 text-cyan-400" />
              )}
              <span>Load MKV + SRT Demo</span>
            </button>

            <button
              type="button"
              disabled={disabled || Boolean(generatingSample)}
              onClick={() => onGenerateSample('mp4-stream')}
              className="px-3 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/40 text-emerald-300 font-semibold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              title="Synthesize a real H.264 + AAC MP4 video stream"
            >
              {generatingSample === 'mp4-stream' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileVideo className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span>Load MP4 Stream</span>
            </button>

            <button
              type="button"
              disabled={disabled || Boolean(generatingSample)}
              onClick={() => onGenerateSample('wav-audio')}
              className="px-3 py-2 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 border border-purple-400/40 text-purple-300 font-semibold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              title="Synthesize a real stereo 44.1kHz PCM WAV audio file"
            >
              {generatingSample === 'wav-audio' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Music className="w-3.5 h-3.5 text-purple-400" />
              )}
              <span>Load Synth WAV</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

