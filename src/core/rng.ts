/**
 * Детерминированный генератор случайных чисел.
 * Нужен, чтобы урок собирался одинаково при одном seed: задания не «переезжают»
 * при перерисовке, а тесты проверяют генераторы без мокинга Math.random.
 */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Строка в 32-битный seed (FNV-1a). */
export function hashSeed(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Готовый генератор по строковому ключу. */
export function rngFor(key: string): Rng {
  return mulberry32(hashSeed(key));
}

export function randInt(rng: Rng, minInclusive: number, maxInclusive: number): number {
  return minInclusive + Math.floor(rng() * (maxInclusive - minInclusive + 1));
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  if (arr.length === 0) throw new Error('pick: пустой массив');
  return arr[Math.floor(rng() * arr.length)] as T;
}

/** Фишер–Йейтс, исходный массив не меняется. */
export function shuffle<T>(rng: Rng, arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

/** n элементов без повторов; если просят больше, чем есть, вернёт всё. */
export function sample<T>(rng: Rng, arr: readonly T[], n: number): T[] {
  return shuffle(rng, arr).slice(0, Math.max(0, Math.min(n, arr.length)));
}

/** Взвешенный выбор: веса не обязаны давать в сумме единицу. */
export function weightedPick<T>(rng: Rng, items: readonly T[], weight: (item: T) => number): T {
  if (items.length === 0) throw new Error('weightedPick: пустой массив');
  let total = 0;
  for (const it of items) total += Math.max(0, weight(it));
  if (total <= 0) return pick(rng, items);
  let r = rng() * total;
  for (const it of items) {
    r -= Math.max(0, weight(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1] as T;
}
