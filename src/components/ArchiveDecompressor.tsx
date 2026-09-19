import React, { useState, useRef } from 'react';
import {
  FolderArchive,
  Upload,
  Search,
  Eye,
  Download,
  File,
  FileText,
  Image,
  Video,
  Music,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Trash2,
  FolderOpen,
  Filter,
  ShieldCheck,
  Lock,
  Key,
} from 'lucide-react';
import {
  ExtractionResult,
  ExtractedArchiveItem,
  decompressArchive,
  formatBytes,
} from '../utils/archiveEngine';
import { ArchivePreviewModal } from './ArchivePreviewModal';

export const ArchiveDecompressor: React.FC = () => {
  const [isDecompressing, setIsDecompressing] = useState(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Current file and password prompt state
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);

  // Search and Filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  // Preview Modal
  const [previewItem, setPreviewItem] = useState<ExtractedArchiveItem | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const runExtraction = async (file: File, pwd?: string) => {
    setError(null);
    setIsDecompressing(true);
    setProgressPercent(0);
    setProgressStatus('Reading archive payload...');

    try {
      const res = await decompressArchive(
        file,
        pwd ? { password: pwd } : undefined,
        (percent, status) => {
          setProgressPercent(percent);
          setProgressStatus(status);
        }
      );
      setResult(res);
      setShowPasswordPrompt(false);
      setPasswordInput('');
    } catch (err: any) {
      console.error('Decompression failed:', err);
      const msg = err?.message || 'Failed to unpack the archive file.';
      if (
        msg.toLowerCase().includes('password') ||
        msg.toLowerCase().includes('encrypted') ||
        msg.includes('ERAR_MISSING_PASSWORD')
      ) {
        setShowPasswordPrompt(true);
      }
      setError(msg);
    } finally {
      setIsDecompressing(false);
    }
  };

  const handleArchiveSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setCurrentFile(file);
    setResult(null);
    setError(null);
    setShowPasswordPrompt(false);
    setPasswordInput('');
    await runExtraction(file);
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentFile || !passwordInput.trim()) return;
    await runExtraction(currentFile, passwordInput.trim());
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    setCurrentFile(null);
    setShowPasswordPrompt(false);
    setPasswordInput('');
    setSearchQuery('');
    setActiveCategory('all');
  };

  const handleDownloadFile = (item: ExtractedArchiveItem) => {
    const a = document.createElement('a');
    a.href = item.url || URL.createObjectURL(new Blob([item.data], { type: item.mimeType }));
    a.download = item.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadAll = async () => {
    if (!result || result.files.length === 0) return;
    // Download each file with small stagger so browser doesn't block multi-downloads
    for (let i = 0; i < result.files.length; i++) {
      const file = result.files[i];
      setTimeout(() => {
        handleDownloadFile(file);
      }, i * 200);
    }
  };

  const filteredFiles = (result?.files || []).filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.path.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (activeCategory === 'all') return true;
    if (activeCategory === 'image' && item.previewType === 'image') return true;
    if (activeCategory === 'video' && item.previewType === 'video') return true;
    if (activeCategory === 'audio' && item.previewType === 'audio') return true;
    if (activeCategory === 'text' && (item.previewType === 'text' || item.previewType === 'pdf')) return true;
    if (activeCategory === 'other' && item.previewType === 'other') return true;

    return false;
  });

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'image':
        return <Image className="w-4 h-4 text-sky-400" />;
      case 'video':
        return <Video className="w-4 h-4 text-emerald-400" />;
      case 'audio':
        return <Music className="w-4 h-4 text-purple-400" />;
      case 'text':
      case 'pdf':
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
          <strong>100% Private Decompression:</strong> Archive extraction operates purely within client-side memory. No files are ever uploaded to any cloud server.
        </span>
      </div>

      {/* Initial Dropzone */}
      {!result && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            handleArchiveSelected(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`relative group rounded-2xl border-2 border-dashed p-8 md:p-12 text-center transition-all cursor-pointer ${
            isDragOver
              ? 'border-emerald-500 bg-emerald-950/20 shadow-lg shadow-emerald-500/10'
              : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/40 hover:bg-zinc-900/70'
          }`}
          role="button"
          tabIndex={0}
          aria-label="Upload archive to decompress"
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
            accept=".zip,.rar,.7z,.tar,.tar.gz,.tgz,.gz,.z,application/zip,application/x-tar,application/gzip,application/x-7z-compressed,application/vnd.rar,application/x-rar-compressed"
            className="hidden"
            onChange={(e) => handleArchiveSelected(e.target.files)}
          />

          <div className="w-16 h-16 mx-auto rounded-2xl bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform shadow-md">
            <FolderArchive className="w-8 h-8" />
          </div>

          <h3 className="mt-4 text-base font-semibold text-zinc-100">
            Choose or drop an archive to decompress
          </h3>
          <p className="mt-1 text-xs text-zinc-400 max-w-md mx-auto">
            Supports <strong className="text-zinc-200">.7Z</strong> (7-Zip), <strong className="text-zinc-200">.RAR</strong> (RAR4/RAR5), <strong className="text-zinc-200">.ZIP</strong>, <strong className="text-zinc-200">.TAR.GZ</strong>, <strong className="text-zinc-200">.TGZ</strong>, <strong className="text-zinc-200">.TAR</strong>, and <strong className="text-zinc-200">.GZ</strong> archives.
          </p>

          <div className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs transition-colors shadow-md">
            <Upload className="w-3.5 h-3.5" />
            <span>Select Archive</span>
          </div>
        </div>
      )}

      {/* Password Prompt for Encrypted Archives (RAR / 7z / ZIP) */}
      {showPasswordPrompt && currentFile && (
        <form
          onSubmit={handlePasswordSubmit}
          className="p-5 rounded-2xl bg-[#121215] border border-amber-500/40 shadow-xl space-y-3 animate-in fade-in"
        >
          <div className="flex items-center gap-2.5 text-amber-400">
            <Lock className="w-5 h-5 shrink-0" />
            <span className="font-semibold text-sm">
              Password-Protected Archive: {currentFile.name}
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            This archive requires a decryption password. Enter the password below to unpack its contents.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <div className="relative flex-1">
              <Key className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Enter archive password..."
                autoFocus
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-400"
              />
            </div>
            <button
              type="submit"
              disabled={isDecompressing || !passwordInput.trim()}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs transition-colors shadow-md disabled:opacity-50"
            >
              Unlock & Extract
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Progress Bar when decompressing */}
      {isDecompressing && (
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
          <div className="flex-1">
            <p className="font-semibold text-red-400 text-sm">Decompression Error</p>
            <p className="mt-1">{error}</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-2.5 px-3 py-1 rounded bg-red-900 hover:bg-red-800 text-red-100 text-xs border border-red-700 transition-colors"
            >
              Choose Another Archive
            </button>
          </div>
        </div>
      )}

      {/* Decompression Result & File Explorer */}
      {result && !isDecompressing && (
        <div className="space-y-4 animate-in fade-in">
          {/* Header Summary Card */}
          <div className="p-5 rounded-2xl bg-[#121215] border border-zinc-800 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <FolderOpen className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                    <span className="truncate max-w-sm">{result.archiveName}</span>
                    <span className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-[10px] font-mono uppercase font-bold">
                      {result.formatDetected}
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Extracted {result.files.length} {result.files.length === 1 ? 'file' : 'files'} in {(result.elapsedMs / 1000).toFixed(2)}s
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadAll}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs transition-colors shadow-sm"
                  title="Download all extracted files"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download All ({result.files.length})</span>
                </button>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-medium border border-zinc-800 transition-colors"
                  title="Unpack another archive"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>New Archive</span>
                </button>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800/80">
                <div className="text-[11px] text-zinc-400">Archive File Size</div>
                <div className="text-sm font-semibold font-mono text-zinc-200 mt-0.5">
                  {formatBytes(result.archiveSize)}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800/80">
                <div className="text-[11px] text-zinc-400">Uncompressed Size</div>
                <div className="text-sm font-semibold font-mono text-emerald-400 mt-0.5">
                  {formatBytes(result.totalUncompressedSize)}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800/80">
                <div className="text-[11px] text-zinc-400">Total Items</div>
                <div className="text-sm font-semibold font-mono text-zinc-200 mt-0.5">
                  {result.files.length}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800/80">
                <div className="text-[11px] text-zinc-400">Extract Time</div>
                <div className="text-sm font-semibold font-mono text-zinc-200 mt-0.5">
                  {(result.elapsedMs / 1000).toFixed(2)}s
                </div>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
              {/* Category Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
                {[
                  { id: 'all', label: 'All Files' },
                  { id: 'image', label: 'Images' },
                  { id: 'video', label: 'Videos' },
                  { id: 'audio', label: 'Audio' },
                  { id: 'text', label: 'Text & Docs' },
                  { id: 'other', label: 'Binaries' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveCategory(tab.id)}
                    className={`px-3 py-1 rounded-lg text-xs transition-colors whitespace-nowrap ${
                      activeCategory === tab.id
                        ? 'bg-emerald-500 text-zinc-950 font-semibold'
                        : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Search input */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search files inside archive..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>

            {/* Extracted Files List */}
            <div className="max-h-96 overflow-y-auto space-y-1.5 pr-1 divide-y divide-zinc-800/40">
              {filteredFiles.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-xs font-mono">
                  No files match your search criteria.
                </div>
              ) : (
                filteredFiles.map((file) => (
                  <div
                    key={file.id}
                    className="pt-1.5 first:pt-0 flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-900/70 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 shrink-0">
                        {getFileIcon(file.previewType)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-zinc-100 truncate">
                          {file.name}
                        </div>
                        <div className="text-[11px] text-zinc-500 font-mono truncate">
                          {file.path !== file.name ? `${file.path} • ` : ''}
                          {formatBytes(file.size)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Preview Button */}
                      <button
                        onClick={() => setPreviewItem(file)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-colors text-xs font-medium"
                        title="Preview file content"
                      >
                        <Eye className="w-3.5 h-3.5 text-zinc-400" />
                        <span className="hidden sm:inline">Preview</span>
                      </button>

                      {/* Download Button */}
                      <button
                        onClick={() => handleDownloadFile(file)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-colors text-xs font-medium"
                        title="Save file to device"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Save</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      <ArchivePreviewModal
        item={previewItem}
        onClose={() => setPreviewItem(null)}
      />
    </div>
  );
};
