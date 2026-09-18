import React, { useRef, useState, DragEvent, ChangeEvent } from 'react';
import { UploadCloud, FileVideo, Music, Sparkles, FolderOpen } from 'lucide-react';

interface MediaDropzoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

const POPULAR_EXTS = [
  'MKV', 'MP4', 'MOV', 'WEBM', 'AVI', 'FLV', 'TS', 'M2TS', 'WMV', 'VOB',
  'MP3', 'WAV', 'AAC', 'FLAC', 'M4A', 'OGG', 'OPUS'
];

export const MediaDropzone: React.FC<MediaDropzoneProps> = ({
  onFileSelected,
  disabled = false,
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
    // Reset value so the user can select the same file again if desired
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
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Select or drop media file for local in-browser conversion"
      onKeyDown={handleKeyDown}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`relative border-2 border-dashed rounded-2xl p-8 md:p-12 text-center transition-all cursor-pointer select-none group focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:border-emerald-500 ${
        isDragging
          ? 'border-emerald-500 bg-emerald-500/5'
          : 'border-zinc-800 hover:border-emerald-500/50 bg-zinc-950/60 hover:bg-zinc-900/30'
      } ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
    >
      {/* File input with NO restrictive accept filter to allow all file types from Files app & device */}
      <input
        ref={inputRef}
        type="file"
        aria-label="Choose media file"
        onChange={handleInputChange}
        className="hidden"
      />

      <div className="flex flex-col items-center justify-center max-w-lg mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300 group-hover:text-emerald-400 group-hover:border-emerald-500/40 group-hover:scale-105 transition-all mb-4 shadow-xl">
          <UploadCloud className="w-8 h-8" aria-hidden="true" />
        </div>

        <h3 className="text-base md:text-lg font-semibold text-zinc-100 mb-1.5 tracking-tight">
          Drop any file here or browse Files
        </h3>
        <p className="text-xs sm:text-sm text-zinc-300 mb-5 max-w-md leading-relaxed">
          Supports all video, audio, and media file formats from iPad/iPhone Files, Android, Mac, or PC.
        </p>

        {/* Big primary choose file button */}
        <button
          type="button"
          aria-label="Browse files on your local device"
          className="px-5 py-2.5 rounded-xl bg-emerald-500 group-hover:bg-emerald-400 text-zinc-950 font-semibold text-xs sm:text-sm flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 mb-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        >
          <FolderOpen className="w-4 h-4" aria-hidden="true" />
          <span>Browse Files on Device</span>
        </button>

        {/* Explicit Form / Upload Consent & Privacy Disclosure */}
        <div className="text-[11px] text-zinc-400 max-w-md bg-zinc-900/80 px-3.5 py-2 rounded-lg border border-zinc-800 mb-4">
          <span className="text-emerald-400 font-semibold">Local Processing Guarantee:</span> Files are processed locally inside your browser’s RAM. No files or personal data are ever uploaded to any cloud server.
        </div>

        {/* Formats info */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-md">
          {POPULAR_EXTS.map((ext) => (
            <span
              key={ext}
              className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-zinc-900/90 text-zinc-300 border border-zinc-800/80 group-hover:border-zinc-700"
            >
              .{ext}
            </span>
          ))}
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
            + ALL FILE TYPES
          </span>
        </div>
      </div>
    </div>
  );
};
