import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'exchange-rates', expiration: { maxAgeSeconds: 86400 } },
          },
        ],
      },
      manifest: {
        name: 'FinPath',
        short_name: 'FinPath',
        description: 'Personal finance tracker — wallets, budgets, and investments',
        theme_color: '#0f1117',
        background_color: '#0f1117',
        display: 'standalone',
        icons: [
          { src: '/vite.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
