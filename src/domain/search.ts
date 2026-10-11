/**
 * Поиск по словарю: на обоих языках сразу, по главному названию и по другим
 * принятым (also). Регистр, дефисы и «ё» не важны: «легочный» найдёт «лёгочный».
 *
 * Порядок результатов: точное совпадение, потом начало названия, потом начало
 * любого слова в нём, потом совпадение где угодно; при равенстве — по алфавиту.
 */

import type { Term } from '../data/types';

export function normalizeQuery(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[‐-―-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Насколько название подходит к запросу: меньше — лучше, null — не подходит. */
function rankName(name: string, q: string): number | null {
  const n = normalizeQuery(name);
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.split(' ').some((w) => w.startsWith(q))) return 2;
  if (n.includes(q)) return 3;
  return null;
}

export function searchTerms(terms: readonly Term[], query: string): Term[] {
  const q = normalizeQuery(query);
  if (q === '') return [];
  const hits: { t: Term; rank: number }[] = [];
  for (const t of terms) {
    const names = [t.en, t.ru, ...(t.also?.en ?? []), ...(t.also?.ru ?? [])];
    let best: number | null = null;
    for (const name of names) {
      const r = rankName(name, q);
      if (r !== null && (best === null || r < best)) best = r;
    }
    if (best !== null) hits.push({ t, rank: best });
  }
  hits.sort((a, b) => a.rank - b.rank || a.t.en.localeCompare(b.t.en));
  return hits.map((h) => h.t);
}
