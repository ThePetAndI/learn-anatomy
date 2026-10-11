/** Связи — кровоснабжение и иннервация: выбор из вариантов, у каждого — название на обоих языках. */

import { h, onTap } from '../../core/dom';
import type { ExerciseContext, ExerciseInstance, ExerciseModule, RelationExercise } from '../types';

const LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е'];

export const relationModule: ExerciseModule<RelationExercise> = {
  title: (ex) => ex.topic,

  mount(ex: RelationExercise, ctx: ExerciseContext): ExerciseInstance {
    let answered = false;
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
      const right = ex.options[ex.correct];
      ctx.attempt({ correct, termIds: ex.termIds });
      ctx.finish({ correct, expected: right ? right.en + ' — ' + right.ru : undefined, explain: ex.explain });
    };

    const list = h(
      'div',
      { class: 'options' },
      ...ex.options.map((o, index) => {
        const btn = h(
          'button',
          { class: 'option', attr: { type: 'button' } },
          h('span', { class: 'option__letter', text: LETTERS[index] ?? '' }),
          h(
            'span',
            { class: 'option__text option__text--two' },
            h('span', { attr: { lang: 'en' }, text: o.en }),
            h('span', { class: 'option__sub', text: o.ru }),
          ),
        );
        onTap(btn, () => choose(index));
        buttons.push(btn);
        return btn;
      }),
    );

    const prompt = h(
      'div',
      { class: 'prompt prompt--tight' },
      h('div', { class: 'prompt__sub', text: ex.question }),
      h('div', { class: 'prompt__text prompt__text--en', attr: { lang: 'en' }, text: ex.subject.en + '?' }),
      h('div', { class: 'prompt__sub', text: ex.subject.ru }),
    );

    return { el: h('div', { class: 'ex ex--quiz' }, prompt, list) };
  },
};
