/** Меньше движения: класс на <html> выключает анимации так же, как системная настройка. */

export function applyReducedMotion(on: boolean): void {
  document.documentElement.classList.toggle('reduce-motion', on);
}
