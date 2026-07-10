import type { NextConfig } from 'next';

// basePath задаётся на этапе сборки (Caddy проксирует /chartersplit).
// В standalone-режиме передаётся пустая строка (корень домена).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig: NextConfig = {
  output: 'standalone',
  // В Docker контекст сборки — только ./frontend (изолированно), поэтому standalone-вывод
  // получается плоским: .next/standalone/server.js (см. Dockerfile). В workspace локально
  // Next сам определяет корень и вкладывает вывод в подпапку — это лишь для локальной сборки.
  basePath: basePath || undefined,
  // Telegram Mini App живёт во фрейме Telegram — не нужен строгий CSP по умолчанию.
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
