/** Веха 3: замечания, перенос прогресса, поиск по словарю, выбор для повторения. */
import { describe, expect, it } from 'vitest';
import { DAY, HOUR, MINUTE, formatIn } from '../src/core/time';
import { allTerms, getDiagram, getPath, getRule, getTerm } from '../src/data/content';
import { EXPORT_KIND, buildExport, migrate, parseImport, sanitize } from '../src/data/persist';
import { MAX_REPORTS, MAX_REPORT_NOTE, SAVE_VERSION, createInitialState } from '../src/data/state';
import {
  addReport,
  clearReports,
  formatReports,
  removeReport,
  reportTargets,
  REPORTS_EXPORT_KIND,
  type ReportDraft,
} from '../src/domain/reports';
import { normalizeQuery, searchTerms } from '../src/domain/search';
import { dueTerms, hardestTerms, nextDueAt, recordTermAttempt } from '../src/domain/srs';
import { buildLesson, makeFind, makeHighlighted, taskCount, termCard } from '../src/lesson/build';
import { rngFor } from '../src/core/rng';

const draft = (over: Partial<ReportDraft> = {}): ReportDraft => ({
  where: 'l_circ_whole',
  kind: 'quiz_en_ru',
  ref: 't:t_aorta',
  en: 'aorta',
  ru: 'аорта',
  reason: 'ru_term',
  note: '',
  ...over,
});

describe('сохранение версии 2', () => {
  it('миграция 1 → 2 добавляет пустой список замечаний и ничего не теряет', () => {
    const v1 = { version: 1, createdAt: 5, lessons: { l1: { attempts: 1, completedAt: 9, best: 1 } }, terms: {}, seen: { 't:t_aorta': 3 } };
    const migrated = migrate({ ...v1 });
    expect(migrated.version).toBe(2);
    expect(migrated.reports).toEqual([]);
    const s = sanitize(v1, 10);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.lessons.l1?.completedAt).toBe(9);
    expect(s.seen).toEqual({ 't:t_aorta': 3 });
    expect(s.reports).toEqual([]);
  });

  it('битые замечания выбрасываются целиком', () => {
    const s = sanitize({
      version: 2,
      reports: [
        { at: 1, ref: 't:t_aorta', reason: 'ru_term', en: 'aorta', ru: 'аорта', note: 'ок', where: 'x', kind: 'y' },
        { at: 2, ref: 't:t_aorta', reason: 'нет такой' },
        { at: 3, ref: '', reason: 'other' },
        { ref: 't:t_vein', reason: 'other' },
      ],
    }, 0);
    expect(s.reports.map((r) => r.at)).toEqual([1]);
  });
});

describe('перенос прогресса файлом', () => {
  it('экспорт читается обратно без потерь', () => {
    const s = createInitialState(100);
    s.lessons.l_circ_whole = { attempts: 2, completedAt: 150, best: 0.9 };
    recordTermAttempt(s, 't_heart', true, 120);
    addReport(s, draft(), 130);
    const res = parseImport(JSON.stringify(buildExport(s, 200)), 300);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state).toEqual(s);
      expect(res.warnings).toEqual([]);
    }
  });

  it('чужой и битый файл не принимаются — прогресс не затрётся', () => {
    expect(parseImport('{нет', 0)).toMatchObject({ ok: false });
    expect(parseImport(JSON.stringify({ kind: 'learn-tajik/progress', state: {} }), 0)).toMatchObject({ ok: false });
    // голый объект без метки — тоже нет, даже если похож на прогресс
    expect(parseImport(JSON.stringify(createInitialState(0)), 0)).toMatchObject({ ok: false });
  });

  it('файл более новой версии принимается с предупреждением', () => {
    const file = { kind: EXPORT_KIND, version: SAVE_VERSION + 1, exportedAt: 0, state: createInitialState(0) };
    const res = parseImport(JSON.stringify(file), 0);
    expect(res.ok && res.warnings.length).toBe(1);
  });
});

