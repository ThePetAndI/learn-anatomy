import { describe, expect, it } from 'vitest';
import { rngFor } from '../src/core/rng';
import type { Rule, Term } from '../src/data/types';
import { MAX_TASKS, buildLesson, pickDistractors, taskCount, type BuildInput } from '../src/lesson/build';
import { createSession } from '../src/lesson/engine';
import type { Exercise, QuizExercise } from '../src/lesson/types';

function term(id: string, en: string, ru: string, extra: Partial<Term> = {}): Term {
  return {
    id,
    en,
    ru,
    kind: 'artery',
    system: 'circulatory',
    about: 'Описание ' + en + '.',
    relations: {},
    diagrams: [],
    audio: null,
    source: 'тест',
    verified: true,
    ...extra,
  };
}

const TERMS: Term[] = [
  term('t_artery', 'artery', 'артерия'),
  term('t_vein', 'vein', 'вена', { kind: 'vein', confusableWith: ['t_artery'] }),
  term('t_aorta', 'aorta', 'аорта'),
  term('t_svc', 'superior vena cava', 'верхняя полая вена', { kind: 'vein' }),
  term('t_ivc', 'inferior vena cava', 'нижняя полая вена', { kind: 'vein' }),
  term('t_heart', 'heart', 'сердце', { kind: 'organ' }),
  term('t_lung', 'lung', 'лёгкое', { kind: 'organ', system: 'other' }),
  term('t_system', 'cardiovascular system', 'сердечно-сосудистая система', {
    kind: 'concept',
    also: { en: ['circulatory system'], ru: ['кровеносная система'] },
  }),
];
const byId = new Map(TERMS.map((t) => [t.id, t]));
const getTerm = (id: string): Term => {
  const t = byId.get(id);
  if (!t) throw new Error(id);
  return t;
};
const RULE: Rule = { id: 'r_x', title: 'Правило', body: 'Текст.', examples: [], source: 'тест', verified: true };

function input(over: Partial<BuildInput>): BuildInput {
  return {
    lesson: { id: 'l_test', terms: [] },
    getTerm,
    getRule: () => RULE,
    getDiagram: (id) => ({ id, terms: [], parents: {} }),
    getPath: (id) => { throw new Error('нет пути ' + id); },
    allTerms: TERMS,
    relationTasks: false,
    earlier: [],
    seen: () => false,
    pickReview: (c, n) => c.slice(0, n),
    seed: 'test',
    ...over,
  };
}

const firstTaskIndex = (list: Exercise[], id: string): number =>
  list.findIndex((ex) => ex.kind !== 'term_card' && ex.kind !== 'rule_card' && ex.termIds.includes(id));

