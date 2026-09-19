import React, { useState } from 'react';
import { Archive, FolderArchive, Sparkles, Layers, ShieldCheck, Zap } from 'lucide-react';
import { ArchiveCompressor } from './ArchiveCompressor';
import { ArchiveDecompressor } from './ArchiveDecompressor';

export type ArchiveTab = 'compress' | 'decompress';

interface FileCompressorWorkstationProps {
  defaultTab?: ArchiveTab;
}

export const FileCompressorWorkstation: React.FC<FileCompressorWorkstationProps> = ({
  defaultTab = 'compress',
}) => {
  const [activeTab, setActiveTab] = useState<ArchiveTab>(defaultTab);

  return (
    <div className="space-y-4">
      {/* Top Mode Selector Tabs */}
      <div className="p-1.5 rounded-2xl bg-[#121215] border border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('compress')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'compress'
                ? 'bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/20'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
            }`}
          >
            <Archive className="w-4 h-4" />
            <span>File Compressor</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                activeTab === 'compress'
                  ? 'bg-emerald-600/30 text-zinc-950 font-bold'
                  : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              7Z • ZIP • TAR • GZ
            </span>
          </button>

          <button
            onClick={() => setActiveTab('decompress')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'decompress'
                ? 'bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/20'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
            }`}
          >
            <FolderArchive className="w-4 h-4" />
            <span>Archive Decompressor</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                activeTab === 'decompress'
                  ? 'bg-emerald-600/30 text-zinc-950 font-bold'
                  : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              7Z • RAR • ZIP • TAR
            </span>
          </button>
        </div>

        {/* Feature Badges */}
        <div className="hidden lg:flex items-center gap-3 pr-2 text-xs font-mono text-zinc-400">
          <div className="flex items-center gap-1 text-emerald-400">
            <Zap className="w-3.5 h-3.5" />
            <span>7-Zip & UnRAR WASM Engines</span>
          </div>
          <span className="text-zinc-700">|</span>
          <div className="flex items-center gap-1 text-zinc-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>100% In-Browser Memory</span>
          </div>
        </div>
      </div>

      {/* Active Tab View */}
      {activeTab === 'compress' ? <ArchiveCompressor /> : <ArchiveDecompressor />}
    </div>
  );
};
