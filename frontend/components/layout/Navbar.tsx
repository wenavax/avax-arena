'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';
import { Menu, X, Swords, Sparkles, BarChart3, Store, GitMerge, User, Map, Wallet, LogOut } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/mint', label: 'Mint', icon: Sparkles },
  { href: '/battle', label: 'Battle', icon: Swords },
  { href: '/merge', label: 'Fusion', icon: GitMerge },
  { href: '/quests', label: 'Quests', icon: Map },
  { href: '/marketplace', label: 'Market', icon: Store },
  { href: '/leaderboard', label: 'Rankings', icon: BarChart3 },
];

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const { ready, authenticated, login, logout } = usePrivy();

  const navLinks = isConnected && address
    ? [...NAV_LINKS, { href: `/profile/${address}`, label: 'Profile', icon: User }]
    : NAV_LINKS;

  return (
    <header className="sticky top-0 z-50 w-full">
      {/* Glassmorphism backdrop */}
      <div className="absolute inset-0 bg-frost-bg/60 backdrop-blur-xl border-b border-white/[0.06]" />

      <nav className="relative mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-lg overflow-hidden">
            <Image src="/avalanche/logo.png" alt="Frostbite" width={36} height={36} className="rounded-lg" priority />
            <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-frost-cyan to-frost-purple opacity-0 blur-lg transition-opacity group-hover:opacity-60" />
          </div>
          <span className="font-display text-lg font-bold tracking-wider">
            <span className="gradient-text">FROST</span>
            <span className="text-white/90 ml-1">BITE</span>
          </span>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(link.href + '/');
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'text-frost-cyan'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                )}
              >
                <Icon className="h-4 w-4" />
                {link.label}
                {/* Active indicator glow */}
                {isActive && (
                  <span className="absolute inset-x-2 -bottom-[1px] h-[2px] bg-frost-primary rounded-full shadow-glow-cyan" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Right side: Theme toggle + Connect + Mobile toggle */}
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {ready && authenticated && address ? (
            <button
              onClick={logout}
              title="Disconnect"
              className="flex items-center gap-2 rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2 text-xs font-mono text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors"
            >
              <span className="w-2 h-2 rounded-full bg-frost-green" />
              {`${address.slice(0, 6)}...${address.slice(-4)}`}
              <LogOut className="h-3 w-3" />
            </button>
          ) : (
            <button
              onClick={login}
              disabled={!ready}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-frost-primary/20 to-frost-secondary/20 border border-frost-primary/30 px-3 py-2 text-xs font-semibold text-frost-primary hover:text-white hover:border-frost-primary/50 transition-all"
            >
              <Wallet className="h-3.5 w-3.5" />
              Connect
            </button>
          )}

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
          mobileOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="bg-frost-bg/95 backdrop-blur-xl border-b border-white/[0.06] px-4 py-3 space-y-1">
          {navLinks.map((link) => {
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
                    ? 'text-frost-cyan bg-frost-cyan/[0.08]'
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
