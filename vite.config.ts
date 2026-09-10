import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// The dashboard (index.html) is the app proper, at BASE. about.html is a
// second, separate entry (the marketing/About page linked from the
// dashboard's logo), with its own small bundle (see src/about/). It's a flat
// sibling file (BASE + 'about.html'), not a nested about/index.html, so the
// URL is always a literal file with no directory-index/trailing-slash
// ambiguity to worry about across dev, preview, and GitHub Pages. Both
// entries are declared under build.rollupOptions.input below since Vite's
// implicit single-entry default is replaced, not extended, once `input` is
// set.
// The PWA manifest's start_url is derived from the same BASE rather than
// hardcoded again, so an installed/home-screen launch opens the dashboard.
//
// BASE is overridable via VITE_BASE_PATH so this project can be built and
// hosted from somewhere other than github.io/localgrid.dev (e.g. an npm
// consumer building it at its own base path for its own Pages deployment).
// It must include the leading and trailing slash, e.g. '/some-path/'.
const BASE = process.env.VITE_BASE_PATH ?? '/localgrid.dev/'

// https://vite.dev/config/
export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'localgrid.dev',
        short_name: 'localgrid',
        description: 'A client-side browser toolbox for developers',
        start_url: BASE,
        scope: BASE,
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        about: fileURLToPath(new URL('./about.html', import.meta.url)),
      },
    },
  },
})
