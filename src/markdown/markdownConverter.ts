import { gfm } from '@bwat47/turndown-plugin-gfm';
import TurndownService from 'turndown';

import { LIST_INDENTATION, type ListIndentation, type PasteOptions } from '../types';
import { transformMarkdownOutsideFencedCode } from './fencedCode';

/** Options used only by DOM-to-Markdown conversion. */
export type MarkdownConversionOptions = Pick<PasteOptions, 'listIndentation'>;

const MARKDOWN_RAW_HTML_ATTRIBUTE_WHITESPACE = /\s+/g;
const MARKDOWN_TAB_WIDTH = 4;
const MINIMUM_LIST_INDENT_WIDTH = 4;
const ORDERED_LIST_NODE_NAME = 'OL';
const ORDERED_LIST_START_ATTRIBUTE = 'start';
const DEFAULT_ORDERED_LIST_START = 1;
const DEFAULT_BULLET_MARKER = '-';

/** Task item content: checkbox marker in group 1, the rest in group 2 (e.g. `[x]  Done` gives `[x]` and `  Done`). */
const TASK_ITEM_PATTERN = /^(\[[ xX]\])([\s\S]*)$/;
const LEADING_WHITESPACE_PATTERN = /^\s+/;

const TURNDOWN_OPTIONS = {
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
    // Two spaces ensure <br> converts correctly. See https://github.com/laurent22/joplin/commit/ac66332a4eb83d8829fbd6cc68a11ef3053c41de
    br: '  ',
    linkStyle: 'inlined',
} as const;

/**
 * Collapses a run of trailing newlines down to a single one, leaving content without a
 * trailing newline untouched. Scans backwards instead of using an end-anchored regex
 * (e.g. `/\n+$/`), which backtracks super-linearly on long newline runs.
 */
function collapseTrailingNewlines(text: string): string {
    let end = text.length;
    while (end > 0 && text[end - 1] === '\n') {
        end--;
    }
    return end === text.length ? text : `${text.slice(0, end)}\n`;
}

/**
 * Builds indentation wide enough to keep child blocks inside a list item. Tabs advance to
 * four-column stops, so wide ordered markers such as `100. ` require two tabs.
 */
function createListIndent(prefixWidth: number, listIndentation: ListIndentation): string {
    const indentWidth = Math.max(prefixWidth, MINIMUM_LIST_INDENT_WIDTH);
    if (listIndentation === LIST_INDENTATION.TABS) {
        return '\t'.repeat(Math.ceil(indentWidth / MARKDOWN_TAB_WIDTH));
    }
    return ' '.repeat(indentWidth);
}

/**
 * Returns the Markdown marker for a list item, including its trailing space.
 * Ordered items honor the parent's `start` attribute, falling back to 1 when it is missing
 * and to plain 1-based numbering when it is not numeric.
 */
function getListItemPrefix(element: HTMLElement, bulletMarker: string): string {
    const parent = element.parentElement;
    if (parent?.nodeName !== ORDERED_LIST_NODE_NAME) return `${bulletMarker} `;

    const index = Array.prototype.indexOf.call(parent.children, element);
    const startAttr = parent.getAttribute(ORDERED_LIST_START_ATTRIBUTE);
    const startIndex = startAttr ? Number(startAttr) : DEFAULT_ORDERED_LIST_START;
    const ordinal = Number.isNaN(startIndex) ? index + DEFAULT_ORDERED_LIST_START : startIndex + index;
    return `${ordinal}. `;
}

/**
 * Normalizes task list content to exactly one space between the checkbox and its text.
 * Content that does not start with a checkbox marker is returned unchanged.
 *
 * @example `[x]   Done\nmore` becomes `[x] Done\nmore`; `[ ]` stays `[ ]`.
 */
function normalizeTaskItemContent(content: string): string {
    const taskMatch = TASK_ITEM_PATTERN.exec(content);
    if (!taskMatch) return content;

    // Both captures always participate, including an empty remainder.
    const marker = taskMatch[1]!;
    const remainder = taskMatch[2]!;
    const [firstLine = '', ...otherLines] = remainder.split('\n');
    const trimmedFirstLine = firstLine.replace(LEADING_WHITESPACE_PATTERN, '');
    const inlineText = trimmedFirstLine.length > 0 ? ` ${trimmedFirstLine}` : '';
    const trailingLines = otherLines.length > 0 ? `\n${otherLines.join('\n')}` : '';
    return `${marker}${inlineText}${trailingLines}`;
}

