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
        name: 'AthletiGo',
        short_name: 'AthletiGo',
        description: 'AthletiGo - Fitness Coaching App',
        theme_color: '#FFFFFF',
        background_color: '#FFFFFF',
        display: 'standalone',
        // start_url '/' lets RoutingGate decide where the user lands.
        // Was '/login' before — that forced the PWA shortcut to always
        // open at /login, where Login.jsx then auto-redirected logged-in
        // users; combined with stale SW caches it produced an apparent
        // "loop" before React finished booting.
        start_url: '/',
        icons: [
          // White background, black AG-triangle logo. Maskable icons use a
          // 60% safe zone so Android doesn't crop the mark. ?v=2 cache-buster
          // forces clients to refetch the recoloured icons.
          { src: '/icon-72.png?v=2', sizes: '72x72', type: 'image/png', purpose: 'any' },
          { src: '/icon-96.png?v=2', sizes: '96x96', type: 'image/png', purpose: 'any' },
          { src: '/icon-128.png?v=2', sizes: '128x128', type: 'image/png', purpose: 'any' },
          { src: '/icon-144.png?v=2', sizes: '144x144', type: 'image/png', purpose: 'any' },
          { src: '/icon-152.png?v=2', sizes: '152x152', type: 'image/png', purpose: 'any' },
          { src: '/icon-192.png?v=2', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-384.png?v=2', sizes: '384x384', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png?v=2', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable-192.png?v=2', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-maskable-512.png?v=2', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/apple-touch-icon.png?v=2', sizes: '180x180', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
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
