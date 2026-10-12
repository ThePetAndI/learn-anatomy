/**
 * Итоги урока: сколько верно и какие термины стоит повторить.
 * Без звёзд и наград — только то, что полезно для учёбы.
 */

import { h } from '../core/dom';
import { pop, type ScreenView } from '../core/router';
import { plural } from '../core/time';
import { findTerm, lessons, sections, type FlatLesson } from '../data/content';
import type { SessionResult } from '../lesson/engine';
import { button } from '../ui/button';
import { kindTag } from '../ui/kind';
import { replaceWithLesson } from './lesson';
import { openReview } from './review';

export function createResultsScreen(
  lesson: FlatLesson,
  result: SessionResult,
  firstCompletion: boolean,
): ScreenView {
  // следующий — только в этом же разделе: разделы независимы, и в конце раздела
  // естественнее вернуться к курсу или повторить раздел, чем попасть в соседний
  const next = lessons.find((l) => l.sectionId === lesson.sectionId && l.order === lesson.order + 1);
  const section = sections.find((sec) => sec.id === lesson.sectionId);

  const missed = result.missedTermIds
    .map(findTerm)
    .filter((t): t is NonNullable<typeof t> => t !== undefined);

  const score =
    result.attempts === 0
      ? 'Заданий-проверок не было'
      : 'Верно ' + result.correct + ' из ' + result.attempts;

  const actions = h(
    'div',
    { class: 'results__actions' },
    next
      ? button({
          label: 'Следующий урок',
          wide: true,
          iconName: 'arrowRight',
          iconAfter: true,
          onTap: () => replaceWithLesson(next),
        })
      : null,
    button({
      label: 'К курсу',
      kind: next ? 'secondary' : 'primary',
      wide: true,
      onTap: () => pop(),
    }),
    // раздел пройден до конца — самое время его повторить
    !next && section
      ? button({
          label: 'Повторить раздел',
          kind: 'secondary',
          wide: true,
          iconName: 'review',
          onTap: () => openReview({ kind: 'section', sectionId: section.id, title: section.title }, true),
        })
      : null,
    button({ label: 'Пройти ещё раз', kind: 'secondary', wide: true, onTap: () => replaceWithLesson(lesson) }),
  );

  const el = h(
    'div',
    { class: 'screen screen--results' },
    h(
      'div',
      { class: 'screen-body results' },
      h('div', { class: 'eyebrow', text: firstCompletion ? 'Урок пройден' : 'Урок пройден ещё раз' }),
      h('h1', { class: 'results__title', text: lesson.title }),
      h('div', { class: 'results__score', text: score }),
      missed.length > 0
        ? h(
            'section',
            { class: 'results__missed' },
            h('h2', {
              class: 'results__subtitle',
              text: 'Ошибки были в ' + missed.length + ' ' + plural(missed.length, 'термине', 'терминах', 'терминах'),
            }),
            h('p', {
              class: 'results__note',
              text:
                missed.length === 1
                  ? 'Он вернётся в повторении раньше остальных.'
                  : 'Они вернутся в повторении раньше остальных.',
            }),
            h(
              'ul',
              { class: 'term-list' },
              ...missed.map((t) =>
                h(
                  'li',
                  { class: 'term-list__item' },
                  h('div', { class: 'term-list__en', attr: { lang: 'en' }, text: t.en }),
                  h('div', { class: 'term-list__ru', text: t.ru }),
                  kindTag(t.kind),
                ),
              ),
            ),
          )
        : result.attempts > 0
          ? h('p', { class: 'results__note', text: 'Без ошибок.' })
          : null,
      actions,
    ),
  );

  return { el };
}
