/**
 * Генерирует иконки приложения из SVG: дуга аорты с тремя ветвями.
 * Топология верная: первая ветвь — плечеголовной ствол, он справа у пациента
 * (слева на рисунке, вид спереди) и делится на подключичную и общую сонную;
 * дальше — левая общая сонная и левая подключичная.
 * Текста в иконке нет: растеризатор не знает наших шрифтов.
 *
 * Запуск: npm run icons
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public/icons');

const PAPER = '#F4EFE6';
const ARTERY = '#B3261E';
const INK = '#22201C';

const ARCH =
  `<g fill="none" stroke="${ARTERY}" stroke-linecap="round" stroke-linejoin="round">` +
  '<path stroke-width="46" d="M200 440V300C200 170 340 170 340 300V440"/>' +
  '<path stroke-width="26" d="M222 227 214 165M214 165C200 140 170 128 140 124M214 165 206 78M270 203 274 78M318 227C330 160 360 135 392 130"/>' +
  '</g>';

/** maskable — фон во весь холст, рисунок ужат в безопасный круг. */
function iconSvg({ maskable = false } = {}) {
  const k = maskable ? 0.7 : 0.86;
  const shift = (256 - 256 * k).toFixed(1);
  const tile = maskable
    ? `<rect width="512" height="512" fill="${PAPER}"/>`
    : `<rect x="8" y="8" width="496" height="496" rx="112" fill="${PAPER}" stroke="${INK}" stroke-opacity="0.12" stroke-width="8"/>`;
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">' +
    tile +
    `<g transform="translate(${shift} ${(Number(shift) + 6).toFixed(1)}) scale(${k})">` +
    ARCH +
    '</g></svg>'
  );
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const plain = iconSvg();
  const maskable = iconSvg({ maskable: true });
  await writeFile(join(OUT, 'favicon.svg'), plain, 'utf8');

  const jobs = [
    ['icon-192.png', plain, 192],
    ['icon-512.png', plain, 512],
    ['maskable-192.png', maskable, 192],
    ['maskable-512.png', maskable, 512],
    ['apple-touch-icon.png', maskable, 180],
  ];
  for (const [name, svg, size] of jobs) {
    const png = await sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
    await writeFile(join(OUT, name), png);
    console.log(name.padEnd(24) + (png.length / 1024).toFixed(1) + ' КБ');
  }
}

main().catch((e) => {
  console.error('Не удалось собрать иконки:', e.message);
  process.exit(1);
});