describe('замечания', () => {
  it('добавление, одинаковое время сдвигается, удаление, очистка', () => {
    const s = createInitialState(0);
    const a = addReport(s, draft({ note: '  аортa  ' }), 50);
    const b = addReport(s, draft(), 50);
    expect(a.note).toBe('аортa');
    expect(b.at).toBe(51);
    expect(removeReport(s, 50)).toBe(true);
    expect(removeReport(s, 50)).toBe(false);
    expect(clearReports(s)).toBe(1);
    expect(s.reports).toEqual([]);
  });

  it('сверх потолка уходят самые старые', () => {
    const s = createInitialState(0);
    for (let i = 0; i < MAX_REPORTS + 5; i++) addReport(s, draft(), i * 10);
    expect(s.reports).toHaveLength(MAX_REPORTS);
    expect(s.reports[0]?.at).toBe(50);
  });

  it('неверный вызов — явная ошибка, а не тихая правка', () => {
    const s = createInitialState(0);
    expect(() => addReport(s, draft({ reason: 'нет' as never }), 0)).toThrow();
    expect(() => addReport(s, draft({ ref: '' }), 0)).toThrow();
    expect(() => addReport(s, draft({ note: 'я'.repeat(MAX_REPORT_NOTE + 1) }), 0)).toThrow();
  });

  it('в задании на схеме можно отметить и термин, и место на рисунке', () => {
    const names = (id: string) => ({ en: getTerm(id).en, ru: getTerm(id).ru });
    const find = makeFind(getTerm('t_aorta'), getDiagram('d_heart'));
    expect(reportTargets(find, names).map((t) => t.ref)).toEqual(['t:t_aorta', 'd:d_heart/t_aorta']);
    expect(reportTargets(termCard(getTerm('t_heart')), names).map((t) => t.ref)).toEqual(['t:t_heart', 'd:d_circulation/t_heart']);
    const hl = makeHighlighted(getTerm('t_atrium'), getDiagram('d_circulation'), allTerms(), rngFor('r'));
    expect(reportTargets(hl!, names)[1]?.ref).toBe('d:d_circulation/t_atrium');
  });

  it('текст для Claude: строки для человека и JSON для разбора', () => {
    const s = createInitialState(0);
    addReport(s, draft({ note: 'по МАТ так' }), Date.UTC(2026, 9, 10));
    const text = formatReports(s.reports, Date.UTC(2026, 9, 10));
    expect(text).toMatch(/1\. aorta — аорта · l_circ_whole · Неверный русский термин: «по МАТ так»/);
    const json = JSON.parse(text.slice(text.indexOf('JSON: ') + 6));
    expect(json.kind).toBe(REPORTS_EXPORT_KIND);
    expect(json.reports).toEqual(s.reports);
  });
});

describe('поиск по словарю', () => {
  const terms = allTerms();
  const ids = (q: string) => searchTerms(terms, q).map((t) => t.id);

  it('на обоих языках', () => {
    expect(ids('aorta')[0]).toBe('t_aorta');
    expect(ids('аорта')[0]).toBe('t_aorta');
  });

  it('ё и е не различаются, регистр и дефис не важны', () => {
    expect(normalizeQuery('Лёгочный  ствол')).toBe('легочный ствол');
    expect(ids('легочный ствол')[0]).toBe('t_pulmonary_trunk');
    expect(ids('СЕРДЕЧНО СОСУДИСТАЯ')[0]).toBe('t_cardiovascular_system');
  });

  it('находит по другим названиям', () => {
    expect(ids('circulatory')).toContain('t_cardiovascular_system');
    expect(ids('двустворчатый')).toContain('t_mitral_valve');
  });

  it('точное совпадение выше вхождения', () => {
    // «atrium» есть и в «right atrium», но сам термин — первым
    expect(ids('atrium')[0]).toBe('t_atrium');
    expect(ids('atrium')).toEqual(expect.arrayContaining(['t_right_atrium', 't_left_atrium']));
  });

  it('пустой запрос — пусто, а не весь словарь', () => {
    expect(ids('   ')).toEqual([]);
  });
});

describe('выбор для повторения', () => {
  const T0 = Date.UTC(2026, 9, 10, 9);

  it('просроченное — самое давнее первым; невиданного нет', () => {
    const s = createInitialState(T0);
    recordTermAttempt(s, 't_a', true, T0); // срок через сутки
    recordTermAttempt(s, 't_b', false, T0); // через 10 минут
    expect(dueTerms(s, T0)).toEqual([]);
    expect(dueTerms(s, T0 + 2 * DAY)).toEqual(['t_b', 't_a']);
    expect(nextDueAt(s)).toBe(T0 + 10 * MINUTE);
    expect(nextDueAt(createInitialState(0))).toBeNull();
  });

  it('трудные: с ошибками — первыми', () => {
    const s = createInitialState(T0);
    recordTermAttempt(s, 't_easy', true, T0);
    recordTermAttempt(s, 't_hard', false, T0);
    expect(hardestTerms(s, 5)[0]).toBe('t_hard');
  });

  it('сессия повторения собирается и из одного-двух терминов', () => {
    for (const ids of [['t_aorta'], ['t_aorta', 't_heart'], ['t_aorta', 't_heart', 't_vein', 't_lung']]) {
      const list = buildLesson({
        lesson: { id: 'review', terms: [], review: ids },
        getTerm,
        getRule,
        getDiagram,
        getPath,
        allTerms: allTerms(),
        relationTasks: true,
        earlier: allTerms().slice(0, 12),
        seen: () => true,
        pickReview: () => [],
        seed: 'r',
      });
      expect(taskCount(list)).toBeGreaterThanOrEqual(ids.length);
      expect(list.every((ex) => ex.termIds.every((id) => ids.includes(id)))).toBe(true);
    }
  });

  it('когда следующее повторение — по-человечески', () => {
    expect(formatIn(5 * MINUTE)).toBe('через 5 мин');
    expect(formatIn(3 * HOUR)).toBe('через 3 ч');
    expect(formatIn(2 * DAY)).toBe('через 2 дня');
    expect(formatIn(-1)).toBe('сейчас');
  });
});
