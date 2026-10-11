import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

// База для хостинга в подпапке подставляется снаружи: VITE_BASE=/<папка>/
const base = process.env.VITE_BASE ?? '/';

/** Цвет шапки и заставки — бумага атласа, не цветной фон. */
const PAPER = '#F4EFE6';

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    assetsInlineLimit: 4096,
  },
  server: {
    host: true,
    port: 5173,
  },
  plugins: [
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/pwa',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: null,
      injectManifest: {
        // всё, что нужно для офлайна: код, стили, шрифты, иконки, схемы
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,json,webmanifest}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
      devOptions: {
        enabled: false,
        type: 'module',
      },
      manifest: {
        id: 'learn-anatomy',
        name: 'Анатомия — кровеносная и нервная системы',
        short_name: 'Анатомия',
        description: 'Термины анатомии парами английский — русский: уроки, схемы, повторение.',
        lang: 'ru',
        dir: 'ltr',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: PAPER,
        theme_color: PAPER,
        categories: ['education', 'medical'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
