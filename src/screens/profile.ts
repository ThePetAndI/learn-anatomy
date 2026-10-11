/**
 * Профиль: прогресс, замечания для Claude, перенос прогресса файлом,
 * настройки, о приложении.
 */

import { h, onTap } from '../core/dom';
import type { ScreenView } from '../core/router';
import { getState, replaceState, subscribe, update } from '../core/store';
import { now, plural } from '../core/time';
import { allTerms, lessons } from '../data/content';
import { buildExport, exportFilename, parseImport } from '../data/persist';
import { createInitialState, type Report } from '../data/state';
import { isCompleted } from '../domain/progress';
import { clearReports, formatReports, REASON_LABELS, removeReport } from '../domain/reports';
import { termsSummary } from '../domain/srs';
import { button } from '../ui/button';
import { downloadJson, pickJsonFile } from '../ui/files';
import { icon } from '../ui/icons';
import { confirmModal, modal } from '../ui/modal';
import { applyReducedMotion } from '../ui/motion';
import { toast } from '../ui/toast';

function stat(value: string, label: string): HTMLElement {
  return h('div', { class: 'stat' }, h('div', { class: 'stat__value', text: value }), h('div', { class: 'stat__label', text: label }));
}

function toggle(label: string, hint: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const input = h('input', { class: 'switch__input', attr: { type: 'checkbox', role: 'switch' } });
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  return h(
    'label',
    { class: 'switch' },
    h('span', { class: 'switch__text' }, h('span', { class: 'switch__label', text: label }), h('span', { class: 'switch__hint', text: hint })),
    input,
  );
}

/* ——————————————————————— замечания ——————————————————————— */

/** Буфер обмена недоступен (старый браузер, нет HTTPS) — показываем текст, чтобы скопировать руками. */
function showTextToCopy(text: string): void {
  const area = h('textarea', { class: 'rsheet__note reports__dump', attr: { readonly: true, rows: 8 } });
  area.value = text;
  modal({
    title: 'Скопируйте текст',
    text: 'Выделите всё и скопируйте — потом вставьте в чат с Claude.',
    body: area,
    actions: [{ label: 'Готово', kind: 'primary', value: 'ok' }],
  });
  setTimeout(() => area.select(), 50);
}

function copyReports(): void {
  const text = formatReports(getState().reports, now());
  const n = getState().reports.length;
  if (!navigator.clipboard?.writeText) {
    showTextToCopy(text);
    return;
  }
  navigator.clipboard.writeText(text).then(
    () => toast({ text: 'Скопировано: ' + n + ' ' + plural(n, 'замечание', 'замечания', 'замечаний') + '. Вставьте в чат с Claude', iconName: 'check', tone: 'good', ms: 3500 }),
    () => showTextToCopy(text),
  );
}

function reportRow(r: Report): HTMLElement {
  const del = h('button', { class: 'icon-btn', attr: { type: 'button' }, aria: { label: 'Удалить замечание' } }, icon('trash'));
  onTap(del, () => update((s) => void removeReport(s, r.at)));
  return h(
    'li',
    { class: 'report-row' },
    h(
      'div',
      { class: 'report-row__text' },
      h('span', { class: 'report-row__what', text: r.ru ? r.en + ' — ' + r.ru : r.en }),
      h('span', { class: 'report-row__why', text: REASON_LABELS[r.reason] + (r.note ? ': «' + r.note + '»' : '') }),
    ),
    del,
  );
}

function reportsSection(): HTMLElement[] {
  const reports = getState().reports;
  const n = reports.length;
  if (n === 0) {
    return [
      h('p', {
        class: 'profile__note',
        text: 'Замечаний нет. Если в уроке, словаре или атласе что-то не так — нажмите флажок; замечание появится здесь.',
      }),
    ];
  }
  const actions = h(
    'div',
    { class: 'profile__actions' },
    button({ label: 'Скопировать для Claude', iconName: 'copy', wide: true, onTap: copyReports }),
  );
  if (typeof navigator.share === 'function') {
    actions.append(
      button({
        label: 'Поделиться',
        kind: 'secondary',
        wide: true,
        onTap: () => void navigator.share({ text: formatReports(getState().reports, now()) }).catch(() => {}),
      }),
    );
  }
  actions.append(
    button({
      label: 'Удалить все',
      kind: 'danger',
      wide: true,
      onTap: () =>
        void confirmModal('Удалить все замечания?', 'Сначала скопируйте их для Claude — после удаления их не вернуть.', 'Удалить', 'danger').then(
          (ok) => {
            if (ok) update((s) => void clearReports(s));
          },
        ),
    }),
  );
  return [
    h('p', { class: 'profile__note', text: n + ' ' + plural(n, 'замечание ждёт', 'замечания ждут', 'замечаний ждут') + ' отправки. Скопируйте и вставьте в чат с Claude — он сверит с источниками и поправит курс.' }),
    h('ul', { class: 'reports' }, ...[...reports].reverse().map(reportRow)),
    actions,
  ];
}

