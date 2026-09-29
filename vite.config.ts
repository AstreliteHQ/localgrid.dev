import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const appVersion = (JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8')) as {
  version: string
}).version

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
// BASE defaults to the domain root, since this deploys behind a custom
// domain rather than github.io/localgrid.dev's own subpath. It's overridable
// via VITE_BASE_PATH so this project can still be built and hosted from a
// different base path elsewhere (e.g. an npm consumer building it at its
// own base path for its own Pages deployment). A non-root value must
// include the leading and trailing slash, e.g. '/some-path/'.
const BASE = process.env.VITE_BASE_PATH ?? '/'

// Absolute public URL of the deployed app, used where crawlers and social
// link previews need a full URL rather than a path: canonical links, Open
// Graph/Twitter image and page URLs, robots.txt, and sitemap.xml. Defaults to
// the custom domain plus BASE. Overridable via VITE_SITE_URL (origin only, no
// trailing slash) for a deployment on another host.
const SITE_URL = (process.env.VITE_SITE_URL ?? 'https://localgrid.dev') + BASE

/** Fills the `%SITE_URL%` placeholder in index.html and about.html, and emits
 * robots.txt and sitemap.xml listing both pages, all derived from SITE_URL so
 * they can't drift from each other or from the base path. */
function seo(): Plugin {
  return {
    name: 'localgrid-seo',
    transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', SITE_URL),
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}sitemap.xml\n`,
      })
      const urls = [SITE_URL, `${SITE_URL}about.html`]
        .map((loc) => `  <url>\n    <loc>${loc}</loc>\n  </url>`)
        .join('\n')
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: BASE,
  // Baked in at build time, read by the sidebar's version footer — see
  // src/vite-env.d.ts for the matching ambient declaration.
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    react(),
    tailwindcss(),
    seo(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
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
