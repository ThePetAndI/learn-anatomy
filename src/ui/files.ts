/** Файлы: отдать JSON на скачивание и прочитать выбранный человеком файл. */

/** Кладёт JSON в файл и отдаёт браузеру на скачивание. */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  // отзыв ссылки откладываем: Android Chrome иначе успевает отменить скачивание
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Открывает системный выбор файла и возвращает его текст; null — файл не выбран. */
export function pickJsonFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    let settled = false;
    const finish = (value: string | null): void => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return finish(null);
      file.text().then(finish, () => finish(null));
    });
    // диалог могут закрыть без выбора — тогда change не придёт
    input.addEventListener('cancel', () => finish(null));
    document.body.append(input);
    input.click();
  });
}
