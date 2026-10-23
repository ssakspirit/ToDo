/// <reference types="vite/client" />

// 브라우저 번들에 포함되는 공개 값만 선언 — 비밀 값(ANTHROPIC_API_KEY, GOOGLE_CLIENT_SECRET)은
// netlify/functions 에서만 읽으며 여기에 추가하면 안 됨
interface ImportMetaEnv {
  readonly VITE_MICROSOFT_CLIENT_ID: string;
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_HOLIDAY_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
