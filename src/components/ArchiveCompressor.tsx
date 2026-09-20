import React, { useState, useRef } from 'react';
import {
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
  RefreshCw,
  Lock,
  Eye,
  EyeOff,
  FolderArchive,
  X,
  Sparkles,
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

// WinRAR Books Stack Icon
export const WinRarBooksIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect x="6" y="8" width="34" height="8" rx="2" fill="#2563EB" stroke="#1D4ED8" strokeWidth="1.5" />
    <path d="M6 10H40" stroke="#60A5FA" strokeWidth="1" strokeLinecap="round" />
    <rect x="36" y="9" width="3" height="6" fill="#F8FAFC" rx="0.5" />

    <rect x="7" y="18" width="34" height="8" rx="2" fill="#16A34A" stroke="#15803D" strokeWidth="1.5" />
    <path d="M7 20H41" stroke="#4ADE80" strokeWidth="1" strokeLinecap="round" />
    <rect x="37" y="19" width="3" height="6" fill="#F8FAFC" rx="0.5" />

    <rect x="6" y="28" width="35" height="9" rx="2" fill="#DC2626" stroke="#B91C1C" strokeWidth="1.5" />
    <path d="M6 30H41" stroke="#F87171" strokeWidth="1" strokeLinecap="round" />
    <rect x="37" y="29" width="3" height="7" fill="#F8FAFC" rx="0.5" />

    <rect x="18" y="6" width="6" height="34" rx="1" fill="#18181B" stroke="#27272A" strokeWidth="1" />
    <rect x="16.5" y="20" width="9" height="7" rx="1.5" fill="#EAB308" stroke="#CA8A04" strokeWidth="1" />
    <rect x="18.5" y="22" width="5" height="3" fill="#18181B" />
    <circle cx="21" cy="23.5" r="0.8" fill="#FDE047" />
  </svg>
);

