import Link from 'next/link';
import { Twitter, MessageCircle, Github } from 'lucide-react';

const SOCIAL_LINKS = [
  { href: 'https://twitter.com', label: 'Twitter', icon: Twitter },
  { href: 'https://discord.gg', label: 'Discord', icon: MessageCircle },
  { href: 'https://github.com', label: 'GitHub', icon: Github },
];

export function Footer() {
  return (
    <footer className="relative mt-auto border-t border-transparent">
      {/* Gradient top border */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-arena-cyan/40 to-transparent" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Branding */}
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-arena-cyan to-arena-purple">
              <span className="text-xs font-bold text-arena-bg">A</span>
            </div>
            <span className="font-display text-sm font-semibold tracking-wider text-white/60">
              AVAX Arena
            </span>
          </div>

          {/* Social Links */}
          <div className="flex items-center gap-4">
            {SOCIAL_LINKS.map((social) => {
              const Icon = social.icon;
              return (
                <Link
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center w-9 h-9 rounded-lg text-white/30 hover:text-arena-cyan hover:bg-arena-cyan/[0.08] transition-all duration-200"
                  aria-label={social.label}
                >
                  <Icon className="h-4 w-4" />
                </Link>
              );
            })}
          </div>

          {/* Powered by */}
          <p className="text-xs text-white/30">
            Powered by{' '}
            <span className="text-arena-red font-medium">Avalanche</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
