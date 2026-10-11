/**
 * Загрузка курса из content/. Файлы попадают в бандл на сборке
 * (import.meta.glob), поэтому в рантайме ничего не качается и всё работает офлайн.
 *
 * Новый файл в content/terms подхватится сам, править код не нужно.
 * Формат — в content/README.md и src/data/types.ts.
 */

import { parseSvg, termsInSvg, walk } from './svg';
import type { Lesson, Path, RawContent, Rule, Section, Term } from './types';

const termModules = import.meta.glob<unknown>('../../content/terms/*.json', {
  eager: true,
  import: 'default',
});
const ruleModule = import.meta.glob<unknown>('../../content/rules.json', { eager: true, import: 'default' });
const courseModule = import.meta.glob<unknown>('../../content/course.json', { eager: true, import: 'default' });
const pathModule = import.meta.glob<unknown>('../../content/paths.json', { eager: true, import: 'default' });
const diagramFiles = import.meta.glob<string>('../../content/diagrams/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
});

/** Содержимое файлов как есть — для проверки контента тестом. */
export const rawContent: RawContent = {
  termFiles: Object.entries(termModules)
    .map(([path, data]) => ({ file: path.replace('../../content/', ''), data }))
    .sort((a, b) => a.file.localeCompare(b.file)),
  rules: Object.values(ruleModule)[0],
  course: Object.values(courseModule)[0],
  paths: Object.values(pathModule)[0],
  diagrams: Object.entries(diagramFiles)
    .map(([path, svg]) => ({ id: path.replace(/^.*\//, '').replace(/\.svg$/, ''), svg }))
    .sort((a, b) => a.id.localeCompare(b.id)),
};

/*
 * Дальше контент считается проверенным: тест и скрипт перед сборкой не пропустят
 * битый. Поэтому здесь приведение типов, а не повторная проверка.
 */

const termList: Term[] = rawContent.termFiles.flatMap(
  ({ data }) => (data as { terms: Term[] }).terms,
);
const ruleList: Rule[] = (rawContent.rules as { rules: Rule[] }).rules;

export const sections: readonly Section[] = (rawContent.course as { sections: Section[] }).sections;

const termById = new Map(termList.map((t) => [t.id, t]));
const ruleById = new Map(ruleList.map((r) => [r.id, r]));

/** Урок вместе с местом в курсе. */
export interface FlatLesson extends Lesson {
  sectionId: string;
  /** В разделе включены вопросы «что кровоснабжает». */
  relations: boolean;
  /** Номер урока в курсе с нуля — порядок открытия. */
  order: number;
  /** Номер внутри раздела с нуля. */
  indexInSection: number;
}

export const lessons: readonly FlatLesson[] = sections.flatMap((s) =>
  s.lessons.map((l, indexInSection) => ({
    ...l,
    sectionId: s.id,
    relations: s.relations === true,
    indexInSection,
    order: 0,
  })),
).map((l, order) => ({ ...l, order }));

const lessonById = new Map(lessons.map((l) => [l.id, l]));

/** В каком уроке термин вводится впервые. */
const introducedIn = new Map<string, FlatLesson>();
for (const l of lessons) {
  for (const id of l.terms) if (!introducedIn.has(id)) introducedIn.set(id, l);
}

export function allTerms(): readonly Term[] {
  return termList;
}

export function getTerm(id: string): Term {
  const t = termById.get(id);
  if (!t) throw new Error('Нет термина ' + id);
  return t;
}

export function findTerm(id: string): Term | undefined {
  return termById.get(id);
}

const pathList: Path[] = (rawContent.paths as { paths: Path[] }).paths;
const pathById = new Map(pathList.map((p) => [p.id, p]));

export function getPath(id: string): Path {
  const p = pathById.get(id);
  if (!p) throw new Error('Нет пути ' + id);
  return p;
}

export function allPaths(): readonly Path[] {
  return pathList;
}

export function getRule(id: string): Rule {
  const r = ruleById.get(id);
  if (!r) throw new Error('Нет правила ' + id);
  return r;
}

export function getLesson(id: string): FlatLesson {
  const l = lessonById.get(id);
  if (!l) throw new Error('Нет урока ' + id);
  return l;
}

export function lessonsOf(sectionId: string): readonly FlatLesson[] {
  return lessons.filter((l) => l.sectionId === sectionId);
}

export function lessonIntroducing(termId: string): FlatLesson | undefined {
  return introducedIn.get(termId);
}

/** Термины, которые вводятся в уроках раздела, — по порядку уроков. */
export function sectionTerms(sectionId: string): string[] {
  return lessons.filter((l) => l.sectionId === sectionId).flatMap((l) => l.terms);
}

/** Термины, введённые в уроках до этого — по порядку курса. */
export function termsBefore(lesson: FlatLesson): Term[] {
  return lessons
    .filter((l) => l.order < lesson.order)
    .flatMap((l) => l.terms)
    .map(getTerm);
}

export function contentStats(): { sections: number; lessons: number; terms: number; rules: number } {
  return {
    sections: sections.length,
    lessons: lessons.length,
    terms: termList.length,
    rules: ruleList.length,
  };
}

/* ——————————————————————————— схемы ——————————————————————————— */

export interface Diagram {
  id: string;
  /** Название из <title>. */
  title: string;
  /** Разметка SVG как она лежит в файле. */
  svg: string;
  /** Термины на схеме по порядку появления. */
  terms: string[];
  /** Для каждого термина — в какие структуры он вложен: камера — в сердце. */
  parents: Record<string, string[]>;
}

function parentsIn(svg: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  walk(parseSvg(svg), (node, ancestors) => {
    const id = node.attrs['data-term'];
    if (id === undefined) return;
    const list = (out[id] ??= []);
    for (const a of ancestors) {
      const p = a.attrs['data-term'];
      if (p !== undefined && !list.includes(p)) list.push(p);
    }
  });
  return out;
}

export const diagrams: readonly Diagram[] = rawContent.diagrams.map(({ id, svg }) => ({
  id,
  svg,
  title: /<title>([^<]*)<\/title>/.exec(svg)?.[1]?.trim() ?? id,
  terms: termsInSvg(svg),
  parents: parentsIn(svg),
}));

const diagramById = new Map(diagrams.map((d) => [d.id, d]));

export function getDiagram(id: string): Diagram {
  const d = diagramById.get(id);
  if (!d) throw new Error('Нет схемы ' + id);
  return d;
}
