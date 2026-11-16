import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 首屏 chunk 预算（kB），与 Vite 默认的 500 kB 告警线保持一致。
 * 真正影响启动速度的是“入口静态依赖”，所以这条线单独由 initialChunkBudget 插件把关。
 */
const INITIAL_CHUNK_BUDGET_KB = 500;

/**
 * 有两个第三方库是作者预打包好的单文件，任何 chunk 策略都拆不开：
 * - elkjs/lib/elk.bundled.js（压缩后约 1.46 MB，只在渲染 architecture 图时按需加载）
 * - @mermaid-js/parser 的预打包 chunk（约 629 kB，同样按需）
 * 全局阈值必须放宽到它们之上，否则每次构建都会出现无法处理的告警；
 * 作为补偿，initialChunkBudget 会继续按 500 kB 检查首屏静态依赖。
 */
const VENDOR_CHUNK_WARNING_LIMIT = 1600;

/**
 * 从模块 id 中取出包名（含 scope），按包归组，避免脆弱的字符串前缀匹配。
 *
 * 只认最外层的 node_modules：像 `mermaid/node_modules/katex` 这种嵌套副本会归属到
 * 它的父包（mermaid），跟随父包的按需加载路径，而不会被拽进首屏分组。
 */
function packageNameOf(id: string): string {
  const match = id.match(/[\\/]node_modules[\\/](@[^\\/]+[\\/][^\\/]+|[^\\/]+)/);
  return match ? match[1] : '';
}

interface VendorGroup {
  name: string;
  test: (id: string) => boolean;
  priority: number;
}

/**
 * 声明一个 vendor 分组。只需列出“入口包”，rolldown 默认会递归收拢它们的依赖；
 * 已被更高优先级分组拿走的模块不会被重复捕获。
 */
function vendorGroup(name: string, packages: string[], priority: number): VendorGroup {
  const allowed = new Set(packages);
  return {
    name,
    test: (id: string) => allowed.has(packageNameOf(id)),
    priority,
  };
}

/**
 * 分组原则：首屏依赖（React、CodeMirror、状态库）与按需依赖（预览、导出、Mermaid）
 * 严格分开，避免按需加载的库被并进首屏 chunk；同时把体积较大的家族按依赖边界
 * 拆成多个 chunk，而不是继续堆在 manualChunks 里的单个巨型 vendor 里。
 */
const vendorGroups: VendorGroup[] = [
  // 首屏必需：React 运行时、全局状态、图标。
  vendorGroup('vendor-react', ['react', 'react-dom', 'scheduler'], 40),
  vendorGroup('vendor-state', ['zustand', 'idb-keyval'], 40),
  vendorGroup('vendor-icons', ['lucide-react'], 40),
  // CodeMirror 编辑器内核（301 kB）与 Markdown/HTML 语言包（210 kB）分开，
  // 两者都在首屏静态图里，但拆开后每个 chunk 都远离 500 kB 阈值。
  vendorGroup(
    'vendor-codemirror',
    [
      '@codemirror/view',
      '@codemirror/state',
      '@codemirror/language',
      '@codemirror/commands',
      '@codemirror/search',
      '@codemirror/autocomplete',
      '@codemirror/lint',
    ],
    30,
  ),
  vendorGroup(
    'vendor-codemirror-markdown',
    ['@codemirror/lang-markdown', '@lezer/common', '@lezer/highlight', '@lezer/lr', '@lezer/markdown'],
    30,
  ),
  // 预览管线按“解析”（remark/unified，140 kB）与“渲染”（react-markdown/rehype，320 kB）拆分。
  vendorGroup(
    'vendor-markdown-parse',
    ['unified', 'remark-parse', 'remark-gfm', 'remark-math', 'remark-rehype'],
    20,
  ),
  vendorGroup(
    'vendor-markdown-render',
    ['react-markdown', 'rehype-katex', 'rehype-slug', 'rehype-stringify'],
    20,
  ),
  // 代码高亮只在预览里出现代码块时加载。
  vendorGroup('vendor-highlight', ['highlight.js'], 20),
];

const CSP = [
  "default-src 'self' file: data: blob:",
  "script-src 'self' 'unsafe-inline' file:",
  "style-src 'self' 'unsafe-inline' file:",
  "img-src 'self' file: data: blob: https:",
  "font-src 'self' file: data: https://cdn.jsdelivr.net",
  "connect-src 'self' file: https://cdn.jsdelivr.net",
  "worker-src 'self' file: blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

/**
 * 只在生产构建注入 CSP：Vite dev server 的 HMR 与 React Refresh 依赖内联脚本/WebSocket，
 * 静态 meta 会破坏开发模式。Electron 与 Web 生产包都会带上这份策略。
 */
function contentSecurityPolicy() {
  return {
    name: 'markdown-studio-csp',
    apply: 'build' as const,
    transformIndexHtml(html: string) {
      return html.replace(
        '</head>',
        `    <meta http-equiv="Content-Security-Policy" content="${CSP}" />\n  </head>`,
      );
    },
  };
}

/**
 * 首屏预算守卫。
 *
 * Vite 自带的告警会把“按需加载的 Mermaid 引擎”和“首屏代码”放在同一把尺子下，
 * 而预打包的 elk.bundled.js 永远超过 500 kB。这里只沿着入口的静态 import 走一遍，
 * 对真正会被首屏请求的 chunk 重新施加 500 kB 预算：首屏变大时依旧会告警，
 * 惰性加载的图表/导出引擎则不会制造噪音。
 */
function initialChunkBudget(): Plugin {
  return {
    name: 'markdown-studio-initial-chunk-budget',
    apply: 'build',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).flatMap((output) =>
        output.type === 'chunk' ? [output] : [],
      );
      const byFileName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));

      // 首屏 = 入口 chunk 沿静态 import 能到达的全部 chunk（Vite 会为它们注入 modulepreload）。
      const initial = new Set<string>();
      const collect = (fileName: string) => {
        if (initial.has(fileName)) return;
        const chunk = byFileName.get(fileName);
        if (!chunk) return;
        initial.add(fileName);
        chunk.imports.forEach(collect);
      };
      for (const chunk of chunks) {
        if (chunk.isEntry) collect(chunk.fileName);
      }

      const oversized = [...initial]
        .flatMap((fileName) => {
          const chunk = byFileName.get(fileName);
          return chunk ? [{ fileName, size: Buffer.byteLength(chunk.code) }] : [];
        })
        .filter((chunk) => chunk.size > INITIAL_CHUNK_BUDGET_KB * 1000)
        .sort((a, b) => b.size - a.size);

      if (oversized.length === 0) return;
      this.warn(
        `首屏 chunk 超过 ${INITIAL_CHUNK_BUDGET_KB} kB 预算：\n` +
          oversized.map((c) => `  ${c.fileName} — ${(c.size / 1000).toFixed(1)} kB`).join('\n') +
          '\n请把非必要的依赖改成动态 import，或确认它确实必须同步加载。',
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), contentSecurityPolicy(), initialChunkBudget()],
  base: './',
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4174,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    // 放宽只是因为上面提到的两个预打包单文件；首屏预算由 initialChunkBudget 单独把关。
    chunkSizeWarningLimit: VENDOR_CHUNK_WARNING_LIMIT,
    rolldownOptions: {
      output: {
        // 用 codeSplitting.groups 取代已废弃的 manualChunks（Vite 8 / rolldown）。
        codeSplitting: {
          groups: vendorGroups,
        },
      },
    },
  },
});
