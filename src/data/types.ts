/**
 * Формат контента курса. Описание для людей — в content/README.md;
 * меняете поле здесь — поправьте и там, и проверку в validate.ts.
 */

/** Что это за структура. От вида зависят метка на карточке и подбор неверных вариантов. */
export type TermKind = 'artery' | 'vein' | 'vessel' | 'nerve' | 'muscle' | 'organ' | 'structure' | 'concept';

export const TERM_KINDS: readonly TermKind[] = [
  'artery', 'vein', 'vessel', 'nerve', 'muscle', 'organ', 'structure', 'concept',
];

/** Система, к которой относится термин; other — органы других систем (лёгкое, печень). */
export type BodySystem = 'circulatory' | 'nervous' | 'other';

export const BODY_SYSTEMS: readonly BodySystem[] = ['circulatory', 'nervous', 'other'];

/** Система, которой посвящён раздел курса. */
export type CourseSystem = 'circulatory' | 'nervous';

/** Связи между терминами — по ним строятся задания «что кровоснабжает» и «путь по порядку». */
export interface TermRelations {
  /** Ветвью какого сосуда или нерва является. */
  branchOf?: string | null;
  /** Что кровоснабжает — главное, о чём можно спросить. */
  supplies?: string[];
  /**
   * Что кровоснабжает лишь частью: чревный ствол — начало двенадцатиперстной,
   * то есть тонкой кишки. Об этом не спрашивают, но такой орган и не ставят
   * неверным вариантом: он был бы наполовину верным.
   */
  suppliesPart?: string[];
  /** Куда впадает (для вен). */
  drainsTo?: string | null;
  /** Что иннервирует — главное, о чём можно спросить. */
  innervates?: string[];
  /** Что иннервирует лишь частью — как suppliesPart. */
  innervatesPart?: string[];
}

export const RELATION_KEYS: readonly (keyof TermRelations)[] = [
  'branchOf', 'supplies', 'suppliesPart', 'drainsTo', 'innervates', 'innervatesPart',
];

export interface Term {
  id: string;
  en: string;
  ru: string;
  /** Другие принятые названия: засчитываются в ответах и показываются на карточке. */
  also?: { en?: string[]; ru?: string[] };
  /** Неправильное множественное число по-английски: atrium — atria. */
  plural?: string;
  kind: TermKind;
  system: BodySystem;
  /** Термины, которые легко спутать с этим, если по названию этого не видно. */
  confusableWith?: string[];
  /** Коротко, что это: одно-два предложения по-русски. */
  about: string;
  relations: TermRelations;
  /** Схемы, на которых есть этот термин (id файла в content/diagrams). */
  diagrams: string[];
  /** Задел на произношение, пока null. */
  audio: string | null;
  source: string;
  verified: boolean;
  note?: string;
}

/** Карточка-правило: как образуются названия, латинские корни. */
export interface Rule {
  id: string;
  title: string;
  /** Абзацы разделены пустой строкой. */
  body: string;
  examples: { en: string; ru: string }[];
  source: string;
  verified: boolean;
  note?: string;
}

export interface Lesson {
  id: string;
  title: string;
  /** Новые термины урока — по порядку знакомства. */
  terms: string[];
  /** Термины прошлых уроков, которые урок повторяет обязательно. */
  review?: string[];
  /** Карточки-правила перед первым заданием. */
  rules?: string[];
  /** Пути «по порядку», которые урок даёт расставить. */
  paths?: string[];
}

/** Путь крови или импульса: звенья по порядку — для задания «Путь по порядку». */
export interface Path {
  id: string;
  title: string;
  /** Термины по порядку движения. */
  steps: string[];
  source: string;
  verified: boolean;
  note?: string;
}

export interface Section {
  id: string;
  system: CourseSystem;
  title: string;
  /** С этого раздела в уроках — вопросы «что кровоснабжает». */
  relations?: boolean;
  lessons: Lesson[];
}

/** Сырой контент как он лежит в файлах — вход для проверки. */
export interface RawContent {
  termFiles: { file: string; data: unknown }[];
  rules: unknown;
  course: unknown;
  paths: unknown;
  /** Схемы из content/diagrams: id — имя файла без .svg. */
  diagrams: { id: string; svg: string }[];
}
