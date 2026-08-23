/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 開発サーバのポートは 5173。API GatewayのCORS許可オリジンと揃える
// （13_infra/lib/config/environments.ts の LOCAL_DEV_ORIGIN）
export default defineConfig({
  plugins: [react()],
  // amazon-cognito-identity-js が Node の global を参照するためブラウザ向けに補う
  define: { global: 'globalThis' },
  server: { port: 5173 },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // e2e/ は Playwright が実行する。Vitest から拾わせない
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
