/**
 * Прогресс по курсу: какие уроки пройдены, какой открыт следующим,
 * сколько процентов раздела готово.
 *
 * Любой раздел можно начать сразу: его первый урок открыт всегда.
 * Внутри раздела уроки открываются по порядку — следующий, когда пройден
 * предыдущий: раздел идёт от общего к частному. Если урок опирается
 * на термин непройденного раздела, сборщик ставит перед заданием его карточку.
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

/** Открыт ли урок: первый в разделе — всегда, остальные — после предыдущего в том же разделе. */
export function isOpen(state: SaveState, lesson: LessonRef, all: readonly LessonRef[]): boolean {
  if (isCompleted(state, lesson.id)) return true;
  const prev = all.find((l) => l.sectionId === lesson.sectionId && l.order === lesson.order - 1);
  return prev === undefined || isCompleted(state, prev.id);
}

/**
 * Урок, с которого продолжить. Сначала — в разделе, где последним пройден урок:
 * человек мог начать с середины курса и ждёт продолжения там же. Если там всё
 * пройдено или ещё ничего не пройдено — первый открытый непройденный по курсу.
 */
export function nextLesson<L extends LessonRef>(state: SaveState, all: readonly L[]): L | undefined {
  let lastSection: string | null = null;
  let lastAt = -Infinity;
  for (const l of all) {
    const at = state.lessons[l.id]?.completedAt ?? null;
    if (at !== null && at >= lastAt) {
      lastAt = at;
      lastSection = l.sectionId;
    }
  }
  const pending = (l: L): boolean => !isCompleted(state, l.id) && isOpen(state, l, all);
  return all.find((l) => l.sectionId === lastSection && pending(l)) ?? all.find(pending);
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
