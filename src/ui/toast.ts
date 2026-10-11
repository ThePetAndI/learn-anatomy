/** Всплывающая подсказка сверху: «готово к работе без сети», ошибки. */

import { clear, h } from '../core/dom';
import { icon, type IconName } from './icons';

let host: HTMLElement | null = null;

function getHost(): HTMLElement {
  if (host && host.isConnected) return host;
  host = h('div', { class: 'toast-host', aria: { live: 'polite', role: 'status' } });
  document.body.append(host);
  return host;
}

export interface ToastOpts {
  text: string;
  iconName?: IconName;
  tone?: 'default' | 'good' | 'bad';
  ms?: number;
}

export function toast(opts: ToastOpts | string): void {
  const o: ToastOpts = typeof opts === 'string' ? { text: opts } : opts;
  const el = h(
    'div',
    { class: 'toast toast--' + (o.tone ?? 'default') },
    o.iconName ? icon(o.iconName) : null,
    h('span', { text: o.text }),
  );
  const parent = getHost();
  parent.append(el);
  // больше трёх одновременно — на узком экране превращается в кашу
  while (parent.children.length > 3) parent.firstElementChild?.remove();

  const life = o.ms ?? 2200;
  setTimeout(() => {
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 260);
  }, life);
}

export function clearToasts(): void {
  if (host) clear(host);
}
