import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function formatAvax(wei: bigint): string {
  const avax = Number(wei) / 1e18;
  return avax.toFixed(avax < 0.01 ? 4 : 2);
}
