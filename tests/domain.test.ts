import { describe, expect, it } from 'vitest';
import { checkTyped, normalizeEn } from '../src/domain/answer';
import { areConfusable, confusableNames, editDistance, similarWords } from '../src/domain/confusable';
import { createInitialState } from '../src/data/state';
import { nextLesson, recordLessonResult, sectionProgress } from '../src/domain/progress';
import {
  BOX_INTERVALS,
  RETRY_DELAY_MS,
  dueCount,
  isDue,
  recordTermAttempt,
  reviewSelection,
} from '../src/domain/srs';
import { DAY } from '../src/core/time';

describe('сверка написанного термина', () => {
  it('нормализует регистр, пробелы, дефисы и артикль', () => {
    expect(normalizeEn('  The  Superior   Vena-Cava ')).toBe('superior vena cava');
  });

  it('точное совпадение', () => {
    expect(checkTyped('aorta', ['aorta']).result).toBe('exact');
    expect(checkTyped('AORTA', ['aorta']).result).toBe('exact');
  });

  it('засчитывает другое принятое название', () => {
    const r = checkTyped('circulatory system', ['cardiovascular system', 'circulatory system']);
    expect(r).toEqual({ result: 'exact', matched: 'circulatory system' });
  });

  it('одна опечатка в длинном термине — засчитано с подсказкой', () => {
    expect(checkTyped('capilary', ['capillary']).result).toBe('typo');
    expect(checkTyped('ventircle', ['ventricle']).result).toBe('typo');
  });

  it('две опечатки — неверно', () => {
    expect(checkTyped('capilari', ['capillary']).result).toBe('wrong');
  });

  it('в коротком термине опечатка не прощается', () => {
    expect(checkTyped('vain', ['vein']).result).toBe('wrong');
  });

  it('пустой ответ — неверно', () => {
    expect(checkTyped('   ', ['aorta']).result).toBe('wrong');
  });

  it('без верных ответов — явная ошибка, а не молчаливое «неверно»', () => {
    expect(() => checkTyped('x', [])).toThrow();
  });
});

describe('похожие термины', () => {
  it('расстояние Дамерау — Левенштейна', () => {
    expect(editDistance('afferent', 'efferent')).toBe(1);
    expect(editDistance('ventricle', 'ventircle')).toBe(1);
    expect(editDistance('', 'abc')).toBe(3);
  });

  it('похожие написанием слова', () => {
    expect(similarWords('artery', 'arteriole')).toBe(true);
    expect(similarWords('sympathetic', 'parasympathetic')).toBe(true);
    expect(similarWords('afferent', 'efferent')).toBe(true);
    expect(similarWords('artery', 'atrium')).toBe(false);
    expect(similarWords('aorta', 'artery')).toBe(false);
  });

  it('пары из CLAUDE.md распознаются', () => {
    expect(confusableNames('superior vena cava', 'inferior vena cava')).toBe(true);
    expect(confusableNames('common carotid artery', 'internal carotid artery')).toBe(true);
    expect(confusableNames('internal carotid artery', 'external carotid artery')).toBe(true);
    expect(confusableNames('sympathetic nervous system', 'parasympathetic nervous system')).toBe(true);
    expect(confusableNames('artery', 'arteriole')).toBe(true);
  });

  it('соседние, но разные термины не считаются похожими', () => {
    expect(confusableNames('subclavian artery', 'axillary artery')).toBe(false);
    expect(confusableNames('pulmonary trunk', 'pulmonary veins')).toBe(false);
    expect(confusableNames('heart', 'aorta')).toBe(false);
  });

  it('явная пометка работает в обе стороны', () => {
    const a = { id: 't_a', en: 'systemic circulation', confusableWith: ['t_b'] };
    const b = { id: 't_b', en: 'pulmonary circulation' };
    expect(areConfusable(a, b)).toBe(true);
    expect(areConfusable(b, a)).toBe(true);
    expect(areConfusable(a, a)).toBe(false);
  });
});

