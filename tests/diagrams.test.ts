/**
 * Схемы: формат проверяется валидатором, а топология — здесь, на настоящих
 * файлах. Стороны и порядок «спереди — сзади» легко перепутать при правке
 * рисунка, а глазом это не всегда заметно.
 */
import { describe, expect, it } from 'vitest';
import { diagrams, getDiagram, getTerm } from '../src/data/content';
import { parseSvg, walk, type SvgNode } from '../src/data/svg';
import { minHitUnits, validateDiagram } from '../src/data/validate';
import { rngFor } from '../src/core/rng';
import { isRefinement, makeHighlighted } from '../src/lesson/build';

const known = (id: string): boolean => id.startsWith('t_');
const wrap = (body: string, extra = ''): string =>
  '<svg viewBox="0 0 360 400" data-diagram="d_x"' + extra + '><title>Тест</title>' + body + '</svg>';
const GOOD_VESSEL =
  '<g data-term="t_aorta"><path class="hit" stroke-width="48" d="M0 0V10"/><path class="vessel-oxy" stroke-width="10" d="M0 0V10"/></g>';

describe('формат схемы', () => {
  it('правильная схема проходит', () => {
    expect(validateDiagram('d_x', wrap(GOOD_VESSEL), known)).toEqual({ errors: [], terms: ['t_aorta'] });
  });

  it('зона нажатия уже 44 px на телефоне — ошибка', () => {
    const thin = GOOD_VESSEL.replace('stroke-width="48"', 'stroke-width="20"');
    expect(validateDiagram('d_x', wrap(thin), known).errors.join()).toMatch(/зона нажатия/);
    expect(minHitUnits(335)).toBe(44);
  });

  it('без зоны нажатия — ошибка', () => {
    const none = '<g data-term="t_aorta"><path class="vessel-oxy" stroke-width="10" d="M0 0V10"/></g>';
    expect(validateDiagram('d_x', wrap(none), known).errors.join()).toMatch(/нужна зона нажатия/);
  });

  it('цвет, стиль, текст и чужие классы запрещены', () => {
    const bad = '<g data-term="t_aorta" data-hit="area"><path class="red" fill="#f00" d="M0 0"/><text>aorta</text></g>';
    const errors = validateDiagram('d_x', wrap(bad), known).errors.join('\n');
    expect(errors).toMatch(/неизвестный класс red/);
    expect(errors).toMatch(/атрибут fill/);
    expect(errors).toMatch(/<text>/);
  });

  it('несуществующий термин и чужое имя файла — ошибки', () => {
    const errors = validateDiagram('d_y', wrap(GOOD_VESSEL), (id) => id !== 't_aorta').errors.join('\n');
    expect(errors).toMatch(/data-diagram="d_y"/);
    expect(errors).toMatch(/термина t_aorta нет/);
  });

  it('битая вложенность — понятная ошибка, а не падение', () => {
    expect(validateDiagram('d_x', '<svg><g></svg>', known).errors[0]).toMatch(/не разбирается/);
  });
});

/* ——— топология на настоящих схемах ——— */

function groups(id: string): SvgNode[] {
  const out: SvgNode[] = [];
  walk(parseSvg(getDiagram(id).svg), (n) => {
    if (n.attrs['data-term']) out.push(n);
  });
  return out;
}

/** Порядковые номера групп термина в документе: чем больше, тем ближе к зрителю. */
function layers(id: string, term: string): number[] {
  return groups(id)
    .map((g, i) => (g.attrs['data-term'] === term ? i : -1))
    .filter((i) => i >= 0);
}

/** Все x из пути «M x y ... V ...» — грубо, но для проверки стороны хватает. */
function xs(node: SvgNode): number[] {
  const out: number[] = [];
  walk(node, (n) => {
    const d = n.attrs.d;
    if (d) for (const m of d.matchAll(/M\s*(-?[\d.]+)/g)) out.push(Number(m[1]));
    if (n.attrs.cx) out.push(Number(n.attrs.cx));
    if (n.attrs.x) out.push(Number(n.attrs.x));
  });
  return out;
}

const avg = (a: number[]): number => a.reduce((s, x) => s + x, 0) / a.length;
const sideX = (diagram: string, term: string): number =>
  avg(groups(diagram).filter((g) => g.attrs['data-term'] === term).flatMap(xs));

