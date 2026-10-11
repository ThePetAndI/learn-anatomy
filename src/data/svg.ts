/**
 * Разбор SVG схем в дерево — для проверки контента под node, где нет DOMParser.
 * Схемы пишутся руками по строгому формату (см. content/README.md), поэтому
 * хватает простого разбора тегов: без CDATA, без инструкций, без текста кроме <title>.
 *
 * Модуль без зависимостей: его запускает node-скрипт проверки контента.
 */

export interface SvgNode {
  tag: string;
  attrs: Record<string, string>;
  children: SvgNode[];
  /** Текст внутри — нужен только для <title>. */
  text: string;
}

const TAG = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;
const ATTR = /([\w:-]+)\s*=\s*"([^"]*)"/g;

/** Разбирает SVG; при нарушении вложенности бросает ошибку с понятным текстом. */
export function parseSvg(source: string): SvgNode {
  const text = source.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?xml[^>]*\?>/, '');
  const root: SvgNode = { tag: '#root', attrs: {}, children: [], text: '' };
  const stack: SvgNode[] = [root];
  let last = 0;
  TAG.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG.exec(text)) !== null) {
    const between = text.slice(last, m.index);
    const top = stack[stack.length - 1] as SvgNode;
    if (between.includes('<')) throw new Error('не разобран тег около «' + between.trim().slice(0, 40) + '»');
    top.text += between;
    last = TAG.lastIndex;

    const [, closing, tag = '', rawAttrs = '', selfClosing] = m;
    if (closing) {
      const open = stack.pop();
      if (!open || open.tag !== tag) throw new Error('закрыт </' + tag + '>, а открыт <' + (open?.tag ?? '?') + '>');
      continue;
    }
    const attrs: Record<string, string> = {};
    ATTR.lastIndex = 0;
    let a: RegExpExecArray | null;
    while ((a = ATTR.exec(rawAttrs)) !== null) attrs[a[1] as string] = a[2] as string;
    const node: SvgNode = { tag, attrs, children: [], text: '' };
    top.children.push(node);
    if (!selfClosing) stack.push(node);
  }
  if (text.slice(last).includes('<')) throw new Error('не разобран хвост файла');
  if (stack.length !== 1) throw new Error('не закрыт <' + (stack[stack.length - 1] as SvgNode).tag + '>');
  const svg = root.children.find((c) => c.tag === 'svg');
  if (!svg || root.children.length !== 1) throw new Error('в файле должен быть ровно один корневой <svg>');
  return svg;
}

/** Все узлы дерева в порядке документа. */
export function walk(node: SvgNode, fn: (n: SvgNode, parents: readonly SvgNode[]) => void, parents: SvgNode[] = []): void {
  fn(node, parents);
  for (const c of node.children) walk(c, fn, [...parents, node]);
}

export function classesOf(node: SvgNode): string[] {
  return (node.attrs.class ?? '').split(/\s+/).filter((c) => c.length > 0);
}

/** id терминов, которые есть на схеме, без повторов, в порядке появления. */
export function termsInSvg(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/data-term="([^"]+)"/g)) {
    const id = m[1] as string;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** Ширина и высота из viewBox="0 0 W H"; null — если viewBox другой формы. */
export function viewBoxSize(svg: SvgNode): { width: number; height: number } | null {
  const parts = (svg.attrs.viewBox ?? '').trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  if (parts[0] !== 0 || parts[1] !== 0) return null;
  return { width: parts[2] as number, height: parts[3] as number };
}
