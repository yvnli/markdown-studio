import type { OutlineItem } from './slug';

export function collectOutline(container: HTMLElement): OutlineItem[] {
  const nodes = Array.from(container.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'));
  return nodes.map((node) => ({
    id: node.id,
    text: node.textContent?.trim() ?? '',
    level: Number(node.tagName.slice(1)),
  })).filter((item) => Boolean(item.id && item.text));
}