describe('топология схем', () => {
  it('у каждой схемы есть термины, и все они существуют', () => {
    expect(diagrams.length).toBeGreaterThanOrEqual(2);
    for (const d of diagrams) {
      expect(d.terms.length).toBeGreaterThan(3);
      for (const id of d.terms) expect(() => getTerm(id)).not.toThrow();
    }
  });

  it('вид спереди: полые вены справа у пациента — слева на рисунке', () => {
    for (const d of ['d_circulation', 'd_heart']) {
      expect(sideX(d, 't_superior_vena_cava')).toBeLessThan(180);
      expect(sideX(d, 't_inferior_vena_cava')).toBeLessThan(180);
    }
  });

  it('правые камеры сердца слева на рисунке', () => {
    expect(sideX('d_heart', 't_right_atrium')).toBeLessThan(sideX('d_heart', 't_left_atrium'));
    expect(sideX('d_heart', 't_right_ventricle')).toBeLessThan(sideX('d_heart', 't_left_ventricle'));
  });

  it('клапан лёгочного ствола левее у пациента и выше клапана аорты', () => {
    const circle = (term: string): SvgNode =>
      groups('d_heart').find((g) => g.attrs['data-term'] === term)!.children.find((c) => c.tag === 'circle')!;
    const pv = circle('t_pulmonary_valve');
    const av = circle('t_aortic_valve');
    expect(Number(pv.attrs.cx)).toBeGreaterThan(Number(av.attrs.cx));
    expect(Number(pv.attrs.cy)).toBeLessThan(Number(av.attrs.cy));
  });

  it('спереди назад: лёгочный ствол впереди аорты, правая лёгочная артерия — позади верхней полой вены', () => {
    for (const d of ['d_circulation', 'd_heart']) {
      expect(Math.max(...layers(d, 't_pulmonary_trunk'))).toBeGreaterThan(Math.max(...layers(d, 't_aorta')));
      expect(Math.min(...layers(d, 't_pulmonary_arteries'))).toBeLessThan(Math.min(...layers(d, 't_superior_vena_cava')));
    }
  });

  it('камеры вложены в сердце, капилляры лёгких — в лёгкое', () => {
    const c = getDiagram('d_circulation');
    expect(c.parents.t_atrium).toEqual(['t_heart']);
    expect(c.parents.t_capillary).toEqual(['t_lung']);
  });
});

describe('варианты на схеме', () => {
  it('уточнение не становится неверным вариантом', () => {
    expect(isRefinement(getTerm('t_atrium'), getTerm('t_right_atrium'))).toBe(true);
    expect(isRefinement(getTerm('t_right_atrium'), getTerm('t_left_atrium'))).toBe(false);
    expect(isRefinement(getTerm('t_artery'), getTerm('t_pulmonary_arteries'))).toBe(false);
  });

  it('«Что подсвечено?» не предлагает то, во что структура вложена', () => {
    const d = getDiagram('d_circulation');
    const pool = d.terms.map(getTerm);
    for (let i = 0; i < 20; i++) {
      const ex = makeHighlighted(getTerm('t_atrium'), d, pool, rngFor('s' + i));
      expect(ex).not.toBeNull();
      expect(ex!.options).not.toContain('heart');
      expect(ex!.options[ex!.correct]).toBe('atrium');
    }
  });
});

/* ——— веха 4: аорта, конечности, вены ——— */

/** Длина пути по горизонтали: от начала до конца. */
function spanX(g: SvgNode): number {
  const nums = (g.children.find((c) => !(c.attrs.class ?? '').includes('hit'))?.attrs.d ?? '').match(/-?[\d.]+/g)!.map(Number);
  return Math.abs((nums[nums.length - 2] as number) - (nums[0] as number));
}

/** Где кончается сосуд: для ветвей из одной точки сторону показывает конец, а не начало. */
function endX(diagram: string, term: string): number {
  const ends = groups(diagram)
    .filter((g) => g.attrs['data-term'] === term)
    .map((g) => {
      const nums = (g.children.find((c) => !(c.attrs.class ?? '').includes('hit'))?.attrs.d ?? '').match(/-?[\d.]+/g)!.map(Number);
      return nums[nums.length - 2] as number;
    });
  return avg(ends);
}

const byTerm = (diagram: string, term: string): SvgNode[] =>
  groups(diagram).filter((g) => g.attrs['data-term'] === term).sort((a, b) => Math.min(...xs(a)) - Math.min(...xs(b)));

