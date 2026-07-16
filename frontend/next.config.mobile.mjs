/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: '',
  trailingSlash: true,
  compress: false,
  poweredByHeader: false,
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.resolve.alias = {
      ...config.resolve.alias,
      '@farcaster/mini-app-solana': false,
    };
    return config;
  },
};

export default nextConfig;
