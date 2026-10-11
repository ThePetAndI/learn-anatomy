/**
 * Карточка термина в словаре: названия, описание, связи, схемы, где в курсе,
 * как идёт повторение. Флажок «Что не так?» — к термину или к его месту на схеме.
 */

import { h, onTap } from '../core/dom';
import { pop, push, type ScreenView } from '../core/router';
import { getState } from '../core/store';
import { formatIn, now } from '../core/time';
import { allTerms, findTerm, getDiagram, lessonIntroducing, sections, type Diagram } from '../data/content';
import type { Term } from '../data/types';
import { diagramTarget, termTarget } from '../domain/reports';
import { LEARNED_BOX } from '../domain/srs';
import { createDiagramView, type DiagramView } from '../ui/diagram';
import { icon } from '../ui/icons';
import { kindTag } from '../ui/kind';
import { openDiagram } from './atlas';
import { openReportSheet } from './report-sheet';

export function openTerm(id: string): void {
  push(() => createTermScreen(id), 'term:' + id);
}

const names = (id: string): { en: string; ru: string } => {
  const t = findTerm(id);
  return t ? { en: t.en, ru: t.ru } : { en: id, ru: '' };
};

/** Ссылка на другой термин — открывает его карточку поверх. */
function termLink(id: string): HTMLElement {
  const t = findTerm(id);
  const b = h(
    'button',
    { class: 'term-link', attr: { type: 'button' } },
    h('span', { class: 'term-link__en', attr: { lang: 'en' }, text: t?.en ?? id }),
    h('span', { class: 'term-link__ru', text: t?.ru ?? '' }),
  );
  onTap(b, () => openTerm(id));
  return b;
}

function relationRows(t: Term): HTMLElement[] {
  const rows: [string, string[]][] = [];
  const r = t.relations;
  if (r.branchOf) rows.push(['Ветвь чего', [r.branchOf]]);
  // обратные связи считаются по всем терминам: «ветви» у ствола никто не пишет руками
  const branches = allTerms().filter((x) => x.relations.branchOf === t.id).map((x) => x.id);
  if (branches.length > 0) rows.push(['Ветви', branches]);
  if (r.drainsTo) rows.push(['Куда впадает', [r.drainsTo]]);
  const tributaries = allTerms().filter((x) => x.relations.drainsTo === t.id).map((x) => x.id);
  if (tributaries.length > 0) rows.push(['Что впадает', tributaries]);
  if (r.supplies && r.supplies.length > 0) rows.push(['Кровоснабжает', r.supplies]);
  if (r.suppliesPart && r.suppliesPart.length > 0) rows.push(['Кровоснабжает частично', r.suppliesPart]);
  // у органа — какие артерии его питают: это тоже считается по всем терминам
  const suppliers = allTerms().filter((x) => (x.relations.supplies ?? []).includes(t.id)).map((x) => x.id);
  if (suppliers.length > 0) rows.push(['Кровоснабжают', suppliers]);
  const partial = allTerms().filter((x) => (x.relations.suppliesPart ?? []).includes(t.id)).map((x) => x.id);
  if (partial.length > 0) rows.push(['Частично кровоснабжают', partial]);
  if (r.innervates && r.innervates.length > 0) rows.push(['Иннервирует', r.innervates]);
  if (r.innervatesPart && r.innervatesPart.length > 0) rows.push(['Иннервирует частично', r.innervatesPart]);
  const nerves = allTerms().filter((x) => (x.relations.innervates ?? []).includes(t.id)).map((x) => x.id);
  if (nerves.length > 0) rows.push(['Иннервируют', nerves]);
  return rows.map(([label, ids]) =>
    h('div', { class: 'relation' }, h('div', { class: 'relation__label', text: label }), ...ids.map(termLink)),
  );
}

