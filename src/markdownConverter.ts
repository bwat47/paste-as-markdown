import TurndownService from 'turndown';
import { gfm } from '@bwat47/turndown-plugin-gfm';
import { processHtml } from './html/processHtml';
import { transformMarkdownOutsideFencedCode } from './markdown/fencedCode';
import { LIST_INDENTATION } from './types';
import type { PassContext, PasteOptions, HtmlToMarkdownResult, ListIndentation } from './types';

const MARKDOWN_RAW_HTML_ATTRIBUTE_WHITESPACE = /\s+/g;
const MARKDOWN_TAB_WIDTH = 4;
const MINIMUM_LIST_INDENT_WIDTH = 4;

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

function createTurndownService({
    includeImages,
    listIndentation,
}: Pick<PasteOptions, 'includeImages' | 'listIndentation'>): TurndownService {
    const service = new TurndownService(TURNDOWN_OPTIONS);
    service.use(gfm);

    // Defensive removals, already handled during DOM pre-processing
    if (!includeImages) {
        service.remove('img');
    }
    service.remove('script');
    service.remove('style');

    // --- Custom behavior overrides (public addRule API) ---
    // Overriding built-in element handling should use addRule (added rules have highest precedence, see turndown#241)

    // 1. Preserve sized <img> tags (retain width/height) by emitting raw HTML instead of Markdown image syntax.
    service.addRule('pamSizedImage', {
        filter: (node: HTMLElement) => {
            return (
                includeImages && node.nodeName === 'IMG' && (node.hasAttribute('width') || node.hasAttribute('height'))
            );
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
            const element = node as HTMLElement;
            const parent = element.parentElement;
            let prefix: string;
            if (parent && parent.nodeName === 'OL') {
                const startAttr = parent.getAttribute('start');
                const startIndex = startAttr ? Number(startAttr) : 1;
                const index = Array.prototype.indexOf.call(parent.children, element);
                const ordinal = Number.isNaN(startIndex) ? index + 1 : startIndex + index;
                prefix = `${ordinal}. `;
            } else {
                const bulletMarker = options.bulletListMarker ?? '-';
                prefix = `${bulletMarker} `;
            }

            const indent = createListIndent(prefix.length, listIndentation);
            content = collapseTrailingNewlines(content.replace(/^\n+/, '')) // trim leading newlines, collapse trailing ones
                .replace(/\n/g, `\n${indent}`); // indent child lines while preserving Markdown nesting

            // Normalize checkbox spacing inline so post-processing doesn't need to regex task lines again.
            const taskMatch = content.match(/^(\[[ xX]\])([\s\S]*)$/);
            if (taskMatch) {
                const [, marker, remainder] = taskMatch;
                const [firstLine, ...otherLines] = remainder.split('\n');
                const trimmedFirstLine = firstLine.replace(/^\s+/, '');
                const inlineText = trimmedFirstLine.length > 0 ? ` ${trimmedFirstLine}` : '';
                const trailingLines = otherLines.length > 0 ? `\n${otherLines.join('\n')}` : '';
                content = `${marker}${inlineText}${trailingLines}`;
            }

            const needsTrailingNewline = element.nextSibling && !/\n$/.test(content);
            return prefix + content + (needsTrailingNewline ? '\n' : '');
        },
    });

    return service;
}

/**
 * Converts clipboard HTML into Markdown by running the project's end-to-end pipeline:
 * wraps orphaned tables, sanitizes and normalizes the DOM, feeds the result through Turndown,
 * and performs final Markdown cleanup.
 *
 * @param html Raw HTML fragment captured from the clipboard.
 * @param options Complete, validated paste behavior flags for preprocessing and conversion.
 * @param context Metadata used to select source-specific processing passes.
 * @returns Markdown output alongside resource metadata.
 */
export async function convertHtmlToMarkdown(
    html: string,
    options: PasteOptions,
    context: PassContext
): Promise<HtmlToMarkdownResult> {
    // First, wrap orphaned table fragments (Excel clipboard data often lacks <table> wrapper)
    const input = wrapOrphanedTableElements(html);

    // Apply DOM preprocessing to clean and sanitize the HTML
    const processed = await processHtml(input, options, context);

    // Create a fresh service per invocation. Paste is an explicit user action so perf impact is negligible
    const service = createTurndownService(options);
    let markdown = service.turndown(processed.body);

    // Post-process the markdown for final cleanup
    markdown = cleanupMarkdown(markdown);

    return { markdown, resources: processed.resources };
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

/**
 * Wraps orphaned table elements (col, tr, td, etc.) in a proper table structure.
 * This fixes Excel clipboard data that often contains table fragments without the <table> wrapper.
 *
 * @internal Exposed for unit testing.
 */
export function wrapOrphanedTableElements(html: string): string {
    const trimmed = html.trim();

    // Check if we have table-related elements but no table wrapper
    const hasTableElements =
        /^<(col|tr|tbody|thead|th|td)/i.test(trimmed) || /<(col|tr|tbody|thead|th|td)[\s>]/i.test(trimmed);
    const hasTableWrapper = /<table[\s>]/i.test(trimmed);

    if (hasTableElements && !hasTableWrapper) {
        return `<table>${trimmed}</table>`;
    }

    return html;
}
