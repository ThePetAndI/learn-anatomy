/**
 * Тест на настоящем контенте курса: файлы проходят проверку, и из них
 * действительно собираются уроки — по всему курсу подряд, как у живого ученика.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  allTerms,
  contentStats,
  getDiagram,
  getPath,
  getRule,
  getTerm,
  lessons,
  rawContent,
  sections,
  termsBefore,
} from '../src/data/content';
import { renderReview, validateContent } from '../src/data/validate';
import { MAX_TASKS, MIN_TASKS, buildLesson, taskCount } from '../src/lesson/build';
import { isCard } from '../src/lesson/types';

const report = validateContent(rawContent);

describe('контент', () => {
  it('проходит проверку без ошибок', () => {
    expect(report.errors).toEqual([]);
  });

  it('без предупреждений', () => {
    expect(report.warnings).toEqual([]);
  });

  it('content/REVIEW.md совпадает с пометками verified', () => {
    const file = readFileSync(new URL('../content/REVIEW.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    expect(file).toBe(renderReview(report.unverified));
  });

  it('первый раздел — устройство кровеносной системы, с уроками', () => {
    expect(sections[0]?.id).toBe('s_circ_overview');
    expect(sections[0]?.lessons.length).toBeGreaterThan(0);
    expect(contentStats().terms).toBeGreaterThanOrEqual(15);
  });

  it('у каждого термина задел на произношение', () => {
    for (const t of allTerms()) expect(t).toHaveProperty('audio');
  });
});

describe('курс собирается урок за уроком', () => {
  // ученик идёт по курсу с нуля: карточки, показанные раньше, второй раз не показываются
  const seen = new Set<string>();

  for (const lesson of lessons) {
    it(lesson.id + ' — ' + lesson.title, () => {
      const list = buildLesson({
        lesson,
        getTerm,
        getRule,
        getDiagram,
        getPath,
        allTerms: allTerms(),
        relationTasks: lesson.relations,
        earlier: termsBefore(lesson),
        seen: (k) => seen.has(k),
        pickReview: (c, n) => c.slice(-n),
        seed: lesson.id + ':0',
      });

      expect(taskCount(list)).toBeGreaterThanOrEqual(MIN_TASKS);
      expect(taskCount(list)).toBeLessThanOrEqual(MAX_TASKS);

      // ничего не спрашиваем вслепую: перед заданием на термин он уже показан карточкой
      for (const ex of list) {
        if (ex.kind === 'rule_card') seen.add('r:' + ex.ruleId);
        else if (ex.kind === 'term_card') seen.add('t:' + ex.termId);
        else for (const id of ex.termIds) expect(seen.has('t:' + id), id + ' спрошен до карточки').toBe(true);
      }

      // каждый новый термин проверяется хотя бы дважды: узнать и вспомнить
      for (const id of lesson.terms) {
        const checks = list.filter((ex) => !isCard(ex) && ex.termIds.includes(id)).length;
        expect(checks, id).toBeGreaterThanOrEqual(2);
      }

      // новый термин ищут на той схеме, что была на его карточке
      for (const ex of list) {
        if ((ex.kind === 'find_on_diagram' || ex.kind === 'name_highlighted') && lesson.terms.includes(ex.termId)) {
          expect(ex.diagramId, ex.termId).toBe(getTerm(ex.termId).diagrams[0]);
        }
      }

      // правила урока показаны перед первым заданием
      for (const r of lesson.rules ?? []) expect(seen.has('r:' + r)).toBe(true);
    });
  }
});

describe('любой раздел можно начать с нуля', () => {
  /*
   * Человек открыл раздел, не пройдя прошлых: ничего ещё не видел. Урок всё
   * равно не должен спрашивать вслепую — пути, повторение и вопросы о связях
   * могут опираться на термины других разделов, и перед каждым таким
   * заданием должна встать карточка.
   */
  for (const section of sections.filter((s) => s.lessons.length > 0)) {
    it(section.id + ' — ' + section.title, () => {
      const seen = new Set<string>();
      for (const lesson of lessons.filter((l) => l.sectionId === section.id)) {
        const list = buildLesson({
          lesson,
          getTerm,
          getRule,
          getDiagram,
          getPath,
          allTerms: allTerms(),
          relationTasks: lesson.relations,
          earlier: termsBefore(lesson),
          seen: (k) => seen.has(k),
          pickReview: () => [],
          seed: lesson.id + ':cold',
        });
        expect(taskCount(list), lesson.id).toBeGreaterThanOrEqual(MIN_TASKS);
        for (const ex of list) {
          if (ex.kind === 'rule_card') seen.add('r:' + ex.ruleId);
          else if (ex.kind === 'term_card') seen.add('t:' + ex.termId);
          else for (const id of ex.termIds) expect(seen.has('t:' + id), lesson.id + ': ' + id).toBe(true);
        }
      }
    });
  }
});