describe('интервальное повторение', () => {
  const T0 = Date.UTC(2026, 9, 10, 9);

  it('верный ответ отодвигает показ, ошибка возвращает скоро', () => {
    const s = createInitialState(T0);
    const first = recordTermAttempt(s, 't_aorta', true, T0);
    expect(first.box).toBe(1);
    expect(first.introduced).toBe(true);
    expect(first.dueAt).toBeGreaterThan(T0 + 0.9 * BOX_INTERVALS[1] * DAY);

    const wrong = recordTermAttempt(s, 't_aorta', false, T0 + DAY);
    expect(wrong.box).toBe(0);
    expect(wrong.streak).toBe(0);
    expect(wrong.dueAt).toBe(T0 + DAY + RETRY_DELAY_MS);
  });

  it('интервалы растут с каждым верным ответом', () => {
    const s = createInitialState(T0);
    let ts = T0;
    let prev = 0;
    for (let i = 0; i < 5; i++) {
      const st = recordTermAttempt(s, 't_vein', true, ts);
      expect(st.interval).toBeGreaterThan(prev);
      prev = st.interval;
      ts = st.dueAt;
    }
  });

  it('досрочные верные ответы в одном уроке ступень не поднимают', () => {
    const s = createInitialState(T0);
    for (let i = 0; i < 4; i++) recordTermAttempt(s, 't_heart', true, T0 + i * 60_000);
    expect(s.terms.t_heart).toMatchObject({ box: 1, correct: 4, streak: 4, introduced: true });
  });

  it('после ошибки верный ответ снова поднимает с нулевой ступени', () => {
    const s = createInitialState(T0);
    recordTermAttempt(s, 't_heart', true, T0);
    recordTermAttempt(s, 't_heart', false, T0 + 1000);
    expect(recordTermAttempt(s, 't_heart', true, T0 + 2000).box).toBe(1);
  });

  it('срок и счётчик просроченного', () => {
    const s = createInitialState(T0);
    recordTermAttempt(s, 't_a', false, T0);
    recordTermAttempt(s, 't_b', true, T0);
    expect(isDue(s.terms.t_a!, T0)).toBe(false);
    expect(dueCount(s, T0 + RETRY_DELAY_MS)).toBe(1);
    expect(dueCount(s, T0 + 2 * DAY)).toBe(2);
  });

  it('повторение берёт просроченное и не берёт невиданное', () => {
    const s = createInitialState(T0);
    recordTermAttempt(s, 't_old', true, T0);
    recordTermAttempt(s, 't_bad', false, T0);
    const pick = reviewSelection(s, ['t_new', 't_old', 't_bad'], 5, T0 + RETRY_DELAY_MS);
    expect(pick[0]).toBe('t_bad');
    expect(pick).not.toContain('t_new');
  });
});

describe('прогресс по курсу', () => {
  const all = [
    { id: 'l1', order: 0, sectionId: 's_a' },
    { id: 'l2', order: 1, sectionId: 's_a' },
    { id: 'l3', order: 2, sectionId: 's_a' },
    { id: 'm1', order: 3, sectionId: 's_b' },
    { id: 'm2', order: 4, sectionId: 's_b' },
  ];
  it('с нуля «Продолжить» ведёт к первому уроку курса, после урока — к следующему', () => {
    const s = createInitialState(0);
    expect(nextLesson(s, all)?.id).toBe('l1');
    recordLessonResult(s, 'l1', 0.8, 1);
    expect(nextLesson(s, all)?.id).toBe('l2');
  });

  it('урок из середины: «Продолжить» ведёт дальше по разделу, а не к его началу', () => {
    const s = createInitialState(0);
    recordLessonResult(s, 'l2', 1, 10);
    expect(nextLesson(s, all)?.id).toBe('l3');
    recordLessonResult(s, 'l3', 1, 20);
    // дальше в разделе всё пройдено — возвращаемся к пропущенному началу
    expect(nextLesson(s, all)?.id).toBe('l1');
  });

  it('«Продолжить» ведёт в раздел, где занимались последним', () => {
    const s = createInitialState(0);
    recordLessonResult(s, 'l1', 1, 10);
    recordLessonResult(s, 'm1', 1, 20);
    expect(nextLesson(s, all)?.id).toBe('m2');
    recordLessonResult(s, 'm2', 1, 30);
    // во втором разделе всё пройдено — продолжаем первый
    expect(nextLesson(s, all)?.id).toBe('l2');
  });

  it('повторное прохождение не сбрасывает дату и берёт лучшую точность', () => {
    const s = createInitialState(0);
    expect(recordLessonResult(s, 'l1', 0.9, 10).firstCompletion).toBe(true);
    expect(recordLessonResult(s, 'l1', 0.5, 20).firstCompletion).toBe(false);
    expect(s.lessons.l1).toEqual({ attempts: 2, completedAt: 10, best: 0.9 });
  });

  it('проценты раздела', () => {
    const s = createInitialState(0);
    recordLessonResult(s, 'l1', 1, 1);
    expect(sectionProgress(s, ['l1', 'l2'])).toBe(0.5);
    expect(sectionProgress(s, [])).toBe(0);
  });
});