function createTurndownService({ listIndentation }: MarkdownConversionOptions): TurndownService {
    const service = new TurndownService(TURNDOWN_OPTIONS);
    service.use(gfm);

    // --- Custom behavior overrides (public addRule API) ---
    // Overriding built-in element handling should use addRule (added rules have highest precedence, see turndown#241)

    // 1. Preserve sized <img> tags (retain width/height) by emitting raw HTML instead of Markdown image syntax.
    service.addRule('pamSizedImage', {
        filter: (node: HTMLElement) => {
            return node.nodeName === 'IMG' && (node.hasAttribute('width') || node.hasAttribute('height'));
        },
        replacement: (_content: string, node: HTMLElement) => {
            const img = node as HTMLImageElement;
            const serializedImg = img.ownerDocument.createElement('img');
            const copyAttr = (name: string) => {
                const value = img.getAttribute(name);
                if (value) serializedImg.setAttribute(name, value.replace(MARKDOWN_RAW_HTML_ATTRIBUTE_WHITESPACE, ' '));
            };
            // Allowed image attributes: src, alt, title, width, height
            ['src', 'alt', 'title', 'width', 'height'].forEach(copyAttr);
            return serializedImg.outerHTML;
        },
    });

    // 2. Highlight / <mark> support (upstream Turndown lacks a rule). Joplin's convention uses ==text==.
    service.addRule('pamMark', {
        filter: (node: HTMLElement) => {
            if (node.nodeName !== 'MARK') return false;
            // Skip highlighting when inside code/pre to avoid altering code samples
            const parentCode = node.closest('code, pre');
            return !parentCode; // only convert when not inside code/pre
        },
        replacement: (content: string) => `==${content}==`,
    });

    // 3. Preserve <sup>/<sub>/<ins> tags as raw HTML (mirrors Joplin's Turndown behavior)
    service.addRule('pamSup', {
        filter: (node: HTMLElement) => node.nodeName === 'SUP',
        replacement: (content: string) => `<sup>${content}</sup>`,
    });
    service.addRule('pamSub', {
        filter: (node: HTMLElement) => node.nodeName === 'SUB',
        replacement: (content: string) => `<sub>${content}</sub>`,
    });
    service.addRule('pamIns', {
        filter: (node: HTMLElement) => node.nodeName === 'INS',
        replacement: (content: string) => `<ins>${content}</ins>`,
    });

    // 4. List normalization, ensure single space after all list markers and consistent indentation.
    service.addRule('pamListItem', {
        filter: 'li',
        replacement: (content, node, options: TurndownService.Options) => {
            const element = node;
            const prefix = getListItemPrefix(element, options.bulletListMarker ?? DEFAULT_BULLET_MARKER);

            const indent = createListIndent(prefix.length, listIndentation);
            content = collapseTrailingNewlines(content.replace(/^\n+/, '')) // trim leading newlines, collapse trailing ones
                .replace(/\n/g, `\n${indent}`); // indent child lines while preserving Markdown nesting

            // Normalize checkbox spacing inline so post-processing doesn't need to regex task lines again.
            content = normalizeTaskItemContent(content);

            const needsTrailingNewline = element.nextSibling && !/\n$/.test(content);
            return prefix + content + (needsTrailingNewline ? '\n' : '');
        },
    });

    return service;
}

/**
 * Converts an already sanitized, fully processed DOM subtree into Markdown.
 * The caller must supply the body returned by processHtml (or an equivalent trusted DOM).
 * This function does not sanitize HTML, run processing passes, or create resources.
 * Turndown works on a clone, leaving the supplied DOM unchanged.
 */
export function domToMarkdown(body: HTMLElement, options: MarkdownConversionOptions): string {
    const service = createTurndownService(options);
    return cleanupMarkdown(service.turndown(body));
}

/**
 * Final markdown cleanup operations that can't be easily done during DOM preprocessing
 */
function cleanupMarkdown(markdown: string): string {
    // Turndown prepends two leading newlines before the first block element (e.g. <p>, <h1>).
    // For pasted fragments this results in unwanted blank lines at the insertion point.
    // Strip any leading blank lines while leaving internal spacing intact.
    markdown = markdown.replace(/^(?:[ \t]*\n)+/, '');

    // No <br> handling here: Turndown's own lineBreak rule (TURNDOWN_OPTIONS.br) already emits
    // hard breaks, and the blank-line collapse below turns runs of them into paragraph breaks.
    // The only literal <br> left in the output is intentional - GFM table cells (a newline would
    // split the row) and inline code spans - so both must be preserved as-is.

    // Remove lines that are only whitespace (artifacts after span/div based email HTML) and
    // collapse 3+ newlines to a single blank line while preserving fenced code blocks.
    markdown = transformMarkdownOutsideFencedCode(markdown, (segment) => {
        segment = segment.replace(/^[ \t]+$/gm, '');
        segment = segment.replace(/\n{3,}/g, '\n\n');
        return segment;
    });

    return markdown;
}
