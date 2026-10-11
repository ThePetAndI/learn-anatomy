/**
 * Повторение: что пора повторить сегодня.
 *
 * Термины приходят из интервального повторения: ошибка возвращает термин
 * через несколько минут, выученное — всё реже. Когда по сроку нечего,
 * можно повторить самые трудные. Повторение раздела — то же самое, но только
 * из терминов одного раздела: открывается кнопкой в Курсе.
 * Повторение — тренировка: оно двигает сроки терминов, но уроки не отмечает.
 */

import { h } from '../core/dom';
import { pop, push, replaceTop, type ScreenView } from '../core/router';
import { getState } from '../core/store';
import { formatIn, now, plural } from '../core/time';
import { allTerms, findTerm, getDiagram, getPath, getRule, getTerm, sectionTerms } from '../data/content';
import type { Term } from '../data/types';
import { dueTerms, hardestTerms, isDue, nextDueAt, reviewSelection, termsSummary } from '../domain/srs';
import { buildLesson } from '../lesson/build';
import type { SessionResult } from '../lesson/engine';
import { button } from '../ui/button';
import { kindTag } from '../ui/kind';
import { createPlayer } from './player';

/** Терминов в одной сессии повторения: пары и по заданию на каждый — до десяти заданий. */
export const REVIEW_TERMS = 8;

/** Что повторять: всё, что пора; самое трудное; один раздел. */
export type ReviewScope =
  | { kind: 'due' }
  | { kind: 'hard' }
  | { kind: 'section'; sectionId: string; title: string };

function pickTerms(scope: ReviewScope): string[] {
  const state = getState();
  const ts = now();
  switch (scope.kind) {
    case 'due':
      return dueTerms(state, ts, REVIEW_TERMS);
    case 'hard':
      return hardestTerms(state, REVIEW_TERMS);
    case 'section':
      // сначала то, что пора, потом трудное — только из встреченных терминов раздела
      return reviewSelection(state, sectionTerms(scope.sectionId), REVIEW_TERMS, ts);
  }
}

/** Сколько терминов раздела пора повторить прямо сейчас. */
export function sectionDueCount(sectionId: string): number {
  const state = getState();
  const ts = now();
  return sectionTerms(sectionId).filter((id) => {
    const stat = state.terms[id];
    return stat !== undefined && isDue(stat, ts);
  }).length;
}

/** Встречались ли термины раздела вообще — есть ли что повторять. */
export function sectionHasSeen(sectionId: string): boolean {
  const terms = getState().terms;
  return sectionTerms(sectionId).some((id) => (terms[id]?.seen ?? 0) > 0);
}

/** Термины, которые человек уже видел: из них неверные варианты. */
function knownTerms(): Term[] {
  const seen = getState().seen;
  return allTerms().filter((t) => seen['t:' + t.id] !== undefined);
}

export function openReview(scope: ReviewScope, replace = false): void {
  const ids = pickTerms(scope);
  if (ids.length === 0) return;
  const factory = (): ScreenView => createReviewSession(ids, scope);
  if (replace) replaceTop(factory, 'review-session');
  else push(factory, 'review-session');
}

function createReviewSession(ids: string[], scope: ReviewScope): ScreenView {
  const seed = 'review:' + now();
  const state = getState();
  const exercises = buildLesson({
    lesson: { id: 'review', terms: [], review: ids },
    getTerm,
    getRule,
    getDiagram,
    getPath,
    allTerms: allTerms(),
    // в повторении — всё, что человек уже знает, включая связи
    relationTasks: true,
    earlier: knownTerms(),
    seen: (k) => state.seen[k] !== undefined,
    // список уже выбран интервальным повторением — добирать нечего
    pickReview: () => [],
    seed,
  });
  return createPlayer({
    exercises,
    seed,
    where: scope.kind === 'section' ? 'review:' + scope.sectionId : 'review',
    ofWhat: 'занятия',
    exitTitle: 'Закончить повторение?',
    exitText: 'Ответы уже записаны: следующие сроки терминов сдвинулись.',
    onDone: (result) => replaceTop(() => createReviewResults(result, scope), 'review-results'),
  });
}

function termRow(t: Term): HTMLElement {
  return h(
    'li',
    { class: 'term-list__item' },
    h('div', { class: 'term-list__en', attr: { lang: 'en' }, text: t.en }),
    h('div', { class: 'term-list__ru', text: t.ru }),
    kindTag(t.kind),
  );
}

