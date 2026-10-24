import { defineConfig } from 'vitest/config';

// 테스트 전용 설정 — vite.config.ts의 Netlify/PWA 플러그인을 띄우지 않도록 분리
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'netlify/**/*.test.ts'],
    environment: 'node',
  },
});
