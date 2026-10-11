/** Общая подготовка для vitest. */
import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import { resetNowProvider } from '../src/core/time';

afterEach(() => {
  resetNowProvider();
});
