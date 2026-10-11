/**
 * Загрузка, сохранение и миграции прогресса.
 * Всё, что приходит с диска, проходит через sanitize: старое или испорченное
 * сохранение не должно ронять приложение.
 */

import { kvGet, kvSet } from './db';
import {
  DEFAULT_SETTINGS,
  MAX_REPORTS,
  MAX_REPORT_NOTE,
  REPORT_REASONS,
  SAVE_VERSION,
  createInitialState,
  createTermStat,
  type LessonProgress,
  type Report,
  type ReportReason,
  type SaveState,
  type Settings,
  type TermStat,
} from './state';
import { now } from '../core/time';

const KEY = 'save';
/** Метка файла экспорта: по ней импорт отличает свой файл от чужого JSON. */
export const EXPORT_KIND = 'learn-anatomy/progress';

/* ——————————————————————————— вспомогательные проверки ——————————————————————————— */

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
}

function int(v: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  return Math.round(num(v, fallback, min, max));
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function str(v: unknown, fallback: string, maxLen: number): string {
  return typeof v === 'string' ? v.slice(0, maxLen) : fallback;
}

/* ——————————————————————————————— миграции ——————————————————————————————— */

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/**
 * Ключ — версия, ИЗ которой мигрируем. Применяются подряд, пока не дойдём
 * до SAVE_VERSION. Когда поменяется структура: поднять SAVE_VERSION в state.ts
 * и добавить сюда шаг с прошлым номером.
 */
const MIGRATIONS: Record<number, Migration> = {
  /* 1 -> 2: замечания «Что не так?». Их ещё не было — список пуст. */
  1: (raw) => ({ ...raw, reports: [], version: 2 }),
};

export function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  let state = raw;
  let guard = 0;
  while (int(state.version, 0) < SAVE_VERSION && guard++ < 50) {
    const from = int(state.version, 0);
    const step = MIGRATIONS[from];
    if (!step) {
      // шага нет — помечаем версией и полагаемся на sanitize
      state.version = SAVE_VERSION;
      break;
    }
    state = step(state);
    if (int(state.version, 0) <= from) break;
  }
  return state;
}

/* ——————————————————————————————— нормализация ——————————————————————————————— */

function sanitizeSettings(v: unknown): Settings {
  const o = isObj(v) ? v : {};
  return {
    reducedMotion: bool(o.reducedMotion, DEFAULT_SETTINGS.reducedMotion),
  };
}

function sanitizeLessons(v: unknown): Record<string, LessonProgress> {
  const out: Record<string, LessonProgress> = {};
  if (!isObj(v)) return out;
  for (const [id, raw] of Object.entries(v)) {
    if (!isObj(raw)) continue;
    out[id] = {
      attempts: int(raw.attempts, 0, 0, 1e6),
      completedAt: typeof raw.completedAt === 'number' ? raw.completedAt : null,
      best: num(raw.best, 0, 0, 1),
    };
  }
  return out;
}

function sanitizeTerms(v: unknown, ts: number): Record<string, TermStat> {
  const out: Record<string, TermStat> = {};
  if (!isObj(v)) return out;
  const base = createTermStat(ts);
  for (const [id, raw] of Object.entries(v)) {
    if (!isObj(raw)) continue;
    out[id] = {
      seen: int(raw.seen, base.seen, 0, 1e7),
      correct: int(raw.correct, base.correct, 0, 1e7),
      wrong: int(raw.wrong, base.wrong, 0, 1e7),
      streak: int(raw.streak, base.streak, 0, 1e4),
      box: int(raw.box, base.box, 0, 6),
      ease: num(raw.ease, base.ease, 1.3, 2.8),
      interval: num(raw.interval, base.interval, 0, 3650),
      dueAt: num(raw.dueAt, ts, 0, Number.MAX_SAFE_INTEGER),
      lastAt: num(raw.lastAt, 0, 0, Number.MAX_SAFE_INTEGER),
      introduced: bool(raw.introduced, false),
    };
  }
  return out;
}

