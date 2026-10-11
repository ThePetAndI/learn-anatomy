/** Реестр заданий: вид задания -> модуль, который его показывает. */

import { findOnDiagramModule } from './exercises/find-on-diagram';
import { matchPairsModule } from './exercises/match-pairs';
import { nameHighlightedModule } from './exercises/name-highlighted';
import { pathModule } from './exercises/path';
import { relationModule } from './exercises/relation';
import { quizModule } from './exercises/quiz';
import { ruleCardModule } from './exercises/rule-card';
import { termCardModule } from './exercises/term-card';
import { typeEnModule } from './exercises/type-en';
import type { Exercise, ExerciseKind, ExerciseModule } from './types';

/* модули типизированы каждый своим заданием; здесь они лежат вместе */
type AnyModule = ExerciseModule<any>;

const REGISTRY: Record<ExerciseKind, AnyModule> = {
  rule_card: ruleCardModule,
  term_card: termCardModule,
  quiz_en_ru: quizModule,
  quiz_ru_en: quizModule,
  type_en: typeEnModule,
  match_pairs: matchPairsModule,
  find_on_diagram: findOnDiagramModule,
  name_highlighted: nameHighlightedModule,
  relation: relationModule,
  path: pathModule,
};

export function moduleFor(ex: Exercise): ExerciseModule {
  return REGISTRY[ex.kind];
}
