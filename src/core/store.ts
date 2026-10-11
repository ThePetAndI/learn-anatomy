/**
 * Единственный источник правды о прогрессе.
 * Мутируем состояние внутри update(), подписчики получают уведомление,
 * запись на диск — с задержкой, чтобы не дёргать IndexedDB на каждый ответ.
 */

import { loadState, saveState } from '../data/persist';
import { createInitialState, type SaveState } from '../data/state';
import { now } from './time';

const SAVE_DEBOUNCE_MS = 400;

type Listener = (state: SaveState) => void;

let state: SaveState = createInitialState(now());
const listeners = new Set<Listener>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function getState(): SaveState {
  return state;
}

export async function initStore(): Promise<SaveState> {
  state = await loadState();
  installLifecycleHooks();
  notify();
  return state;
}

/** Полностью заменить состояние — импорт и сброс прогресса. */
export async function replaceState(next: SaveState): Promise<void> {
  state = next;
  notify();
  await flushSave();
}

/**
 * Изменить состояние. Мутировать напрямую — осознанно: иммутабельные копии
 * на каждый ответ дали бы лишний мусор, а пользы здесь никакой.
 */
export function update(fn: (draft: SaveState) => void): SaveState {
  fn(state);
  notify();
  scheduleSave();
  return state;
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  for (const fn of listeners) {
    try {
      fn(state);
    } catch (err) {
      console.error('Подписчик store упал:', err);
    }
  }
}

function scheduleSave(): void {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveState(state).catch((err) => console.error('Не удалось сохранить прогресс:', err));
  }, SAVE_DEBOUNCE_MS);
}

/** Записать немедленно: перед уходом со страницы. */
export async function flushSave(): Promise<void> {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  await saveState(state).catch((err) => console.error('Не удалось сохранить прогресс:', err));
}

let hooksInstalled = false;

function installLifecycleHooks(): void {
  if (hooksInstalled || typeof document === 'undefined') return;
  hooksInstalled = true;
  // pagehide надёжнее beforeunload на Android: срабатывает при сворачивании
  const onLeave = () => void flushSave();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onLeave();
  });
  window.addEventListener('pagehide', onLeave);
}
