export interface FindOptions {
  query: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
}

export interface FindMatch {
  from: number;
  to: number;
}

export interface FindResult {
  matches: FindMatch[];
  error: string | null;
  truncated: boolean;
}

export interface ReplaceAllResult {
  content: string;
  count: number;
  error: string | null;
  truncated: boolean;
}

export const DEFAULT_FIND_LIMIT = 5000;
export const DEFAULT_REPLACE_LIMIT = 20000;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compile(
  options: FindOptions,
  global: boolean,
): { regexp: RegExp | null; error: string | null } {
  const { query } = options;
  if (!query) return { regexp: null, error: null };
  let source = options.regex ? query : escapeRegExp(query);
  if (options.wholeWord) {
    source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`;
  }
  const flags = `${global ? 'g' : ''}u${options.caseSensitive ? '' : 'i'}`;
  try {
    return { regexp: new RegExp(source, flags), error: null };
  } catch (error) {
    return {
      regexp: null,
      error: error instanceof Error ? error.message : 'Invalid regular expression.',
    };
  }
}

/**
 * Finds every match of `query` inside `text` and returns UTF-16 offsets that
 * CodeMirror can consume directly. Zero-width regex matches are skipped so the
 * editor never receives empty highlights.
 */
export function findMatches(
  text: string,
  options: FindOptions,
  limit: number = DEFAULT_FIND_LIMIT,
): FindResult {
  const { regexp, error } = compile(options, true);
  if (error) return { matches: [], error, truncated: false };
  if (!regexp || !text) return { matches: [], error: null, truncated: false };

  const matches: FindMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = regexp.exec(text)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    if (match[0].length === 0) {
      regexp.lastIndex = from + 1;
      continue;
    }
    matches.push({ from, to });
    if (matches.length >= limit) {
      return { matches, error: null, truncated: true };
    }
  }
  return { matches, error: null, truncated: false };
}

/**
 * Expands `$1`, `$<name>`, `$&` and `$$` for regular-expression replacement.
 * In plain text mode the replacement is kept literal, matching VS Code behaviour.
 */
export function replacementForMatch(
  text: string,
  match: FindMatch,
  options: FindOptions,
  replacement: string,
): string {
  if (!options.regex || !replacement) return replacement;
  const { regexp } = compile(options, true);
  if (!regexp) return replacement;
  regexp.lastIndex = match.from;
  const found = regexp.exec(text);
  if (!found || found.index !== match.from) return replacement;
  return expandReplacement(replacement, found, text);
}

function expandReplacement(template: string, match: RegExpExecArray, input: string): string {
  return template.replace(
    /\$(\$|&|`|'|<([^>]+)>|\d{1,2})/g,
    (token: string, pattern: string, name?: string) => {
      if (pattern === '$') return '$';
      if (pattern === '&') return match[0];
      if (pattern === '`') return input.slice(0, match.index);
      if (pattern === "'") return input.slice(match.index + match[0].length);
      if (name) {
        const groups = match.groups;
        return groups && Object.prototype.hasOwnProperty.call(groups, name)
          ? (groups[name] ?? '')
          : token;
      }
      const index = Number(pattern);
      if (index > 0 && index < match.length) return match[index] ?? '';
      if (pattern.length === 2) {
        const first = Number(pattern[0]);
        if (first > 0 && first < match.length) return `${match[first] ?? ''}${pattern[1]}`;
      }
      return token;
    },
  );
}

export function replaceAllMatches(
  text: string,
  options: FindOptions,
  replacement: string,
  limit: number = DEFAULT_REPLACE_LIMIT,
): ReplaceAllResult {
  const result = findMatches(text, options, limit);
  if (result.error) {
    return { content: text, count: 0, error: result.error, truncated: false };
  }
  if (!result.matches.length) {
    return { content: text, count: 0, error: null, truncated: result.truncated };
  }

  let cursor = 0;
  let output = '';
  for (const match of result.matches) {
    output += text.slice(cursor, match.from);
    output += replacementForMatch(text, match, options, replacement);
    cursor = match.to;
  }
  output += text.slice(cursor);
  return {
    content: output,
    count: result.matches.length,
    error: null,
    truncated: result.truncated,
  };
}
