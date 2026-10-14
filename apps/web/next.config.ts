import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@rc/shared'],
  // The dev-mode "N" badge sat on top of the first call button and the Chat tab.
  devIndicators: false,
};

export default nextConfig;
