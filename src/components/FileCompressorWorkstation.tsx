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
      <div className="p-1.5 rounded-xl cyber-panel flex items-center justify-start gap-1.5 shadow-lg max-w-fit font-mono">
        <button
          onClick={() => setActiveTab('compress')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'compress'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 shadow-[0_0_12px_rgba(0,240,255,0.2)]'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent'
          }`}
        >
          <Archive className="w-4 h-4" />
          <span>Compress Archive</span>
        </button>

        <button
          onClick={() => setActiveTab('decompress')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'decompress'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/50 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent'
          }`}
        >
          <FolderArchive className="w-4 h-4" />
          <span>Extract Archive</span>
        </button>
      </div>

      {/* Active Tab View */}
      {activeTab === 'compress' ? <ArchiveCompressor /> : <ArchiveDecompressor />}
    </div>
  );
};
