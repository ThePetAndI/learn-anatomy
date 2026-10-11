/** Кнопка. Два вида: главная (залитая чернилами) и второстепенная (контур). */

import { h, onTap } from '../core/dom';
import { icon, type IconName } from './icons';

export type ButtonKind = 'primary' | 'secondary' | 'danger';

export interface ButtonOpts {
  label: string;
  kind?: ButtonKind;
  iconName?: IconName;
  /** Иконка справа от текста — для «Дальше». */
  iconAfter?: boolean;
  wide?: boolean;
  disabled?: boolean;
  onTap?: () => void;
}

export function button(opts: ButtonOpts): HTMLButtonElement {
  const ic = opts.iconName ? icon(opts.iconName) : null;
  const btn = h(
    'button',
    {
      class: 'btn btn--' + (opts.kind ?? 'primary') + (opts.wide ? ' btn--wide' : ''),
      attr: { type: 'button', disabled: opts.disabled },
    },
    opts.iconAfter ? null : ic,
    h('span', { text: opts.label }),
    opts.iconAfter ? ic : null,
  );
  if (opts.onTap) {
    const fn = opts.onTap;
    onTap(btn, () => fn());
  }
  return btn;
}
