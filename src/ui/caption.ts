/** Подпись структуры на схеме — на обоих языках, с меткой вида. */

import { h } from '../core/dom';
import type { TermKind } from '../data/types';
import { kindTag } from './kind';

export interface CaptionContent {
  en: string;
  ru: string;
  kind: TermKind;
  /** Строка над названием: «Вы нажали:». */
  lead?: string;
  about?: string;
}

export interface CaptionHandle {
  el: HTMLElement;
  show: (c: CaptionContent) => void;
  /** Вместо названия — подсказка, что делать. */
  hint: (text: string) => void;
}

export function createCaption(): CaptionHandle {
  const el = h('div', { class: 'caption', aria: { live: 'polite' } });
  return {
    el,
    show(c) {
      el.replaceChildren(
        c.lead ? h('div', { class: 'caption__hint', text: c.lead }) : '',
        h('div', { class: 'caption__en', attr: { lang: 'en' }, text: c.en }),
        h('div', { class: 'caption__ru', text: c.ru }),
        kindTag(c.kind),
        c.about ? h('p', { class: 'caption__about', text: c.about }) : '',
      );
    },
    hint(text) {
      el.replaceChildren(h('div', { class: 'caption__hint', text }));
    },
  };
}
