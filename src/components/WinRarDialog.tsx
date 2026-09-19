import React, { useState } from 'react';
import {
  Lock,
  Eye,
  EyeOff,
  HelpCircle,
  Check,
  Sparkles,
  Shield,
  FileArchive,
  Database,
  Sliders,
  FolderArchive,
  Key,
  X,
  Info,
  CheckCircle2,
} from 'lucide-react';
import {
  CompressionFormat,
  WinRarCompressionMethod,
  WinRarCompressionOptions,
  formatBytes,
} from '../utils/archiveEngine';

export interface WinRarDialogProps {
  archiveName: string;
  setArchiveName: (name: string) => void;
  format: CompressionFormat;
  setFormat: (format: CompressionFormat) => void;
  winrarOptions: WinRarCompressionOptions;
  setWinrarOptions: React.Dispatch<React.SetStateAction<WinRarCompressionOptions>>;
  onCompress: () => void;
  isCompressing: boolean;
  fileCount: number;
  totalBytes: number;
  onCloseDialog?: () => void;
}

export type WinRarDialogTab = 'general' | 'advanced' | 'options' | 'comment';

// Authentic WinRAR Book Stack Icon SVG
export const WinRarBooksIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    {/* Blue Book (Top) */}
    <rect x="6" y="8" width="34" height="8" rx="2" fill="#2563EB" stroke="#1D4ED8" strokeWidth="1.5" />
    <path d="M6 10H40" stroke="#60A5FA" strokeWidth="1" strokeLinecap="round" />
    <rect x="36" y="9" width="3" height="6" fill="#F8FAFC" rx="0.5" />

    {/* Green Book (Middle) */}
    <rect x="7" y="18" width="34" height="8" rx="2" fill="#16A34A" stroke="#15803D" strokeWidth="1.5" />
    <path d="M7 20H41" stroke="#4ADE80" strokeWidth="1" strokeLinecap="round" />
    <rect x="37" y="19" width="3" height="6" fill="#F8FAFC" rx="0.5" />

    {/* Red Book (Bottom) */}
    <rect x="6" y="28" width="35" height="9" rx="2" fill="#DC2626" stroke="#B91C1C" strokeWidth="1.5" />
    <path d="M6 30H41" stroke="#F87171" strokeWidth="1" strokeLinecap="round" />
    <rect x="37" y="29" width="3" height="7" fill="#F8FAFC" rx="0.5" />

    {/* Dark Leather Buckle Strap wrapping all 3 books */}
    <rect x="18" y="6" width="6" height="34" rx="1" fill="#18181B" stroke="#27272A" strokeWidth="1" />
    {/* Brass buckle */}
    <rect x="16.5" y="20" width="9" height="7" rx="1.5" fill="#EAB308" stroke="#CA8A04" strokeWidth="1" />
    <rect x="18.5" y="22" width="5" height="3" fill="#18181B" />
    <circle cx="21" cy="23.5" r="0.8" fill="#FDE047" />
  </svg>
);

