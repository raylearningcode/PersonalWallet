import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  build: {
    rollupOptions: {
      external: ['@capacitor/camera'],
    },
  },
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
        name: 'FinPath — Personal Finance OS',
        short_name: 'FinPath',
        description: 'Privacy-first manual finance tracker — wallets, cash-change, budgets, goals, and investments.',
        theme_color: '#0f1117',
        background_color: '#0f1117',
        display: 'standalone',
        start_url: '/',
        orientation: 'portrait-primary',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
        shortcuts: [
          {
            name: 'Add Expense',
            short_name: 'Add',
            description: 'Quickly record a new expense',
            url: '/transactions?action=expense',
          },
          {
            name: 'View Budget',
            short_name: 'Budget',
            description: 'Check your budget categories',
            url: '/budget',
          },
          {
            name: 'Reports',
            short_name: 'Reports',
            description: 'View spending reports',
            url: '/reports',
          },
          {
            name: 'Goals',
            short_name: 'Goals',
            description: 'Track your savings goals',
            url: '/goals',
          },
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
