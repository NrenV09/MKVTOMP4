import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div 
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2.5 rounded-xl bg-amber-500/90 hover:bg-amber-500 text-zinc-950 px-3.5 py-2 text-xs font-semibold shadow-2xl backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-3 duration-300"
      role="status"
      aria-live="polite"
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zinc-950 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-zinc-950"></span>
      </span>
      <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
      <span>Offline Mode — Running locally from cache (100% functional)</span>
    </div>
  );
};
