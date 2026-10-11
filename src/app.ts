/** Сборка приложения: каркас, вкладки, запуск. */

import { h, qs } from './core/dom';
import { mountRouter, registerTab, showTab } from './core/router';
import { getState, initStore, subscribe } from './core/store';
import { now, plural } from './core/time';
import { requestPersistentStorage } from './data/db';
import { dueCount } from './domain/srs';
import { initServiceWorker } from './pwa/register-sw';
import { createAtlasScreen } from './screens/atlas';
import { createCourseScreen } from './screens/course';
import { createDictionaryScreen } from './screens/dictionary';
import { createProfileScreen } from './screens/profile';
import { createReviewScreen } from './screens/review';
import { applyReducedMotion } from './ui/motion';
import { createTabBar } from './ui/tabbar';

export async function bootstrap(): Promise<void> {
  const root = qs<HTMLElement>('#app');

  await initStore();
  applyReducedMotion(getState().settings.reducedMotion);
  // просим браузер не удалять прогресс при нехватке места
  void requestPersistentStorage();
  initServiceWorker();

  const stage = h('main', { class: 'app-stage' });
  const overlay = h('div', { class: 'app-overlay hidden' });
  const tabbar = createTabBar();
  root.replaceChildren(stage, tabbar.el, overlay);

  mountRouter(stage, overlay);
  registerTab('course', createCourseScreen);
  registerTab('review', createReviewScreen);
  registerTab('dictionary', createDictionaryScreen);
  registerTab('atlas', createAtlasScreen);
  registerTab('profile', createProfileScreen);
  showTab('course');

  // точка на «Повторении»: сроки подходят и без действий человека — проверяем ещё и по таймеру
  const dots = (): void => {
    const n = dueCount(getState(), now());
    tabbar.setDot('review', n > 0, n + ' ' + plural(n, 'термин ждёт', 'термина ждут', 'терминов ждут'));
  };
  subscribe(dots);
  setInterval(dots, 60_000);
  dots();

  // заставку убираем, когда шрифты готовы — иначе мелькнёт системный
  await waitForFonts();
  hideBootSplash();
}

async function waitForFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]);
  } catch {
    /* шрифты не критичны для запуска */
  }
}

function hideBootSplash(): void {
  const boot = document.getElementById('boot');
  if (!boot) return;
  boot.classList.add('is-gone');
  setTimeout(() => boot.remove(), 500);
}
