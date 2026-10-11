/**
 * Метка вида термина: «артерия», «вена», «нерв»… Цвет — по атласной традиции
 * (артерии красные, вены синие, нервы жёлтые), но вид читается и без цвета:
 * у метки есть подпись.
 */

import { h } from '../core/dom';
import type { TermKind } from '../data/types';

export const KIND_LABEL: Record<TermKind, string> = {
  artery: 'артерия',
  vein: 'вена',
  vessel: 'сосуд',
  nerve: 'нерв',
  muscle: 'мышца',
  organ: 'орган',
  structure: 'часть органа',
  concept: 'понятие',
};

export function kindTag(kind: TermKind): HTMLElement {
  return h('span', { class: 'kind kind--' + kind }, h('span', { class: 'kind__mark' }), KIND_LABEL[kind]);
}
