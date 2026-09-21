import React, { useState } from 'react';
import { 
  ShieldCheck, 
  FileText, 
  Cookie, 
  HelpCircle, 
  CheckCircle2, 
  X, 
  ExternalLink,
  Lock,
  EyeOff,
  Cpu,
  RefreshCw,
  Scale
} from 'lucide-react';

export type ComplianceTab = 'privacy' | 'terms' | 'cookies' | 'refund' | 'accessibility' | 'attribution';

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

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="compliance-modal-title"
    >
      <div className="bg-[#121215] border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-zinc-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 id="compliance-modal-title" className="text-sm font-semibold text-zinc-100">
                Legal, Privacy & Compliance Transparency
              </h2>
              <p className="text-[11px] text-zinc-400">
                100% Client-Side Video Processing • Zero Data Collection • WCAG AA
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close legal and privacy details modal"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-4 pt-3 border-b border-zinc-800 bg-zinc-900/40 overflow-x-auto text-xs no-scrollbar">
          <button
            onClick={() => setActiveTab('privacy')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium transition-colors whitespace-nowrap ${
              activeTab === 'privacy'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Privacy Policy</span>
          </button>
          <button
            onClick={() => setActiveTab('terms')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium transition-colors whitespace-nowrap ${
              activeTab === 'terms'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Terms of Service</span>
          </button>
          <button
            onClick={() => setActiveTab('cookies')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium transition-colors whitespace-nowrap ${
              activeTab === 'cookies'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Cookie className="w-3.5 h-3.5" />
            <span>Cookie & Storage Policy</span>
          </button>
          <button
            onClick={() => setActiveTab('refund')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium transition-colors whitespace-nowrap ${
              activeTab === 'refund'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>Refund / Pricing Policy</span>
          </button>
          <button
            onClick={() => setActiveTab('accessibility')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium transition-colors whitespace-nowrap ${
              activeTab === 'accessibility'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Accessibility (WCAG AA)</span>
          </button>
          <button
            onClick={() => setActiveTab('attribution')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium transition-colors whitespace-nowrap ${
              activeTab === 'attribution'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Attribution & Licensing</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs sm:text-sm text-zinc-300 leading-relaxed">
          {activeTab === 'privacy' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-start gap-3">
                <EyeOff className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-zinc-100">Zero Server Uploads & Zero Personal Data Collection</div>
                  <div className="text-xs text-emerald-200/90 mt-1">
                    Your audio, video, metadata, and files NEVER leave your browser or computer. All decoding, multiplexing, transcode operations, and export tasks execute strictly inside your local browser memory via WebAssembly.
                  </div>
                </div>
              </div>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-zinc-100">1. Information We Collect</h3>
                <p>
                  <strong>We collect no personal information.</strong> There is no user account system, no sign-up form, no advertising ID tracker, and no analytics SDK embedded into this workstation.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-zinc-100">2. File Processing Architecture</h3>
                <p>
                  When you select or drop a media file into the converter:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-zinc-400">
                  <li>The file is read by your browser using the HTML5 File API.</li>
                  <li>Processing occurs in an isolated Emscripten virtual file system (<code className="text-zinc-300">MEMFS</code>) in your local RAM.</li>
                  <li>When you click "Reset" or close the browser tab, all temporary memory allocations are instantly garbage-collected and erased.</li>
                </ul>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-zinc-100">3. Compliance with Global Privacy Laws (GDPR & CCPA)</h3>
                <p>
                  Because we do not collect, process, or sell any Personally Identifiable Information (PII) or user data on external servers, the application adheres directly to the privacy-by-design standards of the General Data Protection Regulation (GDPR) and California Consumer Privacy Act (CCPA).
                </p>
              </section>
            </div>
          )}

          {activeTab === 'terms' && (
            <div className="space-y-4">
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-zinc-100">1. Acceptance of Terms</h3>
                <p>
                  By accessing and using this converter tool, you agree to these Terms of Service. If you do not agree to these terms, please discontinue using this application.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-zinc-100">2. Permitted Use and Copyright Ownership</h3>
                <p>
                  You agree that you will only process files and content that you legally own, have created, or for which you have secured all necessary permissions and licenses from the respective copyright holders. You are solely responsible for all content you transcode or convert.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-zinc-100">3. "AS IS" Disclaimer of Warranty</h3>
                <p className="text-zinc-400 bg-zinc-900/60 p-3 rounded-xl border border-zinc-800 font-mono text-xs">
                  THIS SOFTWARE AND ITS WEBASSEMBLY ENGINE ARE PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR ACCURACY. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR DATA LOSS ARISING OUT OF USE OF THIS SOFTWARE.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-zinc-100">4. Applicable Law</h3>
                <p>
                  These terms shall be governed by and construed in accordance with applicable copyright, digital rights, and web technology regulations.
                </p>
              </section>
            </div>
          )}

          {activeTab === 'cookies' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-300 flex items-start gap-3">
                <Cookie className="w-5 h-5 shrink-0 mt-0.5 text-blue-400" />
                <div>
                  <div className="font-semibold text-zinc-100">Zero Tracking Cookies</div>
                  <div className="text-xs text-blue-200/90 mt-1">
                    This website does not set, read, or store any third-party advertising, analytics, or behavioral tracking cookies on your device.
                  </div>
                </div>
              </div>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-zinc-100">Browser Cache & Storage Disclosure</h3>
                <p>
                  To optimize performance and eliminate the need to repeatedly download the ~32MB WebAssembly core over the internet, we utilize standard browser storage APIs:
                </p>
                <div className="space-y-2 text-xs">
                  <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                    <span className="font-semibold text-zinc-200">IndexedDB Storage (<code className="text-emerald-400">engine_components_v1</code>):</span>
                    <p className="text-zinc-400 mt-0.5">
                      Stores compiled WebAssembly binaries and runtime worker scripts (<code className="text-zinc-300">ffmpeg-core.wasm</code>, <code className="text-zinc-300">7zz.wasm</code>, <code className="text-zinc-300">unrar.wasm</code>) locally on your device in persistent IndexedDB for instant offline loading and zero network latency. No user data is stored.
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                    <span className="font-semibold text-zinc-200">Session RAM (<code className="text-emerald-400">MEMFS</code>):</span>
                    <p className="text-zinc-400 mt-0.5">
                      Temporary memory buffers used while encoding video streams. Cleared automatically upon clicking "Reset" or closing the page.
                    </p>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'refund' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-start gap-3">
                <Scale className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
                <div>
                  <div className="font-semibold text-zinc-100">Free Open Web Utility • No Fees Charged</div>
                  <div className="text-xs text-amber-200/90 mt-1">
                    This application is 100% free of charge. We do not sell subscriptions, licenses, or credits.
                  </div>
                </div>
              </div>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-zinc-100">Refund & Payment Policy Statement</h3>
                <p>
                  Because this service is provided free of charge without any payment gateway or billing mechanisms:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-zinc-400">
                  <li>No credit card, bank account, or payment information is ever requested or accepted.</li>
                  <li>No recurring billing or trial subscriptions exist.</li>
                  <li>As no monetary transactions take place, no monetary refund obligations or chargeback claims apply.</li>
                </ul>
              </section>
            </div>
          )}

          {activeTab === 'accessibility' && (
            <div className="space-y-4">
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-zinc-100">WCAG 2.1 Level AA Accessibility Commitment</h3>
                <p>
                  We are committed to providing a media workstation that is accessible to all users, regardless of ability or technology:
                </p>
                <ul className="list-disc pl-5 space-y-1.5 text-zinc-400">
                  <li><strong>Keyboard Navigation:</strong> All dropzones, buttons, sliders, and controls are keyboard-accessible with visible focus rings.</li>
                  <li><strong>Color Contrast:</strong> High-contrast foreground and background pairings designed to meet or exceed the WCAG AA 4.5:1 ratio for text legibility.</li>
                  <li><strong>Screen Reader Support:</strong> Explicit <code className="text-zinc-300">aria-label</code> and <code className="text-zinc-300">role</code> attributes on dynamic progress bars and interactive controls.</li>
                  <li><strong>No Autoplay Noise:</strong> Converted video previews are muted by default with explicit audio controls.</li>
                </ul>
              </section>
            </div>
          )}

          {activeTab === 'attribution' && (
            <div className="space-y-4">
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-zinc-100">Open Source Licensing & Third-Party Credits</h3>
                <p>
                  This workstation is built upon open-source software and open web standards:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-zinc-400">
                  <li>
                    <strong className="text-zinc-200">FFmpeg Project:</strong> FFmpeg is a registered trademark of Fabrice Bellard, originator of the FFmpeg project. The WebAssembly port operates under the GNU Lesser General Public License (LGPL v2.1+).
                  </li>
                  <li>
                    <strong className="text-zinc-200">FFmpeg.wasm:</strong> Created by Jerome Wu and contributors under the MIT License.
                  </li>
                  <li>
                    <strong className="text-zinc-200">W3C WebCodecs & WebGPU:</strong> Open web standards developed by the World Wide Web Consortium (W3C).
                  </li>
                </ul>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-zinc-100">Real Business & Maintainer Details</h3>
                <p className="text-zinc-400">
                  Application: <strong>MKV to MP4 Media Workstation</strong><br />
                  Engine: Client-Side WebAssembly (Emscripten & WebCodecs)<br />
                  Distribution: Web Application (AI Studio Container Environment)<br />
                  Data Processing Location: 100% On-Device (Client Browser Sandbox)
                </p>
              </section>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-950/80 flex items-center justify-between text-xs text-zinc-400">
          <span>Last Updated: September 2026</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
