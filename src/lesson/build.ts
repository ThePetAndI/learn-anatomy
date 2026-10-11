/**
 * Сборщик урока: из списка терминов — очередь заданий.
 *
 * Порядок такой:
 *  1. карточки-правила, которых ещё не видели;
 *  2. знакомство с каждым новым термином и сразу «Что это?» на него;
 *  3. пары; пути по порядку; «Найди на схеме»; «Что кровоснабжает» (если раздел
 *     их включает); «Как по-английски?» или написание на каждый новый;
 *     повторение прошлого; «Что подсвечено?»; остальное написание.
 * Заданий-проверок — от MIN_TASKS до MAX_TASKS, карточки не в счёт;
 * что не влезло, отбрасывается с хвоста — поэтому порядок и есть приоритет.
 *
 * Последним проходом перед каждым заданием на незнакомый термин ставится
 * его карточка: ничего не спрашиваем вслепую, даже если урок собран из
 * одного повторения.
 *
 * Модуль чистый: контент и прогресс приходят аргументами, случайность —
 * через seed. Один seed — один и тот же урок.
 */

import { pick, rngFor, shuffle, type Rng } from '../core/rng';
import type { Lesson, Path, Rule, Term } from '../data/types';
import { areConfusable } from '../domain/confusable';
import { LINKS, relationQuestion, type RelationQuestion } from '../domain/relations';
import type {
  Exercise,
  FindOnDiagramExercise,
  MatchPairsExercise,
  NameHighlightedExercise,
  PathExercise,
  QuizExercise,
  RelationExercise,
  TermCardExercise,
  TypeEnExercise,
} from './types';

export const MIN_TASKS = 6;
export const MAX_TASKS = 10;
/** Вариантов ответа в выборе — не больше. */
export const QUIZ_OPTIONS = 4;
/** Пар на экране — не больше: на узком телефоне больше не помещается. */
export const MAX_PAIRS = 5;
const MIN_PAIRS = 3;
/** Терминов прошлых уроков в обычном уроке. */
const REVIEW_IN_LESSON = 3;

/** Что сборщику нужно знать о схеме. */
export interface DiagramInfo {
  id: string;
  /** Термины на схеме. */
  terms: readonly string[];
  /** Для каждого термина — в какие структуры он вложен на схеме: камера — в сердце. */
  parents: Readonly<Record<string, readonly string[]>>;
}

export interface BuildInput {
  lesson: Pick<Lesson, 'id' | 'terms' | 'review' | 'rules' | 'paths'>;
  getTerm: (id: string) => Term;
  getRule: (id: string) => Rule;
  getDiagram: (id: string) => DiagramInfo;
  getPath: (id: string) => Path;
  /** Все термины курса — чтобы знать, что артерия питает через свои ветви. */
  allTerms: readonly Term[];
  /** Задавать ли вопросы «что кровоснабжает» и «что иннервирует»: они с середины курса. */
  relationTasks: boolean;
  /** Термины прошлых уроков по порядку курса: из них повторение и неверные варианты. */
  earlier: readonly Term[];
  /** Показана ли уже карточка: «t:<id>» — термин, «r:<id>» — правило. */
  seen: (key: string) => boolean;
  /** Какие из знакомых терминов повторить: интервальное повторение решает снаружи. */
  pickReview: (candidates: readonly string[], limit: number) => string[];
  seed: string;
}

export function termCard(t: Term): TermCardExercise {
  return {
    kind: 'term_card',
    termIds: [t.id],
    termId: t.id,
    en: t.en,
    ru: t.ru,
    termKind: t.kind,
    plural: t.plural,
    alsoEn: t.also?.en ?? [],
    alsoRu: t.also?.ru ?? [],
    about: t.about,
    // первая схема в списке — самая общая: на ней видно, где термин в целом
    diagramId: t.diagrams[0],
  };
}

function words(en: string): string[] {
  return en.toLowerCase().split(/\s+/);
}

/**
 * Один термин — уточнение другого: atrium и right atrium. Такой не годится
 * в неверные варианты: «предсердие» к «правому предсердию» — наполовину верно.
 */
export function isRefinement(a: Term, b: Term): boolean {
  const [short, long] = words(a.en).length <= words(b.en).length ? [words(a.en), words(b.en)] : [words(b.en), words(a.en)];
  if (short.length === long.length) return false;
  return short.every((w, i) => long[long.length - short.length + i] === w);
}

/**
 * Неверные варианты: сначала термины, которые легко спутать с этим,
 * потом того же вида (артерия к артерии), потом той же системы.
 * Совпадающие по тексту и уточняющие друг друга отбрасываются — иначе
 * верных ответов было бы два.
 */
