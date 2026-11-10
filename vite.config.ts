import { createHash } from 'node:crypto'
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

/** Origins outside the app's own that the page may load from. Kept to the
 * minimum: everything else (scripts, fetch/XHR/WebSocket, images, workers,
 * frames) is restricted to 'self' plus local data:/blob: URLs, so a
 * compromised dependency running in the page can't send data to a host of
 * its choosing. Adding an origin here widens that, so prefer serving a file
 * from the app itself (as emojiData() below does). */
const CSP_ALLOWED = {
  // Google Fonts stylesheet and font files (see index.html / about.html).
  style: ['https://fonts.googleapis.com'],
  font: ['https://fonts.gstatic.com'],
}

/** Builds the Content-Security-Policy for one HTML page. `scriptHashes` are
 * the hashes of the page's inline scripts (the pre-paint theme snippet). */
function contentSecurityPolicy(scriptHashes: string[]): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'none'"],
    // 'unsafe-eval': the Jinja Template Renderer (nunjucks) and JSON Schema
    // Validator (ajv) compile user input with `new Function`. It allows no
    // new network destinations, which every *-src below still governs.
    'script-src': ["'self'", "'unsafe-eval'", ...scriptHashes.map((hash) => `'sha256-${hash}'`)],
    // 'unsafe-inline': React style props, CodeMirror's injected <style> tags.
    'style-src': ["'self'", "'unsafe-inline'", ...CSP_ALLOWED.style],
    'font-src': ["'self'", ...CSP_ALLOWED.font],
    'img-src': ["'self'", 'data:', 'blob:'],
    'media-src': ["'self'", 'data:', 'blob:'],
    'connect-src': ["'self'", 'data:', 'blob:'],
    'worker-src': ["'self'", 'blob:'],
    'frame-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  }
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ')
}

/** Adds a Content-Security-Policy <meta> tag to every built HTML page.
 *
 * A <meta> tag rather than an HTTP header because GitHub Pages (both this
 * repo's deployment and localgrid.proxy's mirror) can't set custom headers.
 * It's injected at the top of <head>, before any script or stylesheet, since a
 * meta policy only governs what comes after it. Build only: the dev server
 * relies on inline scripts (React Refresh) and a HMR WebSocket that the
 * production policy would block. Inline script hashes are computed from the
 * final HTML, so editing the theme snippet can't silently break the policy.
 *
 * Also turns off DNS prefetching, which CSP doesn't cover and which could
 * otherwise leak data to a DNS server through `<link rel="dns-prefetch">`. */
function csp(): Plugin {
  return {
    name: 'localgrid-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const hashes: string[] = []
        for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
          const [, attributes, body] = match
          // External scripts are covered by 'self'. Data blocks such as
          // application/ld+json never execute, so CSP doesn't apply to them.
          if (/\bsrc\s*=/.test(attributes) || /\btype\s*=\s*["']?application\/ld\+json/.test(attributes)) continue
          hashes.push(createHash('sha256').update(body, 'utf8').digest('base64'))
        }
        const tags =
          `\n    <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(hashes)}" />` +
          `\n    <meta http-equiv="x-dns-prefetch-control" content="off" />`
        // Right after <meta charset> (which must stay within the first 1024
        // bytes), ahead of every script and stylesheet.
        const anchor = /<meta charset="[^"]*"\s*\/?>/i.exec(html)?.[0]
        if (!anchor) throw new Error('localgrid-csp: no <meta charset> to inject the policy after')
        return html.replace(anchor, `${anchor}${tags}`)
      },
    },
  }
}

/** Serves the emoji picker's data (frimousse fetches `<base>/en/data.json`
 * and `<base>/en/messages.json`) from this app's own origin, copied from the
 * pinned emojibase-data package, instead of letting it fetch from
 * cdn.jsdelivr.net at runtime. Keeps `connect-src` to 'self', and the files
 * get precached by the service worker so the picker works offline. */
const EMOJIBASE_FILES = ['en/data.json', 'en/messages.json']
function emojiData(): Plugin {
  const read = (file: string) =>
    readFileSync(fileURLToPath(new URL(`./node_modules/emojibase-data/${file}`, import.meta.url)))
  return {
    name: 'localgrid-emoji-data',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0] ?? ''
        const file = EMOJIBASE_FILES.find((name) => path === `${BASE}emojibase/${name}`)
        if (!file) return next()
        res.setHeader('Content-Type', 'application/json')
        res.end(read(file))
      })
    },
    generateBundle() {
      for (const file of EMOJIBASE_FILES) {
        this.emitFile({ type: 'asset', fileName: `emojibase/${file}`, source: read(file) })
      }
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
    csp(),
    emojiData(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Default app shell, plus the emoji picker's data (see emojiData()).
        globPatterns: ['**/*.{js,css,html}', 'emojibase/**/*.json'],
      },
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
