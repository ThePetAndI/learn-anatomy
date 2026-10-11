/** Нижняя панель вкладок — пять разделов из SPEC.md. */

import { h, onTap } from '../core/dom';
import { onTabChange, showTab, type TabId } from '../core/router';
import { icon, type IconName } from './icons';

const TABS: { id: TabId; label: string; iconName: IconName }[] = [
  { id: 'course', label: 'Курс', iconName: 'course' },
  { id: 'review', label: 'Повторение', iconName: 'review' },
  { id: 'dictionary', label: 'Словарь', iconName: 'dictionary' },
  { id: 'atlas', label: 'Атлас', iconName: 'atlas' },
  { id: 'profile', label: 'Профиль', iconName: 'user' },
];

export interface TabBar {
  el: HTMLElement;
  /** Точка на вкладке: там что-то ждёт — например, термины к повторению. */
  setDot: (id: TabId, on: boolean, label?: string) => void;
}

export function createTabBar(): TabBar {
  const buttons = new Map<TabId, HTMLElement>();
  const items = TABS.map((t) => {
    const btn = h(
      'button',
      { class: 'tab', attr: { type: 'button' }, aria: { role: 'tab', selected: 'false', label: t.label } },
      h('span', { class: 'tab__icon' }, icon(t.iconName), h('span', { class: 'tab__dot' })),
      h('span', { class: 'tab__label', text: t.label }),
    );
    onTap(btn, () => showTab(t.id));
    buttons.set(t.id, btn);
    return btn;
  });

  onTabChange((id) => {
    for (const [tabId, btn] of buttons) {
      const active = tabId === id;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    }
  });

  return {
    el: h('nav', { class: 'tabbar', aria: { role: 'tablist', label: 'Разделы' } }, ...items),
    setDot: (id, on, label) => {
      const btn = buttons.get(id);
      if (!btn) return;
      btn.classList.toggle('has-dot', on);
      const base = TABS.find((t) => t.id === id)?.label ?? '';
      btn.setAttribute('aria-label', on && label ? base + ', ' + label : base);
    },
  };
}
