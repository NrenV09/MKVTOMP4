import React, { useState } from 'react';
import { Download, Share2, X, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        aria-label="Install MKV to MP4 Converter app on your device"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border bg-emerald-500 hover:bg-emerald-400 text-zinc-950 border-emerald-400/50 shadow-sm shadow-emerald-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 cursor-pointer"
      >
        <Download className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Install App</span>
      </button>
    );
  }

  // iOS Safari flow (beforeinstallprompt is not supported by WebKit)
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          aria-label="Install app on iPhone or iPad"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-emerald-400 transition-colors text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 cursor-pointer"
        >
          <Smartphone className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
          <span className="hidden sm:inline">Install on iOS</span>
        </button>

        {showIOSGuide && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
          >
            <div className="w-full max-w-sm rounded-2xl bg-[#121215] border border-zinc-800 p-6 shadow-2xl text-zinc-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <h3 id="ios-install-title" className="text-sm font-semibold text-zinc-100">
                    Install on iPhone / iPad
                  </h3>
                </div>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close installation guide"
                  className="p-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-zinc-300 leading-relaxed">
                <p className="text-zinc-400">
                  Install this app on your home screen for full offline access with zero browser address bars:
                </p>
                <div className="space-y-2 bg-zinc-900/70 p-3 rounded-xl border border-zinc-800/80">
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-200 flex items-center justify-center text-[11px] font-bold shrink-0">1</span>
                    <span>Tap the <strong className="text-emerald-400">Share</strong> button in Safari toolbar (<Share2 className="w-3 h-3 inline text-emerald-400" />).</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-200 flex items-center justify-center text-[11px] font-bold shrink-0">2</span>
                    <span>Scroll down and tap <strong className="text-zinc-100">Add to Home Screen</strong>.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-200 flex items-center justify-center text-[11px] font-bold shrink-0">3</span>
                    <span>Tap <strong className="text-emerald-400">Add</strong> to complete installation.</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-xl bg-zinc-800 hover:bg-zinc-700 py-2 text-xs font-semibold text-zinc-200 transition-colors"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
