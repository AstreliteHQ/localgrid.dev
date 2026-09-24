/// <reference types="vite/client" />

/** package.json's `version`, baked in at build time — see the `define` in
 * vite.config.ts (and its mirror in vitest.config.ts, for tests). */
declare const __APP_VERSION__: string
