/**
 * Сверка написанного ответа с термином.
 *
 * Правило: точное совпадение (без учёта регистра, лишних пробелов, дефисов
 * и артикля the) — верно. Одна опечатка в термине от пяти букв — тоже верно,
 * но с подсказкой, как пишется правильно: задание учит термин, а не
 * наказывает за промах по клавише. Две и больше — неверно.
 * Засчитываются и другие принятые названия из поля also.
 */

import { editDistance } from './confusable';

export type MatchResult = 'exact' | 'typo' | 'wrong';

/** Опечаток прощается не больше одной — и только в термине от этой длины. */
export const TYPO_MIN_LENGTH = 5;

const DASHES = /[‐-―-]/g;
const PUNCTUATION = /[.,;:!?"'«»“”‘’()]/g;

export function normalizeEn(input: string): string {
  return input
    .normalize('NFC')
    .toLowerCase()
    .replace(DASHES, ' ')
    .replace(PUNCTUATION, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^the /, '');
}

export interface TypedCheck {
  result: MatchResult;
  /** С каким из принятых названий сошлось; при 'wrong' — главное название. */
  matched: string;
}

export function checkTyped(given: string, accepted: readonly string[]): TypedCheck {
  const main = accepted[0];
  if (main === undefined) throw new Error('checkTyped: нет ни одного верного ответа');
  const g = normalizeEn(given);
  if (g.length === 0) return { result: 'wrong', matched: main };

  for (const a of accepted) {
    if (normalizeEn(a) === g) return { result: 'exact', matched: a };
  }
  for (const a of accepted) {
    const n = normalizeEn(a);
    if (n.length >= TYPO_MIN_LENGTH && editDistance(n, g) <= 1) return { result: 'typo', matched: a };
  }
  return { result: 'wrong', matched: main };
}
