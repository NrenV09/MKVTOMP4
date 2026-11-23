import React, { useState } from 'react';
import { Archive, FolderArchive } from 'lucide-react';
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
      <div className="p-1.5 rounded-xl cyber-panel flex flex-wrap items-center gap-1.5 max-w-fit font-mono">
        <button
          type="button"
          onClick={() => setActiveTab('compress')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'compress'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent'
          }`}
        >
          <Archive className="w-4 h-4" />
          <span>Compress</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('decompress')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'decompress'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/50'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent'
          }`}
        >
          <FolderArchive className="w-4 h-4" />
          <span>Extract</span>
        </button>
      </div>

      {activeTab === 'compress' ? <ArchiveCompressor /> : <ArchiveDecompressor />}
    </div>
  );
};
