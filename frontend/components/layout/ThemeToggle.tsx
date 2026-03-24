'use client';

import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="w-9 h-9" />;

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={`
        relative flex items-center justify-center w-9 h-9 rounded-lg
        transition-all duration-300 overflow-hidden
        ${isDark
          ? 'bg-white/[0.06] hover:bg-white/[0.1] text-white/60 hover:text-frost-gold border border-white/[0.06]'
          : 'bg-frost-primary/10 hover:bg-frost-primary/15 text-frost-primary hover:text-frost-primary border border-frost-primary/20'
        }
      `}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <div className="relative z-10">
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </div>
    </button>
  );
}
