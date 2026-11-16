import type { Options } from 'rehype-katex';

/**
 * KaTeX defaults `strict` to `'warn'`: when math mode contains non-mathematical symbols
 * (Chinese text, full-width punctuation, and similar), it prints warnings such as
 * `unicodeTextInMathMode` to the console. Writing `$per minute$` in Chinese prose is common,
 * the formula still renders fine, and those warnings are only noise, so preview and export
 * both ignore these non-strict hints.
 *
 * Note that `strict` only affects style-guideline hints, not real syntax errors:
 * mistakes such as `$\frac{1}$` are still caught by rehype-katex and marked `katex-error`.
 */
export const katexOptions: Options = { strict: 'ignore' };
