/**
 * Проигрыватель заданий: шапка с прогрессом, задание, флажок «Что не так?»,
 * полоса обратной связи. Общий для урока и повторения — правила у них разные
 * (что сохранить в конце, какие итоги показать), а экран один.
 *
 * Здесь же то, что верно для любой сессии: попытки идут в статистику
 * терминов, карточка отмечается показанной в момент показа.
 */

import { clear, h, onTap } from '../core/dom';
import { rngFor } from '../core/rng';
import { pop, type ScreenView } from '../core/router';
import { getState, update } from '../core/store';
import { now } from '../core/time';
import { getDiagram, getTerm } from '../data/content';
import { reportTargets } from '../domain/reports';
import { recordAttemptTerms } from '../domain/srs';
import { createSession, type SessionResult } from '../lesson/engine';
import { moduleFor } from '../lesson/registry';
import { isCard, type Exercise, type ExerciseInstance, type ExerciseOutcome } from '../lesson/types';
import { button } from '../ui/button';
import { icon } from '../ui/icons';
import { confirmModal } from '../ui/modal';
import { openReportSheet } from './report-sheet';

/** Сколько заданий с ошибкой вернётся в конце. */
const RETRY_MISTAKES = 3;

export interface PlayerOpts {
  exercises: Exercise[];
  /** Основа для перемешиваний внутри заданий. */
  seed: string;
  /** Где — для замечаний: id урока или «review». */
  where: string;
  /** «урока» или «занятия» — в подписи «Повторим в конце …». */
  ofWhat: string;
  exitTitle: string;
  exitText: string;
  /** Все задания пройдены. Экран итогов — на стороне вызывающего. */
  onDone: (result: SessionResult) => void;
}

/** Ключ «уже показано» для карточки. */
function seenKey(ex: Exercise): string | null {
  if (ex.kind === 'term_card') return 't:' + ex.termId;
  if (ex.kind === 'rule_card') return 'r:' + ex.ruleId;
  return null;
}

const names = (id: string): { en: string; ru: string } => {
  const t = getTerm(id);
  return { en: t.en, ru: t.ru };
};

