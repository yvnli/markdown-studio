import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type {
  Blockquote,
  Code,
  Heading,
  List,
  ListItem,
  Paragraph as MdParagraph,
  PhrasingContent,
  Root,
  RootContent,
  Table as MdTable,
  TableCell as MdTableCell,
  TableRow as MdTableRow,
} from 'mdast';
import type { ExportRequest, ExportResult } from '../../types/export';
import { safeFilename } from '../../utils/download';

type DocxChild = Paragraph | Table | TableOfContents;

type InlineStyle = {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  code?: boolean;
};

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

export async function createDocxExport(request: ExportRequest): Promise<ExportResult> {
  const { markdown, title, options } = request;
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(markdown) as Root;
  const children: DocxChild[] = [];

  if (options.includeToc) {
    children.push(
      new TableOfContents('目录', {
        hyperlink: true,
        headingStyleRange: '1-3',
      }),
    );
  }

  for (const node of tree.children) {
    children.push(...blockToDocx(node, 0));
  }

  const document = new Document({
    creator: 'Markdown studio',
    title,
    description: 'Exported from Markdown studio',
    styles: {
      default: {
        document: {
          run: {
            font: 'Aptos',
            size: 22,
            color: '1D1D1F',
          },
          paragraph: {
            spacing: { line: 320, after: 130 },
          },
        },
      },
    },
    sections: [
      {
        properties: {},
        headers: options.includeHeader
          ? {
              default: new Header({
                children: [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [
                      new TextRun({
                        text: 'Markdown studio',
                        color: '86868B',
                        size: 16,
                        font: 'Aptos',
                      }),
                    ],
                  }),
                ],
              }),
            }
          : undefined,
        footers: options.includeFooter
          ? {
              default: new Footer({
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                      new TextRun({ text: 'Markdown studio  ·  ', color: '86868B', size: 15 }),
                      new TextRun({ children: [PageNumber.CURRENT], color: '86868B', size: 15 }),
                      new TextRun({ text: ' / ', color: '86868B', size: 15 }),
                      new TextRun({ children: [PageNumber.TOTAL_PAGES], color: '86868B', size: 15 }),
                    ],
                  }),
                ],
              }),
            }
          : undefined,
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(document);
  return {
    blob,
    filename: `${safeFilename(title)}.docx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
}

function blockToDocx(node: RootContent, level: number): DocxChild[] {
  switch (node.type) {
    case 'heading': {
      const heading = node as Heading;
      return [
        new Paragraph({
          heading: HEADING_LEVELS[Math.min(heading.depth - 1, HEADING_LEVELS.length - 1)],
          children: inlineToRuns(heading.children),
          spacing: { before: 260, after: 120 },
        }),
      ];
    }
    case 'paragraph':
      return [
        new Paragraph({
          children: inlineToRuns((node as MdParagraph).children),
          indent: level ? { left: 300 * level } : undefined,
        }),
      ];
    case 'list':
      return listToDocx(node as List, level);
    case 'blockquote': {
      const blockquote = node as Blockquote;
      const items: DocxChild[] = [];
      for (const child of blockquote.children) {
        if (child.type === 'paragraph') {
          items.push(
            new Paragraph({
              children: inlineToRuns((child as MdParagraph).children),
              indent: { left: 360 },
              border: {
                left: { style: BorderStyle.SINGLE, size: 12, color: 'D2D2D7', space: 10 },
              },
              spacing: { after: 80 },
            }),
          );
        } else {
          items.push(...blockToDocx(child, level + 1));
        }
      }
      return items;
    }
    case 'code': {
      const code = node as Code;
      return [
        new Paragraph({
          children: code.value.split('\n').flatMap((line, index, all) => [
            new TextRun({
              text: line,
              font: 'Consolas',
              size: 19,
              color: 'F5F5F7',
              break: index < all.length - 1 ? 1 : undefined,
            }),
          ]),
          shading: { type: ShadingType.CLEAR, fill: '1D1D1F', color: 'auto' },
          spacing: { before: 100, after: 180 },
          indent: { left: 120, right: 120 },
        }),
      ];
    }
    case 'table':
      return [tableToDocx(node as MdTable)];
    case 'thematicBreak':
      return [
        new Paragraph({
          text: '',
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D2D2D7', space: 1 },
          },
          spacing: { before: 160, after: 160 },
        }),
      ];
    case 'math': {
      const value = (node as unknown as { value?: string }).value ?? '';
      return [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: `$$${value}$$`, font: 'Cambria Math', color: '424245' })],
          spacing: { before: 100, after: 160 },
        }),
      ];
    }
    case 'html': {
      const value = (node as unknown as { value?: string }).value ?? '';
      const plain = value.replace(/<[^>]+>/g, '').trim();
      return plain ? [new Paragraph({ children: [new TextRun({ text: plain })] })] : [];
    }
    default:
      return [];
  }
}

function listToDocx(list: List, level: number): DocxChild[] {
  const result: DocxChild[] = [];
  let itemIndex = list.start ?? 1;
  for (const item of list.children as ListItem[]) {
    const marker = list.ordered ? `${itemIndex}. ` : '• ';
    let first = true;
    for (const child of item.children) {
      if (child.type === 'paragraph') {
        const runs = inlineToRuns((child as MdParagraph).children);
        if (first) {
          runs.unshift(new TextRun({ text: marker, bold: false }));
          first = false;
        }
        result.push(
          new Paragraph({
            children: runs,
            indent: { left: 300 * (level + 1) },
            spacing: { after: 55 },
          }),
        );
      } else if (child.type === 'list') {
        result.push(...listToDocx(child as List, level + 1));
      } else {
        result.push(...blockToDocx(child, level + 1));
      }
    }
    itemIndex += 1;
  }
  return result;
}

function tableToDocx(table: MdTable): Table {
  const rows: TableRow[] = [];
  if (table.children.length) {
    const firstRow = table.children[0] as MdTableRow;
    rows.push(
      new TableRow({
        tableHeader: true,
        children: firstRow.children.map(
          (cell: MdTableCell) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: inlineToRuns(cell.children, { bold: true }),
                  shading: { type: ShadingType.CLEAR, fill: 'F5F5F7' },
                }),
              ],
              shading: { type: ShadingType.CLEAR, fill: 'F5F5F7' },
            }),
        ),
      }),
    );
    for (const row of table.children.slice(1) as MdTableRow[]) {
      rows.push(
        new TableRow({
          children: row.children.map(
            (cell: MdTableCell) =>
              new TableCell({
                children: [new Paragraph({ children: inlineToRuns(cell.children) })],
              }),
          ),
        }),
      );
    }
  }
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'E5E5EA' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E5E5EA' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'E5E5EA' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'E5E5EA' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 3, color: 'E5E5EA' },
      insideVertical: { style: BorderStyle.SINGLE, size: 3, color: 'E5E5EA' },
    },
  });
}

function inlineToRuns(nodes: PhrasingContent[], style: InlineStyle = {}): TextRun[] {
  const runs: TextRun[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        runs.push(
          new TextRun({
            text: node.value,
            bold: style.bold,
            italics: style.italics,
            strike: style.strike,
            font: style.code ? 'Consolas' : undefined,
          }),
        );
        break;
      case 'strong':
        runs.push(...inlineToRuns(node.children, { ...style, bold: true }));
        break;
      case 'emphasis':
        runs.push(...inlineToRuns(node.children, { ...style, italics: true }));
        break;
      case 'delete':
        runs.push(...inlineToRuns(node.children, { ...style, strike: true }));
        break;
      case 'inlineCode':
        runs.push(
          new TextRun({
            text: ` ${node.value} `,
            font: 'Consolas',
            color: '424245',
            bold: style.bold,
            italics: style.italics,
          }),
        );
        break;
      case 'link':
        runs.push(...inlineToRuns(node.children, { ...style, bold: true }));
        if (node.url) runs.push(new TextRun({ text: ` (${node.url})`, color: '86868B', size: 18 }));
        break;
      case 'break':
        runs.push(new TextRun({ text: '', break: 1 }));
        break;
      case 'inlineMath': {
        const value = (node as unknown as { value?: string }).value ?? '';
        runs.push(new TextRun({ text: `$${value}$`, font: 'Cambria Math', color: '424245' }));
        break;
      }
      case 'image':
        runs.push(new TextRun({ text: `[图片：${node.alt ?? ''}]`, color: '86868B' }));
        break;
      default:
        break;
    }
  }
  return runs;
}
