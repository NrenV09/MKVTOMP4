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

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`relative border-2 border-dashed rounded-2xl p-8 md:p-12 text-center transition-all cursor-pointer select-none group ${
        isDragging
          ? 'border-emerald-500 bg-emerald-500/5'
          : 'border-zinc-800 hover:border-emerald-500/50 bg-zinc-950/60 hover:bg-zinc-900/30'
      } ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
    >
      {/* File input with NO restrictive accept filter to allow all file types from Files app & device */}
      <input
        ref={inputRef}
        type="file"
        onChange={handleInputChange}
        className="hidden"
      />

      <div className="flex flex-col items-center justify-center max-w-lg mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300 group-hover:text-emerald-400 group-hover:border-emerald-500/40 group-hover:scale-105 transition-all mb-4 shadow-xl">
          <UploadCloud className="w-8 h-8" />
        </div>

        <h3 className="text-base md:text-lg font-semibold text-zinc-100 mb-1.5 tracking-tight">
          Drop any file here or browse Files
        </h3>
        <p className="text-xs sm:text-sm text-zinc-400 mb-5 max-w-md leading-relaxed">
          Supports all video, audio, and media file formats from iPad/iPhone Files, Android, Mac, or PC. Processed 100% locally.
        </p>

        {/* Big primary choose file button */}
        <button
          type="button"
          className="px-5 py-2.5 rounded-xl bg-emerald-500 group-hover:bg-emerald-400 text-zinc-950 font-semibold text-xs sm:text-sm flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 mb-6"
        >
          <FolderOpen className="w-4 h-4" />
          <span>Browse Files on Device</span>
        </button>

        {/* Formats info */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-md">
          {POPULAR_EXTS.map((ext) => (
            <span
              key={ext}
              className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-zinc-900/90 text-zinc-400 border border-zinc-800/80 group-hover:border-zinc-700"
            >
              .{ext}
            </span>
          ))}
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            + ALL FILE TYPES
          </span>
        </div>
      </div>
    </div>
  );
};
