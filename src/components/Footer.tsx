import React from 'react';
import { ShieldCheck, Lock, Cookie, FileText, Scale, EyeOff, CheckCircle2, Cpu } from 'lucide-react';
import { ComplianceTab } from './ComplianceModal';

interface FooterProps {
  onOpenCompliance: (tab: ComplianceTab) => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenCompliance }) => {
  return (
    <footer className="mt-auto border-t border-zinc-800 bg-[#09090b] text-zinc-500 text-xs py-4 px-4 select-none">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px]">
        <div className="flex items-center gap-4 text-zinc-400">
          <button
            onClick={() => onOpenCompliance('privacy')}
            className="hover:text-zinc-200 transition-colors"
          >
            Privacy
          </button>
          <span>•</span>
          <button
            onClick={() => onOpenCompliance('terms')}
            className="hover:text-zinc-200 transition-colors"
          >
            Terms
          </button>
          <span>•</span>
          <button
            onClick={() => onOpenCompliance('cookies')}
            className="hover:text-zinc-200 transition-colors"
          >
            Storage & Cache
          </button>
        </div>

        <div className="text-zinc-500 font-mono">
          Local client-side processing
        </div>
      </div>
    </footer>
  );
};
