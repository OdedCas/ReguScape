/** @type {import('next').NextConfig} */

const isProd = process.env.NODE_ENV === 'production';
const isPreview = process.env.PREVIEW === 'true';

const nextConfig = {
  output: 'export',
  basePath: isProd && !isPreview ? '/ReguScape' : '',
  images: { unoptimized: true },
  reactStrictMode: true,
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;