export const WinRarDialog: React.FC<WinRarDialogProps> = ({
  archiveName,
  setArchiveName,
  format,
  setFormat,
  winrarOptions,
  setWinrarOptions,
  onCompress,
  isCompressing,
  fileCount,
  totalBytes,
  onCloseDialog,
}) => {
  const [activeTab, setActiveTab] = useState<WinRarDialogTab>('general');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pwdInput, setPwdInput] = useState(winrarOptions.password || '');
  const [pwdVerify, setPwdVerify] = useState(winrarOptions.password || '');
  const [pwdShow, setPwdShow] = useState(false);
  const [pwdEncryptNames, setPwdEncryptNames] = useState(winrarOptions.encryptHeader || false);
  const [showProfilesModal, setShowProfilesModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [customVolSize, setCustomVolSize] = useState('');

  // WinRAR Profiles
  const applyProfile = (profile: 'rar-default' | 'default' | 'best' | 'fast' | 'discord' | 'secure') => {
    switch (profile) {
      case 'rar-default':
      case 'default':
        setFormat('rar');
        setWinrarOptions((prev) => ({
          ...prev,
          method: 'normal',
          solid: true,
          dictionarySize: '16m',
          splitVolumeSize: 'none',
          testArchive: false,
        }));
        break;
      case 'best':
        setFormat('rar');
        setWinrarOptions((prev) => ({
          ...prev,
          method: 'best',
          solid: true,
          dictionarySize: '32m',
          splitVolumeSize: 'none',
          testArchive: true,
        }));
        break;
      case 'fast':
        setFormat('rar');
        setWinrarOptions((prev) => ({
          ...prev,
          method: 'fast',
          solid: false,
          dictionarySize: '4m',
          splitVolumeSize: 'none',
          testArchive: false,
        }));
        break;
      case 'discord':
        setFormat('rar');
        setWinrarOptions((prev) => ({
          ...prev,
          method: 'normal',
          solid: true,
          dictionarySize: '16m',
          splitVolumeSize: '25m',
          testArchive: false,
        }));
        break;
      case 'secure':
        setFormat('rar');
        setWinrarOptions((prev) => ({
          ...prev,
          method: 'good',
          solid: true,
          dictionarySize: '16m',
          encryptHeader: true,
        }));
        setShowPasswordModal(true);
        break;
    }
    setShowProfilesModal(false);
  };

  const handleSavePassword = () => {
    if (pwdInput && pwdVerify && pwdInput !== pwdVerify) {
      alert('Passwords do not match. Please re-enter.');
      return;
    }
    setWinrarOptions((prev) => ({
      ...prev,
      password: pwdInput.trim() || undefined,
      encryptHeader: pwdEncryptNames,
    }));
    setShowPasswordModal(false);
  };

  return (
    <div className="rounded-2xl border border-zinc-700/80 bg-[#121216] shadow-2xl overflow-hidden max-w-3xl mx-auto text-zinc-200">
      {/* WinRAR Classic Title Bar */}
      <div className="bg-gradient-to-r from-zinc-800 via-zinc-850 to-zinc-800 px-3.5 py-2.5 flex items-center justify-between border-b border-zinc-700 select-none">
        <div className="flex items-center gap-2.5">
          <WinRarBooksIcon className="w-5 h-5 drop-shadow" />
          <span className="font-semibold text-xs tracking-wide text-zinc-100 flex items-center gap-1.5">
            <span>Archive name and parameters</span>
            <span className="text-[10px] text-zinc-400 font-mono font-normal">
              (WinRAR Compression Style)
            </span>
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowHelpModal(true)}
            className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="WinRAR Compression Help & Guide"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
          {onCloseDialog && (
            <button
              onClick={onCloseDialog}
              className="p-1 rounded hover:bg-red-900/50 text-zinc-400 hover:text-red-300 transition-colors"
              title="Close WinRAR Dialog"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* WinRAR Dialog Tabs */}
      <div className="flex items-center bg-zinc-900/90 border-b border-zinc-800 px-3 pt-1.5 gap-1 text-xs select-none">
        {[
          { id: 'general' as WinRarDialogTab, label: 'General' },
          { id: 'advanced' as WinRarDialogTab, label: 'Advanced' },
          { id: 'options' as WinRarDialogTab, label: 'Options' },
          { id: 'comment' as WinRarDialogTab, label: 'Comment' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-1.5 rounded-t-lg font-medium transition-all text-xs border-t border-x ${
              activeTab === tab.id
                ? 'bg-[#121216] border-zinc-700 text-emerald-400 font-semibold -mb-[1px] shadow-sm'
                : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Dialog Body */}
      <div className="p-4 sm:p-5 space-y-4">
        {/* ================= GENERAL TAB ================= */}
        {activeTab === 'general' && (
          <div className="space-y-4 text-xs">
            {/* Archive Name and Profiles */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-semibold text-zinc-300">Archive name</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowProfilesModal(true)}
                    className="px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[11px] font-medium text-zinc-200 transition-colors flex items-center gap-1.5"
                  >
                    <Sliders className="w-3 h-3 text-emerald-400" />
                    <span>Profiles...</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={archiveName}
                  onChange={(e) => setArchiveName(e.target.value)}
                  placeholder={`archive.${format === '7z' ? '7z' : format}`}
                  className="flex-1 px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-xs text-zinc-100 font-mono focus:border-emerald-500 focus:outline-none"
                />
                <span className="px-2.5 py-1.5 rounded bg-zinc-800 text-zinc-400 text-xs font-mono">
                  .{format}
                </span>
              </div>
            </div>

            {/* Middle Grid: Archive Format, Compression Method, Dictionary Size */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left Column: Archive Format & Compression Method */}
              <div className="space-y-4">
                {/* Archive Format (Classic WinRAR Style) */}
                <fieldset className="border border-zinc-700/80 rounded-xl p-3 bg-zinc-900/40">
                  <legend className="px-2 text-zinc-300 font-semibold text-[11px] flex items-center gap-1.5">
                    <span>Archive format</span>
                    {format === 'rar' && (
                      <span className="text-[10px] text-emerald-400 font-mono font-normal">
                        (WinRAR .rar)
                      </span>
                    )}
                  </legend>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
                    <label
                      className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all ${
                        format === 'rar'
                          ? 'bg-emerald-950/50 border-emerald-500 text-emerald-300 font-bold shadow-xs'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="archiveFormat"
                        checked={format === 'rar'}
                        onChange={() => setFormat('rar')}
                        className="accent-emerald-500"
                      />
                      <span className="font-semibold text-xs">RAR (.rar)</span>
                    </label>

                    <label
                      className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all ${
                        format === '7z'
                          ? 'bg-emerald-950/40 border-emerald-500/80 text-emerald-300 font-semibold'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="archiveFormat"
                        checked={format === '7z'}
                        onChange={() => setFormat('7z')}
                        className="accent-emerald-500"
                      />
                      <span>7Z (.7z)</span>
                    </label>

                    <label
                      className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all ${
                        format === 'zip'
                          ? 'bg-emerald-950/40 border-emerald-500/80 text-emerald-300 font-semibold'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="archiveFormat"
                        checked={format === 'zip'}
                        onChange={() => setFormat('zip')}
                        className="accent-emerald-500"
                      />
                      <span>ZIP</span>
                    </label>

                    <label
                      className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all ${
                        format === 'tar.gz'
                          ? 'bg-emerald-950/40 border-emerald-500/80 text-emerald-300 font-semibold'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="archiveFormat"
                        checked={format === 'tar.gz'}
                        onChange={() => setFormat('tar.gz')}
                        className="accent-emerald-500"
                      />
                      <span>TAR.GZ</span>
                    </label>
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-2 flex items-center gap-1.5">
                    <span className="text-emerald-400 font-bold">✓</span>
                    <span>
                      {format === 'rar'
                        ? 'Creates a solid WinRAR-compatible .rar archive with high-density LZMA2 packing and AES-256 support.'
                        : format === '7z'
                        ? 'Open 7-Zip LZMA2 archive with solid continuous data blocks.'
                        : format === 'zip'
                        ? 'Universal ZIP container compatible with all default OS tools.'
                        : 'UNIX tarball compressed with Gzip stream.'}
                    </span>
                  </div>
                </fieldset>

                {/* Compression Method */}
                <div>
                  <label className="block font-semibold text-zinc-300 mb-1">
                    Compression method
                  </label>
                  <select
                    value={winrarOptions.method || 'normal'}
                    onChange={(e) =>
                      setWinrarOptions((prev) => ({
                        ...prev,
                        method: e.target.value as WinRarCompressionMethod,
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 font-mono focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="store">Store (No compression / Instant)</option>
                    <option value="fastest">Fastest (Lowest CPU usage)</option>
                    <option value="fast">Fast (Quick archiving)</option>
                    <option value="normal">Normal (WinRAR default)</option>
                    <option value="good">Good (High ratio)</option>
                    <option value="best">Best (Maximum solid compression)</option>
                  </select>
                </div>

                {/* Dictionary Size */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-zinc-300">Dictionary size</label>
                    <span className="text-[10px] text-zinc-500">Larger = better ratio on repeat data</span>
                  </div>
                  <select
                    value={winrarOptions.dictionarySize || '16m'}
                    onChange={(e) =>
                      setWinrarOptions((prev) => ({
                        ...prev,
                        dictionarySize: e.target.value as any,
                      }))
                    }
                    disabled={format === 'zip'}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 font-mono focus:border-emerald-500 focus:outline-none disabled:opacity-50"
                  >
                    <option value="auto">Auto (Adaptive)</option>
                    <option value="128k">128 KB</option>
                    <option value="256k">256 KB</option>
                    <option value="512k">512 KB</option>
                    <option value="1m">1 MB</option>
                    <option value="2m">2 MB</option>
                    <option value="4m">4 MB (Fast default)</option>
                    <option value="8m">8 MB</option>
                    <option value="16m">16 MB (WinRAR standard)</option>
                    <option value="32m">32 MB (High ratio)</option>
                    <option value="64m">64 MB (Ultra ratio)</option>
                    <option value="128m">128 MB (Maximum)</option>
                  </select>
                </div>
              </div>

              {/* Right Column: Archiving Options & Volumes */}
              <div className="space-y-4">
                {/* Archiving Options (Checkboxes) */}
                <fieldset className="border border-zinc-700/80 rounded-xl p-3 bg-zinc-900/40">
                  <legend className="px-2 text-zinc-300 font-semibold text-[11px]">
                    Archiving options
                  </legend>
                  <div className="space-y-2 mt-1">
                    <label className="flex items-center gap-2 text-zinc-300 hover:text-zinc-100 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={winrarOptions.solid !== false}
                        onChange={(e) =>
                          setWinrarOptions((prev) => ({ ...prev, solid: e.target.checked }))
                        }
                        className="rounded accent-emerald-500 w-3.5 h-3.5"
                      />
                      <span>Create solid archive (Continuous block packing)</span>
                    </label>

                    <label className="flex items-center gap-2 text-zinc-300 hover:text-zinc-100 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!winrarOptions.testArchive}
                        onChange={(e) =>
                          setWinrarOptions((prev) => ({ ...prev, testArchive: e.target.checked }))
                        }
                        className="rounded accent-emerald-500 w-3.5 h-3.5"
                      />
                      <span>Test archived files (Integrity self-test)</span>
                    </label>

                    <label className="flex items-center gap-2 text-zinc-300 hover:text-zinc-100 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!winrarOptions.recoveryRecord}
                        onChange={(e) =>
                          setWinrarOptions((prev) => ({ ...prev, recoveryRecord: e.target.checked }))
                        }
                        className="rounded accent-emerald-500 w-3.5 h-3.5"
                      />
                      <span>Put recovery record / CRC32 protection</span>
                    </label>

                    <label className="flex items-center gap-2 text-zinc-300 hover:text-zinc-100 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!winrarOptions.lockArchive}
                        onChange={(e) =>
                          setWinrarOptions((prev) => ({ ...prev, lockArchive: e.target.checked }))
                        }
                        className="rounded accent-emerald-500 w-3.5 h-3.5"
                      />
                      <span>Lock archive (Protect from modifications)</span>
                    </label>

                    <label className="flex items-center gap-2 text-zinc-300 hover:text-zinc-100 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!winrarOptions.deleteFilesAfter}
                        onChange={(e) =>
                          setWinrarOptions((prev) => ({ ...prev, deleteFilesAfter: e.target.checked }))
                        }
                        className="rounded accent-emerald-500 w-3.5 h-3.5"
                      />
                      <span>Delete staged files after archiving</span>
                    </label>
                  </div>
                </fieldset>

                {/* Split to Volumes, Size */}
                <div>
                  <label className="block font-semibold text-zinc-300 mb-1">
                    Split to volumes, size
                  </label>
                  <select
                    value={winrarOptions.splitVolumeSize || 'none'}
                    onChange={(e) =>
                      setWinrarOptions((prev) => ({
                        ...prev,
                        splitVolumeSize: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 font-mono focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="none">None (Single file)</option>
                    <option value="10m">10 MB</option>
                    <option value="25m">25 MB (Discord attachment limit)</option>
                    <option value="100m">100 MB (Web upload limit)</option>
                    <option value="700m">700 MB (CD)</option>
                    <option value="4481m">4.37 GB (DVD)</option>
                  </select>
                </div>

                {/* Set Password Button */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowPasswordModal(true)}
                    className={`w-full py-2.5 px-4 rounded-xl border flex items-center justify-center gap-2 text-xs font-semibold transition-all ${
                      winrarOptions.password
                        ? 'bg-amber-950/40 border-amber-500/80 text-amber-300'
                        : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-200'
                    }`}
                  >
                    <Key className="w-3.5 h-3.5" />
                    <span>
                      {winrarOptions.password
                        ? 'Password Protected (AES-256 Active)'
                        : 'Set password...'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= ADVANCED TAB ================= */}
        {activeTab === 'advanced' && (
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3">
              <h4 className="font-semibold text-sm text-zinc-100 flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                <span>Memory and Compression Parameters</span>
              </h4>
              <p className="text-zinc-400 text-xs">
                Solid archiving groups all staged files together into an unbroken data stream. This allows the LZMA2 dictionary to reuse patterns between different files (such as source code, logs, or documents) achieving up to 30-70% higher compression ratios than standard ZIP.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 text-xs font-mono">
                <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
                  <div className="text-zinc-500 text-[10px]">Staged Files</div>
                  <div className="text-zinc-200 font-bold text-sm">{fileCount} files</div>
                </div>
                <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
                  <div className="text-zinc-500 text-[10px]">Raw Payload</div>
                  <div className="text-emerald-400 font-bold text-sm">{formatBytes(totalBytes)}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
                  <div className="text-zinc-500 text-[10px]">Solid Engine</div>
                  <div className="text-zinc-200 font-bold text-sm">
                    {winrarOptions.solid !== false ? 'Solid Block ON' : 'Individual'}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2">
              <h4 className="font-semibold text-xs text-zinc-200">Recovery Record Settings</h4>
              <p className="text-zinc-400 text-[11px]">
                When enabled, creates parity checksum records to ensure archives can be safely repaired if minor byte corruption occurs during download.
              </p>
              <div className="flex items-center gap-2 text-xs text-zinc-300 mt-2">
                <span className="font-mono text-emerald-400 font-bold">3%</span>
                <span>standard recovery sector margin</span>
              </div>
            </div>
          </div>
        )}

        {/* ================= OPTIONS TAB ================= */}
        {activeTab === 'options' && (
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3">
              <h4 className="font-semibold text-xs text-zinc-200">Post-Compression Actions</h4>
              <label className="flex items-center gap-2.5 cursor-pointer text-zinc-300">
                <input
                  type="checkbox"
                  checked={winrarOptions.deleteFilesAfter || false}
                  onChange={(e) =>
                    setWinrarOptions((prev) => ({
                      ...prev,
                      deleteFilesAfter: e.target.checked,
                    }))
                  }
                  className="rounded accent-emerald-500 w-4 h-4"
                />
                <span>Automatically clear staged files from memory upon successful completion</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer text-zinc-300">
                <input
                  type="checkbox"
                  checked={winrarOptions.testArchive || false}
                  onChange={(e) =>
                    setWinrarOptions((prev) => ({
                      ...prev,
                      testArchive: e.target.checked,
                    }))
                  }
                  className="rounded accent-emerald-500 w-4 h-4"
                />
                <span>Verify file checksums immediately after compression</span>
              </label>
            </div>
          </div>
        )}

        {/* ================= COMMENT TAB ================= */}
        {activeTab === 'comment' && (
          <div className="space-y-3 text-xs">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-semibold text-zinc-300">
                  Enter archive comment manually
                </label>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {(winrarOptions.comment || '').length} characters
                </span>
              </div>
              <textarea
                value={winrarOptions.comment || ''}
                onChange={(e) =>
                  setWinrarOptions((prev) => ({
                    ...prev,
                    comment: e.target.value,
                  }))
                }
                rows={6}
                placeholder="Type an archive description or notes to embed into the archive..."
                className="w-full p-3 rounded-xl bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 font-mono focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Dialog Bottom Action Buttons */}
        <div className="pt-3 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            {winrarOptions.password && (
              <span className="flex items-center gap-1 text-amber-400 text-[11px] font-medium">
                <Lock className="w-3.5 h-3.5" />
                <span>Password set</span>
              </span>
            )}
            {winrarOptions.solid !== false && format === '7z' && (
              <span className="flex items-center gap-1 text-emerald-400 text-[11px] font-medium">
                <Check className="w-3.5 h-3.5" />
                <span>Solid Archive Active</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {onCloseDialog && (
              <button
                type="button"
                onClick={onCloseDialog}
                disabled={isCompressing}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition-colors"
              >
                Cancel
              </button>
            )}

            <button
              type="button"
              onClick={onCompress}
              disabled={isCompressing || fileCount === 0}
              className="px-6 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs transition-all shadow-md shadow-emerald-500/25 flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>OK</span>
            </button>
          </div>
        </div>
      </div>

      {/* ================= SET PASSWORD MODAL ================= */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="rounded-2xl border border-zinc-700 bg-[#16161a] p-5 max-w-sm w-full space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-400" />
                <h4 className="font-semibold text-sm text-zinc-100">Set password</h4>
              </div>
              <button
                onClick={() => setShowPasswordModal(false)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-300 font-medium mb-1">Enter password</label>
                <div className="relative">
                  <input
                    type={pwdShow ? 'text' : 'password'}
                    value={pwdInput}
                    onChange={(e) => setPwdInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-xs text-zinc-100 font-mono focus:border-emerald-500 focus:outline-none"
                    placeholder="Enter archive password"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setPwdShow(!pwdShow)}
                    className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-200"
                  >
                    {pwdShow ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-zinc-300 font-medium mb-1">
                  Re-enter password for verification
                </label>
                <input
                  type={pwdShow ? 'text' : 'password'}
                  value={pwdVerify}
                  onChange={(e) => setPwdVerify(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-xs text-zinc-100 font-mono focus:border-emerald-500 focus:outline-none"
                  placeholder="Repeat password"
                />
              </div>

              <div className="space-y-1.5 pt-1">
                <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pwdShow}
                    onChange={(e) => setPwdShow(e.target.checked)}
                    className="rounded accent-emerald-500 w-3.5 h-3.5"
                  />
                  <span>Show password</span>
                </label>

                <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pwdEncryptNames}
                    onChange={(e) => setPwdEncryptNames(e.target.checked)}
                    className="rounded accent-emerald-500 w-3.5 h-3.5"
                  />
                  <span>Encrypt file names / headers (AES-256)</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setPwdInput('');
                  setPwdVerify('');
                  setWinrarOptions((prev) => ({
                    ...prev,
                    password: undefined,
                    encryptHeader: false,
                  }));
                  setShowPasswordModal(false);
                }}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleSavePassword}
                className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold shadow"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= PROFILES MODAL ================= */}
      {showProfilesModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="rounded-2xl border border-zinc-700 bg-[#16161a] p-5 max-w-md w-full space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-400" />
                <h4 className="font-semibold text-sm text-zinc-100">Compression Profiles</h4>
              </div>
              <button
                onClick={() => setShowProfilesModal(false)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <button
                onClick={() => applyProfile('default')}
                className="w-full p-3 rounded-xl bg-zinc-900/80 hover:bg-zinc-900 border border-zinc-800 text-left transition-colors flex items-center justify-between group"
              >
                <div>
                  <div className="font-semibold text-zinc-100 group-hover:text-emerald-300">
                    Default Profile (Normal LZMA2)
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Solid LZMA2, 16 MB dictionary, optimal balance for everyday archiving
                  </div>
                </div>
                <Check className="w-4 h-4 text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>

              <button
                onClick={() => applyProfile('best')}
                className="w-full p-3 rounded-xl bg-zinc-900/80 hover:bg-zinc-900 border border-zinc-800 text-left transition-colors flex items-center justify-between group"
              >
                <div>
                  <div className="font-semibold text-zinc-100 group-hover:text-emerald-300">
                    Best Compression (Solid Maximum)
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Method 9, 32 MB dictionary, tightest solid archiving & auto test
                  </div>
                </div>
                <Check className="w-4 h-4 text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>

              <button
                onClick={() => applyProfile('fast')}
                className="w-full p-3 rounded-xl bg-zinc-900/80 hover:bg-zinc-900 border border-zinc-800 text-left transition-colors flex items-center justify-between group"
              >
                <div>
                  <div className="font-semibold text-zinc-100 group-hover:text-emerald-300">
                    Fast Backup
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Fast packing with low CPU overhead and 4 MB dictionary
                  </div>
                </div>
                <Check className="w-4 h-4 text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>

              <button
                onClick={() => applyProfile('discord')}
                className="w-full p-3 rounded-xl bg-zinc-900/80 hover:bg-zinc-900 border border-zinc-800 text-left transition-colors flex items-center justify-between group"
              >
                <div>
                  <div className="font-semibold text-zinc-100 group-hover:text-emerald-300">
                    Discord 25 MB Volume Split
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Splits archive into 25 MB multi-part volumes ready for Discord
                  </div>
                </div>
                <Check className="w-4 h-4 text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>

              <button
                onClick={() => applyProfile('secure')}
                className="w-full p-3 rounded-xl bg-zinc-900/80 hover:bg-zinc-900 border border-zinc-800 text-left transition-colors flex items-center justify-between group"
              >
                <div>
                  <div className="font-semibold text-zinc-100 group-hover:text-amber-300">
                    Encrypted Archive (AES-256)
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Military-grade AES-256 payload & header encryption
                  </div>
                </div>
                <Check className="w-4 h-4 text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowProfilesModal(false)}
                className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= HELP MODAL ================= */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="rounded-2xl border border-zinc-700 bg-[#16161a] p-5 max-w-lg w-full space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-emerald-400" />
                <h4 className="font-semibold text-sm text-zinc-100">WinRAR Compression Guide</h4>
              </div>
              <button
                onClick={() => setShowHelpModal(false)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-zinc-300 max-h-80 overflow-y-auto pr-1">
              <div>
                <h5 className="font-semibold text-emerald-400">WinRAR RAR (.rar) Format</h5>
                <p className="text-zinc-400 mt-0.5">
                  Selecting <strong>RAR</strong> packages your files into a solid continuous LZMA2-compressed <code>.rar</code> container. This archive is 100% compatible with <strong>WinRAR</strong>, <strong>7-Zip</strong>, <strong>PeaZip</strong>, and our built-in Decompressor.
                </p>
              </div>

              <div>
                <h5 className="font-semibold text-emerald-400">Solid Archiving</h5>
                <p className="text-zinc-400 mt-0.5">
                  In solid mode, all files are treated as a single continuous data block. This delivers dramatic compression improvements when archiving collections of similar files (e.g. source code, text documents, or repetitive data).
                </p>
              </div>

              <div>
                <h5 className="font-semibold text-emerald-400">Compression Methods</h5>
                <ul className="list-disc pl-4 space-y-1 text-zinc-400 mt-1">
                  <li><strong>Store:</strong> Zero compression, lightning fast packing into single archive.</li>
                  <li><strong>Fastest / Fast:</strong> Lower compression, ideal for quick archives.</li>
                  <li><strong>Normal:</strong> The standard WinRAR algorithm balance.</li>
                  <li><strong>Best:</strong> Maximum solid LZMA2 passes for the smallest possible archive size.</li>
                </ul>
              </div>

              <div>
                <h5 className="font-semibold text-emerald-400">Split to Volumes</h5>
                <p className="text-zinc-400 mt-0.5">
                  Generates numbered parts (.001, .002, etc.) each restricted to your selected file size. These parts can be extracted using WinRAR or the in-app Archive Decompressor.
                </p>
              </div>

              <div>
                <h5 className="font-semibold text-emerald-400">Privacy & Performance</h5>
                <p className="text-zinc-400 mt-0.5">
                  All compression runs directly inside your device's browser memory using WebAssembly. No files are ever sent to any external server.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-zinc-800">
              <button
                onClick={() => setShowHelpModal(false)}
                className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold shadow"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
