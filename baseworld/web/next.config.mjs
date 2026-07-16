/** @type {import('next').NextConfig} */
const securityHeaders = [
  {key: "X-Frame-Options", value: "DENY"},
  {key: "X-Content-Type-Options", value: "nosniff"},
  {key: "Referrer-Policy", value: "strict-origin-when-cross-origin"},
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // CSP — ethers EIP-1193 inject, IPFS gateway img, Pinata API
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js dev için 'unsafe-eval' geliştirme; prod'da kaldır
      "script-src 'self' 'unsafe-inline'" +
        (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https: https://ipfs.io https://*.ipfs.dweb.link https://*.mypinata.cloud",
      "connect-src 'self' https://*.base.org https://*.basescan.org https://api.pinata.cloud https://*.alchemy.com https://*.infura.io https://api.openai.com",
      "font-src 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig = {
  reactStrictMode: true,
  // Production'da frostbite.pro/baseworld altında self-host edilecekse aktif et:
  // basePath: "/baseworld",
  // assetPrefix: "/baseworld",
  eslint: {ignoreDuringBuilds: true},
  typescript: {ignoreBuildErrors: false},
  async headers() {
    // /atlas route'u Farcaster Mini App olarak Warpcast / Coinbase Wallet
    // gibi client'larda embed edilebilsin diye frame-ancestors gevşek.
    const atlasFrameCSP = securityHeaders
      .map((h) => {
        if (h.key !== "Content-Security-Policy") return h;
        return {
          key: h.key,
          value: h.value
            .replace("frame-ancestors 'none'", "frame-ancestors 'self' https://warpcast.com https://*.warpcast.com https://wallet.coinbase.com https://*.coinbase.com")
            .replace("X-Frame-Options", "X-Frame-Options-Disabled"),
        };
      })
      .filter((h) => h.key !== "X-Frame-Options");

    return [
      {
        source: "/((?!atlas).*)",
        headers: securityHeaders,
      },
      {
        source: "/atlas",
        headers: atlasFrameCSP,
      },
      {
        source: "/admin/(.*)",
        headers: [{key: "X-Robots-Tag", value: "noindex, nofollow"}],
      },
    ];
  },
};

export default nextConfig;
