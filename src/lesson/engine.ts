/**
 * Сессия урока: очередь заданий, счёт, повтор ошибок в конце.
 * Без DOM — экран урока только показывает то, что здесь посчитано.
 */

import type { Attempt, Exercise } from './types';

export interface SessionState {
  /** Номер текущего задания с нуля. */
  index: number;
  total: number;
  attempts: number;
  correct: number;
  mistakes: number;
  finished: boolean;
}

export interface SessionResult {
  attempts: number;
  correct: number;
  mistakes: number;
  /** Доля верных попыток, 0..1; без попыток — 1. */
  accuracy: number;
  /** Термины, на которых были ошибки, — по порядку первой ошибки. */
  missedTermIds: string[];
}

export interface SessionOptions {
  exercises: Exercise[];
  /**
   * Сколько заданий с ошибкой повторить в конце. Повтор — тренировка:
   * человек только что увидел верный ответ и закрепляет его. На точность
   * урока повтор не влияет, но в статистику термина идёт — ради неё он и нужен.
   */
  retryMistakes?: number;
}

export interface Session {
  readonly state: Readonly<SessionState>;
  current: () => Exercise | undefined;
  attempt: (attempt: Attempt) => void;
  /** Перейти к следующему заданию. false — заданий больше нет. */
  advance: () => boolean;
  result: () => SessionResult;
  /** Доля пройденного, 0..1 — для полосы прогресса. */
  progress: () => number;
  /** Текущее задание — повтор ошибки в конце урока. */
  isRetry: () => boolean;
  /** Текущее задание после ошибки вернётся в конце. */
  willRetry: () => boolean;
}

export function createSession(opts: SessionOptions): Session {
  /** Своя копия очереди: повторы дописываются в конец. */
  const queue = [...opts.exercises];
  const firstPass = queue.length;
  const retryCap = Math.max(0, opts.retryMistakes ?? 0);
  /** Какие задания первого прохода уже поставлены в повтор. */
  const queued = new Set<number>();
  const missed: string[] = [];

  const state: SessionState = {
    index: 0,
    total: queue.length,
    attempts: 0,
    correct: 0,
    mistakes: 0,
    finished: queue.length === 0,
  };

  return {
    state,

    current: () => queue[state.index],

    attempt(attempt: Attempt) {
      if (state.index >= firstPass) return;
      if (!attempt.correct) {
        for (const id of attempt.termIds) if (!missed.includes(id)) missed.push(id);
        if (!queued.has(state.index) && queued.size < retryCap) {
          const exercise = queue[state.index];
          if (exercise) {
            queued.add(state.index);
            queue.push(exercise);
            state.total = queue.length;
          }
        }
      }
      state.attempts++;
      if (attempt.correct) state.correct++;
      else state.mistakes++;
    },

    advance() {
      if (state.finished) return false;
      state.index++;
      if (state.index >= state.total) {
        state.index = state.total;
        state.finished = true;
        return false;
      }
      return true;
    },

    progress() {
      if (state.total === 0) return 1;
      return Math.min(1, state.index / state.total);
    },

    isRetry: () => state.index >= firstPass,

    willRetry: () => queued.has(state.index),

    result() {
      return {
        attempts: state.attempts,
        correct: state.correct,
        mistakes: state.mistakes,
        accuracy: state.attempts === 0 ? 1 : state.correct / state.attempts,
        missedTermIds: [...missed],
      };
    },
  };
}
