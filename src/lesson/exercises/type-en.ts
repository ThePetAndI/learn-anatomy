/**
 * Напиши по-английски. Одна опечатка в длинном термине засчитывается,
 * но тогда показываем, как пишется правильно (см. domain/answer).
 */

import { h, onTap } from '../../core/dom';
import { checkTyped } from '../../domain/answer';
import { button } from '../../ui/button';
import type { ExerciseContext, ExerciseInstance, ExerciseModule, TypeEnExercise } from '../types';

export const typeEnModule: ExerciseModule<TypeEnExercise> = {
  title: () => 'Напиши по-английски',

  mount(ex: TypeEnExercise, ctx: ExerciseContext): ExerciseInstance {
    let done = false;

    const input = h('input', {
      class: 'typing__input',
      attr: {
        type: 'text',
        lang: 'en',
        autocomplete: 'off',
        autocapitalize: 'off',
        autocorrect: 'off',
        spellcheck: 'false',
        enterkeyhint: 'done',
        'aria-label': 'Термин по-английски',
        placeholder: 'по-английски',
      },
    });

    const check = button({ label: 'Проверить', wide: true, disabled: true });

    const refresh = (): void => {
      check.disabled = done || input.value.trim().length === 0;
    };
    input.addEventListener('input', refresh);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        submit();
      }
    });

    function submit(): void {
      if (done || input.value.trim().length === 0) return;
      done = true;
      input.readOnly = true;
      check.disabled = true;
      const { result, matched } = checkTyped(input.value, ex.accepted);
      const correct = result !== 'wrong';
      input.classList.add(correct ? 'is-right' : 'is-wrong');
      ctx.attempt({ correct, termIds: ex.termIds, typo: result === 'typo' });
      ctx.finish({
        correct,
        typo: result === 'typo',
        // при опечатке показываем то написание, к которому ответ ближе всего
        expected: result === 'typo' ? matched : ex.en,
        given: input.value.trim(),
        explain: ex.explain,
      });
    }

    onTap(check, submit);

    const el = h(
      'div',
      { class: 'ex ex--typing' },
      h('div', { class: 'prompt' }, h('div', { class: 'prompt__text', text: ex.ru })),
      h('label', { class: 'typing__field' }, input),
      h('div', { class: 'ex__action' }, check),
    );

    return {
      el,
      focus: () => input.focus({ preventScroll: true }),
    };
  },
};
