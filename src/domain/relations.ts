/**
 * Вопросы о связях: «что кровоснабжает эта артерия», «какая артерия
 * кровоснабжает этот орган» — и так же для нервов: «что иннервирует»,
 * «какой нерв иннервирует».
 *
 * Главная забота — чтобы среди неверных вариантов не оказалось верного:
 *  — цель, которую артерия (нерв) питает хотя бы частью (…Part) или через
 *    свои ветви, неверным вариантом не ставится;
 *  — артерия (нерв), которая питает цель сама, частью или через ветви, — тоже;
 *  — не ставятся и предки по цепочке ветвей: брюшная аорта «кровоснабжает
 *    почку» через почечную артерию, и назвать её неверной нельзя.
 *
 * Модуль чистый: термины приходят аргументом.
 */

import { shuffle, type Rng } from '../core/rng';
import type { Term, TermKind } from '../data/types';

/** Вид связи: кровоснабжение или иннервация. */
export type LinkKind = 'supply' | 'nerve';

interface LinkSpec {
  main: 'supplies' | 'innervates';
  part: 'suppliesPart' | 'innervatesPart';
  /** Чем бывает цель: орган или мышца. */
  targets: readonly TermKind[];
  forward: string;
  reverse: string;
  topic: string;
}

export const LINKS: Record<LinkKind, LinkSpec> = {
  supply: {
    main: 'supplies',
    part: 'suppliesPart',
    targets: ['organ'],
    forward: 'Что кровоснабжает',
    reverse: 'Какая артерия кровоснабжает',
    topic: 'Кровоснабжение',
  },
  nerve: {
    main: 'innervates',
    part: 'innervatesPart',
    targets: ['muscle', 'organ'],
    forward: 'Что иннервирует',
    reverse: 'Какой нерв иннервирует',
    topic: 'Иннервация',
  },
};

const mainOf = (t: Term, kind: LinkKind): string[] => t.relations[LINKS[kind].main] ?? [];
const partOf = (t: Term, kind: LinkKind): string[] => t.relations[LINKS[kind].part] ?? [];

function byIdMap(all: readonly Term[]): Map<string, Term> {
  return new Map(all.map((t) => [t.id, t]));
}

/** Предки по ветвлению: у почечной артерии — брюшная аорта. */
export function ancestorsOf(id: string, all: readonly Term[]): string[] {
  const byId = byIdMap(all);
  const out: string[] = [];
  let cur = byId.get(id)?.relations.branchOf ?? null;
  while (cur && !out.includes(cur)) {
    out.push(cur);
    cur = byId.get(cur)?.relations.branchOf ?? null;
  }
  return out;
}

/** Потомки по ветвлению: у чревного ствола — левая желудочная, селезёночная… */
export function descendantsOf(id: string, all: readonly Term[]): string[] {
  return all.filter((t) => ancestorsOf(t.id, all).includes(id)).map((t) => t.id);
}

/** Всё, что артерия (нерв) питает — сама или через ветви, целиком или частью. */
export function territoryOf(id: string, all: readonly Term[], kind: LinkKind = 'supply'): Set<string> {
  const byId = byIdMap(all);
  const out = new Set<string>();
  for (const x of [id, ...descendantsOf(id, all)]) {
    const t = byId.get(x);
    if (!t) continue;
    for (const o of [...mainOf(t, kind), ...partOf(t, kind)]) out.add(o);
  }
  return out;
}

/** Артерии (нервы), которые хоть как-то связаны с целью, — вместе с их предками и ветвями. */
export function sourcesOf(targetId: string, all: readonly Term[], kind: LinkKind = 'supply'): Set<string> {
  const out = new Set<string>();
  for (const t of all) {
    if (mainOf(t, kind).includes(targetId) || partOf(t, kind).includes(targetId)) {
      out.add(t.id);
      for (const a of ancestorsOf(t.id, all)) out.add(a);
      for (const d of descendantsOf(t.id, all)) out.add(d);
    }
  }
  return out;
}

