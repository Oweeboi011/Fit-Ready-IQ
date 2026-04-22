/** @type {import('next').NextConfig} */
const isGitHubPages = process.env.GITHUB_PAGES === 'true';

const nextConfig = {
  reactStrictMode: true,
  output: isGitHubPages ? 'export' : 'standalone',
  basePath: isGitHubPages ? '/Fit-Ready-IQ' : '',
  assetPrefix: isGitHubPages ? '/Fit-Ready-IQ/' : undefined,
  
  // Environment variables available to the browser
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:6790',
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || 'Fit-Ready-IQ',
  },
  
  // Image optimization
  images: {
    unoptimized: isGitHubPages,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'maps.googleapis.com',
        pathname: '/maps/**',
      },
      {
        protocol: 'https',
        hostname: 'maps.gstatic.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'geo0.ggpht.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'geo1.ggpht.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'geo2.ggpht.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'geo3.ggpht.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
    ],
  },
  
  // Configure webpack for mapbox-gl
  webpack: (config) => {
    config.module.rules.push({
      test: /\.mjs$/,
      include: /node_modules/,
      type: 'javascript/auto',
    });
    
    return config;
  },
};

module.exports = nextConfig;
