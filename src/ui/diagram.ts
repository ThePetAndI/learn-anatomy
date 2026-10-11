/**
 * Просмотрщик схемы: SVG из content/diagrams, подсветка структур,
 * нажатие на структуру, масштаб двумя пальцами и колесом, сдвиг пальцем.
 *
 * Масштаб — через viewBox, а не CSS transform: линии остаются чёткими
 * при любом увеличении, а координаты нажатия считаются средствами SVG.
 */

import { h, onTap, svgFrom } from '../core/dom';
import type { Diagram } from '../data/content';
import { icon } from './icons';

export interface DiagramPick {
  /** Термин нажатой структуры. */
  termId: string;
  /**
   * Термины от нажатой структуры наружу: у камеры сердца — камера, потом
   * сердце. «Найди сердце» засчитывает нажатие на любую его часть.
   */
  chain: string[];
}

export interface DiagramViewOpts {
  diagram: Diagram;
  /** Можно ли нажимать на структуры. */
  pickable?: boolean;
  /** Масштаб и сдвиг пальцами, колесом и кнопками. */
  zoomable?: boolean;
  onPick?: (pick: DiagramPick) => void;
}

export interface DiagramView {
  el: HTMLElement;
  /** Подсветить структуры: focus — тёмный контур, miss — контур цвета ошибки. */
  highlight: (focus: readonly string[], miss?: readonly string[]) => void;
  clearHighlight: () => void;
  /** Вернуть схему целиком. */
  resetZoom: () => void;
  setPickable: (on: boolean) => void;
  destroy: () => void;
}

const MAX_ZOOM = 5;
/** Сдвиг пальца больше этого — уже перетаскивание, а не нажатие. */
const TAP_SLOP = 10;

let filterSeq = 0;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Контур подсветки: расширенный силуэт структуры, залитый цветом, под самой структурой. */
function outlineFilter(id: string, floodClass: string, radius: string): string {
  return (
    '<filter id="' + id + '" x="-30%" y="-30%" width="160%" height="160%">' +
    '<feMorphology in="SourceAlpha" operator="dilate" radius="' + radius + '" result="wide"/>' +
    '<feFlood class="' + floodClass + '"/>' +
    '<feComposite in2="wide" operator="in" result="ring"/>' +
    '<feMerge><feMergeNode in="ring"/><feMergeNode in="SourceGraphic"/></feMerge>' +
    '</filter>'
  );
}

