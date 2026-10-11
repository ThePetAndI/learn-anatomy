/** Крошечный слой над DOM: хватает, чтобы не тащить фреймворк. */

export type Child = Node | string | number | null | undefined | false;

export interface Props {
  class?: string;
  id?: string;
  text?: string | number;
  html?: string;
  style?: Partial<CSSStyleDeclaration> | Record<string, string>;
  data?: Record<string, string | number | boolean | undefined>;
  attr?: Record<string, string | number | boolean | undefined>;
  aria?: Record<string, string | number | boolean | undefined>;
  on?: Partial<{ [K in keyof HTMLElementEventMap]: (ev: HTMLElementEventMap[K]) => void }>;
  /** Короткая форма для нажатия: pointerup без дребезга и без 300мс задержки. */
  tap?: (ev: PointerEvent | MouseEvent) => void;
}

function applyChildren(el: Element | DocumentFragment, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' || typeof c === 'number' ? String(c) : c);
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    if (props.class) el.className = props.class;
    if (props.id) el.id = props.id;
    if (props.text !== undefined) el.textContent = String(props.text);
    if (props.html !== undefined) el.innerHTML = props.html;
    if (props.style) Object.assign(el.style, props.style);
    if (props.data) {
      for (const [k, v] of Object.entries(props.data)) {
        if (v !== undefined) el.dataset[k] = String(v);
      }
    }
    if (props.attr) {
      for (const [k, v] of Object.entries(props.attr)) {
        if (v !== undefined && v !== false) el.setAttribute(k, String(v));
      }
    }
    if (props.aria) {
      for (const [k, v] of Object.entries(props.aria)) {
        if (v !== undefined) el.setAttribute(k === 'role' ? 'role' : 'aria-' + k, String(v));
      }
    }
    if (props.on) {
      for (const [k, fn] of Object.entries(props.on)) {
        el.addEventListener(k, fn as EventListener);
      }
    }
    if (props.tap) onTap(el, props.tap);
  }
  applyChildren(el, children);
  return el;
}

/** То же для SVG: инлайн-иконки и схемы. */
export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number | undefined> | null,
  ...children: Child[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v !== undefined) el.setAttribute(k, String(v));
    }
  }
  applyChildren(el, children);
  return el;
}

/** Разбирает строку с SVG в элемент (иконки и схемы хранятся как разметка). */
export function svgFrom(markup: string): SVGSVGElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup.trim();
  return tpl.content.firstElementChild as SVGSVGElement;
}

export function frag(...children: Child[]): DocumentFragment {
  const f = document.createDocumentFragment();
  applyChildren(f, children);
  return f;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function qs<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error('Не найден элемент: ' + sel);
  return el;
}

/**
 * Нажатие по pointerup: даёт мгновенную подсветку и не срабатывает,
 * если палец уехал в сторону (значит это был скролл, а не тап).
 */
export function onTap(el: Element, fn: (ev: PointerEvent | MouseEvent) => void): () => void {
  let downX = 0;
  let downY = 0;
  let active = false;

  const onDown = (ev: PointerEvent) => {
    if (ev.button !== undefined && ev.button !== 0) return;
    active = true;
    downX = ev.clientX;
    downY = ev.clientY;
    el.classList.add('is-pressed');
  };
  const onUp = (ev: PointerEvent) => {
    el.classList.remove('is-pressed');
    if (!active) return;
    active = false;
    if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > 12) return;
    if ((el as HTMLButtonElement).disabled) return;
    fn(ev);
  };
  const onCancel = () => {
    active = false;
    el.classList.remove('is-pressed');
  };
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      fn(ev as unknown as MouseEvent);
    }
  };

  el.addEventListener('pointerdown', onDown as EventListener);
  el.addEventListener('pointerup', onUp as EventListener);
  el.addEventListener('pointercancel', onCancel);
  el.addEventListener('pointerleave', onCancel);
  el.addEventListener('keydown', onKey as EventListener);

  return () => {
    el.removeEventListener('pointerdown', onDown as EventListener);
    el.removeEventListener('pointerup', onUp as EventListener);
    el.removeEventListener('pointercancel', onCancel);
    el.removeEventListener('pointerleave', onCancel);
    el.removeEventListener('keydown', onKey as EventListener);
  };
}

/**
 * Ждём конца CSS-анимации, но не дольше fallbackMs (анимации могут быть выключены).
 * Считаем только свою анимацию: animationend всплывает, и анимация внутри
 * экрана — звёзды на итогах, появление задания — заканчивала ожидание раньше
 * времени.
 */
export function afterAnimation(el: Element, fallbackMs = 400): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.removeEventListener('animationend', onEnd);
      resolve();
    };
    const onEnd = (ev: Event) => {
      if (ev.target === el) finish();
    };
    el.addEventListener('animationend', onEnd);
    setTimeout(finish, fallbackMs);
  });
}

export function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
