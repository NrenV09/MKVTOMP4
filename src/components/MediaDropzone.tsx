import React, { useRef, useState, DragEvent, ChangeEvent } from 'react';
import { UploadCloud, FolderOpen } from 'lucide-react';

interface MediaDropzoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

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
      aria-label="Select or drop a media file"
      onKeyDown={handleKeyDown}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`cyber-panel rounded-2xl p-8 md:p-12 text-center transition-all cursor-pointer select-none group focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
        isDragging
          ? 'border-cyan-400 bg-cyan-500/10 shadow-[0_0_35px_rgba(0,240,255,0.25)]'
          : 'hover:border-cyan-400/60'
      } ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
    >
      <input
        ref={inputRef}
        type="file"
        aria-label="Choose media file"
        onChange={handleInputChange}
        className="hidden"
      />

      <div className="flex flex-col items-center justify-center max-w-lg mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-[#070b16] border border-cyan-500/35 flex items-center justify-center text-cyan-300 group-hover:border-cyan-400 group-hover:scale-105 transition-all mb-4">
          <UploadCloud className="w-7 h-7" aria-hidden="true" />
        </div>

        <h2 className="text-lg font-mono font-bold text-zinc-100 mb-1.5">
          Drop a video or audio file
        </h2>
        <p className="text-xs font-mono text-zinc-400 mb-5">
          MKV, MP4, MOV, WebM, AVI, TS, MP3, WAV, FLAC, M4A, Opus
        </p>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) inputRef.current?.click();
          }}
          className="cyber-btn-primary px-6 py-2.5 rounded-xl font-mono text-xs flex items-center gap-2 cursor-pointer"
        >
          <FolderOpen className="w-4 h-4" aria-hidden="true" />
          <span>Choose File</span>
        </button>
      </div>
    </div>
  );
};
