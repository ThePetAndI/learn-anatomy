/**
 * Проверка контента курса. Чистая функция: на вход — содержимое файлов,
 * на выход — ошибки, предупреждения и список непроверенного.
 *
 * Запускается в двух местах: тестом (tests/content.test.ts) и скриптом
 * перед сборкой (scripts/validate-content.ts). Скрипт идёт под node без
 * сборщика, поэтому импорты здесь — только с расширением .ts.
 */

import { areConfusable } from '../domain/confusable.ts';
import { classesOf, parseSvg, viewBoxSize, walk, type SvgNode } from './svg.ts';
import {
  BODY_SYSTEMS,
  RELATION_KEYS,
  TERM_KINDS,
  type RawContent,
} from './types.ts';

export interface ValidationReport {
  errors: string[];
  warnings: string[];
  /** Всё с verified: false — уходит в content/REVIEW.md. */
  unverified: { id: string; what: string; note: string }[];
}

/** Самый маленький и самый большой урок по числу новых терминов. */
export const LESSON_MIN_NEW = 3;
export const LESSON_MAX_NEW = 5;
/** Звеньев в пути: меньше трёх — не путь, больше семи — не помещается на экране. */
export const PATH_MIN_STEPS = 3;
export const PATH_MAX_STEPS = 7;
/** Больше этого — уже ошибка, а не предупреждение. */
const LESSON_HARD_MAX_NEW = 6;

