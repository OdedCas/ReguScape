/** @type {import('next').NextConfig} */

const isProd = process.env.NODE_ENV === 'production';
const isPreview = process.env.PREVIEW === 'true';

const nextConfig = {
  ...(isPreview ? { output: 'export' } : {}),
  basePath: isProd && !isPreview ? '/ReguScape' : '',
  images: { unoptimized: true },
  reactStrictMode: true,
};

module.exports = nextConfig;
