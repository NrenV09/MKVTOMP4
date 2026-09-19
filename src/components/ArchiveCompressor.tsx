import React, { useState, useRef } from 'react';
import {
  Archive,
  Upload,
  Plus,
  Trash2,
  Download,
  CheckCircle2,
  AlertCircle,
  File,
  FileText,
  Image,
  Video,
  Music,
  Sliders,
  Sparkles,
  RefreshCw,
  Clock,
  HardDrive,
  ShieldCheck,
} from 'lucide-react';
import {
  StagedFile,
  CompressionFormat,
  CompressionLevel,
  CompressionResult,
  compressFiles,
  formatBytes,
  getPreviewType,
} from '../utils/archiveEngine';

export const ArchiveCompressor: React.FC = () => {
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [format, setFormat] = useState<CompressionFormat>('zip');
  const [level, setLevel] = useState<CompressionLevel>(6);
  const [archiveName, setArchiveName] = useState<string>('');
  const [isCompressing, setIsCompressing] = useState(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const [result, setResult] = useState<CompressionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilesAdded = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setResult(null);

    const newFiles: StagedFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      newFiles.push({
        id: `staged-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        file: f,
        name: f.name,
        size: f.size,
        type: f.type,
        lastModified: f.lastModified,
      });
    }

    setStagedFiles((prev) => [...prev, ...newFiles]);
  };

  const handleRemoveStaged = (id: string) => {
    setStagedFiles((prev) => prev.filter((item) => item.id !== id));
    setResult(null);
  };

  const handleClearAll = () => {
    setStagedFiles([]);
    setResult(null);
    setError(null);
    setArchiveName('');
  };

  const totalOriginalBytes = stagedFiles.reduce((acc, f) => acc + f.size, 0);

  const handleStartCompression = async () => {
    if (stagedFiles.length === 0) return;
    setError(null);
    setIsCompressing(true);
    setProgressPercent(0);
    setProgressStatus('Initializing compression worker...');

    try {
      const res = await compressFiles(
        stagedFiles,
        format,
        level,
        archiveName,
        (percent, status) => {
          setProgressPercent(percent);
          setProgressStatus(status);
        }
      );
      setResult(res);
    } catch (err: any) {
      console.error('Compression failed:', err);
      setError(err?.message || 'Compression operation failed.');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleDownloadResult = () => {
    if (!result) return;
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.outputName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const getFormatBadge = (fmt: CompressionFormat) => {
    switch (fmt) {
      case 'zip':
        return { label: 'ZIP', desc: 'Universal compatibility across Windows, Mac, Linux, Mobile', ext: '.zip' };
      case '7z':
        return { label: '7Z', desc: '7-Zip LZMA2 ultra-high compression & solid archiving', ext: '.7z' };
      case 'tar.gz':
        return { label: 'TAR.GZ', desc: 'High compression UNIX tarball with gzip', ext: '.tar.gz' };
      case 'tar':
        return { label: 'TAR', desc: 'Uncompressed POSIX archive (fastest packing)', ext: '.tar' };
      case 'gz':
        return { label: 'GZIP', desc: 'Gzip compressed archive stream', ext: '.gz' };
    }
  };

  const getFileIcon = (filename: string) => {
    const type = getPreviewType(filename);
    switch (type) {
      case 'image':
        return <Image className="w-4 h-4 text-sky-400" />;
      case 'video':
        return <Video className="w-4 h-4 text-emerald-400" />;
      case 'audio':
        return <Music className="w-4 h-4 text-purple-400" />;
      case 'text':
        return <FileText className="w-4 h-4 text-amber-400" />;
      default:
        return <File className="w-4 h-4 text-zinc-400" />;
    }
  };

  return (
    <div className="space-y-5">
      {/* Privacy Guarantee Note */}
      <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-950/30 border border-emerald-800/40 text-xs text-emerald-300">
        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
        <span>
          <strong>Zero Server Uploads:</strong> File compression runs 100% locally in your browser memory using high-performance WebAssembly/Web Workers.
        </span>
      </div>

      {/* Dropzone & Staging Area */}
      {stagedFiles.length === 0 ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            handleFilesAdded(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`relative group rounded-2xl border-2 border-dashed p-8 md:p-12 text-center transition-all cursor-pointer ${
            isDragOver
              ? 'border-emerald-500 bg-emerald-950/20 shadow-lg shadow-emerald-500/10'
              : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/40 hover:bg-zinc-900/70'
          }`}
          role="button"
          tabIndex={0}
          aria-label="Upload files for compression"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFilesAdded(e.target.files)}
          />

          <div className="w-16 h-16 mx-auto rounded-2xl bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform shadow-md">
            <Archive className="w-8 h-8" />
          </div>

          <h3 className="mt-4 text-base font-semibold text-zinc-100">
            Choose or drop files to compress
          </h3>
          <p className="mt-1 text-xs text-zinc-400 max-w-md mx-auto">
            Select one or multiple files of any type. Pack into <strong className="text-zinc-200">.7Z</strong> (7-Zip LZMA2), <strong className="text-zinc-200">.ZIP</strong>, <strong className="text-zinc-200">.TAR.GZ</strong>, <strong className="text-zinc-200">.TAR</strong>, or <strong className="text-zinc-200">.GZ</strong> archives.
          </p>

          <div className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs transition-colors shadow-md">
            <Upload className="w-3.5 h-3.5" />
            <span>Select Files</span>
          </div>
        </div>
      ) : (
        /* Staged Files Overview & Controls */
        <div className="space-y-4">
          <div className="rounded-2xl bg-[#121215] border border-zinc-800 p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <Archive className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">
                    Staged Files for Compression ({stagedFiles.length})
                  </h3>
                  <p className="text-xs text-zinc-400 font-mono">
                    Total uncompressed payload: <strong className="text-emerald-400">{formatBytes(totalOriginalBytes)}</strong>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFilesAdded(e.target.files)}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isCompressing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition-colors disabled:opacity-50"
                  title="Add more files to archive"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Files</span>
                </button>
                <button
                  onClick={handleClearAll}
                  disabled={isCompressing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-red-300 text-xs font-medium border border-zinc-800 transition-colors disabled:opacity-50"
                  title="Clear all staged files"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              </div>
            </div>

            {/* Staged File List (Scrollable) */}
            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
              {stagedFiles.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-zinc-900/70 border border-zinc-800/80 text-xs hover:bg-zinc-900 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="shrink-0">{getFileIcon(item.name)}</div>
                    <span className="font-medium text-zinc-200 truncate">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-zinc-400 text-[11px]">
                      {formatBytes(item.size)}
                    </span>
                    <button
                      onClick={() => handleRemoveStaged(item.id)}
                      disabled={isCompressing}
                      className="p-1 text-zinc-500 hover:text-red-400 rounded transition-colors disabled:opacity-40"
                      aria-label={`Remove ${item.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Compression Options */}
            <div className="pt-3 border-t border-zinc-800/80 grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Format */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Archive Format
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {(['7z', 'zip', 'tar.gz', 'tar', 'gz'] as CompressionFormat[]).map((fmt) => {
                    const badge = getFormatBadge(fmt);
                    const active = format === fmt;
                    return (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => setFormat(fmt)}
                        disabled={isCompressing}
                        className={`px-3 py-2 rounded-xl text-left border text-xs transition-all ${
                          active
                            ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300 font-semibold'
                            : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                        }`}
                      >
                        <div className="font-mono text-xs">{badge.label}</div>
                        <div className="text-[10px] text-zinc-500 truncate">{badge.ext}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 text-[11px] text-zinc-500 flex items-center gap-1">
                  <span>💡 RAR extraction is supported in the Decompressor tab.</span>
                </div>
              </div>

              {/* Compression Level */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Compression Level
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { lvl: 0 as CompressionLevel, label: 'Store (0)', tip: 'Instant / No compression' },
                    { lvl: 1 as CompressionLevel, label: 'Fast (1)', tip: 'Low CPU / Fast' },
                    { lvl: 4 as CompressionLevel, label: 'Balanced (4)', tip: 'Balanced' },
                    { lvl: 6 as CompressionLevel, label: 'Standard (6)', tip: 'Recommended default' },
                    { lvl: 9 as CompressionLevel, label: 'Max (9)', tip: 'Highest compression ratio' },
                  ].map((opt) => {
                    const active = level === opt.lvl;
                    return (
                      <button
                        key={opt.lvl}
                        type="button"
                        onClick={() => setLevel(opt.lvl)}
                        disabled={isCompressing}
                        title={opt.tip}
                        className={`px-2 py-2 rounded-xl text-center border text-xs transition-all ${
                          active
                            ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300 font-semibold'
                            : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                        }`}
                      >
                        <div className="truncate">{opt.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Archive Output Name */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Output Archive Name
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={archiveName}
                    onChange={(e) => setArchiveName(e.target.value)}
                    placeholder={`e.g. bundle${getFormatBadge(format).ext}`}
                    disabled={isCompressing}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Leave blank to auto-name using timestamp.
                </p>
              </div>
            </div>

            {/* Compress Action Trigger */}
            <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between">
              <span className="text-xs text-zinc-400">
                Ready to pack {stagedFiles.length} {stagedFiles.length === 1 ? 'file' : 'files'} into {getFormatBadge(format).label}
              </span>
              <button
                onClick={handleStartCompression}
                disabled={isCompressing || stagedFiles.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles className="w-4 h-4" />
                <span>Compress {stagedFiles.length} {stagedFiles.length === 1 ? 'File' : 'Files'}</span>
              </button>
            </div>
          </div>

          {/* Progress Bar when compressing */}
          {isCompressing && (
            <div className="p-5 rounded-2xl bg-[#121215] border border-emerald-500/40 shadow-xl space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-emerald-400 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{progressStatus}</span>
                </span>
                <span className="font-mono text-zinc-300 font-bold">{progressPercent}%</span>
              </div>
              <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-200"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="p-4 rounded-xl bg-red-950/40 border border-red-800 text-red-200 text-xs flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-400 text-sm">Compression Error</p>
                <p className="mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Result Card */}
          {result && !isCompressing && (
            <div className="p-5 sm:p-6 rounded-2xl bg-emerald-950/20 border border-emerald-500/40 shadow-xl space-y-4 animate-in fade-in">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                      <span>{result.outputName}</span>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono uppercase font-bold">
                        {result.format}
                      </span>
                    </h4>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Successfully compressed {result.fileCount} {result.fileCount === 1 ? 'file' : 'files'} in {(result.elapsedMs / 1000).toFixed(2)}s
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    onClick={handleDownloadResult}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Archive</span>
                  </button>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800/80">
                  <div className="text-[11px] text-zinc-400">Original Payload</div>
                  <div className="text-sm font-semibold font-mono text-zinc-200 mt-0.5">
                    {formatBytes(result.originalSize)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800/80">
                  <div className="text-[11px] text-zinc-400">Compressed Archive</div>
                  <div className="text-sm font-semibold font-mono text-emerald-400 mt-0.5">
                    {formatBytes(result.compressedSize)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800/80">
                  <div className="text-[11px] text-zinc-400">Space Saved</div>
                  <div className="text-sm font-semibold font-mono text-emerald-300 mt-0.5">
                    {result.ratio > 0 ? `${result.ratio}%` : '0%'}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800/80">
                  <div className="text-[11px] text-zinc-400">Time Elapsed</div>
                  <div className="text-sm font-semibold font-mono text-zinc-200 mt-0.5">
                    {(result.elapsedMs / 1000).toFixed(2)}s
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