export function pickDistractors(
  target: Term,
  pool: readonly Term[],
  field: 'en' | 'ru',
  count: number,
  rng: Rng,
  reject: (t: Term) => boolean = () => false,
): Term[] {
  const taken = new Set(
    [target[field], ...(target.also?.[field] ?? [])].map((s) => s.toLowerCase()),
  );
  const candidates: { t: Term; rank: number }[] = [];
  for (const t of shuffle(rng, pool)) {
    if (t.id === target.id || isRefinement(t, target) || reject(t)) continue;
    const text = t[field].toLowerCase();
    if (taken.has(text)) continue;
    taken.add(text);
    const rank = areConfusable(target, t) ? 0 : t.kind === target.kind ? 1 : t.system === target.system ? 2 : 3;
    candidates.push({ t, rank });
  }
  // сортировка устойчивая: внутри ранга остаётся случайный порядок
  candidates.sort((a, b) => a.rank - b.rank);
  return candidates.slice(0, count).map((c) => c.t);
}

export function makeQuiz(
  kind: 'quiz_en_ru' | 'quiz_ru_en',
  target: Term,
  pool: readonly Term[],
  rng: Rng,
): QuizExercise | null {
  const field = kind === 'quiz_en_ru' ? 'ru' : 'en';
  const wrong = pickDistractors(target, pool, field, QUIZ_OPTIONS - 1, rng);
  if (wrong.length === 0) return null;
  const options = shuffle(rng, [target, ...wrong]);
  return {
    kind,
    termIds: [target.id],
    prompt: kind === 'quiz_en_ru' ? target.en : target.ru,
    options: options.map((t) => t[field]),
    correct: options.indexOf(target),
    explain: target.about,
  };
}

export function makeTyping(target: Term): TypeEnExercise {
  return {
    kind: 'type_en',
    termIds: [target.id],
    ru: target.ru,
    en: target.en,
    accepted: [target.en, ...(target.also?.en ?? [])],
    explain: target.about,
  };
}

export function makePairs(terms: readonly Term[]): MatchPairsExercise | null {
  const chosen = terms.slice(0, MAX_PAIRS);
  if (chosen.length < MIN_PAIRS) return null;
  return {
    kind: 'match_pairs',
    termIds: chosen.map((t) => t.id),
    pairs: chosen.map((t) => ({ termId: t.id, en: t.en, ru: t.ru })),
  };
}

export function makeFind(target: Term, diagram: DiagramInfo): FindOnDiagramExercise {
  return {
    kind: 'find_on_diagram',
    termIds: [target.id],
    diagramId: diagram.id,
    termId: target.id,
    en: target.en,
    ru: target.ru,
    explain: target.about,
  };
}

/**
 * «Что подсвечено?»: варианты — знакомые термины той же схемы. Не годятся
 * те, что содержат подсвеченное или содержатся в нём: подсвечено предсердие —
 * «сердце» тоже было бы верным ответом.
 */
export function makeHighlighted(
  target: Term,
  diagram: DiagramInfo,
  pool: readonly Term[],
  rng: Rng,
): NameHighlightedExercise | null {
  const onDiagram = pool.filter((t) => diagram.terms.includes(t.id));
  const nested = (t: Term): boolean =>
    (diagram.parents[target.id] ?? []).includes(t.id) || (diagram.parents[t.id] ?? []).includes(target.id);
  const wrong = pickDistractors(target, onDiagram, 'en', QUIZ_OPTIONS - 1, rng, nested);
  if (wrong.length === 0) return null;
  const options = shuffle(rng, [target, ...wrong]);
  return {
    kind: 'name_highlighted',
    termIds: [target.id],
    diagramId: diagram.id,
    termId: target.id,
    options: options.map((t) => t.en),
    optionsRu: options.map((t) => t.ru),
    correct: options.indexOf(target),
    explain: target.about,
  };
}

export function makeRelation(q: RelationQuestion): RelationExercise {
  const side = (t: Term): { termId: string; en: string; ru: string } => ({ termId: t.id, en: t.en, ru: t.ru });
  // объяснение — описание артерии или нерва: в нём сказано, что он питает
  const source = LINKS[q.kind].targets.includes(q.subject.kind) ? q.answer : q.subject;
  return {
    kind: 'relation',
    // ответ — тоже проверяемый термин: если он не знаком, перед заданием встанет его карточка
    termIds: [q.subject.id, q.answer.id],
    topic: LINKS[q.kind].topic,
    question: q.question,
    subject: side(q.subject),
    options: q.options.map(side),
    correct: q.options.indexOf(q.answer),
    explain: source.about,
  };
}

export function makePath(path: Path, getTerm: (id: string) => Term): PathExercise {
  return {
    kind: 'path',
    termIds: [...path.steps],
    pathId: path.id,
    title: path.title,
    steps: path.steps.map((id) => {
      const t = getTerm(id);
      return { termId: t.id, en: t.en, ru: t.ru };
    }),
  };
}

function uniqueTerms(list: readonly Term[]): Term[] {
  const seen = new Set<string>();
  return list.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
}

type TaskKind = 'quiz_en_ru' | 'quiz_ru_en' | 'type_en' | 'find_on_diagram' | 'name_highlighted' | 'relation';

