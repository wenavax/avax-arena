'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Menu, X, Swords, Sparkles, MessageCircle, BarChart3, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/agents', label: 'Agents', icon: Bot },
  { href: '/mint', label: 'Mint NFT', icon: Sparkles },
  { href: '/battle', label: 'Battle', icon: Swords },
  { href: '/chat', label: 'Agent Chat', icon: MessageCircle },
  { href: '/leaderboard', label: 'Leaderboard', icon: BarChart3 },
];

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 w-full">
      {/* Glassmorphism backdrop */}
      <div className="absolute inset-0 bg-arena-bg/60 backdrop-blur-xl border-b border-white/[0.06]" />

      <nav className="relative mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-arena-cyan to-arena-purple">
            <span className="text-lg font-bold text-arena-bg">A</span>
            <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-arena-cyan to-arena-purple opacity-0 blur-lg transition-opacity group-hover:opacity-60" />
          </div>
          <span className="font-display text-lg font-bold tracking-wider">
            <span className="gradient-text">AVAX</span>
            <span className="text-white/90 ml-1">Arena</span>
          </span>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(link.href + '/');
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'text-arena-cyan'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                )}
              >
                <Icon className="h-4 w-4" />
                {link.label}
                {/* Active indicator glow */}
                {isActive && (
                  <span className="absolute inset-x-2 -bottom-[1px] h-[2px] bg-arena-cyan rounded-full shadow-[0_0_8px_rgba(0,240,255,0.6)]" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Right side: Connect + Mobile toggle */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:block">
            <ConnectButton
              chainStatus="icon"
              accountStatus="avatar"
              showBalance={false}
            />
          </div>
          <div className="sm:hidden">
            <ConnectButton
              chainStatus="none"
              accountStatus="avatar"
              showBalance={false}
            />
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
            aria-label="Toggle navigation menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile Navigation Drawer */}
      <div
        className={cn(
          'md:hidden absolute top-16 inset-x-0 z-40 transition-all duration-300 ease-in-out overflow-hidden',
          mobileOpen ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="bg-arena-bg/95 backdrop-blur-xl border-b border-white/[0.06] px-4 py-3 space-y-1">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(link.href + '/');
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'text-arena-cyan bg-arena-cyan/[0.08]'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                )}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
