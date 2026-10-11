/** Окно поверх экрана с затемнением: подтверждения и предупреждения. */

import { h, onTap } from '../core/dom';
import { button, type ButtonKind } from './button';

export interface ModalAction {
  label: string;
  kind?: ButtonKind;
  value: string;
}

export interface ModalOpts {
  title?: string;
  text?: string;
  body?: Node;
  actions?: ModalAction[];
  /** Закрывать по тапу на затемнение и по Escape. */
  dismissable?: boolean;
}

export interface ModalHandle {
  el: HTMLElement;
  close: (value?: string | null) => void;
  result: Promise<string | null>;
}

let openCount = 0;

/** Открыто ли сейчас хоть одно окно — задание на время по нему встаёт на паузу. */
export function isModalOpen(): boolean {
  return openCount > 0;
}

export function modal(opts: ModalOpts): ModalHandle {
  const dismissable = opts.dismissable !== false;
  let resolveResult: (v: string | null) => void = () => {};
  const result = new Promise<string | null>((res) => {
    resolveResult = res;
  });

  const card = h(
    'div',
    { class: 'modal__card', aria: { role: 'dialog', modal: 'true' } },
    opts.title ? h('h2', { class: 'modal__title', text: opts.title }) : null,
    opts.text ? h('p', { class: 'modal__text', text: opts.text }) : null,
    opts.body ?? null,
    opts.actions?.length
      ? h(
          'div',
          { class: 'modal__actions' },
          ...opts.actions.map((a) =>
            button({ label: a.label, kind: a.kind ?? 'secondary', wide: true, onTap: () => close(a.value) }),
          ),
        )
      : null,
  );

  const backdrop = h('div', { class: 'modal' }, card);

  function close(value: string | null = null): void {
    if (!backdrop.isConnected) return;
    backdrop.classList.add('is-closing');
    document.removeEventListener('keydown', onKey);
    openCount = Math.max(0, openCount - 1);
    setTimeout(() => backdrop.remove(), 200);
    resolveResult(value);
  }

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape' && dismissable) close(null);
  };

  if (dismissable) {
    onTap(backdrop, (ev) => {
      if (ev.target === backdrop) close(null);
    });
  }
  document.addEventListener('keydown', onKey);
  document.body.append(backdrop);
  openCount++;

  return { el: card, close, result };
}

/** Да/нет. true — человек подтвердил. */
export async function confirmModal(
  title: string,
  text: string,
  okLabel: string,
  okKind: ButtonKind = 'primary',
): Promise<boolean> {
  const m = modal({
    title,
    text,
    actions: [
      { label: okLabel, kind: okKind, value: 'ok' },
      { label: 'Отмена', kind: 'secondary', value: 'cancel' },
    ],
  });
  return (await m.result) === 'ok';
}
