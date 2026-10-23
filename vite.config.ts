import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import netlify from '@netlify/vite-plugin'

export default defineConfig(({ command, mode }) => {
  // 로컬 dev에서 .env 값을 서버 함수(Netlify.env)가 읽을 수 있도록 process.env에 주입
  // (배포 환경에선 Netlify 환경 변수가 이미 process.env에 있음)
  if (command === 'serve') Object.assign(process.env, loadEnv(mode, process.cwd(), ''))

  return {
    plugins: [
      react(),
      // npm run dev에서 netlify/functions(/api/*)를 함께 실행
      // 엣지 함수는 쓰지 않음 — 켜두면 로컬 Deno 서버 기동 실패로 dev 서버가 종료됨
      netlify({ edgeFunctions: { enabled: false } }),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: 'To-Do',
          short_name: 'To-Do',
          description: '할일 분석 및 일정 관리',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          icons: [
            { src: 'pwa-64x64.png',           sizes: '64x64',   type: 'image/png' },
            { src: 'pwa-192x192.png',          sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png',          sizes: '512x512', type: 'image/png' },
            { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
      }),
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-msal': ['@azure/msal-browser', '@microsoft/microsoft-graph-client'],
          },
        },
      },
    },
    define: {
      'process.env': {}
    }
  }
})