function status(t: Term): string {
  const stat = getState().terms[t.id];
  if (!stat || stat.seen === 0) return 'Ещё не встречался в уроках';
  const parts = ['Верно ' + stat.correct + ' из ' + stat.seen];
  if (stat.box >= LEARNED_BOX) parts.push('выучен надолго');
  parts.push('следующее повторение ' + formatIn(stat.dueAt - now()));
  return parts.join(' · ');
}

function whereInCourse(t: Term): string {
  const lesson = lessonIntroducing(t.id);
  if (!lesson) return 'Вне уроков — только в словаре';
  const section = sections.find((s) => s.id === lesson.sectionId);
  return (section ? section.title + ' · ' : '') + 'урок «' + lesson.title + '»';
}

export function createTermScreen(id: string): ScreenView {
  const t = findTerm(id);
  if (!t) throw new Error('Нет термина ' + id);
  const views: DiagramView[] = [];
  const diagrams: Diagram[] = t.diagrams.map(getDiagram);

  const back = h('button', { class: 'icon-btn', attr: { type: 'button' }, aria: { label: 'Назад' } }, icon('back'));
  onTap(back, () => pop());
  const flag = h(
    'button',
    { class: 'icon-btn', attr: { type: 'button' }, aria: { label: 'Что не так? Сообщить об ошибке' } },
    icon('flag'),
  );
  onTap(flag, () => {
    void openReportSheet({
      targets: [termTarget(t.id, names), ...t.diagrams.map((d) => diagramTarget(d, t.id, names))],
      where: 'dictionary',
      kind: 'term',
    });
  });

  const also = [...(t.also?.en ?? []), ...(t.also?.ru ?? [])];
  const relations = relationRows(t);

  /*
   * Схемы здесь без масштаба: жесты на них мешали бы листать страницу.
   * Нажатие открывает схему в атласе — там и масштаб, и подписи соседей.
   */
  const diagramBlocks = diagrams.map((d) => {
    const view = createDiagramView({ diagram: d });
    view.highlight([t.id]);
    views.push(view);
    const fig = h(
      'button',
      { class: 'term-page__figure', attr: { type: 'button' }, aria: { label: 'Открыть в атласе: ' + d.title } },
      view.el,
      h('span', { class: 'term-page__figcap' }, h('span', { text: d.title }), h('span', { class: 'term-page__open', text: 'Открыть в атласе' })),
    );
    onTap(fig, () => openDiagram(d, t.id));
    return fig;
  });

  const el = h(
    'div',
    { class: 'screen screen--term' },
    h('header', { class: 'term-page__top' }, back, flag),
    h(
      'div',
      { class: 'screen-body term-page' },
      kindTag(t.kind),
      h('h1', { class: 'term-card__en', attr: { lang: 'en' }, text: t.en }),
      t.plural ? h('div', { class: 'term-card__plural' }, 'мн. ч. ', h('span', { attr: { lang: 'en' }, text: t.plural })) : null,
      h('div', { class: 'term-card__ru', text: t.ru }),
      also.length > 0 ? h('div', { class: 'term-card__also' }, 'также: ', h('span', { text: also.join(', ') })) : null,
      h('p', { class: 'term-page__about', text: t.about }),
      relations.length > 0 ? h('section', { class: 'term-page__relations' }, ...relations) : null,
      diagramBlocks.length > 0 ? h('h2', { class: 'page-subtitle', text: 'На схемах' }) : null,
      ...diagramBlocks,
      h('h2', { class: 'page-subtitle', text: 'В курсе' }),
      h(
        'dl',
        { class: 'facts' },
        h('dt', { text: 'Урок' }),
        h('dd', { text: whereInCourse(t) }),
        h('dt', { text: 'Повторение' }),
        h('dd', { text: status(t) }),
        h('dt', { text: 'Источник' }),
        h('dd', { text: t.source }),
        t.verified ? null : h('dt', { text: 'На проверке' }),
        t.verified ? null : h('dd', { text: t.note ?? '' }),
      ),
    ),
  );

  return { el, destroy: () => views.forEach((v) => v.destroy()) };
}
