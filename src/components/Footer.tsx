import React from 'react';
import { Lock, Database, FileText } from 'lucide-react';
import { ComplianceTab } from './ComplianceModal';

interface FooterProps {
  onOpenCompliance: (tab: ComplianceTab) => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenCompliance }) => {
  return (
    <footer className="mt-auto border-t border-cyan-500/20 bg-[#05070e]/90 text-zinc-400 text-xs py-3 px-4 select-none font-mono">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px]">
        <div className="flex flex-wrap items-center gap-3 text-zinc-400">
          <button
            type="button"
            onClick={() => onOpenCompliance('privacy')}
            className="flex items-center gap-1 hover:text-cyan-300 transition-colors cursor-pointer"
          >
            <Lock className="w-3 h-3 text-cyan-400" />
            <span>Privacy</span>
          </button>
          <span className="text-zinc-700">•</span>
          <button
            type="button"
            onClick={() => onOpenCompliance('terms')}
            className="flex items-center gap-1 hover:text-cyan-300 transition-colors cursor-pointer"
          >
            <FileText className="w-3 h-3 text-emerald-400" />
            <span>Terms</span>
          </button>
          <span className="text-zinc-700">•</span>
          <button
            type="button"
            onClick={() => onOpenCompliance('cookies')}
            className="flex items-center gap-1 hover:text-cyan-300 transition-colors cursor-pointer"
          >
            <Database className="w-3 h-3 text-purple-400" />
            <span>Storage</span>
          </button>
        </div>

        <div className="text-zinc-500 text-[10px]">
          Runs locally in your browser
        </div>
      </div>
    </footer>
  );
};
