/** Выбор из вариантов: «Что это?» (en → ru) и «Как по-английски?» (ru → en). */

import { h, onTap } from '../../core/dom';
import type { ExerciseContext, ExerciseInstance, ExerciseModule, QuizExercise } from '../types';

const LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е'];

export const quizModule: ExerciseModule<QuizExercise> = {
  title: (ex) => (ex.kind === 'quiz_en_ru' ? 'Что это?' : 'Как по-английски?'),

  mount(ex: QuizExercise, ctx: ExerciseContext): ExerciseInstance {
    const toEnglish = ex.kind === 'quiz_ru_en';
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
      ctx.attempt({ correct, termIds: ex.termIds });
      ctx.finish({
        correct,
        expected: ex.options[ex.correct],
        given: ex.options[index],
        explain: ex.explain,
      });
    };

    const list = h(
      'div',
      { class: 'options', aria: { role: 'group' } },
      ...ex.options.map((option, index) => {
        const btn = h(
          'button',
          { class: 'option', attr: { type: 'button' } },
          h('span', { class: 'option__letter', text: LETTERS[index] ?? '' }),
          h('span', { class: 'option__text', attr: { lang: toEnglish ? 'en' : 'ru' }, text: option }),
        );
        onTap(btn, () => choose(index));
        buttons.push(btn);
        return btn;
      }),
    );

    const prompt = h(
      'div',
      { class: 'prompt' + (toEnglish ? '' : ' prompt--en') },
      h('div', { class: 'prompt__text', attr: { lang: toEnglish ? 'ru' : 'en' }, text: ex.prompt }),
    );

    return { el: h('div', { class: 'ex ex--quiz' }, prompt, list) };
  },
};
