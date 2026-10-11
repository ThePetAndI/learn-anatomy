/**
 * Окно «Что не так?» — замечание к термину, правилу или схеме.
 *
 * Отмечается конкретное и причина; «как правильно» можно не писать.
 * Замечание сохраняется в прогрессе, а отправляется Claude из Профиля —
 * там все замечания копируются одним текстом.
 */

import { h, onTap } from '../core/dom';
import { update } from '../core/store';
import { now } from '../core/time';
import { MAX_REPORT_NOTE, REPORT_REASONS, type ReportReason } from '../data/state';
import { addReport, REASON_LABELS, WHOLE_EXERCISE, type ReportTarget } from '../domain/reports';
import { button } from '../ui/button';
import { modal } from '../ui/modal';
import { toast } from '../ui/toast';

export interface ReportSheetOpts {
  targets: readonly ReportTarget[];
  /** Где: id урока, «review», «dictionary», «atlas». */
  where: string;
  /** Вид задания или экрана. */
  kind: string;
  /** Добавить вариант «Всё задание» — только в уроке. */
  wholeExercise?: boolean;
}

/** Открывает окно. true — замечание сохранено, false — закрыли без него. */
export function openReportSheet(opts: ReportSheetOpts): Promise<boolean> {
  const whole: ReportTarget = {
    ref: WHOLE_EXERCISE,
    en: opts.targets.map((t) => t.en).join(' · '),
    ru: '',
  };
  const options = opts.wholeExercise ? [...opts.targets, whole] : [...opts.targets];
  let picked = 0;
  let reason: ReportReason | null = null;

  const targetBtns = options.map((t, i) => {
    const b = h(
      'button',
      { class: 'chip chip--target', attr: { type: 'button' } },
      h('span', { class: 'chip__main', attr: { lang: t === whole ? 'ru' : 'en' }, text: t === whole ? 'Всё задание' : t.en }),
      t.ru ? h('span', { class: 'chip__sub', text: t.ru }) : null,
    );
    onTap(b, () => {
      picked = i;
      refresh();
    });
    return b;
  });

  const reasonBtns = REPORT_REASONS.map((r) => {
    const b = h('button', { class: 'chip', attr: { type: 'button' }, text: REASON_LABELS[r] });
    onTap(b, () => {
      reason = r;
      refresh();
    });
    return b;
  });

  const note = h('textarea', {
    class: 'rsheet__note',
    attr: { rows: 2, maxlength: MAX_REPORT_NOTE, placeholder: 'Например: по TA2 — ascending aorta' },
    aria: { label: 'Как правильно' },
  });

  const save = button({ label: 'Сохранить', wide: true, disabled: true });
  const cancel = button({ label: 'Отмена', kind: 'secondary', wide: true });

  function refresh(): void {
    targetBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === picked)));
    reasonBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(REPORT_REASONS[i] === reason)));
    // без причины замечание при разборе ничего не скажет
    save.disabled = reason === null;
  }

  const body = h(
    'div',
    { class: 'rsheet' },
    h('p', {
      class: 'rsheet__intro',
      text: 'Замечание сохранится в приложении. В Профиле все замечания копируются одной кнопкой — для Claude.',
    }),
    options.length > 1 ? h('div', { class: 'rsheet__label', text: 'Что именно' }) : null,
    options.length > 1 ? h('div', { class: 'chips' }, ...targetBtns) : null,
    h('div', { class: 'rsheet__label', text: 'Что не так' }),
    h('div', { class: 'chips' }, ...reasonBtns),
    h('div', { class: 'rsheet__label', text: 'Как правильно — если знаете' }),
    note,
    h('div', { class: 'rsheet__actions' }, save, cancel),
  );

  const m = modal({ title: 'Что не так?' + (options.length === 1 ? ' — ' + options[0]?.en : ''), body });

  onTap(save, () => {
    const target = options[picked];
    if (reason === null || !target) return;
    const chosen = reason;
    update((s) => {
      addReport(
        s,
        { where: opts.where, kind: opts.kind, ref: target.ref, en: target.en, ru: target.ru, reason: chosen, note: note.value },
        now(),
      );
    });
    toast({ text: 'Замечание сохранено. Отправить — в Профиле', iconName: 'check', tone: 'good' });
    m.close('saved');
  });
  onTap(cancel, () => m.close(null));

  refresh();
  return m.result.then((v) => v === 'saved');
}