export function createDiagramView(opts: DiagramViewOpts): DiagramView {
  const svg = svgFrom(opts.diagram.svg);
  svg.classList.add('anat');
  svg.removeAttribute('xmlns');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', opts.diagram.title);
  // название для экранного диктора уже в aria-label; всплывающая подсказка <title> не нужна
  svg.querySelector(':scope > title')?.remove();

  const base: Box = (() => {
    const v = svg.viewBox.baseVal;
    return { x: v.x, y: v.y, w: v.width, h: v.height };
  })();
  let box: Box = { ...base };

  const n = ++filterSeq;
  const hlId = 'hl-' + n;
  const missId = 'miss-' + n;
  const radius = Math.max(2, base.w / 130).toFixed(1);
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = outlineFilter(hlId, 'flood-hl', radius) + outlineFilter(missId, 'flood-miss', radius);
  svg.prepend(defs);

  const el = h('div', {
    class: 'diagram' + (opts.pickable ? ' is-pickable' : '') + (opts.zoomable ? ' is-zoomable' : ''),
  });
  el.append(svg);

  /* ——————————————————————— подсветка ——————————————————————— */

  const groupsOf = (termId: string): SVGGElement[] =>
    Array.from(svg.querySelectorAll<SVGGElement>('[data-term="' + termId + '"]'));

  function clearHighlight(): void {
    svg.classList.remove('has-hl');
    for (const g of svg.querySelectorAll<SVGGElement>('.is-hl, .is-miss')) {
      g.classList.remove('is-hl', 'is-miss');
      g.style.removeProperty('filter');
    }
  }

  function highlight(focus: readonly string[], miss: readonly string[] = []): void {
    clearHighlight();
    if (focus.length === 0 && miss.length === 0) return;
    svg.classList.add('has-hl');
    for (const id of miss) {
      for (const g of groupsOf(id)) {
        g.classList.add('is-miss');
        g.style.filter = 'url(#' + missId + ')';
      }
    }
    for (const id of focus) {
      for (const g of groupsOf(id)) {
        g.classList.remove('is-miss');
        g.classList.add('is-hl');
        g.style.filter = 'url(#' + hlId + ')';
      }
    }
  }

  /* ——————————————————————— масштаб ——————————————————————— */

  function apply(): void {
    svg.setAttribute('viewBox', [box.x, box.y, box.w, box.h].map((v) => v.toFixed(2)).join(' '));
  }

  function clamp(b: Box): Box {
    const w = Math.min(base.w, Math.max(base.w / MAX_ZOOM, b.w));
    const hgt = (w / base.w) * base.h;
    return {
      w,
      h: hgt,
      x: Math.min(base.x + base.w - w, Math.max(base.x, b.x)),
      y: Math.min(base.y + base.h - hgt, Math.max(base.y, b.y)),
    };
  }

  /** Точка экрана в координатах схемы. */
  function toSvg(clientX: number, clientY: number): DOMPoint {
    const ctm = svg.getScreenCTM();
    const p = new DOMPoint(clientX, clientY);
    return ctm ? p.matrixTransform(ctm.inverse()) : p;
  }

  /** Увеличить в k раз так, чтобы точка (cx, cy) схемы осталась под пальцем. */
  function zoomAt(k: number, cx: number, cy: number, from: Box = box): void {
    const w = from.w / k;
    const hgt = from.h / k;
    box = clamp({ x: cx - ((cx - from.x) * w) / from.w, y: cy - ((cy - from.y) * hgt) / from.h, w, h: hgt });
    apply();
  }

  function resetZoom(): void {
    box = { ...base };
    apply();
  }

  /* ——————————————————————— что под пальцем ——————————————————————— */

  /** Расстояние от точки до линии зоны нажатия: подбираем толщину, при которой точка попадает в штрих. */
  function strokeDistance(path: SVGGeometryElement, pt: DOMPoint): number {
    const full = Number(path.getAttribute('stroke-width') ?? '0');
    try {
      for (let w = 4; w <= full; w += 4) {
        path.setAttribute('stroke-width', String(w));
        if (path.isPointInStroke(pt)) return w / 2;
      }
    } finally {
      path.setAttribute('stroke-width', String(full));
    }
    return Infinity;
  }

  /**
   * Структура под пальцем. Если палец на видимой фигуре — она (верхняя).
   * Если на пустом месте у тонких сосудов, где зоны нажатия перекрываются, —
   * ближайшая к пальцу.
   */
  function groupAt(clientX: number, clientY: number): SVGGElement | null {
    const stack = document.elementsFromPoint(clientX, clientY).filter((e) => e !== svg && svg.contains(e));
    for (const e of stack) {
      if (e.classList.contains('hit') || e.classList.contains('hit-area')) continue;
      const g = e.closest<SVGGElement>('[data-term]');
      if (g) return g;
    }
    const pt = toSvg(clientX, clientY);
    let best: SVGGElement | null = null;
    let bestDist = Infinity;
    for (const e of stack) {
      const g = e.closest<SVGGElement>('[data-term]');
      if (!g) continue;
      let d = Infinity;
      if (e.classList.contains('hit-area')) d = 0;
      else if (e.classList.contains('hit')) d = strokeDistance(e as SVGGeometryElement, pt);
      if (d < bestDist) {
        bestDist = d;
        best = g;
      }
    }
    return best;
  }

  function pickAt(clientX: number, clientY: number): void {
    const g = groupAt(clientX, clientY);
    if (!g || !opts.onPick) return;
    const chain: string[] = [];
    for (let node: Element | null = g; node && node !== svg; node = node.parentElement) {
      const id = node.getAttribute('data-term');
      if (id && !chain.includes(id)) chain.push(id);
    }
    opts.onPick({ termId: chain[0] as string, chain });
  }

  /* ——————————————————————— пальцы, мышь, колесо ——————————————————————— */

  const pointers = new Map<number, { x: number; y: number }>();
  let startX = 0;
  let startY = 0;
  let moved = false;
  let pinched = false;
  let panFrom: Box | null = null;
  let pinch: { dist: number; from: Box; cx: number; cy: number } | null = null;
  let pickable = opts.pickable === true;

  const pinchState = (): { dist: number; midX: number; midY: number } => {
    const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 };
  };

  const onDown = (ev: PointerEvent): void => {
    if (ev.button !== 0) return;
    try {
      // палец, уехавший за край схемы, продолжает двигать её
      svg.setPointerCapture(ev.pointerId);
    } catch {
      /* указатель уже не активен — без захвата тоже работает */
    }
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.size === 1) {
      startX = ev.clientX;
      startY = ev.clientY;
      moved = false;
      pinched = false;
      panFrom = { ...box };
    } else if (pointers.size === 2 && opts.zoomable) {
      pinched = true;
      const s = pinchState();
      const mid = toSvg(s.midX, s.midY);
      pinch = { dist: s.dist, from: { ...box }, cx: mid.x, cy: mid.y };
    }
  };

  const onMove = (ev: PointerEvent): void => {
    if (!pointers.has(ev.pointerId)) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.size >= 2 && pinch) {
      const s = pinchState();
      zoomAt(s.dist / Math.max(1, pinch.dist), pinch.cx, pinch.cy, pinch.from);
      return;
    }
    if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > TAP_SLOP) moved = true;
    if (moved && opts.zoomable && panFrom && box.w < base.w) {
      svg.classList.add('is-panning');
      const k = box.w / svg.clientWidth;
      box = clamp({ ...box, x: panFrom.x - (ev.clientX - startX) * k, y: panFrom.y - (ev.clientY - startY) * k });
      apply();
    }
  };

  const onUp = (ev: PointerEvent): void => {
    if (!pointers.has(ev.pointerId)) return;
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size > 0) return;
    svg.classList.remove('is-panning');
    if (!moved && !pinched && pickable) pickAt(ev.clientX, ev.clientY);
  };

  const onCancel = (ev: PointerEvent): void => {
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) pinch = null;
    svg.classList.remove('is-panning');
  };

  const onWheel = (ev: WheelEvent): void => {
    ev.preventDefault();
    const p = toSvg(ev.clientX, ev.clientY);
    zoomAt(Math.exp(-ev.deltaY * 0.0015), p.x, p.y);
  };

  if (opts.pickable || opts.zoomable) {
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onCancel);
  }
  if (opts.zoomable) {
    svg.addEventListener('wheel', onWheel, { passive: false });
    const zoomBtn = (name: 'plus' | 'minus' | 'fit', label: string, fn: () => void): HTMLElement => {
      const b = h('button', { class: 'icon-btn', attr: { type: 'button' }, aria: { label } }, icon(name));
      onTap(b, fn);
      return b;
    };
    const centre = (): [number, number] => [box.x + box.w / 2, box.y + box.h / 2];
    el.append(
      h(
        'div',
        { class: 'diagram__zoom' },
        zoomBtn('plus', 'Увеличить', () => zoomAt(1.6, ...centre())),
        zoomBtn('minus', 'Уменьшить', () => zoomAt(1 / 1.6, ...centre())),
        zoomBtn('fit', 'Показать схему целиком', resetZoom),
      ),
    );
  }

  return {
    el,
    highlight,
    clearHighlight,
    resetZoom,
    setPickable: (on) => {
      pickable = on;
      el.classList.toggle('is-pickable', on);
    },
    destroy: () => {
      svg.removeEventListener('wheel', onWheel);
    },
  };
}
