'use client';

import { useState, useEffect } from 'react';
import { X, Play, Minimize2, Maximize2 } from 'lucide-react';

export function GameplayDemo() {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Show after 5 seconds, only once per session
    const shown = sessionStorage.getItem('demo-shown');
    if (shown) return;
    const timer = setTimeout(() => {
      setVisible(true);
      sessionStorage.setItem('demo-shown', '1');
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  if (dismissed) return null;

  // Floating button (not opened yet)
  if (!open) {
    return visible ? (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-frost-red/90 hover:bg-frost-red text-white text-[10px] font-pixel uppercase tracking-wider shadow-[0_0_20px_rgba(232,65,66,0.3)] hover:shadow-[0_0_30px_rgba(232,65,66,0.5)] transition-all animate-bounce-slow border border-frost-red/50"
        style={{ animationDuration: '3s' }}
      >
        <Play className="w-3 h-3" />
        Watch Demo
      </button>
    ) : null;
  }

  // Opened demo window
  return (
    <div
      className={`fixed z-50 transition-all duration-300 shadow-2xl shadow-black/50 ${
        minimized
          ? 'bottom-4 right-4 w-48 h-10'
          : 'bottom-4 right-4 w-[420px] h-[340px] lg:w-[520px] lg:h-[400px]'
      }`}
    >
      {/* Title bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-black border border-frost-red/30 border-b-0 rounded-t-lg">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-frost-red animate-pulse" />
          <span className="text-[8px] font-pixel text-frost-red/70 uppercase tracking-widest">
            Live Gameplay Demo
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMinimized(!minimized)}
            className="w-5 h-5 flex items-center justify-center rounded text-white/30 hover:text-white/70 hover:bg-white/10 transition"
          >
            {minimized ? <Maximize2 className="w-2.5 h-2.5" /> : <Minimize2 className="w-2.5 h-2.5" />}
          </button>
          <button
            onClick={() => { setOpen(false); setDismissed(true); }}
            className="w-5 h-5 flex items-center justify-center rounded text-white/30 hover:text-frost-red hover:bg-white/10 transition"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* iframe content */}
      {!minimized && (
        <div className="w-full h-[calc(100%-28px)] border border-frost-red/20 border-t-0 rounded-b-lg overflow-hidden bg-black">
          <iframe
            src="/avalanche/gameplay-demo.html"
            className="w-full h-full border-0"
            title="Gameplay Demo"
          />
        </div>
      )}

      {/* Minimized state */}
      {minimized && (
        <div
          className="w-full h-[calc(100%-28px)] border border-frost-red/20 border-t-0 rounded-b-lg bg-black flex items-center justify-center cursor-pointer"
          onClick={() => setMinimized(false)}
        >
          <span className="text-[7px] font-pixel text-white/30">Click to expand</span>
        </div>
      )}
    </div>
  );
}
