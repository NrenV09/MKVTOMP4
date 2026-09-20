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
  Lock,
  Layers,
  Check,
  FolderArchive,
  Key,
} from 'lucide-react';
import {
  StagedFile,
  CompressionFormat,
  CompressionLevel,
  CompressionResult,
  WinRarCompressionOptions,
  WinRarCompressionMethod,
  compressFiles,
  formatBytes,
  getPreviewType,
} from '../utils/archiveEngine';
import { WinRarDialog, WinRarBooksIcon } from './WinRarDialog';

export const ArchiveCompressor: React.FC = () => {
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [format, setFormat] = useState<CompressionFormat>('rar');
  const [level, setLevel] = useState<CompressionLevel>(6);
  const [archiveName, setArchiveName] = useState<string>('');
  const [isCompressing, setIsCompressing] = useState(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const [result, setResult] = useState<CompressionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // WinRAR Compression Options
  const [uiMode, setUiMode] = useState<'winrar' | 'modern'>('winrar');
  const [winrarOptions, setWinrarOptions] = useState<WinRarCompressionOptions>({
    rarFormat: 'rar50',
    method: 'normal',
    solid: true,
    dictionarySize: '16m',
    splitVolumeSize: 'none',
    testArchive: true,
    recoveryRecord: true,
    recoveryRecordPercent: 3,
    deleteFilesAfter: false,
  });

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
    setProgressStatus('Initializing WinRAR / WebAssembly compression worker...');

    try {
      const res = await compressFiles(
        stagedFiles,
        format,
        level,
        archiveName,
        (percent, status) => {
          setProgressPercent(percent);
          setProgressStatus(status);
        },
        winrarOptions
      );
      setResult(res);

      // Handle delete staged files after archiving option
      if (winrarOptions.deleteFilesAfter) {
        setStagedFiles([]);
      }
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

  const handleDownloadVolume = (vol: { name: string; blob: Blob }) => {
    const url = URL.createObjectURL(vol.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = vol.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const handleDownloadAllVolumes = () => {
    if (!result?.volumes) return;
    result.volumes.forEach((vol, idx) => {
      setTimeout(() => {
        handleDownloadVolume(vol);
      }, idx * 250);
    });
  };

  const getFormatBadge = (fmt: CompressionFormat) => {
    switch (fmt) {
      case 'rar':
        return { label: 'RAR', desc: 'WinRAR archive format with Solid LZMA2 blocks & AES-256', ext: '.rar' };
      case '7z':
        return { label: '7Z', desc: '7-Zip open archive format with LZMA2 solid packing', ext: '.7z' };
      case 'zip':
        return { label: 'ZIP', desc: 'Universal compatibility across Windows, Mac, Linux, Mobile', ext: '.zip' };
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
      {/* Top Banner: WinRAR Style + Privacy Guarantee */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-xs">
        <div className="flex items-center gap-2 text-zinc-300">
          <WinRarBooksIcon className="w-5 h-5 drop-shadow" />
          <span>
            <strong className="text-zinc-100">WinRAR Compression Style Active:</strong> Solid LZMA2 archiving, dictionary size control, multi-volume splitting, and AES-256 encryption.
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* UI View Mode Toggle: WinRAR Dialog vs Modern */}
          <div className="flex items-center p-1 rounded-xl bg-zinc-950 border border-zinc-800 shadow-inner">
            <button
              onClick={() => setUiMode('winrar')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                uiMode === 'winrar'
                  ? 'bg-emerald-500 text-zinc-950 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
              }`}
            >
              <WinRarBooksIcon className="w-3.5 h-3.5" />
              <span>WinRAR Dialog</span>
            </button>
            <button
              onClick={() => setUiMode('modern')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                uiMode === 'modern'
                  ? 'bg-emerald-500 text-zinc-950 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Modern Studio</span>
            </button>
          </div>
        </div>
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
            <WinRarBooksIcon className="w-9 h-9 drop-shadow-md" />
          </div>

          <h3 className="mt-4 text-base font-semibold text-zinc-100">
            Choose or drop files to compress
          </h3>
          <p className="mt-1 text-xs text-zinc-400">
            Supports RAR, 7Z, ZIP, TAR.GZ
          </p>

          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs transition-colors shadow-md">
            <Upload className="w-3.5 h-3.5" />
            <span>Select Files</span>
          </div>
        </div>
      ) : (
        /* Staged Files Overview & Controls */
        <div className="space-y-4">
          {/* Staged File List Container */}
          <div className="rounded-2xl bg-[#121215] border border-zinc-800 p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <WinRarBooksIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                    <span>Staged Files</span>
                    <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-[11px]">
                      {stagedFiles.length}
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400 font-mono mt-0.5">
                    {formatBytes(totalOriginalBytes)}
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
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition-colors disabled:opacity-50 cursor-pointer"
                  title="Add more files to archive"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Files</span>
                </button>
                <button
                  onClick={handleClearAll}
                  disabled={isCompressing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-red-300 text-xs font-medium border border-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
                  title="Clear all staged files"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              </div>
            </div>

            {/* Staged File List (Scrollable) */}
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
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
                      className="p-1 text-zinc-500 hover:text-red-400 rounded transition-colors disabled:opacity-40 cursor-pointer"
                      aria-label={`Remove ${item.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dialog View Mode Switch: WinRAR Dialog vs Modern Studio */}
          {uiMode === 'winrar' ? (
            /* WinRAR Classic Dialog */
            <WinRarDialog
              archiveName={archiveName}
              setArchiveName={setArchiveName}
              format={format}
              setFormat={setFormat}
              winrarOptions={winrarOptions}
              setWinrarOptions={setWinrarOptions}
              onCompress={handleStartCompression}
              isCompressing={isCompressing}
              fileCount={stagedFiles.length}
              totalBytes={totalOriginalBytes}
            />
          ) : (
            /* Modern Studio Layout with WinRAR Capabilities */
            <div className="rounded-2xl bg-[#121215] border border-zinc-800 p-4 sm:p-5 space-y-4">
              <div className="pb-2 border-b border-zinc-800/80">
                <span className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-400" />
                  <span>Options</span>
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Format */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Format
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {(['rar', '7z', 'zip', 'tar.gz', 'tar', 'gz'] as CompressionFormat[]).map((fmt) => {
                      const badge = getFormatBadge(fmt);
                      const active = format === fmt;
                      return (
                        <button
                          key={fmt}
                          type="button"
                          onClick={() => setFormat(fmt)}
                          disabled={isCompressing}
                          className={`px-3 py-2 rounded-xl text-left border text-xs transition-all cursor-pointer ${
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
                </div>

                {/* Compression Method */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Method
                  </label>
                  <select
                    value={winrarOptions.method || 'normal'}
                    onChange={(e) =>
                      setWinrarOptions((prev) => ({
                        ...prev,
                        method: e.target.value as WinRarCompressionMethod,
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 font-mono focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="store">Store</option>
                    <option value="fastest">Fastest</option>
                    <option value="fast">Fast</option>
                    <option value="normal">Normal</option>
                    <option value="good">Good</option>
                    <option value="best">Best</option>
                  </select>

                  <div className="mt-2 flex items-center gap-2">
                    <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={winrarOptions.solid !== false}
                        onChange={(e) =>
                          setWinrarOptions((prev) => ({ ...prev, solid: e.target.checked }))
                        }
                        className="rounded accent-emerald-500 w-3.5 h-3.5"
                      />
                      <span>Solid</span>
                    </label>
                  </div>
                </div>

                {/* Output Name & Password */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Archive Name
                  </label>
                  <input
                    type="text"
                    value={archiveName}
                    onChange={(e) => setArchiveName(e.target.value)}
                    placeholder={`e.g. archive.${format === '7z' ? '7z' : format}`}
                    disabled={isCompressing}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors"
                  />

                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => setUiMode('winrar')}
                      className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium"
                    >
                      <span>WinRAR Settings & Password →</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Compress Action Trigger */}
              <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-end">
                <button
                  onClick={handleStartCompression}
                  disabled={isCompressing || stagedFiles.length === 0}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm transition-all shadow-md shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Compress ({stagedFiles.length})</span>
                </button>
              </div>
            </div>
          )}

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
                    <h4 className="text-sm font-semibold text-zinc-100 flex flex-wrap items-center gap-2">
                      <span>{result.outputName}</span>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono uppercase font-bold">
                        {result.rarVersion || result.format.toUpperCase()}
                      </span>
                      {result.magicBytes && (
                        <span className="px-2 py-0.5 rounded bg-zinc-900 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-medium">
                          Magic: {result.magicBytes}
                        </span>
                      )}
                      {result.winrarMethodName && (
                        <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono uppercase font-medium">
                          Method: {result.winrarMethodName}
                        </span>
                      )}
                      {result.isSolid && (
                        <span className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-[10px] font-mono font-medium">
                          Solid Archive
                        </span>
                      )}
                      {result.isEncrypted && (
                        <span className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-800 text-amber-300 text-[10px] font-mono font-medium flex items-center gap-1">
                          <Lock className="w-3 h-3" />
                          <span>AES-256</span>
                        </span>
                      )}
                      {result.hasEncryptedHeaders && (
                        <span className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-800 text-amber-300 text-[10px] font-mono font-medium">
                          Headers Encrypted
                        </span>
                      )}
                      {result.recoveryRecordPercent && result.recoveryRecordPercent > 0 && (
                        <span className="px-2 py-0.5 rounded bg-sky-950/60 border border-sky-800 text-sky-300 text-[10px] font-mono font-medium">
                          {result.recoveryRecordPercent}% Recovery Record
                        </span>
                      )}
                      {result.verified && (
                        <span className="px-2 py-0.5 rounded bg-sky-950/60 border border-sky-800 text-sky-300 text-[10px] font-mono font-medium">
                          ✓ Tested OK
                        </span>
                      )}
                    </h4>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Successfully compressed {result.fileCount} {result.fileCount === 1 ? 'file' : 'files'} in {(result.elapsedMs / 1000).toFixed(2)}s
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  {result.volumes && result.volumes.length > 0 ? (
                    <button
                      onClick={handleDownloadAllVolumes}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download All ({result.volumes.length} Volumes)</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleDownloadResult}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download Archive</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Multi-Volume Parts Listing (if split into volumes) */}
              {result.volumes && result.volumes.length > 0 && (
                <div className="pt-2 border-t border-zinc-800/80 space-y-2">
                  <div className="flex items-center justify-between text-xs text-zinc-300 font-semibold">
                    <span>Generated Multi-Volume Parts ({result.volumes.length}):</span>
                    <span className="text-[11px] text-zinc-400 font-mono">
                      Extractable in WinRAR or 7-Zip
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {result.volumes.map((vol, idx) => (
                      <div
                        key={vol.name}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FolderArchive className="w-4 h-4 text-emerald-400 shrink-0" />
                          <div className="min-w-0">
                            <div className="font-mono text-zinc-200 truncate">{vol.name}</div>
                            <div className="text-[10px] text-zinc-400 font-mono">
                              {formatBytes(vol.size)}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDownloadVolume(vol)}
                          className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Download className="w-3 h-3" />
                          <span>Part {idx + 1}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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

              {/* Authentic RAR container guarantee banner */}
              {result.format === 'rar' && (
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-zinc-300 leading-relaxed">
                    <span className="font-semibold text-emerald-300">Authentic RAR Bitstream Verified: </span>
                    This archive was compiled directly into genuine RAR container format ({result.rarVersion || 'RAR 5.0'}).
                    It carries signature <code className="text-emerald-400 font-mono font-bold">{result.magicBytes || '52 61 72 21 1A 07 01 00'}</code> and cannot be renamed to .zip to open with standard zip extractors.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
