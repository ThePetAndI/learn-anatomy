/**
 * Найди на схеме: нажать на структуру по названию.
 * Засчитывается нажатие на саму структуру или на любую её часть:
 * «найди сердце» — годится и камера сердца. После ответа верная структура
 * обведена, неверно нажатая — обведена цветом ошибки и подписана.
 */

import { h } from '../../core/dom';
import { createCaption } from '../../ui/caption';
import { createDiagramView } from '../../ui/diagram';
import type { ExerciseContext, ExerciseInstance, ExerciseModule, FindOnDiagramExercise } from '../types';

export const findOnDiagramModule: ExerciseModule<FindOnDiagramExercise> = {
  title: () => 'Найди на схеме',

  mount(ex: FindOnDiagramExercise, ctx: ExerciseContext): ExerciseInstance {
    let answered = false;
    const caption = createCaption();
    caption.hint('Нажмите на структуру. Схему можно увеличить двумя пальцами.');

    const view = createDiagramView({
      diagram: ctx.diagram(ex.diagramId),
      pickable: true,
      zoomable: true,
      onPick: (picked) => {
        if (answered) return;
        answered = true;
        view.setPickable(false);
        const correct = picked.chain.includes(ex.termId);
        view.highlight([ex.termId], correct ? [] : [picked.termId]);
        const tapped = ctx.label(picked.termId);
        if (!correct) caption.show({ ...tapped, lead: 'Вы нажали:' });
        else caption.show({ en: ex.en, ru: ex.ru, kind: ctx.label(ex.termId).kind });
        ctx.attempt({ correct, termIds: ex.termIds });
        ctx.finish({
          correct,
          // что нажато — в заголовке полосы: подпись под схемой полоса закрывает
          message: correct ? undefined : 'Это ' + tapped.en + ' — ' + tapped.ru,
          expected: correct ? undefined : ex.en + ' — ' + ex.ru + ' (обведено)',
          explain: ex.explain,
        });
      },
    });

    const el = h(
      'div',
      { class: 'ex ex--diagram' },
      h(
        'div',
        { class: 'prompt prompt--en prompt--tight' },
        h('div', { class: 'prompt__text', attr: { lang: 'en' }, text: ex.en }),
        h('div', { class: 'prompt__sub', text: ex.ru }),
      ),
      view.el,
      caption.el,
    );
    return { el, destroy: () => view.destroy() };
  },
};
