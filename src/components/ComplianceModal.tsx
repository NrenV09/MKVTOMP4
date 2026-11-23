import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  FileText,
  Database,
  X,
  Lock,
  Cpu,
} from 'lucide-react';

export type ComplianceTab = 'privacy' | 'terms' | 'cookies' | 'attribution';

interface ComplianceModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: ComplianceTab;
}

export const ComplianceModal: React.FC<ComplianceModalProps> = ({
  isOpen,
  onClose,
  defaultTab = 'privacy',
}) => {
  const [activeTab, setActiveTab] = useState<ComplianceTab>(defaultTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab);
    }
  }, [defaultTab, isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="compliance-modal-title"
    >
      <div className="bg-[#121215] border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden text-zinc-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h2 id="compliance-modal-title" className="text-sm font-semibold text-zinc-100">
              Privacy, Storage & Terms
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 pt-2 border-b border-zinc-800 bg-zinc-900/40 overflow-x-auto text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'privacy'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Privacy</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('cookies')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'cookies'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Storage</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('terms')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'terms'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Terms</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('attribution')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'attribution'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Licenses</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs sm:text-sm text-zinc-300 leading-relaxed">
          {activeTab === 'privacy' && (
            <div className="space-y-3">
              <p>
                All video, audio, archive, and PDF files are processed locally on your device. Files are never uploaded to a server.
              </p>
              <p className="text-zinc-400">
                No accounts, analytics, or tracking cookies are used. Closing the tab or clearing memory removes temporary working files.
              </p>
            </div>
          )}

          {activeTab === 'cookies' && (
            <div className="space-y-3">
              <p>
                This app stores WebAssembly binaries locally in IndexedDB and Cache Storage so tools load offline without re-downloading.
              </p>
              <p className="text-zinc-400">
                Temporary buffers used during conversion stay in browser memory or OPFS and are deleted after export or when you clear memory.
              </p>
            </div>
          )}

          {activeTab === 'terms' && (
            <div className="space-y-3">
              <p>
                Only process media, archives, and documents that you own or have permission to use.
              </p>
              <p className="text-zinc-400">
                This software is provided as-is without warranty of any kind.
              </p>
            </div>
          )}

          {activeTab === 'attribution' && (
            <ul className="list-disc pl-5 space-y-2 text-zinc-400">
              <li><strong className="text-zinc-200">FFmpeg / FFmpeg.wasm</strong> — LGPL v2.1+ / MIT</li>
              <li><strong className="text-zinc-200">7-Zip / UnRAR WebAssembly</strong> — Local archive support</li>
              <li><strong className="text-zinc-200">pdf-lib</strong> — Local PDF editing and encryption</li>
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-950/80 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