/* прежние имена — для кровоснабжения */
export const suppliedTerritory = (id: string, all: readonly Term[]): Set<string> => territoryOf(id, all, 'supply');
export const suppliersOf = (id: string, all: readonly Term[]): Set<string> => sourcesOf(id, all, 'supply');

const hasLink = (t: Term, kind: LinkKind): boolean => mainOf(t, kind).length > 0 || partOf(t, kind).length > 0;

export interface RelationQuestion {
  kind: LinkKind;
  /** О чём спрашиваем. */
  subject: Term;
  question: string;
  answer: Term;
  /** Варианты вместе с ответом, уже перемешанные. */
  options: Term[];
}

const MAX_OPTIONS = 4;

/**
 * «Что кровоснабжает <артерия>?» / «Что иннервирует <нерв>?» Ответ — одна из
 * знакомых целей, которые она питает целиком; неверные — знакомые цели того же
 * рода вне её бассейна. null — спросить не о чем или не из чего выбирать.
 */
export function forwardQuestion(
  source: Term,
  pool: readonly Term[],
  all: readonly Term[],
  rng: Rng,
  kind: LinkKind,
): RelationQuestion | null {
  const known = new Set(pool.map((t) => t.id));
  const answers = mainOf(source, kind).filter((id) => known.has(id));
  if (answers.length === 0) return null;
  const answerId = shuffle(rng, answers)[0];
  const answer = pool.find((t) => t.id === answerId);
  if (!answer) return null;
  const territory = territoryOf(source.id, all, kind);
  const wrong = shuffle(
    rng,
    pool.filter((t) => LINKS[kind].targets.includes(t.kind) && t.kind === answer.kind && !territory.has(t.id)),
  ).slice(0, MAX_OPTIONS - 1);
  if (wrong.length === 0) return null;
  return { kind, subject: source, question: LINKS[kind].forward, answer, options: shuffle(rng, [answer, ...wrong]) };
}

/**
 * «Какая артерия кровоснабжает <орган>?» / «Какой нерв иннервирует <мышцу>?»
 * Ответ — знакомая артерия (нерв), которая питает цель целиком; неверные —
 * знакомые артерии (нервы) с известным бассейном, не связанные с целью ни сами,
 * ни через предков и ветви.
 */
export function reverseQuestion(
  target: Term,
  pool: readonly Term[],
  all: readonly Term[],
  rng: Rng,
  kind: LinkKind,
): RelationQuestion | null {
  const answers = pool.filter((t) => mainOf(t, kind).includes(target.id));
  if (answers.length === 0) return null;
  const answer = shuffle(rng, answers)[0] as Term;
  const related = sourcesOf(target.id, all, kind);
  const wrong = shuffle(rng, pool.filter((t) => hasLink(t, kind) && !related.has(t.id))).slice(0, MAX_OPTIONS - 1);
  if (wrong.length === 0) return null;
  return { kind, subject: target, question: LINKS[kind].reverse, answer, options: shuffle(rng, [answer, ...wrong]) };
}

/* прежние имена — для кровоснабжения */
export const suppliesQuestion = (a: Term, pool: readonly Term[], all: readonly Term[], rng: Rng): RelationQuestion | null =>
  forwardQuestion(a, pool, all, rng, 'supply');
export const suppliedByQuestion = (o: Term, pool: readonly Term[], all: readonly Term[], rng: Rng): RelationQuestion | null =>
  reverseQuestion(o, pool, all, rng, 'supply');

/**
 * Какой вопрос задать о термине: артерия или нерв — «что питает», орган
 * или мышца — «чем питается». Пробуем по очереди, пока не соберётся.
 */
export function relationQuestion(
  t: Term,
  pool: readonly Term[],
  all: readonly Term[],
  rng: Rng,
): RelationQuestion | null {
  for (const kind of ['supply', 'nerve'] as const) {
    const q = LINKS[kind].targets.includes(t.kind)
      ? reverseQuestion(t, pool, all, rng, kind)
      : mainOf(t, kind).length > 0
        ? forwardQuestion(t, pool, all, rng, kind)
        : null;
    if (q) return q;
  }
  return null;
}
