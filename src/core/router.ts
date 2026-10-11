/**
 * Навигация: корневые вкладки плюс стек экранов поверх них (урок, итоги).
 * Аппаратная «назад» на Android разбирает стек через history API.
 */

import { afterAnimation } from './dom';

/** Вкладки по SPEC.md. */
export type TabId = 'course' | 'review' | 'dictionary' | 'atlas' | 'profile';

export interface ScreenView {
  el: HTMLElement;
  /** Вызывается каждый раз, когда экран становится видимым. */
  onShow?: () => void;
  onHide?: () => void;
  /** Освобождение таймеров и слушателей при закрытии. */
  destroy?: () => void;
  /** Системная «назад» на этом экране. false — экран сам решил, что делать (например, спросил). */
  onBack?: () => boolean;
}

export type ViewFactory = () => ScreenView;

interface StackEntry {
  view: ScreenView;
  /** Ключ, чтобы не открывать один и тот же экран дважды подряд. */
  key: string;
}

let stage: HTMLElement | null = null;
let overlayHost: HTMLElement | null = null;
const tabs = new Map<TabId, ViewFactory>();
const tabViews = new Map<TabId, ScreenView>();
let activeTab: TabId | null = null;
const stack: StackEntry[] = [];
const tabListeners = new Set<(tab: TabId) => void>();

export function mountRouter(stageEl: HTMLElement, overlayEl: HTMLElement): void {
  stage = stageEl;
  overlayHost = overlayEl;
  window.addEventListener('popstate', onPopState);
  history.replaceState({ depth: 0 }, '');
}

export function registerTab(id: TabId, factory: ViewFactory): void {
  tabs.set(id, factory);
}

export function onTabChange(fn: (tab: TabId) => void): () => void {
  tabListeners.add(fn);
  return () => tabListeners.delete(fn);
}

export function showTab(id: TabId): void {
  if (!stage) throw new Error('Роутер не смонтирован');
  closeAll();
  if (activeTab === id && tabViews.has(id)) return;

  const prev = activeTab !== null ? tabViews.get(activeTab) : undefined;
  prev?.onHide?.();

  let view = tabViews.get(id);
  if (!view) {
    const factory = tabs.get(id);
    if (!factory) throw new Error('Вкладка не зарегистрирована: ' + id);
    view = factory();
    tabViews.set(id, view);
  }

  // старый экран лежит под новым, пока тот проявляется: без вспышки фона между ними
  const next = view;
  next.el.classList.add('screen--enter');
  stage.append(next.el);
  activeTab = id;
  next.onShow?.();
  void afterAnimation(next.el, 260).then(() => {
    next.el.classList.remove('screen--enter');
    const stillActive = activeTab !== null && tabViews.get(activeTab) === prev;
    if (prev && prev !== next && !stillActive) prev.el.remove();
  });
  for (const fn of tabListeners) fn(id);
}

/** Открыть экран поверх текущего. key защищает от двойного открытия по дабл-тапу. */
export function push(factory: ViewFactory, key = ''): ScreenView | null {
  if (!overlayHost) throw new Error('Роутер не смонтирован');
  if (key && stack.some((e) => e.key === key)) return null;
  const view = factory();
  view.el.classList.add('screen--push');
  overlayHost.append(view.el);
  overlayHost.classList.remove('hidden');
  stack.push({ view, key });
  view.onShow?.();
  void afterAnimation(view.el, 320).then(() => view.el.classList.remove('screen--push'));
  // своя запись в истории, чтобы системная «назад» закрывала именно этот экран
  history.pushState({ depth: stack.length }, '');
  return view;
}

/** Закрыть верхний экран. */
export function pop(syncHistory = true): void {
  const entry = stack.pop();
  if (!entry) return;
  const { view } = entry;
  view.onHide?.();
  view.el.classList.add('screen--pop');
  void afterAnimation(view.el, 320).then(() => {
    view.el.remove();
    view.destroy?.();
    if (stack.length === 0 && overlayHost) overlayHost.classList.add('hidden');
  });
  if (syncHistory && history.state?.depth === stack.length + 1) history.back();
  // вкладка под стеком снова видна — пусть обновится
  if (stack.length === 0 && activeTab !== null) tabViews.get(activeTab)?.onShow?.();
}

/** Закрыть все экраны стека разом — при переходе на вкладку. */
export function closeAll(): void {
  while (stack.length) {
    const entry = stack.pop();
    if (!entry) break;
    entry.view.onHide?.();
    entry.view.el.remove();
    entry.view.destroy?.();
  }
  if (overlayHost) overlayHost.classList.add('hidden');
}

/** Заменить верхний экран — переход «урок → итоги» без лишней записи в истории. */
export function replaceTop(factory: ViewFactory, key = ''): ScreenView | null {
  if (!overlayHost) throw new Error('Роутер не смонтирован');
  const top = stack.pop();
  top?.view.onHide?.();

  const view = factory();
  view.el.classList.add('screen--enter');
  overlayHost.append(view.el);
  overlayHost.classList.remove('hidden');
  stack.push({ view, key });
  view.onShow?.();
  void afterAnimation(view.el, 260).then(() => {
    view.el.classList.remove('screen--enter');
    // прежний экран убираем под уже проявившимся новым
    if (top) {
      top.view.el.remove();
      top.view.destroy?.();
    }
  });
  return view;
}

function onPopState(): void {
  const top = stack[stack.length - 1];
  if (top) {
    // экран может не отпустить сразу — например, урок спросит, точно ли выйти
    if (top.view.onBack && !top.view.onBack()) {
      history.pushState({ depth: stack.length }, '');
      return;
    }
    pop(false);
  } else if (activeTab !== null && activeTab !== 'course') {
    // с любой вкладки «назад» возвращает на курс, а не закрывает приложение
    history.pushState({ depth: 0 }, '');
    showTab('course');
  }
}
