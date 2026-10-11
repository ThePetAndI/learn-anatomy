/** Пары: столбец английских терминов и столбец русских названий. */

import { h, onTap } from '../../core/dom';
import { shuffle } from '../../core/rng';
import type { ExerciseContext, ExerciseInstance, ExerciseModule, MatchPairsExercise } from '../types';

interface Cell {
  el: HTMLButtonElement;
  termId: string;
  side: 'en' | 'ru';
  matched: boolean;
}

export const matchPairsModule: ExerciseModule<MatchPairsExercise> = {
  title: () => 'Найди пары',

  mount(ex: MatchPairsExercise, ctx: ExerciseContext): ExerciseInstance {
    let selected: Cell | null = null;
    let matchedCount = 0;
    let mistakes = 0;
    let busy = false;
    const timers: number[] = [];

    const makeCell = (termId: string, text: string, side: 'en' | 'ru'): Cell => {
      const el = h('button', {
        class: 'pair pair--' + side,
        attr: { type: 'button', lang: side },
        text,
      });
      const cell: Cell = { el, termId, side, matched: false };
      onTap(el, () => pick(cell));
      return cell;
    };

    // столбцы перемешиваются независимо, иначе пары стояли бы друг напротив друга
    const left = shuffle(ctx.rng, ex.pairs).map((p) => makeCell(p.termId, p.en, 'en'));
    const right = shuffle(ctx.rng, ex.pairs).map((p) => makeCell(p.termId, p.ru, 'ru'));

    function pick(cell: Cell): void {
      if (busy || cell.matched) return;
      if (selected === cell) {
        cell.el.classList.remove('is-picked');
        selected = null;
        return;
      }
      if (!selected || selected.side === cell.side) {
        selected?.el.classList.remove('is-picked');
        selected = cell;
        cell.el.classList.add('is-picked');
        return;
      }

      const first = selected;
      selected = null;

      if (first.termId === cell.termId) {
        matchedCount++;
        for (const c of [first, cell]) {
          c.matched = true;
          c.el.classList.remove('is-picked');
          c.el.classList.add('is-matched');
          c.el.disabled = true;
        }
        ctx.attempt({ correct: true, termIds: [cell.termId] });
        if (matchedCount === ex.pairs.length) {
          ctx.finish({
            correct: mistakes === 0,
            message: mistakes === 0 ? 'Все пары верны' : 'Пары собраны, ошибок: ' + mistakes,
          });
        }
        return;
      }

      // ошибка засчитывается обоим терминам: перепутаны оба
      mistakes++;
      ctx.attempt({ correct: false, termIds: [first.termId, cell.termId] });
      busy = true;
      first.el.classList.add('is-bad');
      cell.el.classList.add('is-bad');
      timers.push(
        window.setTimeout(() => {
          first.el.classList.remove('is-bad', 'is-picked');
          cell.el.classList.remove('is-bad', 'is-picked');
          busy = false;
        }, 600),
      );
    }

    const el = h(
      'div',
      { class: 'ex ex--pairs' },
      h(
        'div',
        { class: 'pairs' },
        h('div', { class: 'pairs__col' }, ...left.map((c) => c.el)),
        h('div', { class: 'pairs__col' }, ...right.map((c) => c.el)),
      ),
    );

    return {
      el,
      destroy: () => {
        for (const t of timers) clearTimeout(t);
      },
    };
  },
};
