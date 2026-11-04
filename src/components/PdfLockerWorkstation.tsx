import React, { useState, useRef } from 'react';
import {
  Lock,
  Unlock,
  FileText,
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Eye,
  EyeOff,
  Download,
  Sparkles,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  Sliders,
  Stamp,
  FileCheck2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Wand2,
} from 'lucide-react';
import {
  PdfPermissions,
  PdfInspectionResult,
  DEFAULT_PDF_PERMISSIONS,
  inspectPdfBuffer,
  lockPdfDocument,
  unlockPdfDocument,
  generateSampleClassifiedPdf,
  encodePermissionsMask,
} from '../utils/pdfLockerEngine';
import { formatBytes } from '../utils/ffmpegBuilder';

export type PdfVaultMode = 'lock' | 'unlock';

interface PdfLockerWorkstationProps {
  onLog?: (type: 'stdout' | 'stderr' | 'system' | 'error', message: string) => void;
}

export const PdfLockerWorkstation: React.FC<PdfLockerWorkstationProps> = ({ onLog }) => {
  const [mode, setMode] = useState<PdfVaultMode>('lock');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [rawBytes, setRawBytes] = useState<Uint8Array | null>(null);
  const [inspection, setInspection] = useState<PdfInspectionResult | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [isGeneratingSample, setIsGeneratingSample] = useState(false);

  // Lock settings
  const [userPassword, setUserPassword] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [showUserPassword, setShowUserPassword] = useState(false);
  const [showOwnerPassword, setShowOwnerPassword] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [encryptionAlgorithm, setEncryptionAlgorithm] = useState<'rc4-128' | 'aes-128'>('rc4-128');
  const [permissions, setPermissions] = useState<PdfPermissions>(DEFAULT_PDF_PERMISSIONS);
  const [scrubMetadata, setScrubMetadata] = useState(true);
  const [watermarkText, setWatermarkText] = useState('');

  // Unlock settings
  const [unlockPassword, setUnlockPassword] = useState('');
  const [showUnlockPassword, setShowUnlockPassword] = useState(false);

  // Processing & output state
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [outputBytes, setOutputBytes] = useState<Uint8Array | null>(null);
  const [outputFileName, setOutputFileName] = useState<string>('');
  const [outputMode, setOutputMode] = useState<'locked' | 'unlocked' | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const logEvent = (type: 'stdout' | 'stderr' | 'system' | 'error', text: string) => {
    if (onLog) onLog(type, text);
  };

  const handleLoadPdfFile = async (file: File) => {
    setErrorMsg(null);
    setOutputBytes(null);
    setOutputMode(null);
    setIsInspecting(true);

    try {
      const arrayBuf = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      const info = await inspectPdfBuffer(bytes, file.name);

      setPdfFile(file);
      setRawBytes(bytes);
      setInspection(info);

      if (info.isEncrypted) {
        setMode('unlock');
        logEvent(
          'system',
          `[PDF VAULT] Loaded encrypted PDF "${file.name}" (${info.pageCount} pages, ${info.encryptionDetails?.cipher || 'Standard Security'}). Switched to Unlock mode.`
        );
      } else {
        setMode('lock');
        logEvent(
          'system',
          `[PDF VAULT] Loaded unencrypted PDF "${file.name}" (${info.pageCount} pages, ${formatBytes(file.size)}). Ready for cryptographic lock.`
        );
      }
    } catch (err: any) {
      const msg = err?.message || 'Could not parse PDF file. Ensure it is a valid PDF document.';
      setErrorMsg(msg);
      logEvent('error', `[PDF VAULT] Inspection failed: ${msg}`);
    } finally {
      setIsInspecting(false);
    }
  };

  const handleGenerateSamplePdf = async () => {
    setIsGeneratingSample(true);
    setErrorMsg(null);
    try {
      logEvent('system', '[PDF VAULT] Synthesizing 2-page classified sample PDF document in browser...');
      const sample = await generateSampleClassifiedPdf();
      await handleLoadPdfFile(sample);
      if (!userPassword) {
        setUserPassword('cyber2026');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to synthesize sample PDF.');
    } finally {
      setIsGeneratingSample(false);
    }
  };

  const handleGenerateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
    const rand = new Uint8Array(16);
    crypto.getRandomValues(rand);
    let out = '';
    for (let i = 0; i < 16; i++) {
      out += chars[rand[i] % chars.length];
    }
    setUserPassword(out);
    setShowUserPassword(true);
    logEvent('system', '[PDF VAULT] Generated 16-character high-entropy cryptographic user key.');
  };

  const handleCopyPassword = () => {
    if (!userPassword) return;
    navigator.clipboard.writeText(userPassword);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const applyPermissionPreset = (preset: 'strict' | 'print-only' | 'forms' | 'all') => {
    if (preset === 'strict') {
      setPermissions({
        allowPrinting: false,
        allowHighResPrinting: false,
        allowModifying: false,
        allowCopying: false,
        allowAnnotating: false,
        allowFillingForms: false,
        allowAccessibility: false,
        allowAssembly: false,
      });
    } else if (preset === 'print-only') {
      setPermissions({
        allowPrinting: true,
        allowHighResPrinting: true,
        allowModifying: false,
        allowCopying: false,
        allowAnnotating: false,
        allowFillingForms: false,
        allowAccessibility: true,
        allowAssembly: false,
      });
    } else if (preset === 'forms') {
      setPermissions({
        allowPrinting: true,
        allowHighResPrinting: true,
        allowModifying: false,
        allowCopying: false,
        allowAnnotating: true,
        allowFillingForms: true,
        allowAccessibility: true,
        allowAssembly: false,
      });
    } else {
      setPermissions({
        allowPrinting: true,
        allowHighResPrinting: true,
        allowModifying: true,
        allowCopying: true,
        allowAnnotating: true,
        allowFillingForms: true,
        allowAccessibility: true,
        allowAssembly: true,
      });
    }
  };

  const handleLockPdf = async () => {
    if (!rawBytes || !pdfFile) return;
    if (!userPassword && !ownerPassword) {
      setErrorMsg('Please enter a User Open Password (or Owner Master Password) to lock this PDF.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);
    setOutputBytes(null);
    const start = performance.now();

    try {
      logEvent(
        'system',
        `[PDF VAULT] Encrypting "${pdfFile.name}" with ${encryptionAlgorithm.toUpperCase()} Standard Security Handler...`
      );
      const locked = await lockPdfDocument(rawBytes, {
        userPassword,
        ownerPassword: ownerPassword || userPassword,
        encryptionAlgorithm,
        permissions,
        scrubMetadata,
        watermarkText,
      });

      const elapsed = Math.round(performance.now() - start);
      const baseName = pdfFile.name.replace(/\.pdf$/i, '');
      const finalName = `${baseName}_locked.pdf`;

      setOutputBytes(locked);
      setOutputFileName(finalName);
      setOutputMode('locked');
      setElapsedMs(elapsed);

      logEvent(
        'system',
        `[PDF VAULT] Successfully locked "${finalName}" (${formatBytes(locked.byteLength)}) in ${elapsed} ms.`
      );
    } catch (err: any) {
      const msg =
        err?.message ||
        'Failed to encrypt PDF. If the source PDF is already password-protected, switch to Unlock PDF first.';
      setErrorMsg(msg);
      logEvent('error', `[PDF VAULT] Lock error: ${msg}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUnlockPdf = async () => {
    if (!rawBytes || !pdfFile) return;
    if (!unlockPassword) {
      setErrorMsg('Please enter the PDF password to authenticate and unlock this document.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);
    setOutputBytes(null);
    const start = performance.now();

    try {
      logEvent('system', `[PDF VAULT] Authenticating key and decrypting "${pdfFile.name}"...`);
      const unlocked = await unlockPdfDocument(rawBytes, unlockPassword);
      const elapsed = Math.round(performance.now() - start);
      const baseName = pdfFile.name.replace(/(_locked)?\.pdf$/i, '');
      const finalName = `${baseName}_unlocked.pdf`;

      setOutputBytes(unlocked);
      setOutputFileName(finalName);
      setOutputMode('unlocked');
      setElapsedMs(elapsed);

      logEvent(
        'system',
        `[PDF VAULT] Successfully unlocked "${finalName}" (${formatBytes(unlocked.byteLength)}) in ${elapsed} ms.`
      );
    } catch (err: any) {
      const msg = err?.message || 'Invalid password or unsupported PDF encryption revision.';
      setErrorMsg(msg);
      logEvent('error', `[PDF VAULT] Unlock error: ${msg}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadOutput = () => {
    if (!outputBytes || !outputFileName) return;
    const blob = new Blob([outputBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = outputFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }, 10000);
  };

  const handleLoadOutputIntoVault = async () => {
    if (!outputBytes || !outputFileName) return;
    const nextFile = new File([outputBytes], outputFileName, { type: 'application/pdf' });
    if (outputMode === 'locked' && userPassword) {
      setUnlockPassword(userPassword);
    }
    await handleLoadPdfFile(nextFile);
  };

  const handleClear = () => {
    setPdfFile(null);
    setRawBytes(null);
    setInspection(null);
    setOutputBytes(null);
    setOutputMode(null);
    setErrorMsg(null);
  };

  // Password strength calculation
  const getPasswordStrength = (pwd: string): { label: string; color: string; percent: number } => {
    if (!pwd) return { label: 'NO KEY SET', color: 'bg-zinc-700', percent: 0 };
    let score = 0;
    if (pwd.length >= 6) score += 25;
    if (pwd.length >= 10) score += 25;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score += 20;
    if (/\d/.test(pwd)) score += 15;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 15;
    if (score < 40) return { label: 'WEAK KEY', color: 'bg-amber-500', percent: 35 };
    if (score < 75) return { label: 'MODERATE KEY', color: 'bg-cyan-400', percent: 70 };
    return { label: 'HIGH-ENTROPY KEY', color: 'bg-emerald-400', percent: 100 };
  };

  const pwdStrength = getPasswordStrength(userPassword);
  const currentMaskHex =
    '0x' + (encodePermissionsMask(permissions) >>> 0).toString(16).toUpperCase().padStart(8, '0');

  return (
    <div className="space-y-4 font-mono">
      {/* Top Mode Bar */}
      <div className="cyber-panel rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 bg-[#04060c] p-1 rounded-xl border border-cyan-500/25">
          <button
            type="button"
            onClick={() => {
              setMode('lock');
              setErrorMsg(null);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              mode === 'lock'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 shadow-[0_0_12px_rgba(0,240,255,0.2)]'
                : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
            }`}
          >
            <Lock className="w-4 h-4 text-cyan-400" />
            <span>Lock & Encrypt PDF</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('unlock');
              setErrorMsg(null);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              mode === 'unlock'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/50 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
            }`}
          >
            <Unlock className="w-4 h-4 text-emerald-400" />
            <span>Unlock & Decrypt PDF</span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-zinc-400">
          <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>ISO 32000-1 Standard Security Handler • 100% Client-Side Zero-Cloud</span>
        </div>
      </div>

      {/* Error Alert */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/80 text-red-200 text-xs flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-bold text-red-400 uppercase tracking-wider">
              PDF Cryptographic Vault Alert
            </div>
            <p className="mt-1 text-red-300/90">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Dropzone if no PDF loaded */}
      {!pdfFile || !inspection ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) handleLoadPdfFile(f);
          }}
          className="relative rounded-2xl border transition-all duration-200 p-8 sm:p-10 flex flex-col items-center justify-center text-center select-none overflow-hidden cyber-panel hover:border-cyan-400/60 cursor-pointer group"
        >
          <div className="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-cyan-400/60 pointer-events-none" />
          <div className="absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 border-cyan-400/60 pointer-events-none" />
          <div className="absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 border-cyan-400/60 pointer-events-none" />
          <div className="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-cyan-400/60 pointer-events-none" />

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleLoadPdfFile(f);
              e.target.value = '';
            }}
            className="hidden"
          />

          <div className="w-16 h-16 rounded-2xl bg-[#040711] border border-cyan-500/40 flex items-center justify-center mb-4 text-cyan-400 group-hover:scale-105 group-hover:border-cyan-300 transition-all shadow-[0_0_25px_rgba(0,240,255,0.15)]">
            {mode === 'lock' ? <Lock className="w-7 h-7" /> : <Unlock className="w-7 h-7 text-emerald-400" />}
          </div>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-[10px] font-bold text-cyan-300 uppercase tracking-widest mb-2">
            <KeyRound className="w-3 h-3" />
            <span>ZERO-CLOUD PDF CRYPTOGRAPHIC VAULT</span>
          </div>

          <h2 className="text-lg sm:text-xl font-bold text-zinc-100 tracking-wide uppercase">
            {mode === 'lock'
              ? 'Drop PDF Document to Password-Lock'
              : 'Drop Encrypted PDF Document to Unlock'}
          </h2>

          <p className="text-xs sm:text-sm text-zinc-400 mt-1.5 max-w-lg font-sans">
            Encrypt PDFs with ISO 32000-1 User & Owner passwords, granular permission bitmasks
            (Disable Copy, Print, or Edit), and security watermarks — or unlock protected PDFs
            entirely in-browser.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="cyber-btn-primary px-6 py-2.5 rounded-xl text-xs flex items-center gap-2 cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              <span>Select Local .PDF File</span>
            </button>

            <button
              type="button"
              disabled={isGeneratingSample || isInspecting}
              onClick={(e) => {
                e.stopPropagation();
                handleGenerateSamplePdf();
              }}
              className="px-4 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/50 text-emerald-300 text-xs font-bold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {isGeneratingSample ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 text-emerald-400" />
              )}
              <span>Generate Sample Classified PDF</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* 1. PDF Document Inspector Header */}
          <div className="cyber-panel rounded-xl p-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-500/20 pb-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                    inspection.isEncrypted
                      ? 'bg-amber-500/15 border-amber-400/50 text-amber-300'
                      : 'bg-cyan-500/15 border-cyan-400/50 text-cyan-300'
                  }`}
                >
                  {inspection.isEncrypted ? (
                    <Lock className="w-5 h-5" />
                  ) : (
                    <FileText className="w-5 h-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-zinc-100 truncate">
                      {inspection.fileName}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                        inspection.isEncrypted
                          ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                          : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      }`}
                    >
                      {inspection.isEncrypted ? 'ENCRYPTED // LOCKED' : 'UNENCRYPTED // OPEN'}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400 flex items-center gap-2 mt-0.5 flex-wrap">
                    <span>Size: {formatBytes(inspection.fileSize)}</span>
                    <span>•</span>
                    <span>Pages: {inspection.pageCount}</span>
                    {inspection.pageDimensions && (
                      <>
                        <span>•</span>
                        <span>
                          {Math.round(inspection.pageDimensions.width)} ×{' '}
                          {Math.round(inspection.pageDimensions.height)} pt
                        </span>
                      </>
                    )}
                    {inspection.title && (
                      <>
                        <span>•</span>
                        <span className="text-cyan-300 truncate max-w-xs">
                          Title: "{inspection.title}"
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => pdfFile && handleLoadPdfFile(pdfFile)}
                  className="px-2.5 py-1.5 rounded-lg bg-cyan-950/50 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-500/30 transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Re-inspect PDF trailer and security dictionary"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isInspecting ? 'animate-spin' : ''}`} />
                  <span>Re-Probe</span>
                </button>

                <button
                  type="button"
                  onClick={handleClear}
                  className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-red-950/50 text-zinc-300 hover:text-red-300 border border-zinc-800 hover:border-red-500/40 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  <span>Remove PDF</span>
                </button>
              </div>
            </div>

            {/* If encrypted, display detected security dictionary telemetry */}
            {inspection.isEncrypted && inspection.encryptionDetails && (
              <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-2 text-amber-200">
                  <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    Detected Security Handler:{' '}
                    <strong className="text-amber-300">{inspection.encryptionDetails.cipher}</strong>{' '}
                    (V={inspection.encryptionDetails.version}, R={inspection.encryptionDetails.revision},{' '}
                    {inspection.encryptionDetails.keyLengthBits}-bit)
                  </span>
                </div>
                <span className="text-amber-300/90 font-mono">
                  Permissions Mask: {inspection.encryptionDetails.permissionsMask}
                </span>
              </div>
            )}
          </div>

          {/* 2. Output Result Banner (if locked or unlocked) */}
          {outputBytes && outputMode && (
            <div className="cyber-panel-emerald rounded-xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-emerald-500/20 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-400/50 flex items-center justify-center text-emerald-400 shrink-0">
                    <FileCheck2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-base font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                      <span>
                        {outputMode === 'locked'
                          ? 'PDF CRYPTOGRAPHICALLY LOCKED //'
                          : 'PDF SUCCESSFULLY UNLOCKED //'}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px]">
                        {elapsedMs} ms
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      Output: <strong className="text-emerald-300">{outputFileName}</strong> (
                      {formatBytes(outputBytes.byteLength)})
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadOutput}
                    className="cyber-btn-primary px-5 py-2.5 rounded-lg text-xs flex items-center gap-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download {outputMode === 'locked' ? 'Locked' : 'Unlocked'} PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleLoadOutputIntoVault}
                    className="px-3.5 py-2.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Load this generated PDF back into the inspector to verify its lock/unlock state"
                  >
                    <span>
                      {outputMode === 'locked'
                        ? 'Verify & Test Unlock →'
                        : 'Verify Unlocked PDF →'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 3. Main Controls: LOCK MODE vs UNLOCK MODE */}
          {mode === 'lock' ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Left Column: Passwords, Cipher & Watermark */}
              <div className="cyber-panel rounded-xl p-4 space-y-4 text-xs">
                <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2.5">
                  <div className="flex items-center gap-2 font-bold text-sm text-cyan-300">
                    <KeyRound className="w-4 h-4 text-cyan-400" />
                    <span>1. CRYPTOGRAPHIC KEYS & CIPHER</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateRandomPassword}
                    className="px-2.5 py-1 rounded bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/40 text-cyan-300 text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Wand2 className="w-3 h-3" />
                    <span>Generate Cyber Key</span>
                  </button>
                </div>

                {/* User Open Password */}
                <div className="space-y-1.5">
                  <label className="text-[11px] text-zinc-300 font-bold uppercase tracking-wider flex items-center justify-between">
                    <span>User Open Password (Required to View PDF)</span>
                    <span className="text-[10px] text-cyan-400">{pwdStrength.label}</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <div className="relative flex-1">
                      <input
                        type={showUserPassword ? 'text' : 'password'}
                        value={userPassword}
                        onChange={(e) => setUserPassword(e.target.value)}
                        placeholder="Enter password required to open PDF..."
                        className="w-full bg-[#040711] border border-cyan-500/35 focus:border-cyan-400 rounded-lg px-3 py-2 pr-9 text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowUserPassword(!showUserPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-cyan-300 cursor-pointer"
                        title={showUserPassword ? 'Hide password' : 'Show password'}
                      >
                        {showUserPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleCopyPassword}
                      disabled={!userPassword}
                      className="px-3 py-2 rounded-lg bg-[#040711] hover:bg-cyan-950/50 border border-cyan-500/30 text-cyan-300 disabled:opacity-40 transition-colors flex items-center gap-1 cursor-pointer"
                      title="Copy password to clipboard"
                    >
                      {copiedKey ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-[11px] text-emerald-300">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span className="text-[11px]">Copy</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Strength bar */}
                  <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${pwdStrength.color}`}
                      style={{ width: `${pwdStrength.percent}%` }}
                    />
                  </div>
                </div>

                {/* Owner Master Password */}
                <div className="space-y-1.5">
                  <label className="text-[11px] text-zinc-400 uppercase tracking-wider block">
                    Owner Master Password (Optional — Enforces Permission Restrictions)
                  </label>
                  <div className="relative">
                    <input
                      type={showOwnerPassword ? 'text' : 'password'}
                      value={ownerPassword}
                      onChange={(e) => setOwnerPassword(e.target.value)}
                      placeholder="Defaults to User Password if left blank..."
                      className="w-full bg-[#040711] border border-zinc-800 focus:border-cyan-400 rounded-lg px-3 py-2 pr-9 text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOwnerPassword(!showOwnerPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-cyan-300 cursor-pointer"
                    >
                      {showOwnerPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Cipher Algorithm Selector */}
                <div className="space-y-1.5">
                  <label className="text-[11px] text-zinc-400 uppercase tracking-wider block">
                    PDF Standard Security Cipher
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setEncryptionAlgorithm('rc4-128')}
                      className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                        encryptionAlgorithm === 'rc4-128'
                          ? 'bg-cyan-500/15 border-cyan-400 text-cyan-200'
                          : 'bg-[#040711] border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <div className="font-bold text-xs text-cyan-300">RC4-128 (V2 / R3)</div>
                      <div className="text-[10px] text-zinc-400 mt-0.5">
                        Maximum compatibility across all PDF viewers
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEncryptionAlgorithm('aes-128')}
                      className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                        encryptionAlgorithm === 'aes-128'
                          ? 'bg-emerald-500/15 border-emerald-400 text-emerald-200'
                          : 'bg-[#040711] border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <div className="font-bold text-xs text-emerald-300">AES-128 (V4 / AESV2)</div>
                      <div className="text-[10px] text-zinc-400 mt-0.5">
                        ISO 32000-1 CryptFilter with 16-byte random IV
                      </div>
                    </button>
                  </div>
                </div>

                {/* Diagonal Security Stamp & Metadata Scrubber */}
                <div className="pt-2 border-t border-cyan-500/20 space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-zinc-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
                        <Stamp className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Diagonal Security Stamp (Optional)</span>
                      </label>
                      <div className="flex items-center gap-1">
                        {['', 'CONFIDENTIAL', 'CLASSIFIED // DO NOT COPY', 'DRAFT'].map((preset) => (
                          <button
                            key={preset || 'none'}
                            type="button"
                            onClick={() => setWatermarkText(preset)}
                            className={`px-1.5 py-0.5 rounded text-[9px] uppercase border transition-colors cursor-pointer ${
                              watermarkText === preset
                                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold'
                                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            {preset === ''
                              ? 'None'
                              : preset === 'CLASSIFIED // DO NOT COPY'
                              ? 'Classified'
                              : preset}
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      type="text"
                      value={watermarkText}
                      onChange={(e) => setWatermarkText(e.target.value)}
                      placeholder="Optional watermark stamped across all pages before encryption..."
                      className="w-full bg-[#040711] border border-zinc-800 focus:border-cyan-400 rounded-lg px-3 py-1.5 text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
                    />
                  </div>

                  <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#040711] border border-cyan-500/25 cursor-pointer">
                    <div>
                      <div className="text-zinc-200 font-bold text-xs">
                        Zero-Trace Metadata Scrubbing
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        Strip Author, Title, Subject & Keywords before encrypting objects
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={scrubMetadata}
                      onChange={(e) => setScrubMetadata(e.target.checked)}
                      className="rounded bg-zinc-900 border-cyan-500/40 text-cyan-400 focus:ring-0 w-4 h-4 cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              {/* Right Column: ISO 32000-1 Permission Bitmask Matrix */}
              <div className="cyber-panel rounded-xl p-4 space-y-4 text-xs flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-500/20 pb-2.5">
                    <div className="flex items-center gap-2 font-bold text-sm text-emerald-300">
                      <Sliders className="w-4 h-4 text-emerald-400" />
                      <span>2. PERMISSION BITMASK MATRIX</span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px]">
                      /P = {currentMaskHex}
                    </span>
                  </div>

                  {/* Quick Permission Presets */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] text-zinc-400 uppercase mr-1">Presets:</span>
                    <button
                      type="button"
                      onClick={() => applyPermissionPreset('strict')}
                      className="px-2.5 py-1 rounded bg-red-500/15 hover:bg-red-500/25 border border-red-500/35 text-red-300 text-[10px] font-bold cursor-pointer"
                    >
                      Strict Lockdown
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPermissionPreset('print-only')}
                      className="px-2.5 py-1 rounded bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/35 text-cyan-300 text-[10px] font-bold cursor-pointer"
                    >
                      Print Only (No Copy)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPermissionPreset('forms')}
                      className="px-2.5 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 text-[10px] font-bold cursor-pointer"
                    >
                      Forms + Print
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPermissionPreset('all')}
                      className="px-2.5 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 text-[10px] font-bold cursor-pointer"
                    >
                      Allow All
                    </button>
                  </div>

                  {/* 8 Individual Bitmask Checkboxes */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      {
                        key: 'allowPrinting' as keyof PdfPermissions,
                        label: 'Allow Printing',
                        bit: 'Bit 3 (0x004)',
                      },
                      {
                        key: 'allowHighResPrinting' as keyof PdfPermissions,
                        label: 'High-Res Faithful Print',
                        bit: 'Bit 12 (0x800)',
                      },
                      {
                        key: 'allowCopying' as keyof PdfPermissions,
                        label: 'Allow Copy Text/Graphics',
                        bit: 'Bit 5 (0x010)',
                      },
                      {
                        key: 'allowModifying' as keyof PdfPermissions,
                        label: 'Allow Document Edits',
                        bit: 'Bit 4 (0x008)',
                      },
                      {
                        key: 'allowAnnotating' as keyof PdfPermissions,
                        label: 'Allow Annotations',
                        bit: 'Bit 6 (0x020)',
                      },
                      {
                        key: 'allowFillingForms' as keyof PdfPermissions,
                        label: 'Allow Form Field Entry',
                        bit: 'Bit 9 (0x100)',
                      },
                      {
                        key: 'allowAccessibility' as keyof PdfPermissions,
                        label: 'Screen Reader Access',
                        bit: 'Bit 10 (0x200)',
                      },
                      {
                        key: 'allowAssembly' as keyof PdfPermissions,
                        label: 'Page Insert / Rotate',
                        bit: 'Bit 11 (0x400)',
                      },
                    ].map((item) => {
                      const checked = permissions[item.key];
                      return (
                        <label
                          key={item.key}
                          className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 cursor-pointer transition-all ${
                            checked
                              ? 'bg-emerald-500/10 border-emerald-500/40 text-zinc-100'
                              : 'bg-[#040711] border-zinc-800/90 text-zinc-400'
                          }`}
                        >
                          <div>
                            <div className="font-bold text-[11px]">{item.label}</div>
                            <div className="text-[9px] text-zinc-500">{item.bit}</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setPermissions((prev) => ({
                                ...prev,
                                [item.key]: e.target.checked,
                              }))
                            }
                            className="rounded bg-zinc-900 border-zinc-700 text-emerald-500 focus:ring-0 w-4 h-4 cursor-pointer"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Execute Lock Button */}
                <div className="pt-4 border-t border-cyan-500/20 flex items-center justify-between gap-3">
                  <div className="text-[11px] text-zinc-400">
                    Cipher: <strong className="text-cyan-300">{encryptionAlgorithm.toUpperCase()}</strong>
                  </div>
                  <button
                    type="button"
                    disabled={isProcessing || (!userPassword && !ownerPassword)}
                    onClick={handleLockPdf}
                    className="cyber-btn-primary px-6 py-3 rounded-xl text-xs flex items-center gap-2 cursor-pointer disabled:opacity-40"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Encrypting PDF Objects...</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        <span>Lock & Encrypt PDF Now</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* UNLOCK MODE PANEL */
            <div className="cyber-panel rounded-xl p-5 space-y-4 text-xs max-w-2xl">
              <div className="flex items-center gap-2.5 border-b border-cyan-500/20 pb-3">
                <Unlock className="w-5 h-5 text-emerald-400" />
                <div>
                  <div className="font-bold text-sm text-emerald-300 uppercase tracking-wider">
                    DECRYPT & REMOVE PDF PASSWORD PROTECTION
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Enter either the User Open Password or Owner Master Password to strip the{' '}
                    <code>/Encrypt</code> dictionary and export a permanently unlocked PDF.
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] text-zinc-300 font-bold uppercase tracking-wider block">
                  PDF Authentication Password
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showUnlockPassword ? 'text' : 'password'}
                      value={unlockPassword}
                      onChange={(e) => setUnlockPassword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && unlockPassword) {
                          handleUnlockPdf();
                        }
                      }}
                      placeholder="Enter User or Owner password to unlock..."
                      className="w-full bg-[#040711] border border-emerald-500/40 focus:border-emerald-400 rounded-lg px-3.5 py-2.5 pr-10 text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowUnlockPassword(!showUnlockPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-emerald-300 cursor-pointer"
                    >
                      {showUnlockPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={isProcessing || !unlockPassword}
                    onClick={handleUnlockPdf}
                    className="cyber-btn-primary px-6 py-2.5 rounded-lg text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Decrypting...</span>
                      </>
                    ) : (
                      <>
                        <Unlock className="w-4 h-4" />
                        <span>Unlock PDF Now</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
