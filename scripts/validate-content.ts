/**
 * Проверка файлов курса в content/. Запускается перед сборкой.
 * Сами правила — в src/data/validate.ts, их же проверяют тесты.
 *
 *   npm run validate:content   — проверить
 *   npm run review             — проверить и пересобрать content/REVIEW.md
 *
 * Скрипт идёт под node без сборщика (node сам убирает типы TypeScript),
 * поэтому импорты — с расширением .ts.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderReview, validateContent } from '../src/data/validate.ts';
import type { RawContent } from '../src/data/types.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'content');

async function readJson(path: string): Promise<unknown> {
  const text = await readFile(path, 'utf8');
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(path + ': битый JSON — ' + (e as Error).message);
  }
}

async function readRaw(): Promise<RawContent> {
  const termNames = (await readdir(join(CONTENT, 'terms'))).filter((n) => n.endsWith('.json')).sort();
  const termFiles = [];
  for (const name of termNames) {
    termFiles.push({ file: 'terms/' + name, data: await readJson(join(CONTENT, 'terms', name)) });
  }
  const diagrams = [];
  for (const name of (await readdir(join(CONTENT, 'diagrams'))).filter((n) => n.endsWith('.svg')).sort()) {
    diagrams.push({ id: name.slice(0, -4), svg: await readFile(join(CONTENT, 'diagrams', name), 'utf8') });
  }
  return {
    termFiles,
    rules: await readJson(join(CONTENT, 'rules.json')),
    course: await readJson(join(CONTENT, 'course.json')),
    paths: await readJson(join(CONTENT, 'paths.json')),
    diagrams,
  };
}

async function main(): Promise<void> {
  const report = validateContent(await readRaw());
  for (const w of report.warnings) console.warn('предупреждение: ' + w);
  for (const e of report.errors) console.error('ошибка: ' + e);

  const reviewPath = join(CONTENT, 'REVIEW.md');
  const expected = renderReview(report.unverified);
  if (process.argv.includes('--write-review')) {
    await writeFile(reviewPath, expected, 'utf8');
    console.log('REVIEW.md пересобран: ' + report.unverified.length + ' на проверку');
  } else {
    const current = await readFile(reviewPath, 'utf8').catch(() => '');
    if (current.replace(/\r\n/g, '\n') !== expected) {
      report.errors.push('REVIEW.md устарел');
      console.error('ошибка: content/REVIEW.md не совпадает с пометками verified — запустите npm run review');
    }
  }

  if (report.errors.length > 0) {
    console.error('\nКонтент с ошибками: ' + report.errors.length);
    process.exit(1);
  }
  console.log('Контент в порядке. Предупреждений: ' + report.warnings.length);
}

main().catch((e: unknown) => {
  console.error((e as Error).message);
  process.exit(1);
});
