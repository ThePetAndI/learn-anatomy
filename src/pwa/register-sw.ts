/**
 * Регистрация service worker и мягкое предложение обновиться.
 * registerType: 'prompt' — не перезагружаем приложение посреди урока.
 */

import { registerSW } from 'virtual:pwa-register';
import { modal } from '../ui/modal';
import { toast } from '../ui/toast';

export function initServiceWorker(): void {
  if (import.meta.env.DEV) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      void (async () => {
        const m = modal({
          title: 'Есть обновление',
          text: 'Новая версия уже скачана. Обновить сейчас? Прогресс сохранится.',
          actions: [
            { label: 'Обновить', kind: 'primary', value: 'yes' },
            { label: 'Позже', kind: 'secondary', value: 'no' },
          ],
        });
        if ((await m.result) === 'yes') await updateSW(true);
      })();
    },
    onOfflineReady() {
      toast({ text: 'Сохранено на устройстве — теперь работает без сети', iconName: 'offline', tone: 'good' });
    },
    onRegisterError(err) {
      console.error('Service worker не зарегистрировался:', err);
    },
  });
}