/* ——————————————————————— перенос прогресса ——————————————————————— */

function exportProgress(): void {
  downloadJson(exportFilename(now()), buildExport(getState(), now()));
  toast({ text: 'Файл сохранён в загрузки', iconName: 'download', tone: 'good' });
}

async function importProgress(): Promise<void> {
  const text = await pickJsonFile();
  if (text === null) return;
  const res = parseImport(text, now());
  if (!res.ok) {
    toast({ text: res.error, iconName: 'cross', tone: 'bad', ms: 4000 });
    return;
  }
  const done = (s: typeof res.state): number => lessons.filter((l) => isCompleted(s, l.id)).length;
  const ok = await confirmModal(
    'Заменить прогресс?',
    'Сейчас пройдено уроков: ' + done(getState()) + ', в файле: ' + done(res.state) + '. Текущий прогресс заменится файлом.' +
      (res.warnings.length > 0 ? ' ' + res.warnings.join(' ') : ''),
    'Заменить',
    'danger',
  );
  if (!ok) return;
  await replaceState(res.state);
  applyReducedMotion(res.state.settings.reducedMotion);
  toast({ text: 'Прогресс загружен из файла', iconName: 'check', tone: 'good' });
}

/* ——————————————————————— экран ——————————————————————— */

export function createProfileScreen(): ScreenView {
  const body = h('div', { class: 'screen-body profile' });
  const el = h('div', { class: 'screen screen--profile' }, body);

  function render(): void {
    const state = getState();
    const sum = termsSummary(state, now());
    const done = lessons.filter((l) => isCompleted(state, l.id)).length;
    const offline = typeof navigator !== 'undefined' && navigator.serviceWorker?.controller != null;

    const reset = button({ label: 'Сбросить прогресс', kind: 'danger', wide: true });
    onTap(reset, async () => {
      const ok = await confirmModal(
        'Сбросить прогресс?',
        'Пройденные уроки и статистика терминов удалятся. Замечания и настройки останутся. Отменить это нельзя.',
        'Сбросить',
        'danger',
      );
      if (!ok) return;
      const current = getState();
      const fresh = createInitialState(now());
      fresh.settings = { ...current.settings };
      fresh.reports = [...current.reports];
      await replaceState(fresh);
      toast({ text: 'Прогресс сброшен' });
    });

    body.replaceChildren(
      h('header', { class: 'page-head' }, h('div', { class: 'eyebrow', text: 'Профиль' }), h('h1', { class: 'page-title', text: 'Прогресс' })),
      h(
        'div',
        { class: 'stats' },
        stat(done + ' / ' + lessons.length, 'уроков пройдено'),
        stat(sum.seen + ' / ' + allTerms().length, 'терминов встречено'),
        stat(String(sum.learned), 'выучено надолго'),
        stat(String(sum.due), 'пора повторить'),
      ),

      h('h2', { class: 'page-subtitle', text: 'Замечания для Claude' }),
      ...reportsSection(),

      h('h2', { class: 'page-subtitle', text: 'Перенос прогресса' }),
      h('p', { class: 'profile__note', text: 'Прогресс хранится только на этом устройстве. Сохраните его в файл, чтобы перенести на другое или не потерять при очистке браузера.' }),
      h(
        'div',
        { class: 'profile__actions' },
        button({ label: 'Сохранить в файл', iconName: 'download', kind: 'secondary', wide: true, onTap: exportProgress }),
        button({ label: 'Загрузить из файла', iconName: 'upload', kind: 'secondary', wide: true, onTap: () => void importProgress() }),
      ),

      h('h2', { class: 'page-subtitle', text: 'Настройки' }),
      toggle('Меньше движения', 'Без анимаций переходов', state.settings.reducedMotion, (v) => {
        update((s) => {
          s.settings.reducedMotion = v;
        });
        applyReducedMotion(v);
      }),

      h('h2', { class: 'page-subtitle', text: 'О приложении' }),
      h(
        'dl',
        { class: 'facts' },
        h('dt', { text: 'Версия' }),
        h('dd', { text: __APP_VERSION__ + ' от ' + __BUILD_DATE__ }),
        h('dt', { text: 'Без сети' }),
        h('dd', { text: offline ? 'работает' : 'заработает после первой загрузки собранной версии' }),
      ),
      reset,
    );
  }

  let dirty = true;
  subscribe(() => {
    dirty = true;
    // замечание удалили прямо на этом экране — перерисовать сразу
    if (el.isConnected) {
      render();
      dirty = false;
    }
  });

  return {
    el,
    onShow: () => {
      if (dirty) {
        render();
        dirty = false;
      }
    },
  };
}
