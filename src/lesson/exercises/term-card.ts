/**
 * Знакомство с термином. Не проверка: ошибиться нельзя, попыток не записывает —
 * просто говорит, что это и где на схеме, прежде чем об этом спросят.
 */

import { h } from '../../core/dom';
import { button } from '../../ui/button';
import { createDiagramView, type DiagramView } from '../../ui/diagram';
import { kindTag } from '../../ui/kind';
import type { ExerciseContext, ExerciseInstance, ExerciseModule, TermCardExercise } from '../types';

export const termCardModule: ExerciseModule<TermCardExercise> = {
  title: () => 'Новый термин',

  mount(ex: TermCardExercise, ctx: ExerciseContext): ExerciseInstance {
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

    const also = [...ex.alsoEn, ...ex.alsoRu];

    // где на схеме: схема целиком, термин обведён, остальное приглушено
    let where: DiagramView | null = null;
    if (ex.diagramId) {
      // без масштаба: жесты на схеме не должны мешать прокрутить карточку до кнопки
      where = createDiagramView({ diagram: ctx.diagram(ex.diagramId) });
      where.highlight([ex.termId]);
      where.el.classList.add('term-card__diagram');
    }
    const el = h(
      'div',
      { class: 'ex ex--card' },
      h(
        'article',
        { class: 'term-card' },
        kindTag(ex.termKind),
        h('h2', { class: 'term-card__en', attr: { lang: 'en' }, text: ex.en }),
        ex.plural
          ? h('div', { class: 'term-card__plural' }, 'мн. ч. ', h('span', { attr: { lang: 'en' }, text: ex.plural }))
          : null,
        h('div', { class: 'term-card__ru', text: ex.ru }),
        also.length > 0
          ? h('div', { class: 'term-card__also' }, 'также: ', h('span', { text: also.join(', ') }))
          : null,
        h('p', { class: 'term-card__about', text: ex.about }),
      ),
      where ? h('div', { class: 'term-card__where', text: 'Где на схеме' }) : null,
      where?.el ?? null,
      h('div', { class: 'ex__action' }, next),
    );
    return { el, destroy: () => where?.destroy() };
  },
};
