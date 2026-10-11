/**
 * Словарь: все термины курса. Без запроса — по разделам в порядке курса,
 * с запросом — поиск на обоих языках.
 */

import { h, onTap } from '../core/dom';
import type { ScreenView } from '../core/router';
import { getState } from '../core/store';
import { allTerms, lessonIntroducing, lessons, sections } from '../data/content';
import type { Term } from '../data/types';
import { searchTerms } from '../domain/search';
import { LEARNED_BOX } from '../domain/srs';
import { icon } from '../ui/icons';
import { kindTag } from '../ui/kind';
import { openTerm } from './term';

function row(t: Term): HTMLElement {
  const stat = getState().terms[t.id];
  const state = !stat || stat.seen === 0 ? 'is-new' : stat.box >= LEARNED_BOX ? 'is-learned' : 'is-known';
  const b = h(
    'button',
    { class: 'dict-row ' + state, attr: { type: 'button' } },
    h(
      'span',
      { class: 'dict-row__text' },
      h('span', { class: 'dict-row__en', attr: { lang: 'en' }, text: t.en }),
      h('span', { class: 'dict-row__ru', text: t.ru }),
    ),
    kindTag(t.kind),
    state === 'is-learned' ? h('span', { class: 'dict-row__mark', aria: { label: 'выучен' } }, icon('check')) : null,
  );
  onTap(b, () => openTerm(t.id));
  return b;
}

/** Термины в порядке курса: по разделам, внутри — по урокам; вне уроков — в конце. */
function grouped(): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const s of sections) {
    const ids = lessons.filter((l) => l.sectionId === s.id).flatMap((l) => l.terms);
    if (ids.length === 0) continue;
    out.push(h('h2', { class: 'dict__group', text: s.title }));
    out.push(...ids.map((id) => allTerms().find((t) => t.id === id)).filter((t): t is Term => !!t).map(row));
  }
  const loose = allTerms().filter((t) => !lessonIntroducing(t.id));
  if (loose.length > 0) {
    out.push(h('h2', { class: 'dict__group', text: 'Вне уроков' }));
    out.push(...loose.map(row));
  }
  return out;
}

export function createDictionaryScreen(): ScreenView {
  const input = h('input', {
    class: 'dict__input',
    attr: { type: 'search', autocomplete: 'off', spellcheck: 'false', placeholder: 'aorta или аорта' },
    aria: { label: 'Поиск по словарю' },
  });
  const list = h('div', { class: 'dict__list' });

  function render(): void {
    const q = input.value;
    if (q.trim() === '') {
      list.replaceChildren(...grouped());
      return;
    }
    const found = searchTerms(allTerms(), q);
    list.replaceChildren(
      ...(found.length > 0
        ? found.map(row)
        : [h('p', { class: 'dict__empty', text: 'Ничего не нашлось. Попробуйте начало слова — «лёгоч» или «pulmo».' })]),
    );
  }
  input.addEventListener('input', render);

  const el = h(
    'div',
    { class: 'screen screen--dictionary' },
    h(
      'div',
      { class: 'screen-body dict' },
      h('header', { class: 'page-head' }, h('div', { class: 'eyebrow', text: 'Словарь' }), h('h1', { class: 'page-title', text: 'Термины' })),
      h('label', { class: 'dict__search' }, icon('search'), input),
      list,
    ),
  );

  return { el, onShow: render };
}
