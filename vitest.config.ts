import { defineConfig } from 'vitest/config';

// 테스트 전용 설정 — vite.config.ts의 Netlify/PWA 플러그인을 띄우지 않도록 분리
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // netlify/functions 안의 파일은 전부 함수로 배포되므로 테스트는 tests/에 둠
    environment: 'node',
  },
});
