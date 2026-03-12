import Link from 'next/link';
import Image from 'next/image';
import { Twitter, Github, BookOpen, Zap } from 'lucide-react';

const SOCIAL_LINKS = [
  { href: 'https://x.com/frostbitepro', label: 'X / Twitter', icon: Twitter },
  { href: 'https://github.com/wenavax/avax-arena', label: 'GitHub', icon: Github },
];

export function Footer() {
  return (
    <footer className="relative mt-auto border-t border-transparent">
      {/* Gradient top border */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-frost-primary/40 to-transparent" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          {/* Left: Logo + Network Badge */}
          <div className="flex flex-col items-center md:items-start gap-3">
            <div className="flex items-center gap-2">
              <Image src="/logo.png" alt="Frostbite" width={28} height={28} className="rounded-md" />
              <span className="font-display text-sm font-semibold tracking-wider text-white/60">
                Frostbite
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-frost-green/5 border border-frost-green/20">
              <div className="w-2 h-2 rounded-full bg-frost-green animate-pulse" />
              <span className="text-xs font-pixel text-frost-green/80">Avalanche C-Chain</span>
            </div>
          </div>

          {/* Center: Links (Social + Docs + Legal) */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-4">
              {SOCIAL_LINKS.map((social) => {
                const Icon = social.icon;
                return (
                  <Link
                    key={social.label}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center w-9 h-9 rounded-lg text-white/30 hover:text-frost-cyan hover:bg-frost-cyan/[0.08] transition-all duration-200"
                    aria-label={social.label}
                  >
                    <Icon className="h-4 w-4" />
                  </Link>
                );
              })}
            </div>
            <div className="flex items-center gap-4">
              <Link href="/docs" className="flex items-center gap-1.5 text-xs text-white/40 hover:text-frost-cyan transition-colors">
                <BookOpen className="w-3.5 h-3.5" />
                Documentation
              </Link>
              <Link href="/privacy" className="text-xs text-white/30 hover:text-white/60 transition-colors">
                Privacy
              </Link>
              <Link href="/terms" className="text-xs text-white/30 hover:text-white/60 transition-colors">
                Terms
              </Link>
            </div>
          </div>

          {/* Right: Contract Info + Powered by */}
          <div className="flex flex-col items-center md:items-end gap-2">
            <div className="text-[10px] font-mono text-white/20">
              Warrior: {(process.env.NEXT_PUBLIC_ARENA_WARRIOR_ADDRESS || '0x...').slice(0, 6)}...{(process.env.NEXT_PUBLIC_ARENA_WARRIOR_ADDRESS || '0x...').slice(-4)}
            </div>
            <span className="flex items-center gap-1 text-xs text-white/30">
              <Zap className="w-3 h-3 text-frost-red" />
              Powered by{' '}
              <span className="text-frost-red font-medium">Avalanche</span>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