function createReviewResults(result: SessionResult, scope: ReviewScope): ScreenView {
  const missed = result.missedTermIds.map(findTerm).filter((t): t is Term => t !== undefined);
  // «ещё» — в том же объёме: после повторения раздела предлагаем снова раздел
  const more = scope.kind === 'section' ? sectionDueCount(scope.sectionId) : dueTerms(getState(), now()).length;
  const eyebrow = scope.kind === 'section' ? scope.title : scope.kind === 'due' ? 'Повторение' : 'Трудные термины';
  const el = h(
    'div',
    { class: 'screen screen--results' },
    h(
      'div',
      { class: 'screen-body results' },
      h('div', { class: 'eyebrow', text: eyebrow }),
      h('h1', { class: 'results__title', text: 'Готово' }),
      h('div', { class: 'results__score', text: 'Верно ' + result.correct + ' из ' + result.attempts }),
      missed.length > 0
        ? h(
            'section',
            { class: 'results__missed' },
            h('h2', { class: 'results__subtitle', text: 'Ошибки' }),
            h('p', {
              class: 'results__note',
              text: (missed.length === 1 ? 'Этот термин вернётся' : 'Эти термины вернутся') + ' через несколько минут.',
            }),
            h('ul', { class: 'term-list' }, ...missed.map(termRow)),
          )
        : null,
      h(
        'div',
        { class: 'results__actions' },
        more > 0
          ? button({
              label: 'Ещё повторение · ' + more,
              wide: true,
              iconName: 'arrowRight',
              iconAfter: true,
              onTap: () => openReview(scope.kind === 'section' ? scope : { kind: 'due' }, true),
            })
          : null,
        button({ label: 'Готово', kind: more > 0 ? 'secondary' : 'primary', wide: true, onTap: () => pop() }),
      ),
    ),
  );
  return { el };
}

/** Вкладка «Повторение». */
export function createReviewScreen(): ScreenView {
  const body = h('div', { class: 'screen-body review' });
  const el = h('div', { class: 'screen screen--review' }, body);

  function render(): void {
    const state = getState();
    const ts = now();
    const due = dueTerms(state, ts);
    const sum = termsSummary(state, ts);
    const next = nextDueAt(state);

    const head = h(
      'header',
      { class: 'page-head' },
      h('div', { class: 'eyebrow', text: 'Повторение' }),
      h('h1', { class: 'page-title', text: due.length > 0 ? 'Пора повторить' : 'Всё повторено' }),
    );

    let main: HTMLElement;
    if (sum.seen === 0) {
      main = h('p', { class: 'review__note', text: 'Повторение начнётся после первого урока: сюда будут возвращаться пройденные термины.' });
    } else if (due.length > 0) {
      main = h(
        'div',
        { class: 'review__due' },
        h('div', { class: 'review__count' }, h('span', { class: 'review__num', text: String(due.length) }), ' ' + plural(due.length, 'термин ждёт', 'термина ждут', 'терминов ждут') + ' повторения'),
        button({
          label: due.length > REVIEW_TERMS ? 'Повторить ' + REVIEW_TERMS + ' из ' + due.length : 'Повторить',
          wide: true,
          iconName: 'arrowRight',
          iconAfter: true,
          onTap: () => openReview({ kind: 'due' }),
        }),
      );
    } else {
      main = h(
        'div',
        { class: 'review__due' },
        h('p', { class: 'review__note', text: 'По сроку сейчас повторять нечего. Следующее — ' + (next === null ? 'после урока' : formatIn(next - ts)) + '.' }),
        button({ label: 'Повторить трудные', kind: 'secondary', wide: true, onTap: () => openReview({ kind: 'hard' }) }),
      );
    }

    const list = due.slice(0, 40).map(findTerm).filter((t): t is Term => t !== undefined);
    body.replaceChildren(
      head,
      main,
      h(
        'dl',
        { class: 'facts review__facts' },
        h('dt', { text: 'Встречено' }),
        h('dd', { text: sum.seen + ' ' + plural(sum.seen, 'термин', 'термина', 'терминов') }),
        h('dt', { text: 'Выучено надолго' }),
        h('dd', { text: String(sum.learned) }),
      ),
      list.length > 0 ? h('h2', { class: 'page-subtitle', text: 'Что пора повторить' }) : '',
      list.length > 0 ? h('ul', { class: 'term-list' }, ...list.map(termRow)) : '',
      due.length > list.length ? h('p', { class: 'review__note', text: 'и ещё ' + (due.length - list.length) }) : '',
    );
  }

  /*
   * Экран дешёвый — рисуем заново при каждом показе. Пока он открыт, сроки
   * подходят сами по себе, без изменений в сохранении, — поэтому ещё и раз в минуту.
   */
  let timer: ReturnType<typeof setInterval> | null = null;

  return {
    el,
    onShow: () => {
      render();
      timer ??= setInterval(render, 60_000);
    },
    onHide: () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    },
  };
}
