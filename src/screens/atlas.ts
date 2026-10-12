/**
 * Атлас: все схемы. Нажатие на структуру обводит её и подписывает
 * на обоих языках, с коротким описанием.
 */

import { h, onTap } from '../core/dom';
import { pop, push, type ScreenView } from '../core/router';
import { plural } from '../core/time';
import { diagrams, getTerm, lessonIntroducing, type Diagram } from '../data/content';
import { createCaption } from '../ui/caption';
import { createDiagramView } from '../ui/diagram';
import { diagramTarget, termTarget, wholeDiagramTarget } from '../domain/reports';
import { icon } from '../ui/icons';
import { openReportSheet } from './report-sheet';

const HINT = 'Нажмите на структуру — появится её название по-английски и по-русски.';

/** Открыть схему; focus — сразу выбрать структуру (из словаря). */
export function openDiagram(d: Diagram, focus?: string): void {
  push(() => createDiagramScreen(d, focus), 'atlas:' + d.id);
}

function createDiagramScreen(d: Diagram, focus?: string): ScreenView {
  const caption = createCaption();
  caption.hint(HINT);
  /** Выбранная структура — к ней в первую очередь относится замечание. */
  let selected: string | null = null;

  const view = createDiagramView({
    diagram: d,
    pickable: true,
    zoomable: true,
    onPick: ({ termId }) => select(termId),
  });

  function select(termId: string): void {
    const t = getTerm(termId);
    selected = termId;
    view.highlight([termId]);
    caption.show({ en: t.en, ru: t.ru, kind: t.kind, about: t.about });
  }
  if (focus) select(focus);

  const back = h('button', { class: 'icon-btn', attr: { type: 'button' }, aria: { label: 'Назад к атласу' } }, icon('close'));
  onTap(back, () => pop());

  const names = (id: string): { en: string; ru: string } => {
    const t = getTerm(id);
    return { en: t.en, ru: t.ru };
  };
  const flag = h(
    'button',
    { class: 'icon-btn', attr: { type: 'button' }, aria: { label: 'Что не так? Сообщить об ошибке на схеме' } },
    icon('flag'),
  );
  onTap(flag, () => {
    void openReportSheet({
      targets: [
        ...(selected ? [diagramTarget(d.id, selected, names), termTarget(selected, names)] : []),
        wholeDiagramTarget(d.id, d.title),
      ],
      where: 'atlas',
      kind: 'atlas',
    });
  });

  const el = h(
    'div',
    { class: 'screen screen--atlas-view' },
    h('header', { class: 'atlas-view__top' }, back, h('h1', { class: 'atlas-view__title', text: d.title }), flag),
    h('div', { class: 'atlas-view__body' }, view.el, caption.el),
  );
  return { el, destroy: () => view.destroy() };
}

/**
 * Схемы в порядке курса. Считаются только «свои» термины схемы — те, у кого
 * она первая в списке: иначе общие термины вроде сердца или капилляра
 * тянули бы вперёд схему венечных артерий или микроциркуляции.
 */
function courseOrder(d: Diagram): number {
  const own = d.terms.filter((id) => getTerm(id).diagrams[0] === d.id);
  const orders = (own.length > 0 ? own : d.terms).map((id) => lessonIntroducing(id)?.order ?? Infinity);
  return Math.min(...orders);
}

export function createAtlasScreen(): ScreenView {
  const ordered = [...diagrams].sort((a, b) => courseOrder(a) - courseOrder(b) || a.title.localeCompare(b.title));
  const items = ordered.map((d) => {
    const thumb = createDiagramView({ diagram: d });
    const card = h(
      'button',
      { class: 'atlas-item', attr: { type: 'button' } },
      thumb.el,
      h(
        'span',
        { class: 'atlas-item__text' },
        h('span', { class: 'atlas-item__title', text: d.title }),
        h('span', {
          class: 'atlas-item__meta',
          text: d.terms.length + ' ' + plural(d.terms.length, 'структура', 'структуры', 'структур'),
        }),
      ),
    );
    onTap(card, () => openDiagram(d));
    return card;
  });

  const el = h(
    'div',
    { class: 'screen screen--atlas' },
    h(
      'div',
      { class: 'screen-body atlas' },
      h('header', { class: 'page-head' }, h('div', { class: 'eyebrow', text: 'Атлас' }), h('h1', { class: 'page-title', text: 'Схемы' })),
      h('p', {
        class: 'atlas__note',
        text: 'Обычно вид спереди: правая сторона тела — слева от вас; другой вид назван в заголовке схемы. Сосуды — по крови: красный — богатая кислородом, синий — бедная; нервы — жёлтые.',
      }),
      h('div', { class: 'atlas__grid' }, ...items),
    ),
  );
  return { el };
}
