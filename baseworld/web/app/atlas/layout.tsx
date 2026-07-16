import type {Metadata} from "next";

/**
 * /atlas için ek metadata — Farcaster Mini App / Frame embed tag'leri.
 *
 * Warpcast / Coinbase Wallet gibi Farcaster client'lar bir URL gördüğünde
 * `fc:frame` meta tag'ini parse eder ve preview + "Launch" buton üretir.
 *
 * Buton tıklanınca homeUrl açılır (Mini App context'inde).
 */
export const metadata: Metadata = {
  title: "Atlas",
  other: {
    "fc:frame": JSON.stringify({
      version: "next",
      imageUrl: "https://frostbite.pro/baseworld/og.png",
      button: {
        title: "Open Atlas",
        action: {
          type: "launch_frame",
          name: "Base Atlas",
          url: "https://frostbite.pro/baseworld/atlas",
          splashImageUrl: "https://frostbite.pro/baseworld/splash.png",
          splashBackgroundColor: "#070d14",
        },
      },
    }),
  },
};

export default function AtlasLayout({children}: {children: React.ReactNode}) {
  return children;
}
