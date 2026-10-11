/**
 * Интервальное повторение: ступени Лейтнера с поправкой на лёгкость (SM-2 упрощённо).
 * Ошибка возвращает термин на первую ступень и в ближайшую очередь,
 * верный ответ отодвигает следующий показ всё дальше.
 *
 * Модуль чистый: время приходит аргументом, случайности нет.
 */

import { DAY, MINUTE } from '../core/time';
import { createTermStat, type SaveState, type TermStat } from '../data/state';

/** Базовый интервал в днях для каждой ступени. */
export const BOX_INTERVALS = [0, 1, 3, 7, 16, 35, 90] as const;
export const MAX_BOX = BOX_INTERVALS.length - 1;

export const MIN_EASE = 1.3;
export const MAX_EASE = 2.8;
const EASE_UP = 0.08;
const EASE_DOWN = 0.2;

/** После ошибки термин возвращается в ближайшее повторение, а не через сутки. */
export const RETRY_DELAY_MS = 10 * MINUTE;

/** С этой ступени термин считается выученным. */
export const LEARNED_BOX = 4;

export function getTermStat(state: SaveState, termId: string, ts: number): TermStat {
  return state.terms[termId] ?? createTermStat(ts);
}

/** Записывает попытку и пересчитывает, когда показать термин снова. */
export function recordTermAttempt(
  state: SaveState,
  termId: string,
  correct: boolean,
  ts: number,
): TermStat {
  const stat = { ...getTermStat(state, termId, ts) };
  stat.seen += 1;
  stat.lastAt = ts;

  if (correct) {
    stat.correct += 1;
    stat.streak += 1;
    stat.introduced = true;
    /*
     * Досрочный верный ответ ступень не поднимает: в одном уроке термин
     * спрашивают три-четыре раза подряд, и иначе он стал бы «выученным»
     * за пять минут. Ступень растёт, только когда срок подошёл
     * (или термин на нулевой ступени — новый либо после ошибки).
     */
    if (stat.box > 0 && ts < stat.dueAt) {
      state.terms[termId] = stat;
      return stat;
    }
    stat.box = Math.min(MAX_BOX, stat.box + 1);
    stat.ease = Math.min(MAX_EASE, stat.ease + EASE_UP);
    stat.interval = (BOX_INTERVALS[stat.box] ?? 0) * (stat.ease / 2.5);
    stat.dueAt = ts + stat.interval * DAY;
  } else {
    stat.wrong += 1;
    stat.streak = 0;
    stat.box = 0;
    stat.ease = Math.max(MIN_EASE, stat.ease - EASE_DOWN);
    stat.interval = 0;
    stat.dueAt = ts + RETRY_DELAY_MS;
  }

  state.terms[termId] = stat;
  return stat;
}

export function recordAttemptTerms(
  state: SaveState,
  termIds: readonly string[],
  correct: boolean,
  ts: number,
): void {
  for (const id of termIds) recordTermAttempt(state, id, correct, ts);
}

/** Насколько термин трудный, 0..1: доля ошибок, сорванная серия, низкая ступень. */
export function termDifficulty(stat: TermStat): number {
  if (stat.seen === 0) return 0.5;
  const wrongRate = stat.wrong / stat.seen;
  const brokenStreak = stat.streak === 0 ? 0.2 : 0;
  const shallowBox = (1 - stat.box / MAX_BOX) * 0.3;
  return Math.min(1, Math.max(0, wrongRate * 0.5 + brokenStreak + shallowBox));
}

/** Пора повторить: термин встречался и срок подошёл. */
export function isDue(stat: TermStat, ts: number): boolean {
  return stat.seen > 0 && stat.dueAt <= ts;
}

export function dueCount(state: SaveState, ts: number): number {
  let n = 0;
  for (const stat of Object.values(state.terms)) if (isDue(stat, ts)) n++;
  return n;
}

/**
 * Что повторить из набора: сначала просроченное, потом трудное, потом
 * давно не виденное. Термины, которых ещё не было, не берём — повторение
 * не должно превращаться в изучение нового.
 */
export function reviewSelection(
  state: SaveState,
  candidates: readonly string[],
  limit: number,
  ts: number,
): string[] {
  const scored = candidates
    .filter((id) => (state.terms[id]?.seen ?? 0) > 0)
    .map((id) => {
      const stat = state.terms[id] as TermStat;
      return { id, due: isDue(stat, ts), score: termDifficulty(stat), lastAt: stat.lastAt };
    });
  scored.sort((a, b) => {
    if (a.due !== b.due) return a.due ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    return a.lastAt - b.lastAt;
  });
  return scored.slice(0, limit).map((x) => x.id);
}

export interface TermsSummary {
  /** Встречались в уроках. */
  seen: number;
  /** На ступени LEARNED_BOX и выше. */
  learned: number;
  due: number;
}

export function termsSummary(state: SaveState, ts: number): TermsSummary {
  let seen = 0;
  let learned = 0;
  let due = 0;
  for (const stat of Object.values(state.terms)) {
    if (stat.seen > 0) seen++;
    if (stat.box >= LEARNED_BOX) learned++;
    if (isDue(stat, ts)) due++;
  }
  return { seen, learned, due };
}

/** Что пора повторить: самые давно просроченные первыми. */
export function dueTerms(state: SaveState, ts: number, limit = Infinity): string[] {
  return Object.entries(state.terms)
    .filter(([, stat]) => isDue(stat, ts))
    .sort((a, b) => a[1].dueAt - b[1].dueAt)
    .slice(0, limit)
    .map(([id]) => id);
}

/**
 * Самые трудные из встреченных — для повторения, когда по сроку повторять
 * нечего: больше ошибок, ниже ступень, давно не виденные — первыми.
 */
export function hardestTerms(state: SaveState, limit: number): string[] {
  return Object.entries(state.terms)
    .filter(([, stat]) => stat.seen > 0)
    .map(([id, stat]) => ({ id, stat, score: termDifficulty(stat) }))
    .sort((a, b) => b.score - a.score || b.stat.wrong - a.stat.wrong || a.stat.lastAt - b.stat.lastAt)
    .slice(0, limit)
    .map((x) => x.id);
}

/** Когда подойдёт срок ближайшего термина; null — встреченных терминов нет. */
export function nextDueAt(state: SaveState): number | null {
  let next: number | null = null;
  for (const stat of Object.values(state.terms)) {
    if (stat.seen > 0 && (next === null || stat.dueAt < next)) next = stat.dueAt;
  }
  return next;
}
