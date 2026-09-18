import React from 'react';
import { ShieldCheck, Lock, Cookie, FileText, Scale, EyeOff, CheckCircle2, Cpu } from 'lucide-react';
import { ComplianceTab } from './ComplianceModal';

interface FooterProps {
  onOpenCompliance: (tab: ComplianceTab) => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenCompliance }) => {
  return (
    <footer className="mt-auto border-t border-zinc-850 bg-[#09090b] text-zinc-400 text-xs py-6 px-4 select-none">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Compliance Badges Matrix */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/80 flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
              <EyeOff className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="font-semibold text-zinc-200 text-xs">100% Client-Side</div>
              <div className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                Files are processed locally in RAM via WebAssembly. Zero server uploads.
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/80 flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0 mt-0.5">
              <Cookie className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="font-semibold text-zinc-200 text-xs">Zero Tracking Cookies</div>
              <div className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                No tracking cookies or analytics pixels. Only local offline Wasm cache.
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/80 flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0 mt-0.5">
              <Scale className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="font-semibold text-zinc-200 text-xs">Free & Open Utility</div>
              <div className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                No subscriptions, charges, or hidden paywalls. 100% free web utility.
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/80 flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="font-semibold text-zinc-200 text-xs">WCAG AA Accessible</div>
              <div className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                High-contrast typography, keyboard navigation, and full ARIA support.
              </div>
            </div>
          </div>
        </div>

        {/* Legal Links & Disclaimers */}
        <div className="pt-3 border-t border-zinc-850 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-5 gap-y-2 text-[11px]">
            <button
              onClick={() => onOpenCompliance('privacy')}
              className="hover:text-emerald-400 transition-colors underline-offset-4 hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
            >
              Privacy Policy
            </button>
            <span className="text-zinc-700">•</span>
            <button
              onClick={() => onOpenCompliance('terms')}
              className="hover:text-emerald-400 transition-colors underline-offset-4 hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
            >
              Terms of Service
            </button>
            <span className="text-zinc-700">•</span>
            <button
              onClick={() => onOpenCompliance('cookies')}
              className="hover:text-emerald-400 transition-colors underline-offset-4 hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
            >
              Cookie & Storage Disclosure
            </button>
            <span className="text-zinc-700">•</span>
            <button
              onClick={() => onOpenCompliance('refund')}
              className="hover:text-emerald-400 transition-colors underline-offset-4 hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
            >
              Refund / Free Policy
            </button>
            <span className="text-zinc-700">•</span>
            <button
              onClick={() => onOpenCompliance('accessibility')}
              className="hover:text-emerald-400 transition-colors underline-offset-4 hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
            >
              Accessibility Statement
            </button>
            <span className="text-zinc-700">•</span>
            <button
              onClick={() => onOpenCompliance('attribution')}
              className="hover:text-emerald-400 transition-colors underline-offset-4 hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
            >
              FFmpeg Licensing & Legal
            </button>
          </div>

          <div className="text-[11px] text-zinc-400 text-center md:text-right font-mono">
            <span>Client-side WebAssembly • Zero Data Transmission</span>
          </div>
        </div>

        {/* Real Business / Copyright Statement */}
        <div className="text-[10px] text-zinc-400 text-center md:text-left leading-relaxed">
          MKV to MP4 Converter Workstation. All conversion tasks run locally inside the user’s web browser via WebAssembly (LGPL v2.1+) and WebCodecs APIs. FFmpeg is a trademark of Fabrice Bellard, originator of the FFmpeg project. No copyrighted files are distributed or retained.
        </div>
      </div>
    </footer>
  );
};
