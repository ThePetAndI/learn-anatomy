/**
 * Контракт между движком урока и заданиями.
 *
 * Граница жёсткая: задание получает готовые данные и контекст и больше
 * ничего не знает — ни про контент, ни про прогресс. Задания собирает
 * сборщик в lesson/build.ts.
 */

import type { Rng } from '../core/rng';
import type { Diagram } from '../data/content';
import type { TermKind } from '../data/types';

export type ExerciseKind =
  | 'rule_card'
  | 'term_card'
  | 'quiz_en_ru'
  | 'quiz_ru_en'
  | 'type_en'
  | 'match_pairs'
  | 'find_on_diagram'
  | 'name_highlighted'
  | 'relation'
  | 'path';

interface ExerciseCommon {
  kind: ExerciseKind;
  /** Термины, которые задание проверяет, — идут в статистику повторения. */
  termIds: string[];
}

/** Карточка-правило. Не проверка: попыток не записывает. */
export interface RuleCardExercise extends ExerciseCommon {
  kind: 'rule_card';
  ruleId: string;
  title: string;
  /** Абзацы разделены пустой строкой. */
  body: string;
  examples: { en: string; ru: string }[];
}

/** Знакомство с термином перед первым заданием на него. Не проверка. */
export interface TermCardExercise extends ExerciseCommon {
  kind: 'term_card';
  termId: string;
  en: string;
  ru: string;
  termKind: TermKind;
  plural?: string;
  alsoEn: string[];
  alsoRu: string[];
  about: string;
  /** Схема, на которой показать, где термин; нет — термина нет ни на одной схеме. */
  diagramId?: string;
}

/** Выбор из вариантов: «Что это?» (en → ru) и «Как по-английски?» (ru → en). */
export interface QuizExercise extends ExerciseCommon {
  kind: 'quiz_en_ru' | 'quiz_ru_en';
  prompt: string;
  options: string[];
  /** Индекс верного варианта в options. */
  correct: number;
  /** Что это за термин — показывается после ошибки. */
  explain: string;
}

/** Написать термин по-английски. */
export interface TypeEnExercise extends ExerciseCommon {
  kind: 'type_en';
  ru: string;
  en: string;
  /** Все засчитываемые написания: главное название первым. */
  accepted: string[];
  explain: string;
}

/** Пары: английские термины и русские названия. */
export interface MatchPairsExercise extends ExerciseCommon {
  kind: 'match_pairs';
  pairs: { termId: string; en: string; ru: string }[];
}

/** Найди на схеме: нажать на структуру по её названию. */
export interface FindOnDiagramExercise extends ExerciseCommon {
  kind: 'find_on_diagram';
  diagramId: string;
  termId: string;
  en: string;
  ru: string;
  explain: string;
}

/** Что подсвечено: назвать структуру по месту на схеме. */
export interface NameHighlightedExercise extends ExerciseCommon {
  kind: 'name_highlighted';
  diagramId: string;
  termId: string;
  /** Варианты — английские названия. */
  options: string[];
  /** Русские названия тех же вариантов — для разбора после ответа. */
  optionsRu: string[];
  correct: number;
  explain: string;
}

/**
 * Связи: «Что кровоснабжает renal artery?», «Какая артерия кровоснабжает kidney?»,
 * «Что иннервирует facial nerve?», «Какой нерв иннервирует masseter?».
 */
export interface RelationExercise extends ExerciseCommon {
  kind: 'relation';
  /** «Кровоснабжение» или «Иннервация» — заголовок задания. */
  topic: string;
  question: string;
  subject: { termId: string; en: string; ru: string };
  options: { termId: string; en: string; ru: string }[];
  correct: number;
  explain: string;
}

/** Путь по порядку: нажимать звенья пути крови или импульса одно за другим. */
export interface PathExercise extends ExerciseCommon {
  kind: 'path';
  pathId: string;
  title: string;
  /** Звенья в верном порядке; перемешивает модуль. */
  steps: { termId: string; en: string; ru: string }[];
}

export type Exercise =
  | RuleCardExercise
  | TermCardExercise
  | QuizExercise
  | TypeEnExercise
  | MatchPairsExercise
  | FindOnDiagramExercise
  | NameHighlightedExercise
  | RelationExercise
  | PathExercise;

/** Карточки, а не проверки: на них нельзя ошибиться. */
export const CARD_KINDS: readonly ExerciseKind[] = ['rule_card', 'term_card'];

export function isCard(ex: Exercise): boolean {
  return CARD_KINDS.includes(ex.kind);
}

/** Результат одной попытки внутри задания. */
export interface Attempt {
  correct: boolean;
  termIds: string[];
  /** Засчитано, но с опечаткой. */
  typo?: boolean;
}

/** Чем закончилось задание — определяет полосу обратной связи. */
export interface ExerciseOutcome {
  correct: boolean;
  /** Правильный ответ — показывается при ошибке или опечатке. */
  expected?: string;
  given?: string;
  typo?: boolean;
  /** Своя подпись вместо стандартной. */
  message?: string;
  /** Что это за термин — показывается при ошибке. */
  explain?: string;
}

export interface ExerciseContext {
  /** Записать попытку: идёт в счёт урока и статистику терминов. */
  attempt: (result: Attempt) => void;
  /** Задание пройдено. Движок покажет полосу и кнопку «Дальше». */
  finish: (outcome: ExerciseOutcome) => void;
  /** Детерминированный генератор для перемешиваний внутри задания. */
  rng: Rng;
  /** Схема по id — для заданий на схеме и карточки термина. */
  diagram: (id: string) => Diagram;
  /** Подпись структуры на двух языках — что нажали на схеме. */
  label: (termId: string) => TermLabel;
}

export interface TermLabel {
  en: string;
  ru: string;
  kind: TermKind;
}

export interface ExerciseInstance {
  el: HTMLElement;
  /** Освободить слушатели и таймеры. */
  destroy?: () => void;
  /** Остановить и снова пустить время — у заданий на время, пока поверх открыто окно. */
  pause?: (paused: boolean) => void;
  /** Поставить фокус, когда задание показано (поле ввода). */
  focus?: () => void;
}

export interface ExerciseModule<E extends Exercise = Exercise> {
  /** Заголовок над заданием. */
  title: (exercise: E) => string;
  mount: (exercise: E, ctx: ExerciseContext) => ExerciseInstance;
}
