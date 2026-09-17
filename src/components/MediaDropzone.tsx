import React, { useRef, useState, DragEvent, ChangeEvent } from 'react';
import { UploadCloud, FileVideo, Music, Disc, Sparkles } from 'lucide-react';

interface MediaDropzoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

const SUPPORTED_EXTS = [
  'MKV', 'MP4', 'MOV', 'WEBM', 'AVI', 'FLV', 'TS',
  'MP3', 'WAV', 'AAC', 'FLAC', 'OGG', 'M4A'
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
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`relative border-2 border-dashed rounded-xl p-8 md:p-12 text-center transition-all cursor-pointer select-none group ${
        isDragging
          ? 'border-emerald-500 bg-emerald-500/5'
          : 'border-zinc-800 hover:border-zinc-700 bg-zinc-950/60 hover:bg-zinc-900/30'
      } ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
    >
      <input
        ref={inputRef}
        type="file"
        onChange={handleInputChange}
        accept=".mkv,.mp4,.mov,.webm,.avi,.flv,.ts,.mp3,.wav,.aac,.flac,.ogg,.m4a,video/*,audio/*"
        className="hidden"
      />

      <div className="flex flex-col items-center justify-center max-w-md mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-emerald-400 group-hover:border-emerald-500/30 transition-all mb-4 shadow-inner">
          <UploadCloud className="w-7 h-7" />
        </div>

        <h3 className="text-sm md:text-base font-medium text-zinc-200 mb-1 tracking-tight">
          Drop video or audio file to import
        </h3>
        <p className="text-xs text-zinc-500 mb-6 max-w-sm">
          Processed 100% locally in-browser via WebAssembly. High-speed remuxing and professional transcoding.
        </p>

        {/* Format Pills */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-md">
          {SUPPORTED_EXTS.map((ext) => (
            <span
              key={ext}
              className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-zinc-900/90 text-zinc-400 border border-zinc-800/80 group-hover:border-zinc-700"
            >
              .{ext}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
