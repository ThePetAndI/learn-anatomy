/**
 * Инлайн-SVG иконки. Никаких эмодзи и иконочных шрифтов.
 * Сетка 24×24, линия 1.8, цвет — currentColor.
 */

import { svgFrom } from '../core/dom';

const S = (body: string): string =>
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" ' +
  'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';

export const ICONS = {
  close: S('<path d="M6 6l12 12M18 6 6 18"/>'),
  check: S('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  cross: S('<path d="M7 7l10 10M17 7 7 17"/>'),
  arrowRight: S('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  /** Курс: раскрытая книга. */
  course: S('<path d="M3.5 5.5c3-1 6-.8 8.5 1v12.5c-2.5-1.8-5.5-2-8.5-1Z"/><path d="M20.5 5.5c-3-1-6-.8-8.5 1v12.5c2.5-1.8 5.5-2 8.5-1Z"/>'),
  /** Профиль. */
  user: S('<circle cx="12" cy="8.5" r="3.6"/><path d="M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6"/>'),
  /** Правило: абзац с отметкой. */
  rule: S('<path d="M5 5h14M5 9.5h14M5 14h9M5 18.5h6"/>'),
  backspace: S('<path d="M9 5.5h10.5v13H9L3.5 12Z"/><path d="m12 9.5 4 5M16 9.5l-4 5"/>'),
  refresh: S('<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>'),
  plus: S('<path d="M12 5.5v13M5.5 12h13"/>'),
  minus: S('<path d="M5.5 12h13"/>'),
  /** Вернуть схему целиком. */
  fit: S('<path d="M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15"/>'),
  /** Атлас: схема в рамке. */
  atlas: S('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9.5 4.5v15M9.5 11c3 0 5-2 7-5M9.5 14c3 0 6 1 8 4"/>'),
  /** Флажок «Что не так?». */
  flag: S('<path d="M6 20.5V4.5"/><path d="M6 5c3.5-2 6.5 2 12 0v8c-5.5 2-8.5-2-12 0"/>'),
  /** Повторение: две стрелки по кругу. */
  review: S('<path d="M19 8.5A7.5 7.5 0 0 0 5.6 7.4"/><path d="M5 4v3.8h3.8"/><path d="M5 15.5a7.5 7.5 0 0 0 13.4 1.1"/><path d="M19 20v-3.8h-3.8"/>'),
  /** Словарь: книга с закладкой. */
  dictionary: S('<path d="M5.5 4.5h11a2 2 0 0 1 2 2v13h-11a2 2 0 0 1-2-2Z"/><path d="M5.5 17.5a2 2 0 0 1 2-2h11"/><path d="M10 4.5v6l2-1.5 2 1.5v-6"/>'),
  search: S('<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>'),
  copy: S('<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>'),
  download: S('<path d="M12 4.5v10M7.5 10.5l4.5 4.5 4.5-4.5"/><path d="M5 19.5h14"/>'),
  upload: S('<path d="M12 15V5M7.5 9.5 12 5l4.5 4.5"/><path d="M5 19.5h14"/>'),
  trash: S('<path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7"/>'),
  back: S('<path d="M14.5 6 8.5 12l6 6"/>'),
  offline: S('<path d="M12 4.5v10M8 10.5l4 4 4-4"/><path d="M5 19.5h14"/>'),
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName, cls = 'icon'): SVGSVGElement {
  const el = svgFrom(ICONS[name]);
  el.setAttribute('class', cls);
  return el;
}