describe('сборщик урока', () => {
  it('первый урок: карточка перед первым заданием на каждый термин', () => {
    const list = buildLesson(input({ lesson: { id: 'l1', terms: ['t_system', 't_heart', 't_aorta'], rules: ['r_x'] } }));
    expect(list[0]?.kind).toBe('rule_card');
    for (const id of ['t_system', 't_heart', 't_aorta']) {
      const card = list.findIndex((ex) => ex.kind === 'term_card' && ex.termId === id);
      expect(card).toBeGreaterThanOrEqual(0);
      expect(card).toBeLessThan(firstTaskIndex(list, id));
    }
  });

  it('проверок — от 6 до 10', () => {
    for (const terms of [['t_artery', 't_aorta', 't_heart'], ['t_artery', 't_aorta', 't_heart', 't_lung']]) {
      const list = buildLesson(input({ lesson: { id: 'l', terms }, earlier: [getTerm('t_svc'), getTerm('t_vein')] }));
      expect(taskCount(list)).toBeGreaterThanOrEqual(6);
      expect(taskCount(list)).toBeLessThanOrEqual(MAX_TASKS);
    }
  });

  it('задания в обе стороны и написание', () => {
    const list = buildLesson(input({ lesson: { id: 'l', terms: ['t_artery', 't_aorta', 't_heart'] } }));
    const kinds = new Set(list.map((ex) => ex.kind));
    for (const k of ['quiz_en_ru', 'quiz_ru_en', 'type_en', 'match_pairs']) expect(kinds.has(k as Exercise['kind'])).toBe(true);
  });

  it('уже показанные карточки не повторяются', () => {
    const list = buildLesson(
      input({ lesson: { id: 'l', terms: ['t_artery', 't_aorta', 't_heart'], rules: ['r_x'] }, seen: () => true }),
    );
    expect(list.some((ex) => ex.kind === 'term_card' || ex.kind === 'rule_card')).toBe(false);
  });

  it('урок-повторение собирается из знакомого, без карточек', () => {
    const earlier = TERMS.slice(0, 6);
    const list = buildLesson(
      input({
        lesson: { id: 'l', terms: [], review: ['t_svc', 't_ivc', 't_artery', 't_vein'] },
        earlier,
        seen: () => true,
      }),
    );
    expect(taskCount(list)).toBeGreaterThanOrEqual(6);
    expect(list.every((ex) => ex.termIds.every((id) => earlier.some((t) => t.id === id)))).toBe(true);
  });

  it('незнакомый термин в повторении получает карточку', () => {
    const list = buildLesson(
      input({ lesson: { id: 'l', terms: [], review: ['t_svc', 't_ivc', 't_artery'] }, earlier: TERMS.slice(0, 5), seen: (k) => k !== 't:t_ivc' }),
    );
    const card = list.findIndex((ex) => ex.kind === 'term_card' && ex.termId === 't_ivc');
    expect(card).toBeGreaterThanOrEqual(0);
    expect(card).toBeLessThan(firstTaskIndex(list, 't_ivc'));
  });

  it('один seed — один и тот же урок', () => {
    const a = buildLesson(input({ lesson: { id: 'l', terms: ['t_artery', 't_aorta', 't_heart'] }, seed: 's1' }));
    const b = buildLesson(input({ lesson: { id: 'l', terms: ['t_artery', 't_aorta', 't_heart'] }, seed: 's1' }));
    expect(a).toEqual(b);
  });

  it('в выборе ровно один верный вариант, и он на месте', () => {
    const list = buildLesson(input({ lesson: { id: 'l', terms: ['t_artery', 't_aorta', 't_heart'] }, earlier: TERMS.slice(3) }));
    const quizzes = list.filter((ex): ex is QuizExercise => ex.kind === 'quiz_en_ru' || ex.kind === 'quiz_ru_en');
    expect(quizzes.length).toBeGreaterThan(0);
    for (const q of quizzes) {
      const t = getTerm(q.termIds[0]!);
      const answer = q.kind === 'quiz_en_ru' ? t.ru : t.en;
      expect(q.options[q.correct]).toBe(answer);
      expect(q.options.filter((o) => o === answer)).toHaveLength(1);
      expect(new Set(q.options).size).toBe(q.options.length);
    }
  });
});

describe('неверные варианты', () => {
  it('похожий термин идёт первым', () => {
    const wrong = pickDistractors(getTerm('t_svc'), TERMS, 'ru', 1, rngFor('a'));
    expect(wrong[0]?.id).toBe('t_ivc');
    const wrong2 = pickDistractors(getTerm('t_artery'), TERMS, 'ru', 1, rngFor('b'));
    expect(wrong2[0]?.id).toBe('t_vein');
  });

  it('другое название того же термина не попадает в неверные', () => {
    const twin = term('t_twin', 'circulatory system', 'кровеносная система', { kind: 'concept' });
    const wrong = pickDistractors(getTerm('t_system'), [...TERMS, twin], 'en', 10, rngFor('c'));
    expect(wrong.some((t) => t.id === 't_twin')).toBe(false);
  });
});

describe('сессия урока', () => {
  const exercises: Exercise[] = [
    { kind: 'type_en', termIds: ['t_a'], ru: 'а', en: 'a', accepted: ['a'], explain: '' },
    { kind: 'type_en', termIds: ['t_b'], ru: 'б', en: 'b', accepted: ['b'], explain: '' },
  ];

  it('ошибка возвращается в конце и не портит счёт второй раз', () => {
    const s = createSession({ exercises, retryMistakes: 3 });
    s.attempt({ correct: false, termIds: ['t_a'] });
    expect(s.willRetry()).toBe(true);
    expect(s.state.total).toBe(3);
    s.advance();
    s.attempt({ correct: true, termIds: ['t_b'] });
    s.advance();
    expect(s.isRetry()).toBe(true);
    s.attempt({ correct: false, termIds: ['t_a'] });
    expect(s.advance()).toBe(false);
    expect(s.result()).toEqual({ attempts: 2, correct: 1, mistakes: 1, accuracy: 0.5, missedTermIds: ['t_a'] });
  });

  it('без попыток точность — 1', () => {
    expect(createSession({ exercises: [] }).result().accuracy).toBe(1);
  });
});
