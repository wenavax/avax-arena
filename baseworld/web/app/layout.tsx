import type {Metadata, Viewport} from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://frostbite.pro/baseworld"),
  title: {
    default: "Base Atlas",
    template: "%s · Base Atlas",
  },
  description:
    "Every land pixel of the world map (~61,000) is a 1 USDC NFT on Base.",
  keywords: ["base atlas", "base chain", "NFT", "world map", "USDC", "pixel"],
  openGraph: {
    title: "Base Atlas",
    description:
      "640×320 world map. Each land pixel is an NFT on Base. Owner sets the pixel image.",
    url: "https://frostbite.pro/baseworld",
    siteName: "Base Atlas",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Base Atlas",
    description: "640×320 world map. Each land pixel is a 1 USDC mint NFT on Base.",
  },
  robots: {
    index: true,
    follow: true,
  },
  other: {
    // Base.dev app verification (domain ownership proof)
    "base:app_id": "6a22c2b22280de924021e2c0",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