const EN_RE = /^[A-Za-z][A-Za-z' -]*[A-Za-z]$/;
const RU_RE = /^[А-Яа-яЁё][А-Яа-яЁё ,-]*[А-Яа-яЁё]$/;

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isStr(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isStrArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

export function validateContent(raw: RawContent): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const unverified: ValidationReport['unverified'] = [];

  /* ——————————————————————————— термины ——————————————————————————— */

  interface Checked {
    id: string;
    en: string;
    ru: string;
    file: string;
    confusableWith?: string[];
    relations: Obj;
  }
  const terms = new Map<string, Checked>();
  const diagramSet = new Set(raw.diagrams.map((d) => d.id));
  /** Какие схемы термин называет у себя в diagrams — сверяется со схемами ниже. */
  const declared = new Map<string, string[]>();

  for (const { file, data } of raw.termFiles) {
    if (!isObj(data) || !Array.isArray(data.terms)) {
      errors.push(file + ': ожидается объект { "terms": [...] }');
      continue;
    }
    data.terms.forEach((t: unknown, i: number) => {
      const where = file + ' #' + i;
      if (!isObj(t)) {
        errors.push(where + ': термин должен быть объектом');
        return;
      }
      const id = typeof t.id === 'string' ? t.id : '';
      const at = file + ' ' + (id || '#' + i);
      if (!/^t_[a-z0-9_]+$/.test(id)) errors.push(at + ': id должен иметь вид t_slug');
      else if (terms.has(id)) errors.push(at + ': id уже занят в ' + terms.get(id)?.file);

      const en = typeof t.en === 'string' ? t.en : '';
      const ru = typeof t.ru === 'string' ? t.ru : '';
      checkEn(at, 'en', en);
      checkRu(at, 'ru', ru);

      if (t.also !== undefined) {
        if (!isObj(t.also)) errors.push(at + ': also — объект { en?: [], ru?: [] }');
        else {
          for (const key of Object.keys(t.also)) {
            if (key !== 'en' && key !== 'ru') errors.push(at + ': also.' + key + ' — лишнее поле');
          }
          if (t.also.en !== undefined) {
            if (!isStrArray(t.also.en)) errors.push(at + ': also.en — список строк');
            else t.also.en.forEach((s) => checkEn(at, 'also.en', s));
          }
          if (t.also.ru !== undefined) {
            if (!isStrArray(t.also.ru)) errors.push(at + ': also.ru — список строк');
            else t.also.ru.forEach((s) => checkRu(at, 'also.ru', s));
          }
        }
      }
      if (t.plural !== undefined) checkEn(at, 'plural', typeof t.plural === 'string' ? t.plural : '');

      if (!TERM_KINDS.includes(t.kind as never)) {
        errors.push(at + ': kind — одно из ' + TERM_KINDS.join(', '));
      }
      if (!BODY_SYSTEMS.includes(t.system as never)) {
        errors.push(at + ': system — одно из ' + BODY_SYSTEMS.join(', '));
      }

      if (!isStr(t.about)) errors.push(at + ': about пустое');
      else {
        if (!/[.!?»]$/.test(t.about.trim())) errors.push(at + ': about должно кончаться точкой');
        if (t.about.length > 320) warnings.push(at + ': about длиннее 320 знаков — карточка станет стеной текста');
      }

      if (!isObj(t.relations)) errors.push(at + ': relations — объект (может быть пустым {})');
      if (!isStrArray(t.diagrams)) errors.push(at + ': diagrams — список id схем');
      else {
        for (const d of t.diagrams) {
          if (!diagramSet.has(d)) errors.push(at + ': схемы ' + d + ' нет в content/diagrams');
        }
        if (id) declared.set(id, t.diagrams);
      }
      if (t.audio !== null && typeof t.audio !== 'string') errors.push(at + ': audio — null или путь к файлу');
      if (!isStr(t.source)) errors.push(at + ': source пустое — откуда взят термин?');
      if (typeof t.verified !== 'boolean') errors.push(at + ': verified — true или false');
      if (t.note !== undefined && typeof t.note !== 'string') errors.push(at + ': note — строка');
      if (t.verified === false) {
        if (!isStr(t.note)) errors.push(at + ': verified: false требует пояснения в note');
        unverified.push({ id, what: en + ' — ' + ru, note: typeof t.note === 'string' ? t.note : '' });
      }
      if (t.confusableWith !== undefined && !isStrArray(t.confusableWith)) {
        errors.push(at + ': confusableWith — список id терминов');
      }

      const known = new Set(['id', 'en', 'ru', 'also', 'plural', 'kind', 'system', 'confusableWith',
        'about', 'relations', 'diagrams', 'audio', 'source', 'verified', 'note']);
      for (const key of Object.keys(t)) {
        if (!known.has(key)) errors.push(at + ': неизвестное поле ' + key);
      }

      if (id && !terms.has(id)) {
        terms.set(id, {
          id,
          en,
          ru,
          file,
          confusableWith: isStrArray(t.confusableWith) ? t.confusableWith : undefined,
          relations: isObj(t.relations) ? t.relations : {},
        });
      }
    });
  }

  function checkEn(at: string, field: string, value: string): void {
    if (!EN_RE.test(value) || /\s{2,}/.test(value)) {
      errors.push(at + ': ' + field + ' — латиница, пробелы, дефис: «' + value + '»');
    }
  }

  function checkRu(at: string, field: string, value: string): void {
    if (!RU_RE.test(value) || /\s{2,}/.test(value)) {
      errors.push(at + ': ' + field + ' — кириллица, пробелы, дефис: «' + value + '»');
    }
  }

  // ссылки между терминами
  const ruSeen = new Map<string, string>();
  const enSeen = new Map<string, string>();
  for (const t of terms.values()) {
    const at = t.file + ' ' + t.id;
    for (const [key, value] of Object.entries(t.relations)) {
      if (!RELATION_KEYS.includes(key as never)) {
        errors.push(at + ': relations.' + key + ' — неизвестная связь');
        continue;
      }
      const refs = value === null ? [] : typeof value === 'string' ? [value] : isStrArray(value) ? value : null;
      if (refs === null) {
        errors.push(at + ': relations.' + key + ' — id термина или список id');
        continue;
      }
      for (const ref of refs) {
        if (ref === t.id) errors.push(at + ': relations.' + key + ' ссылается сам на себя');
        else if (!terms.has(ref)) errors.push(at + ': relations.' + key + ' → ' + ref + ' — такого термина нет');
      }
    }
    for (const ref of t.confusableWith ?? []) {
      if (!terms.has(ref)) errors.push(at + ': confusableWith → ' + ref + ' — такого термина нет');
    }
    // одинаковый перевод сделал бы задания неоднозначными
    const enKey = t.en.toLowerCase();
    const ruKey = t.ru.toLowerCase();
    if (enSeen.has(enKey)) errors.push(at + ': en «' + t.en + '» уже есть у ' + enSeen.get(enKey));
    else enSeen.set(enKey, t.id);
    if (ruSeen.has(ruKey)) errors.push(at + ': ru «' + t.ru + '» уже есть у ' + ruSeen.get(ruKey));
    else ruSeen.set(ruKey, t.id);
  }

  /* ——————————————————————————— схемы ——————————————————————————— */

  for (const d of raw.diagrams) {
    const at = 'diagrams/' + d.id + '.svg';
    const report = validateDiagram(d.id, d.svg, (id) => terms.has(id));
    for (const e of report.errors) errors.push(at + ': ' + e);
    // термин на схеме ⇔ схема в его diagrams
    for (const id of report.terms) {
      if (terms.has(id) && !(declared.get(id) ?? []).includes(d.id)) {
        errors.push(at + ': ' + id + ' есть на схеме, но схемы нет в его diagrams');
      }
    }
    for (const [id, list] of declared) {
      if (list.includes(d.id) && !report.terms.includes(id)) {
        errors.push(at + ': у ' + id + ' в diagrams указана эта схема, но на ней нет data-term="' + id + '"');
      }
    }
  }

  /* ——————————————————————————— правила ——————————————————————————— */

  const rules = new Set<string>();
  if (!isObj(raw.rules) || !Array.isArray(raw.rules.rules)) {
    errors.push('rules.json: ожидается объект { "rules": [...] }');
  } else {
    raw.rules.rules.forEach((r: unknown, i: number) => {
      if (!isObj(r)) {
        errors.push('rules.json #' + i + ': правило должно быть объектом');
        return;
      }
      const id = typeof r.id === 'string' ? r.id : '';
      const at = 'rules.json ' + (id || '#' + i);
      if (!/^r_[a-z0-9_]+$/.test(id)) errors.push(at + ': id должен иметь вид r_slug');
      else if (rules.has(id)) errors.push(at + ': id повторяется');
      else rules.add(id);
      if (!isStr(r.title)) errors.push(at + ': title пустое');
      if (!isStr(r.body)) errors.push(at + ': body пустое');
      if (!Array.isArray(r.examples) || !r.examples.every((e) => isObj(e) && isStr(e.en) && isStr(e.ru))) {
        errors.push(at + ': examples — список { en, ru }');
      }
      if (!isStr(r.source)) errors.push(at + ': source пустое');
      if (typeof r.verified !== 'boolean') errors.push(at + ': verified — true или false');
      if (r.verified === false) {
        if (!isStr(r.note)) errors.push(at + ': verified: false требует пояснения в note');
        unverified.push({ id, what: 'правило «' + String(r.title) + '»', note: typeof r.note === 'string' ? r.note : '' });
      }
    });
  }

  /* ——————————————————————————— пути ——————————————————————————— */

  const paths = new Map<string, string[]>();
  if (!isObj(raw.paths) || !Array.isArray(raw.paths.paths)) {
    errors.push('paths.json: ожидается объект { "paths": [...] }');
  } else {
    raw.paths.paths.forEach((pth: unknown, i: number) => {
      if (!isObj(pth)) {
        errors.push('paths.json #' + i + ': путь должен быть объектом');
        return;
      }
      const id = typeof pth.id === 'string' ? pth.id : '';
      const at = 'paths.json ' + (id || '#' + i);
      if (!/^p_[a-z0-9_]+$/.test(id)) errors.push(at + ': id должен иметь вид p_slug');
      else if (paths.has(id)) errors.push(at + ': id повторяется');
      if (!isStr(pth.title)) errors.push(at + ': title пустое');
      if (!isStrArray(pth.steps)) {
        errors.push(at + ': steps — список id терминов по порядку');
        return;
      }
      if (pth.steps.length < PATH_MIN_STEPS || pth.steps.length > PATH_MAX_STEPS) {
        errors.push(at + ': звеньев ' + pth.steps.length + ' — нужно от ' + PATH_MIN_STEPS + ' до ' + PATH_MAX_STEPS);
      }
      if (new Set(pth.steps).size !== pth.steps.length) errors.push(at + ': звено повторяется');
      for (const step of pth.steps) if (!terms.has(step)) errors.push(at + ': термина ' + step + ' нет');
      if (!isStr(pth.source)) errors.push(at + ': source пустое');
      if (typeof pth.verified !== 'boolean') errors.push(at + ': verified — true или false');
      if (pth.verified === false) {
        if (!isStr(pth.note)) errors.push(at + ': verified: false требует пояснения в note');
        unverified.push({ id, what: 'путь «' + String(pth.title) + '»', note: typeof pth.note === 'string' ? pth.note : '' });
      }
      if (id) paths.set(id, pth.steps);
    });
  }

  /* ——————————————————————————— курс ——————————————————————————— */

  const introducedIn = new Map<string, string>();
  const usedPaths = new Set<string>();
  const usedRules = new Set<string>();
  const sectionIds = new Set<string>();
  const lessonIds = new Set<string>();

  if (!isObj(raw.course) || !Array.isArray(raw.course.sections)) {
    errors.push('course.json: ожидается объект { "sections": [...] }');
  } else {
    raw.course.sections.forEach((s: unknown, si: number) => {
      if (!isObj(s)) {
        errors.push('course.json раздел #' + si + ': должен быть объектом');
        return;
      }
      const sid = typeof s.id === 'string' ? s.id : '';
      const sat = 'course.json ' + (sid || 'раздел #' + si);
      if (!/^s_[a-z0-9_]+$/.test(sid)) errors.push(sat + ': id раздела должен иметь вид s_slug');
      else if (sectionIds.has(sid)) errors.push(sat + ': id раздела повторяется');
      else sectionIds.add(sid);
      if (s.system !== 'circulatory' && s.system !== 'nervous') errors.push(sat + ': system — circulatory или nervous');
      if (!isStr(s.title)) errors.push(sat + ': title пустое');
      if (s.relations !== undefined && typeof s.relations !== 'boolean') errors.push(sat + ': relations — true или false');
      if (!Array.isArray(s.lessons)) {
        errors.push(sat + ': lessons — список уроков');
        return;
      }

      s.lessons.forEach((l: unknown, li: number) => {
        if (!isObj(l)) {
          errors.push(sat + ' урок #' + li + ': должен быть объектом');
          return;
        }
        const lid = typeof l.id === 'string' ? l.id : '';
        const at = 'course.json ' + (lid || sid + ' урок #' + li);
        if (!/^l_[a-z0-9_]+$/.test(lid)) errors.push(at + ': id урока должен иметь вид l_slug');
        else if (lessonIds.has(lid)) errors.push(at + ': id урока повторяется');
        else lessonIds.add(lid);
        if (!isStr(l.title)) errors.push(at + ': title пустое');

        const fresh = isStrArray(l.terms) ? l.terms : null;
        if (fresh === null) {
          errors.push(at + ': terms — список id новых терминов (может быть пустым)');
          return;
        }
        const review = l.review === undefined ? [] : isStrArray(l.review) ? l.review : null;
        if (review === null) errors.push(at + ': review — список id');

        if (fresh.length > LESSON_HARD_MAX_NEW) {
          errors.push(at + ': ' + fresh.length + ' новых терминов — больше ' + LESSON_HARD_MAX_NEW + ' в уроке не бывает');
        } else if (fresh.length > LESSON_MAX_NEW || (fresh.length > 0 && fresh.length < LESSON_MIN_NEW)) {
          warnings.push(at + ': ' + fresh.length + ' новых терминов — обычно ' + LESSON_MIN_NEW + '–' + LESSON_MAX_NEW);
        }
        if (fresh.length === 0 && (review ?? []).length === 0) {
          errors.push(at + ': в уроке нет ни новых терминов, ни повторения');
        }

        for (const id of fresh) {
          if (!terms.has(id)) errors.push(at + ': термина ' + id + ' нет');
          else if (introducedIn.has(id)) errors.push(at + ': ' + id + ' уже вводился в ' + introducedIn.get(id));
        }
        // повторять можно только знакомое: ничего не спрашиваем вслепую
        for (const id of review ?? []) {
          if (!terms.has(id)) errors.push(at + ': review → ' + id + ' — такого термина нет');
          else if (!introducedIn.has(id)) errors.push(at + ': review → ' + id + ' ещё не вводился в прошлых уроках');
        }
        for (let i = 0; i < fresh.length; i++) {
          for (let j = i + 1; j < fresh.length; j++) {
            const a = terms.get(fresh[i] as string);
            const b = terms.get(fresh[j] as string);
            if (a && b && areConfusable(a, b)) {
              errors.push(at + ': похожие термины в одном уроке — ' + a.en + ' / ' + b.en + '. Разнесите по разным урокам');
            }
          }
        }
        for (const id of fresh) if (terms.has(id) && !introducedIn.has(id)) introducedIn.set(id, lid);

        // путь можно расставить, только когда знакомы все его звенья
        if (l.paths !== undefined) {
          if (!isStrArray(l.paths)) errors.push(at + ': paths — список id путей');
          else {
            for (const pid of l.paths) {
              const steps = paths.get(pid);
              if (!steps) {
                errors.push(at + ': пути ' + pid + ' нет');
                continue;
              }
              usedPaths.add(pid);
              for (const step of steps) {
                if (terms.has(step) && !introducedIn.has(step)) {
                  errors.push(at + ': путь ' + pid + ' — звено ' + step + ' к этому уроку ещё не вводилось');
                }
              }
            }
          }
        }

        if (l.rules !== undefined) {
          if (!isStrArray(l.rules)) errors.push(at + ': rules — список id правил');
          else {
            for (const r of l.rules) {
              if (!rules.has(r)) errors.push(at + ': правила ' + r + ' нет');
              usedRules.add(r);
            }
          }
        }
      });
    });
  }

  for (const t of terms.values()) {
    if (!introducedIn.has(t.id)) warnings.push(t.file + ' ' + t.id + ': термин не вводится ни в одном уроке');
  }
  for (const r of rules) {
    if (!usedRules.has(r)) warnings.push('rules.json ' + r + ': правило не показывается ни в одном уроке');
  }
  for (const pid of paths.keys()) {
    if (!usedPaths.has(pid)) warnings.push('paths.json ' + pid + ': путь не даётся ни в одном уроке');
  }

  return { errors, warnings, unverified };
}

/* ——————————————————————————— формат схемы ——————————————————————————— */

/**
 * Ширина, на которой схема показывается в полный рост на телефоне:
 * 375 px экрана минус поля по 20 px. По ней пересчитываются 44 px зоны нажатия
 * в единицы viewBox.
 */
export const PHONE_DIAGRAM_WIDTH = 335;
export const MIN_TAP_PX = 44;

/** Наименьшая зона нажатия в единицах viewBox схемы такой ширины. */
export function minHitUnits(viewBoxWidth: number): number {
  return (MIN_TAP_PX * viewBoxWidth) / PHONE_DIAGRAM_WIDTH;
}

/** Классы оформления схем; цвета к ним — в src/styles/diagram.css. */
export const DIAGRAM_CLASSES: ReadonlySet<string> = new Set([
  'bed', 'cap', 'organ', 'muscle', 'apex', 'septum', 'cavity-oxy', 'cavity-deoxy',
  'vessel-oxy', 'vessel-deoxy', 'valve', 'valve-ring', 'hit', 'hit-area',
  'outline', 'landmark', 'groove', 'node', 'conduct', 'behind', 'tube', 'line',
  'nerve', 'ring', 'zone-1', 'zone-2', 'zone-3',
]);

const DIAGRAM_TAGS = new Set(['svg', 'title', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const DIAGRAM_ATTRS = new Set([
  'xmlns', 'viewBox', 'data-diagram', 'data-term', 'data-hit', 'class', 'd', 'x', 'y', 'width',
  'height', 'rx', 'ry', 'cx', 'cy', 'r', 'points', 'x1', 'y1', 'x2', 'y2', 'stroke-width',
]);

export interface DiagramReport {
  errors: string[];
  /** Термины на схеме по порядку появления. */
  terms: string[];
}

/**
 * Проверка одной схемы. Цвет и толщину контура задаёт приложение по классам,
 * поэтому в файле нет ни цветов, ни стилей, ни текста: подписи на двух языках
 * берутся из контента.
 */
export function validateDiagram(id: string, source: string, termExists: (id: string) => boolean): DiagramReport {
  const errors: string[] = [];
  const found: string[] = [];
  let svg: SvgNode;
  try {
    svg = parseSvg(source);
  } catch (e) {
    return { errors: ['не разбирается: ' + (e as Error).message], terms: [] };
  }
  if (svg.attrs['data-diagram'] !== id) errors.push('у корня нужен data-diagram="' + id + '" — как имя файла');
  const size = viewBoxSize(svg);
  if (!size) errors.push('viewBox должен иметь вид "0 0 ширина высота"');
  const minHit = minHitUnits(size?.width ?? 0);
  const title = svg.children.find((c) => c.tag === 'title');
  if (!title || title.text.trim() === '') errors.push('нужен непустой <title> — название схемы');

  walk(svg, (node, parents) => {
    const where = '<' + node.tag + (node.attrs['data-term'] ? ' ' + node.attrs['data-term'] : '') + '>';
    if (!DIAGRAM_TAGS.has(node.tag)) errors.push(where + ': такой тег в схеме не используется');
    for (const a of Object.keys(node.attrs)) {
      if (!DIAGRAM_ATTRS.has(a)) errors.push(where + ': атрибут ' + a + ' не используется — цвет и стиль задаются классами');
    }
    for (const c of classesOf(node)) {
      if (!DIAGRAM_CLASSES.has(c)) errors.push(where + ': неизвестный класс ' + c);
    }

    const cls = classesOf(node);
    if (cls.includes('hit') && !cls.includes('hit-area')) {
      const w = Number(node.attrs['stroke-width']);
      if (!(w >= minHit)) {
        errors.push(where + ': зона нажатия ' + (node.attrs['stroke-width'] ?? '—') + ' — нужно не меньше ' + Math.ceil(minHit) + ' (44 px на телефоне)');
      }
    }
    if (cls.includes('hit-area')) {
      const r = Number(node.attrs.r);
      const w = node.tag === 'circle' ? 2 * r : Number(node.attrs.width);
      const h = node.tag === 'circle' ? 2 * r : Number(node.attrs.height);
      if (!(w >= minHit && h >= minHit)) {
        errors.push(where + ': площадь нажатия меньше ' + Math.ceil(minHit) + ' по одной из сторон');
      }
    }

    const term = node.attrs['data-term'];
    if (term !== undefined) {
      if (node.tag !== 'g') errors.push(where + ': data-term ставится на группу <g>');
      if (!termExists(term)) errors.push(where + ': термина ' + term + ' нет');
      else if (!found.includes(term)) found.push(term);
      const own = node.children.filter((c) => c.attrs['data-term'] === undefined);
      const nested = node.children.some((c) => c.attrs['data-term'] !== undefined);
      const visible = own.filter((c) => !classesOf(c).includes('hit'));
      const hasHit = node.attrs['data-hit'] === 'area' || own.some((c) => classesOf(c).includes('hit'));
      /*
       * Группа-контейнер — аорта из восходящей части, дуги и нисходящей —
       * может не иметь своей фигуры: её подсветка — это подсветка частей.
       */
      if (visible.length === 0 && !nested) errors.push(where + ': нет видимой фигуры — подсвечивать будет нечего');
      if (visible.length > 0 && !hasHit) errors.push(where + ': нужна зона нажатия — элемент class="hit" или data-hit="area" у группы');
      if (parents.some((p) => p.attrs['data-term'] === term)) errors.push(where + ': вложен сам в себя');
    }
    if (node.attrs['data-hit'] !== undefined && node.attrs['data-hit'] !== 'area') {
      errors.push(where + ': data-hit бывает только "area"');
    }
  });

  return { errors, terms: found };
}

/** Текст content/REVIEW.md по списку непроверенного. */
export function renderReview(unverified: ValidationReport['unverified']): string {
  const lines = [
    '# На проверку',
    '',
    'Всё, что помечено `"verified": false`. Файл собирает `npm run review` — руками не править:',
    'исправьте термин или правило и снимите пометку, строка уйдёт сама.',
    '',
  ];
  if (unverified.length === 0) {
    lines.push('Сейчас непроверенного нет.', '');
  } else {
    lines.push('| id | что | в чём сомнение |', '|---|---|---|');
    for (const u of unverified) {
      lines.push('| `' + u.id + '` | ' + u.what + ' | ' + u.note.replace(/\|/g, '\\|') + ' |');
    }
    lines.push('');
  }
  return lines.join('\n');
}