export function buildLesson(input: BuildInput): Exercise[] {
  const rng = rngFor(input.seed);
  const fresh = input.lesson.terms.map(input.getTerm);
  const pool = uniqueTerms([...input.earlier, ...fresh]);

  /**
   * Схема для задания: новый термин ищут на той, что была на его карточке
   * (первой в списке), знакомый — на любой из своих.
   */
  const freshIds = new Set(fresh.map((t) => t.id));
  const diagramFor = (t: Term): DiagramInfo =>
    input.getDiagram(freshIds.has(t.id) ? (t.diagrams[0] as string) : pick(rng, t.diagrams));

  /** Задание нужного вида на термин; null — если его не собрать (не из чего выбирать). */
  function task(kind: TaskKind, t: Term): Exercise | null {
    switch (kind) {
      case 'quiz_en_ru':
      case 'quiz_ru_en':
        return makeQuiz(kind, t, pool, rng);
      case 'type_en':
        return makeTyping(t);
      case 'find_on_diagram':
        return t.diagrams.length > 0 ? makeFind(t, diagramFor(t)) : null;
      case 'name_highlighted':
        return t.diagrams.length > 0 ? makeHighlighted(t, diagramFor(t), pool, rng) : null;
      case 'relation': {
        if (!input.relationTasks) return null;
        const q = relationQuestion(t, pool, input.allTerms, rng);
        return q ? makeRelation(q) : null;
      }
    }
  }

  /** Повторение термина: виды по очереди; если вид не собрался — следующий. */
  function reviewTask(t: Term, index: number): Exercise | null {
    const order: TaskKind[] =
      t.diagrams.length > 0
        ? ['quiz_ru_en', 'find_on_diagram', 'relation', 'type_en', 'name_highlighted', 'quiz_en_ru']
        : ['quiz_ru_en', 'relation', 'type_en', 'quiz_en_ru'];
    for (let k = 0; k < order.length; k++) {
      const ex = task(order[(index + k) % order.length] as TaskKind, t);
      if (ex) return ex;
    }
    return null;
  }

  // повторение: сначала то, что урок требует явно, потом что подскажет интервальное
  const forced = (input.lesson.review ?? []).map(input.getTerm);
  const reviewLimit = fresh.length === 0 ? MAX_TASKS : REVIEW_IN_LESSON;
  const extra = input
    .pickReview(
      input.earlier.map((t) => t.id).filter((id) => !forced.some((f) => f.id === id)),
      Math.max(0, reviewLimit - forced.length),
    )
    .map(input.getTerm);
  const review = uniqueTerms([...forced, ...extra]);

  const cards: Exercise[] = [];
  for (const id of input.lesson.rules ?? []) {
    if (input.seen('r:' + id)) continue;
    const r = input.getRule(id);
    cards.push({ kind: 'rule_card', termIds: [], ruleId: r.id, title: r.title, body: r.body, examples: r.examples });
  }

  const tasks: Exercise[] = [];
  const push = (ex: Exercise | null): void => {
    if (ex && tasks.length < MAX_TASKS) tasks.push(ex);
  };
  const paths = (input.lesson.paths ?? []).map((id) => makePath(input.getPath(id), input.getTerm));

  if (fresh.length > 0) {
    // второе задание на новый термин — по очереди выбор и написание, третье — другое из двух
    const order = shuffle(rng, fresh);
    const second = order.map((t, i) => task(i % 2 === 0 ? 'quiz_ru_en' : 'type_en', t));
    const third = order.map((t, i) => task(i % 2 === 0 ? 'type_en' : 'quiz_ru_en', t));

    for (const t of fresh) push(task('quiz_en_ru', t));
    push(makePairs(uniqueTerms([...fresh, ...review, ...shuffle(rng, input.earlier)])));
    paths.forEach(push);
    for (const t of fresh) push(task('find_on_diagram', t));
    for (const t of fresh) push(task('relation', t));
    second.forEach(push);
    review.slice(0, 1).forEach((t, i) => push(reviewTask(t, i)));
    for (const t of fresh) push(task('name_highlighted', t));
    third.forEach(push);
    review.slice(1).forEach((t, i) => push(reviewTask(t, i + 1)));
  } else {
    // урок-повторение: пары, пути, потом каждый термин отдельным заданием
    push(makePairs(review));
    paths.forEach(push);
    review.forEach((t, i) => push(reviewTask(t, i)));
    if (tasks.length < MIN_TASKS) push(makePairs(review.slice(MAX_PAIRS)));
    review.forEach((t, i) => {
      if (tasks.length < MIN_TASKS) push(reviewTask(t, i + 1));
    });
  }

  return withTermCards([...cards, ...tasks], input);
}

/** Перед первым заданием на незнакомый термин — его карточка. */
function withTermCards(list: readonly Exercise[], input: BuildInput): Exercise[] {
  const out: Exercise[] = [];
  const carded = new Set<string>();
  for (const ex of list) {
    if (ex.kind !== 'rule_card' && ex.kind !== 'term_card') {
      for (const id of ex.termIds) {
        if (carded.has(id) || input.seen('t:' + id)) continue;
        carded.add(id);
        out.push(termCard(input.getTerm(id)));
      }
    }
    out.push(ex);
  }
  return out;
}

/** Сколько в очереди настоящих проверок (без карточек). */
export function taskCount(list: readonly Exercise[]): number {
  return list.filter((ex) => ex.kind !== 'rule_card' && ex.kind !== 'term_card').length;
}
