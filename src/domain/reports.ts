/**
 * Замечания «Что не так?». Человек отмечает в уроке, словаре или атласе
 * термин, правило или место на схеме, где видит ошибку; замечания копятся
 * в сохранении, а потом одним текстом уходят Claude — он сверяет их
 * с источниками и правит контент.
 *
 * Сервера нет, поэтому путь такой: копились — скопировал в Профиле — вставил в чат.
 */

import {
  MAX_REPORTS,
  MAX_REPORT_NOTE,
  REPORT_REASONS,
  type Report,
  type ReportReason,
  type SaveState,
} from '../data/state';
import type { Exercise } from '../lesson/types';

export const REASON_LABELS: Record<ReportReason, string> = {
  en_term: 'Неверный английский термин',
  ru_term: 'Неверный русский термин',
  about: 'Неточное описание',
  diagram: 'Ошибка на схеме',
  task: 'Задание сбивает с толку',
  other: 'Другое',
};

/** Что можно отметить. */
export interface ReportTarget {
  /** Ссылка на контент — формат описан у Report.ref. */
  ref: string;
  en: string;
  ru: string;
}

/** Отметка «всё задание целиком» — когда не так не термин, а само задание. */
export const WHOLE_EXERCISE = 'all';

/** Подпись термина: нужна, чтобы назвать структуру на схеме. */
export type TermNames = (termId: string) => { en: string; ru: string };

export function termTarget(termId: string, names: TermNames): ReportTarget {
  return { ref: 't:' + termId, ...names(termId) };
}

/** Структура на схеме: «на этой схеме аорта нарисована не так». */
export function diagramTarget(diagramId: string, termId: string, names: TermNames): ReportTarget {
  const n = names(termId);
  return { ref: 'd:' + diagramId + '/' + termId, en: n.en + ' на схеме', ru: n.ru + ' на схеме' };
}

export function wholeDiagramTarget(diagramId: string, title: string): ReportTarget {
  return { ref: 'd:' + diagramId, en: title, ru: 'схема целиком' };
}

/**
 * Что в этом задании можно отметить. Термин — всегда; на схеме — ещё и сама
 * структура на рисунке: ошибка может быть в рисунке, а не в названии.
 */
export function reportTargets(ex: Exercise, names: TermNames): ReportTarget[] {
  switch (ex.kind) {
    case 'rule_card':
      return [{ ref: 'r:' + ex.ruleId, en: ex.title, ru: 'правило' }];
    case 'term_card':
      return [
        termTarget(ex.termId, names),
        ...(ex.diagramId ? [diagramTarget(ex.diagramId, ex.termId, names)] : []),
      ];
    case 'quiz_en_ru':
    case 'quiz_ru_en':
    case 'type_en':
      return ex.termIds.map((id) => termTarget(id, names));
    case 'match_pairs':
      return ex.pairs.map((p) => termTarget(p.termId, names));
    case 'find_on_diagram':
    case 'name_highlighted':
      return [termTarget(ex.termId, names), diagramTarget(ex.diagramId, ex.termId, names)];
    case 'relation': {
      // ошибка может быть в самой связи — тогда отмечают ответ
      const answer = ex.options[ex.correct];
      return [termTarget(ex.subject.termId, names), ...(answer ? [termTarget(answer.termId, names)] : [])];
    }
    case 'path':
      return [{ ref: 'p:' + ex.pathId, en: ex.title, ru: 'путь целиком' }, ...ex.steps.map((s) => termTarget(s.termId, names))];
  }
}

/** Новое замечание: всё, кроме времени, — его ставит addReport. */
export type ReportDraft = Omit<Report, 'at'>;

/**
 * Добавляет замечание. Время — идентификатор: если в ту же миллисекунду уже
 * есть замечание, сдвигаем на одну вперёд. Сверх MAX_REPORTS уходят самые старые.
 *
 * Пустая отметка, чужая причина или слишком длинный текст — ошибка вызывающего
 * (форма этого не допускает), а не повод тихо обрезать: бросаем.
 */
export function addReport(state: SaveState, draft: ReportDraft, ts: number): Report {
  if (!REPORT_REASONS.includes(draft.reason)) throw new Error('Неизвестная причина замечания: ' + draft.reason);
  if (draft.ref === '') throw new Error('Замечание ни к чему не относится: пустой ref');
  const note = draft.note.trim();
  if (note.length > MAX_REPORT_NOTE) {
    throw new Error('Текст замечания длиннее ' + MAX_REPORT_NOTE + ' знаков: ' + note.length);
  }
  let at = ts;
  while (state.reports.some((r) => r.at === at)) at++;
  const report: Report = { ...draft, note, at };
  state.reports.push(report);
  if (state.reports.length > MAX_REPORTS) state.reports.splice(0, state.reports.length - MAX_REPORTS);
  return report;
}

/** Удаляет одно замечание. false — такого нет. */
export function removeReport(state: SaveState, at: number): boolean {
  const i = state.reports.findIndex((r) => r.at === at);
  if (i < 0) return false;
  state.reports.splice(i, 1);
  return true;
}

/** Удаляет все замечания, возвращает, сколько было. */
export function clearReports(state: SaveState): number {
  const n = state.reports.length;
  state.reports = [];
  return n;
}

export const REPORTS_EXPORT_KIND = 'learn-anatomy/reports';

function dateLabel(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
}

/**
 * Текст для чата с Claude: сверху по строке на замечание — чтобы человек видел,
 * что отправляет, — снизу то же самое в JSON, чтобы разбор был точным.
 */
export function formatReports(reports: readonly Report[], ts: number): string {
  const lines = reports.map((r, i) => {
    const what = r.ru ? r.en + ' — ' + r.ru : r.en;
    const note = r.note ? ': «' + r.note + '»' : '';
    return i + 1 + '. ' + what + ' · ' + r.where + ' · ' + REASON_LABELS[r.reason] + note;
  });
  const payload = JSON.stringify({ kind: REPORTS_EXPORT_KIND, version: 1, reports });
  return (
    'Замечания к курсу «Анатомия» — ' + reports.length + ', ' + dateLabel(ts) + '\n' +
    lines.join('\n') + '\n\n' +
    'JSON: ' + payload
  );
}
