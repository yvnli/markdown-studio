import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Initial chunk budget (kB), aligned with Vite's default 500 kB warning threshold.
 * What actually affects startup time is the "static entry dependencies", so this
 * threshold is enforced separately by the initialChunkBudget plugin.
 */
const INITIAL_CHUNK_BUDGET_KB = 500;

/**
 * Two third-party libraries are shipped by their authors as pre-bundled single files
 * that no chunking strategy can split:
 * - elkjs/lib/elk.bundled.js (about 1.46 MB minified, loaded on demand only when rendering
 *   the architecture diagram)
 * - the pre-bundled @mermaid-js/parser chunk (about 629 kB, also on demand)
 * The global threshold must be raised above them, or every build emits warnings we cannot
 * resolve. As compensation, initialChunkBudget keeps enforcing the 500 kB budget on
 * initial static dependencies.
 */
const VENDOR_CHUNK_WARNING_LIMIT = 1600;

/**
 * Extract the package name (including scope) from a module id and group by package,
 * avoiding fragile string-prefix matching.
 *
 * Only the outermost node_modules counts: a nested copy such as
 * `mermaid/node_modules/katex` belongs to its parent package (mermaid) and follows the
 * parent's on-demand path instead of being pulled into an initial group.
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
 * Declare a vendor group. List only the "entry packages"; rolldown collects their
 * dependencies recursively by default, and modules already claimed by a higher-priority
 * group are not captured again.
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
 * Grouping principle: keep initial dependencies (React, CodeMirror, state libraries)
 * strictly separate from on-demand dependencies (preview, export, Mermaid) so lazily
 * loaded libraries are not merged into initial chunks. Split large families into several
 * chunks along dependency boundaries instead of piling them into one giant vendor chunk
 * in manualChunks.
 */
const vendorGroups: VendorGroup[] = [
  // Required for the initial screen: React runtime, global state, icons.
  vendorGroup('vendor-react', ['react', 'react-dom', 'scheduler'], 40),
  vendorGroup('vendor-state', ['zustand', 'idb-keyval'], 40),
  vendorGroup('vendor-icons', ['lucide-react'], 40),
  // Keep the CodeMirror editor core (301 kB) separate from the Markdown/HTML language
  // packages (210 kB); both are in the initial static graph, but once split apart each
  // chunk stays well under the 500 kB threshold.
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
  // Split the preview pipeline into parsing (remark/unified, 140 kB) and rendering
  // (react-markdown/rehype, 320 kB).
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
  // Syntax highlighting loads only when the preview contains a code block.
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
 * Inject CSP only in production builds: the Vite dev server's HMR and React Refresh rely on
 * inline scripts and WebSockets, and a static meta tag would break dev mode. Both the
 * Electron and web production bundles carry this policy.
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
 * Initial chunk budget guard.
 *
 * Vite's built-in warning measures the on-demand Mermaid engine and the initial code with
 * the same ruler, while the pre-bundled elk.bundled.js is always over 500 kB. This walks
 * only the static imports from the entry and reapplies the 500 kB budget to the chunks
 * actually requested on the initial screen: it still warns when the initial payload grows,
 * while lazily loaded diagram and export engines add no noise.
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

      // Initial = every chunk reachable from the entry chunk along static imports (Vite
      // injects modulepreload for them).
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
        `Initial chunk exceeds the ${INITIAL_CHUNK_BUDGET_KB} kB budget:\n` +
          oversized.map((c) => `  ${c.fileName} — ${(c.size / 1000).toFixed(1)} kB`).join('\n') +
          '\nMake non-essential dependencies dynamic imports, or confirm they truly must load synchronously.',
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
    // Raised only because of the two pre-bundled single files mentioned above; the initial
    // budget is enforced separately by initialChunkBudget.
    chunkSizeWarningLimit: VENDOR_CHUNK_WARNING_LIMIT,
    rolldownOptions: {
      output: {
        // Use codeSplitting.groups instead of the deprecated manualChunks (Vite 8 / rolldown).
        codeSplitting: {
          groups: vendorGroups,
        },
      },
    },
  },
});
