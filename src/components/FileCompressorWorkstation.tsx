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
      <div className="p-1 rounded-xl bg-[#121215] border border-zinc-800 flex items-center justify-start gap-1 shadow-lg max-w-fit">
        <button
          onClick={() => setActiveTab('compress')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'compress'
              ? 'bg-emerald-500 text-zinc-950 shadow-md'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
          }`}
        >
          <Archive className="w-4 h-4" />
          <span>Compress</span>
        </button>

        <button
          onClick={() => setActiveTab('decompress')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'decompress'
              ? 'bg-emerald-500 text-zinc-950 shadow-md'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
          }`}
        >
          <FolderArchive className="w-4 h-4" />
          <span>Extract</span>
        </button>
      </div>

      {/* Active Tab View */}
      {activeTab === 'compress' ? <ArchiveCompressor /> : <ArchiveDecompressor />}
    </div>
  );
};
