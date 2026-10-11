import { describe, expect, it } from 'vitest';
import { loadState, sanitize, saveState } from '../src/data/persist';
import { SAVE_VERSION, createInitialState } from '../src/data/state';

describe('сохранение', () => {
  it('мусор на входе превращается в чистое состояние', () => {
    for (const junk of [null, 42, 'x', [], { terms: 'нет' }]) {
      const s = sanitize(junk, 5);
      expect(s.version).toBe(SAVE_VERSION);
      expect(s.terms).toEqual({});
    }
  });

  it('значения вне диапазона обрезаются, чужие поля отбрасываются', () => {
    const s = sanitize(
      {
        version: SAVE_VERSION,
        createdAt: 1,
        terms: { t_a: { seen: -5, box: 99, ease: 10, introduced: 'да' } },
        lessons: { l1: { attempts: 2, completedAt: 7, best: 3 } },
        seen: { 't:t_a': 3, 'r:bad': 'вчера' },
        coins: 1000,
      },
      5,
    );
    expect(s.terms.t_a).toMatchObject({ seen: 0, box: 6, ease: 2.8, introduced: false });
    expect(s.lessons.l1).toEqual({ attempts: 2, completedAt: 7, best: 1 });
    expect(s.seen).toEqual({ 't:t_a': 3 });
    expect('coins' in s).toBe(false);
  });

  it('записанное читается обратно', async () => {
    const s = createInitialState(100);
    s.seen['t:t_heart'] = 100;
    s.lessons.l1 = { attempts: 1, completedAt: 100, best: 0.9 };
    await saveState(s);
    expect(await loadState()).toEqual(s);
  });
});
