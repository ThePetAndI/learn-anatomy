/** Вопросы о кровоснабжении: среди неверных вариантов не должно быть верного. */
import { describe, expect, it } from 'vitest';
import { rngFor } from '../src/core/rng';
import { allTerms, getTerm } from '../src/data/content';
import {
  ancestorsOf,
  descendantsOf,
  forwardQuestion,
  reverseQuestion,
  sourcesOf,
  territoryOf,
  suppliedByQuestion,
  suppliedTerritory,
  suppliersOf,
  suppliesQuestion,
} from '../src/domain/relations';

const all = allTerms();

describe('ветвление', () => {
  it('предки и потомки по branchOf', () => {
    expect(ancestorsOf('t_left_gastric_artery', all)).toEqual(['t_celiac_trunk', 't_abdominal_aorta']);
    expect(descendantsOf('t_celiac_trunk', all).sort()).toEqual(
      ['t_common_hepatic_artery', 't_left_gastric_artery', 't_splenic_artery'].sort(),
    );
  });

  it('бассейн артерии — с ветвями и частичным кровоснабжением', () => {
    const celiac = suppliedTerritory('t_celiac_trunk', all);
    for (const o of ['t_stomach', 't_liver', 't_spleen', 't_small_intestine']) expect(celiac.has(o)).toBe(true);
    expect(celiac.has('t_kidney')).toBe(false);
  });

  it('кто питает тонкую кишку: верхняя брыжеечная, чревный ствол частью, их предки и ветви', () => {
    const s = suppliersOf('t_small_intestine', all);
    for (const id of ['t_superior_mesenteric_artery', 't_celiac_trunk', 't_common_hepatic_artery', 't_abdominal_aorta']) {
      expect(s.has(id)).toBe(true);
    }
    expect(s.has('t_renal_artery')).toBe(false);
  });
});

describe('вопросы на всех связях курса', () => {
  const arteries = all.filter((t) => (t.relations.supplies ?? []).length > 0);
  const organs = all.filter((t) => t.kind === 'organ');

  it('«что кровоснабжает»: ответ верен, неверные — вне бассейна артерии', () => {
    for (const a of arteries) {
      for (let i = 0; i < 15; i++) {
        const q = suppliesQuestion(a, all, all, rngFor(a.id + i));
        expect(q, a.id).not.toBeNull();
        const territory = suppliedTerritory(a.id, all);
        expect(a.relations.supplies).toContain(q!.answer.id);
        for (const o of q!.options) if (o !== q!.answer) expect(territory.has(o.id), a.id + ' → ' + o.id).toBe(false);
      }
    }
  });

  it('«какая артерия кровоснабжает»: ответ питает орган, неверные с органом не связаны вовсе', () => {
    for (const o of organs) {
      for (let i = 0; i < 15; i++) {
        const q = suppliedByQuestion(o, all, all, rngFor(o.id + i));
        // лёгкое: питающих его бронхиальных артерий в курсе нет — вопроса нет
        if (!q) continue;
        expect(q.answer.relations.supplies).toContain(o.id);
        const related = suppliersOf(o.id, all);
        for (const opt of q.options) if (opt !== q.answer) expect(related.has(opt.id), o.id + ' ← ' + opt.id).toBe(false);
      }
    }
  });

  it('«что иннервирует» и «какой нерв иннервирует»: тех же правил держится и иннервация', () => {
    const nerves = all.filter((t) => (t.relations.innervates ?? []).length > 0);
    expect(nerves.length).toBeGreaterThan(2);
    for (const n of nerves) {
      for (let i = 0; i < 15; i++) {
        const q = forwardQuestion(n, all, all, rngFor(n.id + i), 'nerve');
        expect(q, n.id).not.toBeNull();
        expect(n.relations.innervates).toContain(q!.answer.id);
        const territory = territoryOf(n.id, all, 'nerve');
        for (const o of q!.options) if (o !== q!.answer) expect(territory.has(o.id), n.id + ' → ' + o.id).toBe(false);
      }
    }
    for (const m of all.filter((t) => t.kind === 'muscle')) {
      for (let i = 0; i < 15; i++) {
        const q = reverseQuestion(m, all, all, rngFor(m.id + i), 'nerve');
        expect(q, m.id).not.toBeNull();
        const related = sourcesOf(m.id, all, 'nerve');
        for (const opt of q!.options) if (opt !== q!.answer) expect(related.has(opt.id), m.id + ' ← ' + opt.id).toBe(false);
      }
    }
  });

  it('жевательную мышцу иннервирует нижнечелюстной нерв, и лицевой в варианты «неверных» не попадает как верный', () => {
    for (let i = 0; i < 20; i++) {
      const q = reverseQuestion(getTerm('t_masseter'), all, all, rngFor('m' + i), 'nerve');
      expect(q!.answer.id).toBe('t_mandibular_nerve');
      // тройничный нерв — предок нижнечелюстного: тоже не может быть «неверным»
      expect(q!.options.map((o) => o.id)).not.toContain('t_trigeminal_nerve');
    }
  });

  it('о незнакомом не спрашивают: ответ и варианты — только из уже встреченного', () => {
    const pool = [getTerm('t_celiac_trunk'), getTerm('t_stomach'), getTerm('t_heart'), getTerm('t_lung')];
    const q = suppliesQuestion(getTerm('t_celiac_trunk'), pool, all, rngFor('x'));
    expect(q?.answer.id).toBe('t_stomach');
    expect(q?.options.every((o) => pool.includes(o))).toBe(true);
  });
});