export function createPlayer(opts: PlayerOpts): ScreenView {
  const session = createSession({ exercises: opts.exercises, retryMistakes: RETRY_MISTAKES });

  let instance: ExerciseInstance | null = null;
  let awaitingContinue = false;
  let finished = false;

  /* ——————————————————————— разметка ——————————————————————— */

  const barFill = h('span', { class: 'lesson__bar-fill' });
  const counter = h('span', { class: 'lesson__counter' });
  const closeBtn = h('button', { class: 'icon-btn', attr: { type: 'button' }, aria: { label: 'Выйти' } }, icon('close'));
  onTap(closeBtn, () => requestExit());

  /*
   * Флажок — в строке названия задания: замечание относится к тому, что на экране,
   * и до ответа, и после, пока не нажали «Дальше».
   */
  const flagBtn = h(
    'button',
    { class: 'icon-btn lesson__flag', attr: { type: 'button' }, aria: { label: 'Что не так? Сообщить об ошибке' } },
    icon('flag'),
  );
  let reporting = false;
  onTap(flagBtn, () => {
    const exercise = session.current();
    if (!exercise || reporting) return;
    reporting = true;
    const shown = instance;
    // задание на время стоит, пока поверх открыто окно
    shown?.pause?.(true);
    void openReportSheet({
      targets: reportTargets(exercise, names),
      where: opts.where,
      kind: exercise.kind,
      wholeExercise: true,
    }).then(() => {
      reporting = false;
      if (instance === shown) shown?.pause?.(false);
    });
  });

  const taskText = h('span', { class: 'lesson__task-text' });
  const taskTitle = h('div', { class: 'lesson__task' }, taskText, flagBtn);
  const host = h('div', { class: 'lesson__host' });

  const fbIcon = h('span', { class: 'feedback__icon' });
  const fbTitle = h('div', { class: 'feedback__title' });
  const fbText = h('div', { class: 'feedback__text' });
  const fbWhy = h('p', { class: 'feedback__why' });
  const continueBtn = button({ label: 'Дальше', wide: true, iconName: 'arrowRight', iconAfter: true });
  const feedback = h(
    'section',
    { class: 'feedback', aria: { live: 'polite' } },
    h('div', { class: 'feedback__head' }, fbIcon, h('div', { class: 'feedback__body' }, fbTitle, fbText)),
    fbWhy,
    continueBtn,
  );

  const el = h(
    'div',
    { class: 'screen screen--lesson' },
    h(
      'header',
      { class: 'lesson__top' },
      closeBtn,
      h('div', { class: 'lesson__bar', aria: { role: 'progressbar', label: 'Пройдено' } }, barFill),
      counter,
    ),
    taskTitle,
    host,
    feedback,
  );

  /* ——————————————————————— показ задания ——————————————————————— */

  function mountCurrent(): void {
    const exercise = session.current();
    if (!exercise) {
      finish();
      return;
    }
    instance?.destroy?.();
    clear(host);
    awaitingContinue = false;
    feedback.classList.remove('is-shown', 'is-right', 'is-wrong');
    host.style.paddingBottom = '';

    const mod = moduleFor(exercise);
    // повтор ошибки подписан: иначе знакомое задание выглядит как сбой
    taskText.textContent = (session.isRetry() ? 'Повтор · ' : '') + mod.title(exercise);
    taskTitle.classList.toggle('is-retry', session.isRetry());

    /*
     * Карточка отмечается показанной здесь, при показе, а не при сборке:
     * сессию можно бросить на середине, и до карточки дело может не дойти.
     */
    const key = seenKey(exercise);
    if (key && getState().seen[key] === undefined) {
      const ts = now();
      update((s) => {
        s.seen[key] = ts;
      });
    }

    const index = session.state.index;
    instance = mod.mount(exercise, {
      rng: rngFor(opts.seed + ':' + index),
      attempt: (attempt) => {
        session.attempt(attempt);
        const ts = now();
        update((s) => recordAttemptTerms(s, attempt.termIds, attempt.correct, ts));
      },
      finish: (outcome) => onFinish(exercise, outcome),
      diagram: getDiagram,
      label: (id) => {
        const t = getTerm(id);
        return { en: t.en, ru: t.ru, kind: t.kind };
      },
    });
    instance.el.classList.add('ex--enter');
    host.append(instance.el);
    host.scrollTop = 0;
    instance.focus?.();
    renderProgress();
  }

  function renderProgress(): void {
    barFill.style.transform = 'scaleX(' + session.progress() + ')';
    const shown = Math.min(session.state.index + 1, session.state.total);
    counter.textContent = shown + ' / ' + session.state.total;
  }

  function onFinish(exercise: Exercise, outcome: ExerciseOutcome): void {
    // карточка — не проверка: полосы «верно» под ней не нужно
    if (isCard(exercise)) {
      advance();
      return;
    }
    awaitingContinue = true;
    clear(fbIcon);
    fbIcon.append(icon(outcome.correct ? 'check' : 'cross'));
    feedback.classList.add('is-shown', outcome.correct ? 'is-right' : 'is-wrong');

    if (outcome.correct) {
      fbTitle.textContent = outcome.message ?? (outcome.typo ? 'Засчитано, но с опечаткой' : 'Верно');
      fbText.textContent = outcome.typo && outcome.expected ? 'Пишется: ' + outcome.expected : '';
    } else {
      fbTitle.textContent = outcome.message ?? 'Неверно';
      const parts: string[] = [];
      if (outcome.expected) parts.push('Правильно: ' + outcome.expected);
      if (session.willRetry()) parts.push('Повторим в конце ' + opts.ofWhat);
      fbText.textContent = parts.join('. ');
    }
    fbText.classList.toggle('hidden', fbText.textContent === '');

    // объяснение — только после ошибки: это самый учебный момент
    fbWhy.textContent = !outcome.correct && outcome.explain ? outcome.explain : '';
    fbWhy.classList.toggle('hidden', fbWhy.textContent === '');
    // задание не должно прятаться под полосой: даём докрутить до его низа
    host.style.paddingBottom = feedback.offsetHeight + 16 + 'px';
    continueBtn.focus({ preventScroll: true });
  }

  function advance(): void {
    if (session.advance()) mountCurrent();
    else finish();
  }

  onTap(continueBtn, () => {
    if (!awaitingContinue) return;
    awaitingContinue = false;
    advance();
  });

  /* ——————————————————————— конец и выход ——————————————————————— */

  function finish(): void {
    if (finished) return;
    finished = true;
    renderProgress();
    opts.onDone(session.result());
  }

  function hasProgress(): boolean {
    return session.state.index > 0 || session.state.attempts > 0;
  }

  let asking = false;
  function requestExit(): void {
    if (!hasProgress()) {
      pop();
      return;
    }
    if (asking) return;
    asking = true;
    void confirmModal(opts.exitTitle, opts.exitText, 'Выйти', 'danger').then((ok) => {
      asking = false;
      if (ok) pop();
    });
  }

  return {
    el,
    onShow: () => {
      if (!instance) mountCurrent();
    },
    onBack: () => {
      if (!hasProgress()) return true;
      requestExit();
      return false;
    },
    destroy: () => {
      instance?.destroy?.();
      instance = null;
    },
  };
}