export const ArchiveCompressor: React.FC = () => {
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [format, setFormat] = useState<'rar' | '7z'>('rar');
  const [rarVersion, setRarVersion] = useState<'rar50' | 'rar40'>('rar50');
  const [archiveName, setArchiveName] = useState<string>('');
  const [compressionMethod, setCompressionMethod] = useState<WinRarCompressionMethod>('normal');
  const [splitVolume, setSplitVolume] = useState<string>('none');
  const [solid, setSolid] = useState(true);
  const [recoveryRecord, setRecoveryRecord] = useState(true);

  // Password state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [encryptHeader, setEncryptHeader] = useState(false);
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Compression progress & result
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
    setProgressStatus('Initializing compression engine...');

    const winrarOptions: WinRarCompressionOptions = {
      rarFormat: format === 'rar' ? rarVersion : undefined,
      method: compressionMethod,
      solid,
      dictionarySize: '16m',
      splitVolumeSize: splitVolume,
      testArchive: true,
      recoveryRecord,
      recoveryRecordPercent: recoveryRecord ? 3 : 0,
      password: password || undefined,
      encryptHeader: password ? encryptHeader : false,
      deleteFilesAfter: false,
    };

    const level: CompressionLevel =
      compressionMethod === 'store'
        ? 0
        : compressionMethod === 'fastest' || compressionMethod === 'fast'
        ? 1
        : compressionMethod === 'best'
        ? 9
        : 6;

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
    } catch (err: any) {
      console.error('Compression failed:', err);
      setError(err?.message || 'Compression failed.');
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

  const handleSavePassword = () => {
    if (password && password !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }
    setPasswordError(null);
    setShowPasswordModal(false);
  };

  const handleClearPassword = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPassword('');
    setConfirmPassword('');
    setEncryptHeader(false);
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

  const extension = format === 'rar' ? '.rar' : '.7z';

  return (
    <div className="space-y-4">
      {/* Dropzone (when empty) */}
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
          className={`relative group rounded-2xl border-2 border-dashed p-10 md:p-14 text-center transition-all cursor-pointer select-none ${
            isDragOver
              ? 'border-emerald-500 bg-emerald-950/20'
              : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/40 hover:bg-zinc-900/60'
          }`}
          role="button"
          tabIndex={0}
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

          <div className="w-14 h-14 mx-auto rounded-2xl bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform shadow-md">
            <WinRarBooksIcon className="w-8 h-8" />
          </div>

          <h3 className="mt-4 text-base font-semibold text-zinc-100">
            Drop files here or browse
          </h3>
          <p className="mt-1 text-xs text-zinc-400">
            RAR or 7Z
          </p>

          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs transition-colors shadow-md">
            <Upload className="w-3.5 h-3.5" />
            <span>Select Files</span>
          </div>
        </div>
      ) : (
        /* Staged Files + Settings */
        <div className="space-y-4">
          {/* Staged File List */}
          <div className="rounded-2xl bg-[#121215] border border-zinc-800 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-zinc-800/80">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-zinc-200">
                  Files ({stagedFiles.length})
                </span>
                <span className="text-xs text-zinc-500 font-mono">
                  • {formatBytes(totalOriginalBytes)}
                </span>
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
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add</span>
                </button>
                <button
                  onClick={handleClearAll}
                  disabled={isCompressing}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-red-400 text-xs font-medium border border-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              </div>
            </div>

            {/* List */}
            <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
              {stagedFiles.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-lg bg-zinc-900/60 border border-zinc-800/60 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="shrink-0">{getFileIcon(item.name)}</div>
                    <span className="text-zinc-200 truncate">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="font-mono text-zinc-500 text-[11px]">
                      {formatBytes(item.size)}
                    </span>
                    <button
                      onClick={() => handleRemoveStaged(item.id)}
                      disabled={isCompressing}
                      className="text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Simple Compression Settings Card */}
          <div className="rounded-2xl bg-[#121215] border border-zinc-800 p-4 sm:p-5 space-y-4">
            {/* Format row */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <label className="text-xs font-semibold text-zinc-300">Archive Format</label>
                {format === 'rar' && (
                  <div className="flex items-center p-0.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs">
                    <button
                      type="button"
                      onClick={() => setRarVersion('rar50')}
                      className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-colors ${
                        rarVersion === 'rar50'
                          ? 'bg-emerald-500 text-zinc-950'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      RAR 5.0
                    </button>
                    <button
                      type="button"
                      onClick={() => setRarVersion('rar40')}
                      className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-colors ${
                        rarVersion === 'rar40'
                          ? 'bg-emerald-500 text-zinc-950'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      RAR 4.0
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {(['rar', '7z'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setFormat(fmt)}
                    disabled={isCompressing}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold uppercase font-mono transition-all cursor-pointer ${
                      format === fmt
                        ? 'bg-emerald-500 text-zinc-950 border-emerald-400 shadow-sm'
                        : 'bg-zinc-900/70 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>

            {/* Archive Name Input */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Archive Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={archiveName}
                  onChange={(e) => setArchiveName(e.target.value)}
                  placeholder={`archive${extension}`}
                  disabled={isCompressing}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>

            {/* Settings Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Method */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Method
                </label>
                <select
                  value={compressionMethod}
                  onChange={(e) => setCompressionMethod(e.target.value as WinRarCompressionMethod)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="store">Store</option>
                  <option value="fast">Fast</option>
                  <option value="normal">Normal</option>
                  <option value="best">Best</option>
                </select>
              </div>

              {/* Volumes */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Split Volumes
                </label>
                <select
                  value={splitVolume}
                  onChange={(e) => setSplitVolume(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="none">None</option>
                  <option value="10m">10 MB</option>
                  <option value="25m">25 MB</option>
                  <option value="100m">100 MB</option>
                  <option value="700m">700 MB</option>
                  <option value="4481m">4.4 GB</option>
                </select>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Encryption
                </label>
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(true)}
                  className={`w-full px-3 py-2 rounded-xl border text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                    password
                      ? 'bg-amber-950/30 border-amber-500/50 text-amber-300'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80'
                  }`}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <Lock className="w-3.5 h-3.5" />
                    <span>{password ? 'Password Set' : 'Set Password'}</span>
                  </span>
                  {password && (
                    <span
                      onClick={handleClearPassword}
                      className="p-0.5 hover:text-red-400 transition-colors"
                      title="Remove password"
                    >
                      <X className="w-3 h-3" />
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Checkbox Options */}
            <div className="flex flex-wrap items-center gap-6 pt-1 text-xs text-zinc-300">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={solid}
                  onChange={(e) => setSolid(e.target.checked)}
                  className="rounded accent-emerald-500 w-3.5 h-3.5"
                />
                <span>Solid archive</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={recoveryRecord}
                  onChange={(e) => setRecoveryRecord(e.target.checked)}
                  className="rounded accent-emerald-500 w-3.5 h-3.5"
                />
                <span>Recovery record (3%)</span>
              </label>
            </div>

            {/* Compress Action Button */}
            <div className="pt-2 border-t border-zinc-800/80">
              <button
                onClick={handleStartCompression}
                disabled={isCompressing || stagedFiles.length === 0}
                className="w-full py-3 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-sm transition-all shadow-md shadow-emerald-500/20 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>Compress ({stagedFiles.length})</span>
              </button>
            </div>
          </div>

          {/* Progress */}
          {isCompressing && (
            <div className="p-4 rounded-2xl bg-[#121215] border border-emerald-500/40 shadow-xl space-y-2.5 animate-in fade-in">
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

          {/* Error */}
          {error && (
            <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800 text-red-200 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Result Card */}
          {result && !isCompressing && (
            <div className="p-5 rounded-2xl bg-emerald-950/20 border border-emerald-500/40 shadow-xl space-y-4 animate-in fade-in">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                      <span>{result.outputName}</span>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono uppercase font-bold">
                        {result.rarVersion || result.format.toUpperCase()}
                      </span>
                      {result.isEncrypted && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-800 text-amber-300 text-[10px] font-mono flex items-center gap-1">
                          <Lock className="w-3 h-3" />
                          <span>AES-256</span>
                        </span>
                      )}
                    </h4>
                    <p className="text-xs text-zinc-400 mt-0.5 font-mono">
                      {result.fileCount} files • {(result.elapsedMs / 1000).toFixed(2)}s
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {result.volumes && result.volumes.length > 0 ? (
                    <button
                      onClick={handleDownloadAllVolumes}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs transition-all shadow-md cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download All ({result.volumes.length})</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleDownloadResult}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs transition-all shadow-md cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </button>
                  )}
                  <button
                    onClick={handleClearAll}
                    className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-medium border border-zinc-800 transition-colors cursor-pointer"
                  >
                    New
                  </button>
                </div>
              </div>

              {/* Multi-Volume Parts Listing (if split) */}
              {result.volumes && result.volumes.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs text-zinc-300 font-semibold">
                    Parts ({result.volumes.length}):
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
                            <div className="text-[10px] text-zinc-500 font-mono">
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

              {/* Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80">
                  <div className="text-[10px] text-zinc-500">Original</div>
                  <div className="text-xs font-semibold font-mono text-zinc-200 mt-0.5">
                    {formatBytes(result.originalSize)}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80">
                  <div className="text-[10px] text-zinc-500">Compressed</div>
                  <div className="text-xs font-semibold font-mono text-emerald-400 mt-0.5">
                    {formatBytes(result.compressedSize)}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80">
                  <div className="text-[10px] text-zinc-500">Saved</div>
                  <div className="text-xs font-semibold font-mono text-emerald-300 mt-0.5">
                    {result.ratio > 0 ? `${result.ratio}%` : '0%'}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80">
                  <div className="text-[10px] text-zinc-500">Time</div>
                  <div className="text-xs font-semibold font-mono text-zinc-200 mt-0.5">
                    {(result.elapsedMs / 1000).toFixed(2)}s
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Simplified Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-[#18181b] border border-zinc-700 shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-400" />
                <span>Set Password</span>
              </h3>
              <button
                onClick={() => setShowPasswordModal(false)}
                className="text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Enter Password
                </label>
                <div className="relative">
                  <input
                    type={showPasswordText ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setPasswordError(null);
                    }}
                    placeholder="Password"
                    className="w-full px-3 py-2 pr-9 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordText(!showPasswordText)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                  >
                    {showPasswordText ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Confirm Password
                </label>
                <input
                  type={showPasswordText ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setPasswordError(null);
                  }}
                  placeholder="Re-enter password"
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {passwordError && (
                <div className="text-[11px] text-red-400 font-medium">
                  {passwordError}
                </div>
              )}

              {(format === 'rar' || format === '7z') && (
                <label className="flex items-center gap-2 pt-1 text-xs text-zinc-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={encryptHeader}
                    onChange={(e) => setEncryptHeader(e.target.checked)}
                    className="rounded accent-emerald-500 w-3.5 h-3.5"
                  />
                  <span>Encrypt file names</span>
                </label>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePassword}
                className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs transition-colors cursor-pointer"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
