/**
 * Урок: какие задания собрать и что сохранить в конце.
 * Сам экран — проигрыватель из player.ts.
 */

import { push, replaceTop, type ScreenView } from '../core/router';
import { getState, update } from '../core/store';
import { now } from '../core/time';
import { allTerms, getDiagram, getPath, getRule, getTerm, termsBefore, type FlatLesson } from '../data/content';
import { recordLessonResult } from '../domain/progress';
import { reviewSelection } from '../domain/srs';
import { buildLesson } from '../lesson/build';
import { createPlayer } from './player';
import { createResultsScreen } from './results';

export function openLesson(lesson: FlatLesson): void {
  push(() => createLessonScreen(lesson), 'lesson:' + lesson.id);
}

/** Начать урок заново поверх итогов — без лишней записи в истории. */
export function replaceWithLesson(lesson: FlatLesson): void {
  replaceTop(() => createLessonScreen(lesson), 'lesson:' + lesson.id);
}

export function createLessonScreen(lesson: FlatLesson): ScreenView {
  const state = getState();
  const attemptNo = state.lessons[lesson.id]?.attempts ?? 0;
  const seed = lesson.id + ':' + attemptNo;
  /*
   * Пока урок не пройден, его собственные карточки — правила и новые термины —
   * показываются каждый раз: урок могли бросить на середине и вернуться через
   * неделю. После прохождения хватает заданий.
   */
  const own = new Set([...(lesson.rules ?? []).map((id) => 'r:' + id), ...lesson.terms.map((id) => 't:' + id)]);
  const completed = state.lessons[lesson.id]?.completedAt != null;
  const exercises = buildLesson({
    lesson,
    getTerm,
    getRule,
    getDiagram,
    getPath,
    allTerms: allTerms(),
    relationTasks: lesson.relations,
    earlier: termsBefore(lesson),
    seen: (k) => (completed || !own.has(k)) && state.seen[k] !== undefined,
    pickReview: (candidates, limit) => reviewSelection(getState(), candidates, limit, now()),
    seed,
  });

  return createPlayer({
    exercises,
    seed,
    where: lesson.id,
    ofWhat: 'урока',
    exitTitle: 'Выйти из урока?',
    exitText: 'Ответы уже записаны в повторение, но урок не будет отмечен пройденным.',
    onDone: (result) => {
      const ts = now();
      let firstCompletion = false;
      update((s) => {
        firstCompletion = recordLessonResult(s, lesson.id, result.accuracy, ts).firstCompletion;
      });
      replaceTop(() => createResultsScreen(lesson, result, firstCompletion), 'results:' + lesson.id);
    },
  });
}
