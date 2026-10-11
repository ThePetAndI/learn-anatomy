/**
 * Похожие термины: какие легко спутать между собой.
 *
 * Нужно в двух местах. Проверка контента не даёт ввести такие термины в одном
 * уроке (common / internal carotid, afferent / efferent), а сборщик урока ставит
 * их неверными вариантами друг к другу, когда оба уже знакомы: различать их
 * и есть знание.
 *
 * Похожесть определяется по английскому названию: термины одной длины в словах
 * отличаются ровно одним словом, и это слово — либо пара уточнений
 * (superior / inferior), либо слова, похожие написанием (artery / arteriole,
 * sympathetic / parasympathetic). Смысловые пары, которые так не поймать
 * (systemic / pulmonary circulation), задаются в контенте полем confusableWith.
 *
 * Модуль без зависимостей: его запускает и node-скрипт проверки контента.
 */

/** Уточнения положения и вида: слова, которыми различаются соседние термины. */
const QUALIFIERS: ReadonlySet<string> = new Set([
  'superior', 'inferior', 'anterior', 'posterior', 'medial', 'lateral',
  'internal', 'external', 'common', 'left', 'right', 'deep', 'superficial',
  'greater', 'lesser', 'major', 'minor', 'proximal', 'distal', 'ascending',
  'descending', 'dorsal', 'ventral', 'upper', 'lower', 'middle', 'central',
  'peripheral', 'afferent', 'efferent', 'sympathetic', 'parasympathetic',
]);

function words(en: string): string[] {
  return en.toLowerCase().trim().split(/\s+/).filter((w) => w.length > 0);
}

/** Расстояние Дамерау — Левенштейна (с перестановкой соседних букв). */
export function editDistance(a: string, b: string): number {
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;
  const d: number[][] = [];
  for (let i = 0; i <= n; i++) {
    const row: number[] = [];
    for (let j = 0; j <= m; j++) row.push(i === 0 ? j : j === 0 ? i : 0);
    d.push(row);
  }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const row = d[i] as number[];
      const prev = d[i - 1] as number[];
      let v = Math.min((prev[j] as number) + 1, (row[j - 1] as number) + 1, (prev[j - 1] as number) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, ((d[i - 2] as number[])[j - 2] as number) + 1);
      }
      row[j] = v;
    }
  }
  return (d[n] as number[])[m] as number;
}

function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/** Похожи ли два слова написанием: artery / arteriole, afferent / efferent. */
export function similarWords(a: string, b: string): boolean {
  if (a === b) return false;
  const short = Math.min(a.length, b.length);
  if (short < 5) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const prefix = commonPrefix(a, b);
  if (prefix >= 5 && prefix >= 0.7 * short) return true;
  return short >= 6 && editDistance(a, b) <= 2;
}

/** Легко ли спутать два термина по их английским названиям. */
export function confusableNames(enA: string, enB: string): boolean {
  const a = words(enA);
  const b = words(enB);
  if (a.length !== b.length || a.length === 0) return false;
  const diff: number[] = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push(i);
  if (diff.length !== 1) return false;
  const i = diff[0] as number;
  const wa = a[i] as string;
  const wb = b[i] as string;
  return (QUALIFIERS.has(wa) && QUALIFIERS.has(wb)) || similarWords(wa, wb);
}

export interface ConfusableTerm {
  id: string;
  en: string;
  confusableWith?: readonly string[];
}

/** Похожи ли термины: по названию или по явной пометке в контенте (в любую сторону). */
export function areConfusable(a: ConfusableTerm, b: ConfusableTerm): boolean {
  if (a.id === b.id) return false;
  if (a.confusableWith?.includes(b.id) || b.confusableWith?.includes(a.id)) return true;
  return confusableNames(a.en, b.en);
}
