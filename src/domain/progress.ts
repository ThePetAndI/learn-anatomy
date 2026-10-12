/**
 * Прогресс по курсу: какие уроки пройдены, какой предложить следующим,
 * сколько процентов раздела готово.
 *
 * Открыт любой урок: порядок в курсе — рекомендованный, а не обязательный.
 * Если урок опирается на термин, которого человек ещё не видел, сборщик
 * ставит перед заданием его карточку.
 */

import type { SaveState } from '../data/state';

export interface LessonRef {
  id: string;
  order: number;
  sectionId: string;
}

export function isCompleted(state: SaveState, lessonId: string): boolean {
  return (state.lessons[lessonId]?.completedAt ?? null) !== null;
}

/**
 * Урок, с которого продолжить: следующий непройденный после последнего
 * пройденного — в том же разделе, ведь человек мог начать с середины курса.
 * Если дальше в разделе всё пройдено — первый непройденный в этом разделе,
 * а если и там всё — первый непройденный по курсу.
 */
export function nextLesson<L extends LessonRef>(state: SaveState, all: readonly L[]): L | undefined {
  let last: L | undefined;
  let lastAt = -Infinity;
  for (const l of all) {
    const at = state.lessons[l.id]?.completedAt ?? null;
    if (at !== null && at >= lastAt) {
      lastAt = at;
      last = l;
    }
  }
  const pending = (l: L): boolean => !isCompleted(state, l.id);
  const inSection = (l: L): boolean => last !== undefined && l.sectionId === last.sectionId;
  return (
    all.find((l) => inSection(l) && l.order > last!.order && pending(l)) ??
    all.find((l) => inSection(l) && pending(l)) ??
    all.find(pending)
  );
}

/** Доля пройденных уроков раздела, 0..1. В разделе без уроков — 0. */
export function sectionProgress(state: SaveState, lessonIds: readonly string[]): number {
  if (lessonIds.length === 0) return 0;
  const done = lessonIds.filter((id) => isCompleted(state, id)).length;
  return done / lessonIds.length;
}

export interface LessonOutcome {
  firstCompletion: boolean;
}

/** Записать урок, пройденный до конца. accuracy — доля верных попыток, 0..1. */
export function recordLessonResult(
  state: SaveState,
  lessonId: string,
  accuracy: number,
  ts: number,
): LessonOutcome {
  const prev = state.lessons[lessonId] ?? { attempts: 0, completedAt: null, best: 0 };
  const firstCompletion = prev.completedAt === null;
  state.lessons[lessonId] = {
    attempts: prev.attempts + 1,
    completedAt: prev.completedAt ?? ts,
    best: Math.max(prev.best, Math.min(1, Math.max(0, accuracy))),
  };
  return { firstCompletion };
}
