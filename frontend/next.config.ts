import type { NextConfig } from 'next';

// basePath задаётся на этапе сборки — если приложение живёт под под-путём
// (например, /chartersplit за общим reverse-proxy). Пусто — корень домена.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

// Только для локальной разработки: проксировать <basePath>/api/* на backend
// (в проде это делает reverse-proxy). Пример: DEV_API_URL=http://localhost:3001
const devApiUrl = process.env.DEV_API_URL;

const nextConfig: NextConfig = {
  // В Docker контекст сборки — только ./frontend, поэтому standalone-вывод
  // плоский: .next/standalone/server.js (см. Dockerfile).
  output: 'standalone',
  basePath: basePath || undefined,
  reactStrictMode: true,
  async rewrites() {
    if (!devApiUrl) return [];
    return [
      { source: '/api/:path*', destination: `${devApiUrl.replace(/\/$/, '')}/:path*` },
    ];
  },
};

export default nextConfig;