describe('топология схем кровеносной системы', () => {
  it('ветви дуги: плечеголовной ствол один, и обе левые ветви отходят от дуги правее него на рисунке', () => {
    const bct = byTerm('d_aorta', 't_brachiocephalic_trunk');
    expect(bct).toHaveLength(1);
    const bctStart = xs(bct[0]!)[0] as number;
    const leftCarotid = byTerm('d_aorta', 't_common_carotid_artery')[1]!;
    const leftSubclavian = byTerm('d_aorta', 't_subclavian_artery')[1]!;
    expect(xs(leftCarotid)[0]!).toBeGreaterThan(bctStart);
    expect(xs(leftSubclavian)[0]!).toBeGreaterThan(xs(leftCarotid)[0]!);
  });

  it('правая почечная артерия длиннее левой', () => {
    const [right, left] = byTerm('d_aorta', 't_renal_artery');
    expect(spanX(right!)).toBeGreaterThan(spanX(left!));
  });

  it('нижняя полая вена справа от аорты; левая почечная вена длиннее правой', () => {
    expect(sideX('d_veins', 't_inferior_vena_cava')).toBeLessThan(198);
    const [right, left] = byTerm('d_veins', 't_renal_vein');
    expect(spanX(left!)).toBeGreaterThan(2 * spanX(right!));
  });

  it('левая плечеголовная вена длиннее правой; наружная яремная снаружи от внутренней', () => {
    const [right, left] = byTerm('d_veins', 't_brachiocephalic_vein');
    expect(spanX(left!)).toBeGreaterThan(spanX(right!));
    const ej = byTerm('d_veins', 't_external_jugular_vein').map((g) => xs(g)[0]!);
    const ij = byTerm('d_veins', 't_internal_jugular_vein').map((g) => xs(g)[0]!);
    expect(ej[0]!).toBeLessThan(ij[0]!);
    expect(ej[1]!).toBeGreaterThan(ij[1]!);
  });

  it('рука спереди: лучевая и латеральная подкожная — со стороны большого пальца (левее)', () => {
    expect(endX('d_upper_limb', 't_radial_artery')).toBeLessThan(endX('d_upper_limb', 't_ulnar_artery'));
    expect(sideX('d_arm_veins', 't_cephalic_vein')).toBeLessThan(sideX('d_arm_veins', 't_basilic_vein'));
  });

  it('нога спереди: внутренняя подвздошная медиальнее наружной, передняя большеберцовая латеральнее задней', () => {
    expect(endX('d_lower_limb', 't_internal_iliac_artery')).toBeGreaterThan(endX('d_lower_limb', 't_external_iliac_artery'));
    expect(endX('d_lower_limb', 't_anterior_tibial_artery')).toBeLessThan(endX('d_lower_limb', 't_posterior_tibial_artery'));
  });

  it('вид справа: позвоночная позади внутренней сонной, внутренняя сонная позади наружной', () => {
    expect(sideX('d_head_neck', 't_vertebral_artery')).toBeLessThan(sideX('d_head_neck', 't_internal_carotid_artery'));
    expect(endX('d_head_neck', 't_internal_carotid_artery')).toBeLessThan(endX('d_head_neck', 't_external_carotid_artery'));
  });

  it('аорта на своей схеме — из частей, а ветви в неё не вложены', () => {
    const p = getDiagram('d_aorta').parents;
    expect(p.t_ascending_aorta).toEqual(['t_aorta']);
    expect(p.t_thoracic_aorta).toEqual(['t_aorta', 't_descending_aorta']);
    expect(p.t_aortic_bifurcation).toEqual(['t_aorta', 't_descending_aorta', 't_abdominal_aorta']);
    // «найди аорту» не должна принимать сонную артерию
    expect(p.t_common_carotid_artery).toEqual([]);
  });
});

/* ——— лицо ——— */

describe('топология схем лица', () => {
  it('ветви лицевого нерва сверху вниз: височные, скуловые, щёчные, краевая, шейная', () => {
    const ends = ['t_temporal_branches', 't_zygomatic_branches', 't_buccal_branches', 't_marginal_mandibular_branch', 't_cervical_branch'].map(
      (id) => {
        const g = groups('d_facial_nerve').find((x) => x.attrs['data-term'] === id)!;
        // y конца первого подпути видимой линии — там ветвь кончается
        const first = (g.children[1]?.attrs.d ?? '').split('M')[1]!.match(/-?[\d.]+/g)!.map(Number);
        return first[first.length - 1] as number;
      },
    );
    for (let i = 1; i < ends.length; i++) expect(ends[i]!).toBeGreaterThan(ends[i - 1]!);
  });

  it('ветви тройничного и лицевого нервов вложены в свой нерв', () => {
    const t = getDiagram('d_trigeminal').parents;
    expect(t.t_mental_nerve).toEqual(['t_trigeminal_nerve', 't_mandibular_nerve', 't_inferior_alveolar_nerve']);
    expect(t.t_ophthalmic_nerve).toEqual(['t_trigeminal_nerve']);
    expect(getDiagram('d_facial_nerve').parents.t_buccal_branches).toEqual(['t_facial_nerve']);
    // жевательная мышца с лицевым нервом не связана
    expect(getDiagram('d_facial_nerve').parents.t_masseter).toEqual([]);
  });

  it('лицевая вена лежит позади лицевой артерии', () => {
    // одна и та же высота — у щеки: вена левее (позади, лицо обращено вправо)
    const xAt = (diagram: string, term: string, y: number): number => {
      const g = groups(diagram).find((x) => x.attrs['data-term'] === term)!;
      const d = g.children.find((c) => !(c.attrs.class ?? '').includes('hit'))!.attrs.d!;
      const nums = d.match(/-?[\d.]+/g)!.map(Number);
      let best = Infinity;
      let bx = 0;
      for (let i = 0; i + 1 < nums.length; i += 2) {
        const dy = Math.abs((nums[i + 1] as number) - y);
        if (dy < best) {
          best = dy;
          bx = nums[i] as number;
        }
      }
      return bx;
    };
    expect(xAt('d_face_veins', 't_facial_vein', 290)).toBeLessThan(xAt('d_face_arteries', 't_facial_artery', 290));
  });
});
