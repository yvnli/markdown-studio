export function slugifyHeading(text: string, used: Set<string> = new Set()): string {
  const base =
    text
      .toLowerCase()
      .replace(/[\s\u3000]+/g, '-')
      .replace(/[^\p{L}\p{N}_-]/gu, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'section';
  let candidate = /^\d/.test(base) ? `h-${base}` : base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

export interface OutlineItem {
  id: string;
  text: string;
  level: number;
}

export function extractOutline(markdown: string): OutlineItem[] {
  const used = new Set<string>();
  const items: OutlineItem[] = [];
  let inFence = false;

  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const text = match[2].trim();
    if (!text) continue;
    items.push({
      id: slugifyHeading(text, used),
      text,
      level: match[1].length,
    });
  }
  return items;
}
