/**
 * Структура сохранения. Всё, что знает приложение о прогрессе, — здесь.
 * Меняете форму — поднимите SAVE_VERSION и добавьте миграцию в persist.ts.
 */

export const SAVE_VERSION = 2;

/** Что не так: причина замечания. */
export type ReportReason = 'en_term' | 'ru_term' | 'about' | 'diagram' | 'task' | 'other';
export const REPORT_REASONS: readonly ReportReason[] = ['en_term', 'ru_term', 'about', 'diagram', 'task', 'other'];
/** Больше замечаний не храним: самые старые уходят. До потолка их, скорее всего, отправят раньше. */
export const MAX_REPORTS = 300;
/** Длина «как правильно» — фраза-другая, не сочинение. */
export const MAX_REPORT_NOTE = 300;

/**
 * Замечание к уроку, словарю или схеме. Копятся здесь, потом одним текстом
 * уходят Claude: сервера нет, путь такой — Профиль, «Скопировать», чат.
 */
export interface Report {
  /** Когда отмечено (мс) — заодно и идентификатор замечания. */
  at: number;
  /** Где: id урока, «review» — повторение, «dictionary», «atlas». */
  where: string;
  /** Вид задания или экрана: «quiz_en_ru», «term_card», «atlas»… */
  kind: string;
  /**
   * Что именно: «t:id» — термин, «r:id» — правило, «d:id» — схема целиком,
   * «d:id/t_id» — структура на схеме, «p:id» — путь по порядку, «all» — задание целиком.
   */
  ref: string;
  /** Как это было показано — на случай, если контент к тому времени поменялся. */
  en: string;
  ru: string;
  reason: ReportReason;
  /** Как правильно — если человек знает. Может быть пустым. */
  note: string;
}

/** Статистика термина для интервального повторения. */
export interface TermStat {
  seen: number;
  correct: number;
  wrong: number;
  /** Верных ответов подряд. */
  streak: number;
  /** Ступень Лейтнера: 0 — только что ошибся, дальше интервалы растут. */
  box: number;
  ease: number;
  /** Интервал в днях. */
  interval: number;
  /** Когда показать снова. */
  dueAt: number;
  lastAt: number;
  /** Хоть раз ответил верно — термин считается знакомым. */
  introduced: boolean;
}

export interface LessonProgress {
  attempts: number;
  /** Когда урок впервые пройден до конца; null — ещё не пройден. */
  completedAt: number | null;
  /** Лучшая точность, 0..1. */
  best: number;
}

export interface Settings {
  /** Убрать анимации, даже если система их не выключила. */
  reducedMotion: boolean;
}

export interface SaveState {
  version: number;
  createdAt: number;
  terms: Record<string, TermStat>;
  lessons: Record<string, LessonProgress>;
  /**
   * Что уже показано карточкой: «t:<id>» — знакомство с термином,
   * «r:<id>» — правило. Значение — когда показано впервые.
   */
  seen: Record<string, number>;
  /** Замечания «Что не так?», старые первыми. */
  reports: Report[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  reducedMotion: false,
};

export function createTermStat(ts: number): TermStat {
  return {
    seen: 0,
    correct: 0,
    wrong: 0,
    streak: 0,
    box: 0,
    ease: 2.5,
    interval: 0,
    dueAt: ts,
    lastAt: 0,
    introduced: false,
  };
}

export function createInitialState(ts: number): SaveState {
  return {
    version: SAVE_VERSION,
    createdAt: ts,
    terms: {},
    lessons: {},
    seen: {},
    reports: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}
