import { defineConfig } from 'vitest/config';

// 앱은 사용자 브라우저(한국 시간)에서 날짜를 계산하므로 테스트도 KST로 고정
// — Netlify 빌드 서버는 UTC라 고정하지 않으면 날짜가 하루씩 밀려 실패함
process.env.TZ = 'Asia/Seoul';

// 테스트 전용 설정 — vite.config.ts의 Netlify/PWA 플러그인을 띄우지 않도록 분리
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // netlify/functions 안의 파일은 전부 함수로 배포되므로 테스트는 tests/에 둠
    environment: 'node',
  },
});
