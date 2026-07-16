export const OCEAN = "#0c1a24";
export const OWNED = "#f4a259";
export const LAND_PALETTE = [
  "#355b6b",
  "#3f6b54",
  "#6b5436",
  "#56466b",
  "#6b3f54",
  "#3f546b",
  "#5d6b3f",
  "#6b6440",
  "#3f6b6b",
  "#4f6b5a",
  "#6b5a4f",
  "#5a4f6b",
  "#6b4f3f",
  "#4f5a6b",
];

export const landColor = (ci: number) => LAND_PALETTE[ci % LAND_PALETTE.length];

export const shortAddr = (a: string) =>
  a.length > 12 ? a.slice(0, 6) + "…" + a.slice(-4) : a;

export const resolveURI = (u: string) =>
  u.startsWith("ipfs://") ? "https://ipfs.io/ipfs/" + u.slice(7) : u;
