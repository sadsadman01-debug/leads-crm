import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // We render our own "New version available" toast via useRegisterSW
      // (PwaUpdatePrompt.tsx) — auto-injecting a second registration script
      // would double-register the service worker.
      injectRegister: false,
      registerType: 'prompt',
      manifestFilename: 'manifest.json',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Leads CRM',
        short_name: 'Leads CRM',
        description: 'Multi-tenant Lead Management CRM',
        start_url: '/',
        display: 'standalone',
        background_color: '#0a0a0d',
        theme_color: '#0a0a0d',
        icons: [
          { src: '/icons/icon-152.png', sizes: '152x152', type: 'image/png' },
          { src: '/icons/icon-180.png', sizes: '180x180', type: 'image/png' },
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-384.png', sizes: '384x384', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the built app-shell (JS/CSS/icons/fonts) only — /api/* and
        // Supabase's own domain are never touched by the service worker, so
        // auth/session, real-time subscriptions, and live data are unaffected.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Local dev only runs the Vite frontend — no Netlify/Vercel functions
      // server. Proxy /api/* to the live deployment so login and data calls
      // work against the real backend instead of hitting nothing.
      '/api': {
        target: 'https://leadify-six.vercel.app',
        changeOrigin: true,
      },
    },
  },
})