function sanitizeSeen(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(v)) return out;
  for (const [k, raw] of Object.entries(v)) {
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) out[k] = raw;
  }
  return out;
}

/**
 * Замечания. Запись без причины или без того, к чему она относится,
 * ничего не скажет при разборе — такую выбрасываем целиком, а не чиним.
 */
function sanitizeReports(v: unknown): Report[] {
  if (!Array.isArray(v)) return [];
  const out: Report[] = [];
  for (const raw of v) {
    if (!isObj(raw)) continue;
    if (typeof raw.reason !== 'string' || !REPORT_REASONS.includes(raw.reason as ReportReason)) continue;
    if (typeof raw.ref !== 'string' || raw.ref === '') continue;
    if (typeof raw.at !== 'number' || !Number.isFinite(raw.at)) continue;
    out.push({
      at: raw.at,
      where: str(raw.where, '', 64),
      kind: str(raw.kind, '', 32),
      ref: raw.ref.slice(0, 160),
      en: str(raw.en, '', 200),
      ru: str(raw.ru, '', 200),
      reason: raw.reason as ReportReason,
      note: str(raw.note, '', MAX_REPORT_NOTE),
    });
  }
  return out.slice(-MAX_REPORTS);
}

/** Приводит что угодно к валидному SaveState. Чужие поля отбрасываются. */
export function sanitize(input: unknown, ts: number = now()): SaveState {
  if (!isObj(input)) return createInitialState(ts);
  const raw = migrate({ ...input });
  return {
    version: SAVE_VERSION,
    createdAt: num(raw.createdAt, ts, 0, Number.MAX_SAFE_INTEGER),
    terms: sanitizeTerms(raw.terms, ts),
    lessons: sanitizeLessons(raw.lessons),
    seen: sanitizeSeen(raw.seen),
    reports: sanitizeReports(raw.reports),
    settings: sanitizeSettings(raw.settings),
  };
}

/* ——————————————————————————————— диск ——————————————————————————————— */

export async function loadState(): Promise<SaveState> {
  try {
    const raw = await kvGet<unknown>(KEY);
    if (raw === undefined) return createInitialState(now());
    return sanitize(raw);
  } catch (err) {
    console.error('Не удалось прочитать прогресс, начинаем с чистого листа:', err);
    return createInitialState(now());
  }
}

export async function saveState(state: SaveState): Promise<void> {
  await kvSet(KEY, state);
}

/* ——————————————————————————————— экспорт и импорт ——————————————————————————————— */

export interface ExportFile {
  kind: typeof EXPORT_KIND;
  version: number;
  exportedAt: number;
  state: SaveState;
}

export function buildExport(state: SaveState, ts: number = now()): ExportFile {
  return {
    kind: EXPORT_KIND,
    version: SAVE_VERSION,
    exportedAt: ts,
    state: JSON.parse(JSON.stringify(state)) as SaveState,
  };
}

/** anatomy-progress-20261010-1430.json */
export function exportFilename(ts: number = now()): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    'anatomy-progress-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
    '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.json'
  );
}

export type ImportResult =
  | { ok: true; state: SaveState; warnings: string[] }
  | { ok: false; error: string };

/**
 * Разбирает файл экспорта. Принимает только свой файл — с меткой EXPORT_KIND:
 * чужой JSON, даже похожий, не должен молча затереть прогресс.
 */
export function parseImport(text: string, ts: number = now()): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Это не JSON — файл повреждён или выбран не тот.' };
  }
  if (!isObj(parsed) || parsed.kind !== EXPORT_KIND || !isObj(parsed.state)) {
    return { ok: false, error: 'Это не файл прогресса «Анатомии»: нет нужной метки.' };
  }
  const warnings: string[] = [];
  const fileVersion = int(parsed.version, 0);
  if (fileVersion > SAVE_VERSION) {
    warnings.push('Файл сделан более новой версией приложения — часть данных может не примениться.');
  }
  return { ok: true, state: sanitize(parsed.state, ts), warnings };
}
