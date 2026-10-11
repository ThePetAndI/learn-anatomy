/**
 * Карточка-правило: как образуются названия, откуда корни.
 * Не проверка — попыток не записывает.
 */

import { h } from '../../core/dom';
import { button } from '../../ui/button';
import type { ExerciseContext, ExerciseInstance, ExerciseModule, RuleCardExercise } from '../types';

export const ruleCardModule: ExerciseModule<RuleCardExercise> = {
  title: () => 'Правило',

  mount(ex: RuleCardExercise, ctx: ExerciseContext): ExerciseInstance {
    let done = false;
    const next = button({
      label: 'Понятно',
      wide: true,
      onTap: () => {
        if (done) return;
        done = true;
        ctx.finish({ correct: true });
      },
    });

    // пустая строка разделяет абзацы
    const paragraphs = ex.body.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

    const el = h(
      'div',
      { class: 'ex ex--card' },
      h(
        'article',
        { class: 'rule-card' },
        h('h2', { class: 'rule-card__title', text: ex.title }),
        ...paragraphs.map((p) => h('p', { class: 'rule-card__p', text: p.trim() })),
        ex.examples.length > 0
          ? h(
              'dl',
              { class: 'rule-card__examples' },
              ...ex.examples.flatMap((e) => [
                h('dt', { attr: { lang: 'en' }, text: e.en }),
                h('dd', { text: e.ru }),
              ]),
            )
          : null,
      ),
      h('div', { class: 'ex__action' }, next),
    );
    return { el };
  },
};
