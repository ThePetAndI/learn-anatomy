/**
 * Время. Приложение офлайновое, сервера нет — «день» это локальный день устройства.
 * now() вынесено в переменную, чтобы тесты могли двигать часы.
 */

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

let nowProvider: () => number = () => Date.now();

export function now(): number {
  return nowProvider();
}

export function setNowProvider(fn: () => number): void {
  nowProvider = fn;
}

export function resetNowProvider(): void {
  nowProvider = () => Date.now();
}

/** Локальная дата YYYY-MM-DD. */
export function dayKey(ts: number = now()): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

/** Склонение: 1 термин, 2 термина, 5 терминов. */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/**
 * «через 5 мин», «через 3 ч», «через 2 дня» — когда следующее повторение.
 * От суток и больше — в днях: «через 71 ч» никто в уме не переводит.
 */
export function formatIn(ms: number): string {
  if (ms <= 0) return 'сейчас';
  const totalMin = Math.ceil(ms / MINUTE);
  if (totalMin >= 24 * 60) {
    const days = Math.round(totalMin / (24 * 60));
    return 'через ' + days + ' ' + plural(days, 'день', 'дня', 'дней');
  }
  const h = Math.floor(totalMin / 60);
  if (h === 0) return 'через ' + totalMin + ' мин';
  return 'через ' + h + ' ч';
}
