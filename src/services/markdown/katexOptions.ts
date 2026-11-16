import type { Options } from 'rehype-katex';

/**
 * KaTeX 的 `strict` 默认是 `'warn'`：数学模式里出现非数学符号（中文、全角标点等）时，
 * 会在控制台打印 `unicodeTextInMathMode` 之类的警告。中文写作里 `$每分钟$` 这种写法很常见，
 * 公式本身能正常渲染，这些警告只是噪音，所以预览与导出统一忽略“非严格”提示。
 *
 * 注意 `strict` 只影响排版规范类提示，不影响真正的语法错误：
 * `$\frac{1}$` 这类错误仍会由 rehype-katex 捕获并输出 `katex-error` 标记。
 */
export const katexOptions: Options = { strict: 'ignore' };
