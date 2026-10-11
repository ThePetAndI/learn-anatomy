/// <reference lib="webworker" />
/**
 * Service worker. Всё приложение — код, стили, шрифты, иконки, контент —
 * кладётся в precache при установке, дальше оно работает без сети целиком.
 * Сети в рантайме не требуется вообще.
 */

import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & typeof globalThis;

// список файлов подставляет vite-plugin-pwa на сборке
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// любая навигация внутри приложения отдаёт index.html из кэша
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(self.clients.claim());
});
