/**
 * Скачивает шрифты из Google Fonts в src/assets/fonts и генерирует
 * src/styles/fonts.css с локальными @font-face.
 *
 *   Literata   — термины и заголовки: книжная антиква, как в атласе;
 *   Golos Text — текст и интерфейс: гротеск, сделанный под кириллицу.
 *
 * Запускать вручную: npm run fonts
 * В рантайме приложения обращений к CDN нет — файлы лежат локально
 * и попадают в precache service worker'а.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_DIR = join(ROOT, 'src/assets/fonts');
const CSS_FILE = join(ROOT, 'src/styles/fonts.css');

// UA современного Chrome — иначе Google отдаст ttf вместо woff2
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Русский текст целиком помещается в cyrillic, английский — в latin
const WANTED = ['cyrillic', 'latin'];

const FAMILIES = [
  { css: 'Literata:wght@400..700', family: 'Literata', slug: 'literata' },
  { css: 'Golos+Text:wght@400..700', family: 'Golos Text', slug: 'golos' },
];

async function fetchCss(spec) {
  const url = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Google Fonts ответил ${res.status} на ${url}`);
  return res.text();
}

/** Разбирает css2-ответ на блоки { subset, weight, style, src, range }. */
function parseFaces(css) {
  const faces = [];
  const re = /\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    const subset = m[1];
    const body = m[2];
    const src = /src:\s*url\((https:[^)]+)\)/.exec(body)?.[1];
    const range = /unicode-range:\s*([^;]+);/.exec(body)?.[1]?.trim();
    const weight = /font-weight:\s*([^;]+);/.exec(body)?.[1]?.trim();
    const style = /font-style:\s*([^;]+);/.exec(body)?.[1]?.trim() ?? 'normal';
    if (src && range && weight) faces.push({ subset, src, range, weight, style });
  }
  return faces;
}

async function main() {
  await mkdir(FONT_DIR, { recursive: true });
  const cssParts = [
    '/* Сгенерировано scripts/fetch-fonts.mjs — не править вручную. */',
    '/* Literata и Golos Text, вариативные 400–700. Файлы локальные: CDN в рантайме нет. */',
    '',
  ];
  const report = [];

  for (const fam of FAMILIES) {
    const css = await fetchCss(fam.css);
    const faces = parseFaces(css).filter((f) => WANTED.includes(f.subset));
    if (faces.length !== WANTED.length) {
      throw new Error(
        `${fam.family}: ожидали сабсеты ${WANTED.join(', ')}, получили ${faces.map((f) => f.subset).join(', ')}`,
      );
    }
    for (const face of faces) {
      const name = `${fam.slug}-${face.subset}.woff2`;
      const res = await fetch(face.src, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`Не скачался ${face.src}: ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(join(FONT_DIR, name), buf);
      report.push(`${name.padEnd(28)} ${(buf.length / 1024).toFixed(1)} КБ`);
      cssParts.push(
        '@font-face {',
        `  font-family: '${fam.family}';`,
        `  font-style: ${face.style};`,
        `  font-weight: ${face.weight};`,
        '  font-display: swap;',
        `  src: url('../assets/fonts/${name}') format('woff2-variations');`,
        `  unicode-range: ${face.range};`,
        '}',
        '',
      );
    }
  }

  await writeFile(CSS_FILE, cssParts.join('\n'), 'utf8');
  console.log('Скачано:');
  for (const line of report) console.log('  ' + line);
  console.log(`\nCSS: ${CSS_FILE}`);
}

main().catch((e) => {
  console.error('Ошибка:', e.message);
  process.exit(1);
});
