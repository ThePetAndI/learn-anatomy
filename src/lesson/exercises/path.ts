/**
 * Путь по порядку: звенья пути крови или импульса перемешаны, их нажимают
 * одно за другим. Верное звено встаёт в цепочку сверху, неверное вздрагивает
 * и засчитывается ошибкой — путь собирается до конца в любом случае: человек
 * видит его целиком, а это и есть урок.
 */

import { h, onTap } from '../../core/dom';
import { shuffle } from '../../core/rng';
import type { ExerciseContext, ExerciseInstance, ExerciseModule, PathExercise } from '../types';

export const pathModule: ExerciseModule<PathExercise> = {
  title: () => 'Путь по порядку',

  mount(ex: PathExercise, ctx: ExerciseContext): ExerciseInstance {
    let next = 0;
    let mistakes = 0;
    const timers: number[] = [];

    const chain = h('ol', { class: 'path__chain' });
    const slots = ex.steps.map((_, i) => {
      const slot = h('li', { class: 'path__slot' }, h('span', { class: 'path__num', text: String(i + 1) }));
      chain.append(slot);
      return slot;
    });

    const pile = h('div', { class: 'path__pile' });
    for (const step of shuffle(ctx.rng, ex.steps)) {
      const chip = h(
        'button',
        { class: 'path__chip', attr: { type: 'button' } },
        h('span', { class: 'path__en', attr: { lang: 'en' }, text: step.en }),
        h('span', { class: 'path__ru', text: step.ru }),
      );
      onTap(chip, () => pickStep(step.termId, chip));
      pile.append(chip);
    }

    function pickStep(termId: string, chip: HTMLButtonElement): void {
      const expected = ex.steps[next];
      if (!expected || chip.disabled) return;
      if (termId !== expected.termId) {
        mistakes++;
        // ошибка — по тому звену, которое должно было идти сейчас: его и надо повторить
        ctx.attempt({ correct: false, termIds: [expected.termId] });
        chip.classList.remove('is-bad');
        void chip.offsetWidth;
        chip.classList.add('is-bad');
        timers.push(window.setTimeout(() => chip.classList.remove('is-bad'), 500));
        return;
      }
      ctx.attempt({ correct: true, termIds: [termId] });
      chip.disabled = true;
      chip.classList.add('is-placed');
      const slot = slots[next];
      slot?.append(h('span', { class: 'path__placed', attr: { lang: 'en' }, text: expected.en }));
      slot?.classList.add('is-filled');
      next++;
      if (next === ex.steps.length) {
        ctx.finish({
          correct: mistakes === 0,
          message: mistakes === 0 ? 'Путь верный' : 'Путь собран, ошибок: ' + mistakes,
          expected: mistakes === 0 ? undefined : ex.steps.map((s) => s.en).join(' → '),
        });
      }
    }

    const el = h(
      'div',
      { class: 'ex ex--path' },
      h('div', { class: 'prompt prompt--tight' }, h('div', { class: 'prompt__text', text: ex.title })),
      h('p', { class: 'path__hint', text: 'Нажимайте звенья по порядку — с начала пути.' }),
      chain,
      pile,
    );

    return {
      el,
      destroy: () => {
        for (const t of timers) clearTimeout(t);
      },
    };
  },
};
