import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'AthletiGo Coach',
        short_name: 'AthletiGo',
        description: 'AthletiGo - Fitness Coaching App',
        theme_color: '#FF6F20',
        background_color: '#ffffff',
        display: 'standalone',
        // start_url '/' lets RoutingGate decide where the user lands.
        // Was '/login' before — that forced the PWA shortcut to always
        // open at /login, where Login.jsx then auto-redirected logged-in
        // users; combined with stale SW caches it produced an apparent
        // "loop" before React finished booting.
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-[hash]-${Date.now()}.js`,
        chunkFileNames: `assets/[name]-[hash]-${Date.now()}.js`,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
