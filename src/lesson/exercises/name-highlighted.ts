/** Что подсвечено: структура обведена на схеме, выбрать её английское название. */

import { h, onTap } from '../../core/dom';
import { createDiagramView } from '../../ui/diagram';
import type { ExerciseContext, ExerciseInstance, ExerciseModule, NameHighlightedExercise } from '../types';

const LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е'];

export const nameHighlightedModule: ExerciseModule<NameHighlightedExercise> = {
  title: () => 'Что подсвечено?',

  mount(ex: NameHighlightedExercise, ctx: ExerciseContext): ExerciseInstance {
    let answered = false;
    const view = createDiagramView({ diagram: ctx.diagram(ex.diagramId), zoomable: true });
    view.highlight([ex.termId]);

    const buttons: HTMLButtonElement[] = [];
    const choose = (index: number): void => {
      if (answered) return;
      answered = true;
      const correct = index === ex.correct;
      buttons.forEach((btn, i) => {
        btn.disabled = true;
        if (i === ex.correct) btn.classList.add('is-right');
        else if (i === index) btn.classList.add('is-wrong');
        else btn.classList.add('is-dim');
      });
      ctx.attempt({ correct, termIds: ex.termIds });
      ctx.finish({
        correct,
        expected: ex.options[ex.correct] + ' — ' + ex.optionsRu[ex.correct],
        explain: ex.explain,
      });
    };

    const list = h(
      'div',
      { class: 'options options--compact' },
      ...ex.options.map((option, index) => {
        const btn = h(
          'button',
          { class: 'option', attr: { type: 'button' } },
          h('span', { class: 'option__letter', text: LETTERS[index] ?? '' }),
          h('span', { class: 'option__text', attr: { lang: 'en' }, text: option }),
        );
        onTap(btn, () => choose(index));
        buttons.push(btn);
        return btn;
      }),
    );

    return { el: h('div', { class: 'ex ex--diagram' }, view.el, list), destroy: () => view.destroy() };
  },
};
