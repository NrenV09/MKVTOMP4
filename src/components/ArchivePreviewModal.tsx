import React, { useState, useEffect } from 'react';
import { X, Download, FileText, Image, Video, Music, File } from 'lucide-react';
import { ExtractedArchiveItem, formatBytes } from '../utils/archiveEngine';

interface ArchivePreviewModalProps {
  item: ExtractedArchiveItem | null;
  onClose: () => void;
}

export const ArchivePreviewModal: React.FC<ArchivePreviewModalProps> = ({ item, onClose }) => {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isLoadingText, setIsLoadingText] = useState(false);

  useEffect(() => {
    if (!item) {
      setTextContent(null);
      return;
    }

    if (item.previewType === 'text') {
      setIsLoadingText(true);
      try {
        const decoder = new TextDecoder('utf-8');
        const text = decoder.decode(item.data.slice(0, 100000)); // cap at ~100KB for preview safety
        setTextContent(text);
      } catch (err) {
        setTextContent('Unable to decode text content.');
      } finally {
        setIsLoadingText(false);
      }
    } else {
      setTextContent(null);
    }
  }, [item]);

  if (!item) return null;

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = item.url || URL.createObjectURL(new Blob([item.data], { type: item.mimeType }));
    a.download = item.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-modal-title"
    >
      <div className="relative w-full max-w-2xl max-h-[85vh] rounded-2xl bg-[#121215] border border-zinc-800 flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800/80 bg-zinc-900/50">
          <div className="flex items-center gap-2.5 min-w-0 pr-4">
            <div className="p-1.5 rounded-lg bg-zinc-800 border border-zinc-700/60 text-emerald-400 shrink-0">
              {item.previewType === 'image' && <Image className="w-4 h-4" />}
              {item.previewType === 'video' && <Video className="w-4 h-4" />}
              {item.previewType === 'audio' && <Music className="w-4 h-4" />}
              {item.previewType === 'text' && <FileText className="w-4 h-4" />}
              {item.previewType === 'other' && <File className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <h3 id="preview-modal-title" className="text-sm font-semibold text-zinc-100 truncate">
                {item.name}
              </h3>
              <p className="text-[11px] text-zinc-400 font-mono">
                {item.path !== item.name ? `${item.path} • ` : ''}
                {formatBytes(item.size)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs transition-colors shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              aria-label={`Download ${item.name}`}
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Download</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600"
              aria-label="Close preview"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-auto p-5 flex items-center justify-center bg-zinc-950/70 min-h-[250px]">
          {item.previewType === 'image' && item.url && (
            <img
              src={item.url}
              alt={item.name}
              className="max-h-[60vh] max-w-full rounded-lg object-contain border border-zinc-800/80 shadow-md"
            />
          )}

          {item.previewType === 'video' && item.url && (
            <video
              src={item.url}
              controls
              autoPlay={false}
              className="max-h-[60vh] max-w-full rounded-lg border border-zinc-800/80 shadow-md"
            />
          )}

          {item.previewType === 'audio' && item.url && (
            <div className="w-full max-w-md p-6 rounded-xl bg-zinc-900 border border-zinc-800 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Music className="w-7 h-7" />
              </div>
              <audio src={item.url} controls className="w-full" />
            </div>
          )}

          {item.previewType === 'text' && (
            <div className="w-full h-full max-h-[60vh] overflow-auto">
              {isLoadingText ? (
                <div className="text-zinc-500 text-xs font-mono py-8 text-center">Reading text stream...</div>
              ) : (
                <pre className="text-xs font-mono text-zinc-300 bg-zinc-900/90 p-4 rounded-xl border border-zinc-800/80 overflow-x-auto whitespace-pre-wrap break-words leading-relaxed select-text">
                  {textContent}
                </pre>
              )}
            </div>
          )}

          {item.previewType === 'other' && (
            <div className="text-center py-10 space-y-3">
              <div className="w-12 h-12 mx-auto rounded-xl bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-zinc-400">
                <File className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-300">Preview not available for this binary format</p>
                <p className="text-xs text-zinc-500 mt-1">Download to inspect with a native desktop application.</p>
              </div>
              <button
                onClick={handleDownload}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save {item.name} ({formatBytes(item.size)})</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
