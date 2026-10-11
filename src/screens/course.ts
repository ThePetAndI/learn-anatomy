/**
 * Курс: разделы и уроки по порядку, прогресс раздела в процентах.
 * Уроки раздела нанизаны на вертикальную линию, как ветви на сосуд:
 * пройденный — залитый узел, текущий — кольцо, закрытый — серый.
 * Любой раздел можно начать сразу; у раздела, где термины уже встречались,
 * есть кнопка «Повторить раздел».
 */

import { h, onTap } from '../core/dom';
import type { ScreenView } from '../core/router';
import { getState, subscribe } from '../core/store';
import { plural } from '../core/time';
import { lessons, lessonsOf, sections, type FlatLesson } from '../data/content';
import type { CourseSystem, Section } from '../data/types';
import { isCompleted, isOpen, nextLesson, sectionProgress } from '../domain/progress';
import { icon } from '../ui/icons';
import { openLesson } from './lesson';
import { openReview, sectionDueCount, sectionHasSeen } from './review';

const SYSTEM_TITLE: Record<CourseSystem, string> = {
  circulatory: 'Кровеносная система',
  nervous: 'Нервная система',
};

function lessonMeta(l: FlatLesson): string {
  if (l.terms.length === 0) return 'повторение';
  return l.terms.length + ' ' + plural(l.terms.length, 'новый термин', 'новых термина', 'новых терминов');
}

function lessonRow(l: FlatLesson, current: FlatLesson | undefined): HTMLElement {
  const state = getState();
  const done = isCompleted(state, l.id);
  const open = isOpen(state, l, lessons);
  const isCurrent = current?.id === l.id;
  const status = done ? 'is-done' : isCurrent ? 'is-current' : open ? 'is-open' : 'is-locked';

  const row = h(
    'button',
    {
      class: 'lesson-row ' + status,
      attr: { type: 'button', disabled: !open },
      aria: { label: l.title + (done ? ', пройден' : open ? '' : ', закрыт') },
    },
    h('span', { class: 'lesson-row__node' }, done ? icon('check') : null),
    h(
      'span',
      { class: 'lesson-row__text' },
      h('span', { class: 'lesson-row__title', text: l.title }),
      h('span', { class: 'lesson-row__meta', text: lessonMeta(l) }),
    ),
    open ? null : icon('lock', 'icon lesson-row__lock'),
  );
  if (open) onTap(row, () => openLesson(l));
  return row;
}

function sectionBlock(s: Section, number: number, current: FlatLesson | undefined): HTMLElement {
  const list = lessonsOf(s.id);
  const pct = Math.round(sectionProgress(getState(), list.map((l) => l.id)) * 100);
  const empty = list.length === 0;

  return h(
    'section',
    { class: 'section section--' + s.system + (empty ? ' is-empty' : '') },
    h(
      'header',
      { class: 'section__head' },
      h('span', { class: 'section__num', text: String(number) }),
      h('h3', { class: 'section__title', text: s.title }),
      h('span', { class: 'section__pct', text: empty ? 'готовится' : pct + '%' }),
    ),
    empty
      ? null
      : h(
          'div',
          { class: 'section__progress', aria: { role: 'progressbar', valuenow: pct, valuemin: 0, valuemax: 100 } },
          h('span', { style: { transform: 'scaleX(' + pct / 100 + ')' } }),
        ),
    empty ? null : h('div', { class: 'lesson-list' }, ...list.map((l) => lessonRow(l, current))),
    empty ? null : sectionReview(s),
  );
}

/** «Повторить раздел»: только термины этого раздела, сначала то, что пора. */
function sectionReview(s: Section): HTMLElement | null {
  if (!sectionHasSeen(s.id)) return null;
  const due = sectionDueCount(s.id);
  const b = h(
    'button',
    { class: 'section-review', attr: { type: 'button' } },
    icon('review'),
    h('span', { class: 'section-review__label', text: 'Повторить раздел' }),
    // подпись — только когда есть что повторять по сроку; иначе повторение берёт трудное
    due > 0 ? h('span', { class: 'section-review__meta', text: 'пора: ' + due }) : null,
  );
  onTap(b, () => openReview({ kind: 'section', sectionId: s.id, title: s.title }));
  return b;
}

function continueCard(current: FlatLesson | undefined): HTMLElement | null {
  if (!current) return null;
  const section = sections.find((s) => s.id === current.sectionId);
  const card = h(
    'button',
    { class: 'continue', attr: { type: 'button' } },
    h(
      'span',
      { class: 'continue__text' },
      h('span', { class: 'continue__label', text: current.order === 0 ? 'Начать' : 'Продолжить' }),
      h('span', { class: 'continue__title', text: current.title }),
      section ? h('span', { class: 'continue__section', text: section.title }) : null,
    ),
    icon('arrowRight', 'icon continue__arrow'),
  );
  onTap(card, () => openLesson(current));
  return card;
}

export function createCourseScreen(): ScreenView {
  const body = h('div', { class: 'screen-body course' });
  const el = h('div', { class: 'screen screen--course' }, body);

  function render(): void {
    const current = nextLesson(getState(), lessons);
    const groups = (['circulatory', 'nervous'] as const).map((system) => {
      const list = sections.filter((s) => s.system === system);
      return h(
        'div',
        { class: 'system system--' + system },
        h('h2', { class: 'system__title', text: SYSTEM_TITLE[system] }),
        ...list.map((s) => sectionBlock(s, list.indexOf(s) + 1, current)),
      );
    });

    body.replaceChildren(
      h(
        'header',
        { class: 'course__head' },
        h('div', { class: 'eyebrow', text: 'Курс' }),
        h('h1', { class: 'course__title', text: 'Анатомия' }),
        h('p', { class: 'course__sub', text: 'Кровеносная и нервная системы: термины по-английски и по-русски' }),
      ),
      continueCard(current) ?? h('p', { class: 'course__done', text: 'Все готовые уроки пройдены. Новые разделы появятся здесь.' }),
      ...groups,
    );
  }

  let dirty = true;
  subscribe(() => {
    dirty = true;
  });

  return {
    el,
    onShow: () => {
      if (dirty) {
        render();
        dirty = false;
      }
    },
  };
}
