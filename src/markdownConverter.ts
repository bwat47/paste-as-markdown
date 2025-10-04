import TurndownService from 'turndown';
import { TURNDOWN_OPTIONS } from './constants';
import { processHtml } from './html/processHtml';
import { getGfmPlugin } from './gfmPlugin';
import type { PasteOptions, ResourceConversionMeta } from './types';

async function createTurndownService(includeImages: boolean): Promise<TurndownService> {
    const service = new TurndownService(TURNDOWN_OPTIONS);

    // Load the ESM-only GFM plugin
    const gfm = await getGfmPlugin();
    service.use(gfm);

    if (!includeImages) {
        service.remove('img');
    }

    // --- Custom behavior overrides (public addRule API) ---
    // We previously manipulated the internal rules array to obtain higher precedence. According to upstream
    // guidance, overriding built-in element handling should use addRule (added rules have highest precedence).
    // 1. Preserve sized <img> tags (retain width/height) by emitting raw HTML instead of Markdown image syntax.
    service.addRule('pamSizedImage', {
        // Uses addRule instead of manipulating internal arrays (see turndown#241 guidance on precedence)
        filter: (node: HTMLElement) => {
            return (
                includeImages && node.nodeName === 'IMG' && (node.hasAttribute('width') || node.hasAttribute('height'))
            );
        },
        replacement: (_content: string, node: HTMLElement) => {
            const img = node as HTMLImageElement;
            const attrs: string[] = [];
            const pushAttr = (name: string) => {
                const v = img.getAttribute(name);
                if (v) attrs.push(`${name}="${v}"`);
            };
            // Allowed image attributes: src, alt, title, width, height
            ['src', 'alt', 'title', 'width', 'height'].forEach(pushAttr);
            return `<img ${attrs.join(' ')}>`;
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

    // 3. Preserve <sup>/<sub> tags as raw HTML (mirrors Joplin's Turndown behavior)
    service.addRule('pamSup', {
        filter: (node: HTMLElement) => node.nodeName === 'SUP',
        replacement: (content: string) => `<sup>${content}</sup>`,
    });
    service.addRule('pamSub', {
        filter: (node: HTMLElement) => node.nodeName === 'SUB',
        replacement: (content: string) => `<sub>${content}</sub>`,
    });

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

            const minimumIndentWidth = 4; // Joplin expects nested list items indented by >=4 spaces
            const indentWidth = Math.max(prefix.length, minimumIndentWidth);
            const indent = ' '.repeat(indentWidth);
            content = content
                .replace(/^\n+/, '') // remove leading newlines
                .replace(/\n+$/, '\n') // replace trailing newlines with just a single one
                .replace(/\n/gm, `\n${indent}`); // indent child lines while preserving 4-space nested list requirement

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

    // Defensive removals
    service.remove('script');
    service.remove('style');

    return service;
}

/**
 * Converts clipboard HTML into Markdown by running the project’s end-to-end pipeline:
 * wraps orphaned tables, sanitizes and normalizes the DOM, feeds the result through Turndown,
 * and performs final Markdown cleanup.
 *
 * @param html Raw HTML fragment captured from the clipboard.
 * @param options Paste behavior flags. Supports `includeImages`, `convertImagesToResources`,
 * `normalizeQuotes`, `forceTightLists`, and `isGoogleDocs` to tailor preprocessing.
 * @returns Markdown output alongside resource metadata and a plain-text fallback indicator.
 */
export async function convertHtmlToMarkdown(
    html: string,
    options: Partial<PasteOptions> & { isGoogleDocs?: boolean } = {}
): Promise<{ markdown: string; resources: ResourceConversionMeta; plainTextFallback: boolean }> {
    const {
        includeImages = true,
        convertImagesToResources = false,
        normalizeQuotes = true,
        forceTightLists = false,
        isGoogleDocs = false,
    } = options ?? {};

    // First, wrap orphaned table fragments (Excel clipboard data often lacks <table> wrapper)
    const input = wrapOrphanedTableElements(html);

    // Apply DOM-based preprocessing to clean and sanitize the HTML (now async)
    const pasteOptions: PasteOptions = {
        includeImages,
        convertImagesToResources,
        normalizeQuotes,
        forceTightLists,
    };
    const processed = await processHtml(input, pasteOptions, isGoogleDocs);

    const turndownInput = (processed.body ?? processed.sanitizedHtml ?? '') as Parameters<
        TurndownService['turndown']
    >[0];

    if (!turndownInput) {
        return { markdown: '', resources: processed.resources, plainTextFallback: false };
    }

    // Create a fresh service per invocation. Paste is an explicit user action so perf impact is negligible
    // and this guarantees option/rule changes always apply without stale caching.
    const service = await createTurndownService(includeImages);
    let markdown = service.turndown(turndownInput);

    // Post-process the markdown for final cleanup
    markdown = cleanupMarkdown(markdown, forceTightLists);

    return { markdown, resources: processed.resources, plainTextFallback: false };
}

/**
 * Final markdown cleanup operations that can't be easily done during DOM preprocessing
 */
function cleanupMarkdown(markdown: string, forceTightLists: boolean): string {
    // Turndown prepends two leading newlines before the first block element (e.g. <p>, <h1>). For
    // pasted fragments this results in unwanted blank lines at the insertion point. Strip any
    // leading blank lines while leaving internal spacing intact.
    markdown = markdown.replace(/^(?:[ \t]*\n)+/, '');

    // Restore NBSP-only inline code sentinel inserted during HTML preprocessing.
    markdown = markdown.replace(/`__PAM_NBSP__`/g, '`&nbsp;`');

    // Convert stray <br> artifacts:
    // 1. Runs of 2+ <br> become a paragraph break (blank line) -> \n\n
    // 2. Single <br> becomes a Markdown hard line break (two spaces + newline) -> '  \n'
    markdown = cleanupBrTags(markdown);

    // Remove lines that are only whitespace (artifacts after span/div based email HTML) and
    // collapse 3+ newlines to a single blank line while preserving fenced code blocks.
    markdown = withFencedCodeProtection(markdown, (segment) => {
        // remove whitespace-only lines
        segment = segment.replace(/^\s+$/gm, '');
        // collapse excessive vertical spacing
        segment = segment.replace(/\n{3,}/g, '\n\n');
        return segment;
    });

    // If enabled, remove blank lines between consecutive list items (unordered, ordered, tasks)
    if (forceTightLists) {
        markdown = tightenListSpacing(markdown);
    }

    return markdown;
}

// Remove blank lines between list items while protecting fenced code blocks.
function tightenListSpacing(markdown: string): string {
    const isListLine = (rawLine: string): boolean => {
        const line = rawLine.replace(/\r$/, '');
        const trimmed = line.trim();
        // Guard common Markdown horizontal rules (---, ***, ___, and spaced variants)
        if (/^([-*_])(\s*\1){2,}$/.test(trimmed)) {
            return false;
        }
        return /^[ \t]*(?:>[ \t]*)*(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/.test(line);
    };

    const isBlankListSeparator = (rawLine: string): boolean => {
        const line = rawLine.replace(/\r$/, '');
        if (line.trim() === '') {
            return true;
        }
        return /^[ \t]*(?:>[ \t]*)*$/.test(line);
    };

    return withFencedCodeProtection(markdown, (segment) => {
        const lines = segment.split('\n');
        let index = 0;
        while (index < lines.length - 2) {
            if (isListLine(lines[index]) && isBlankListSeparator(lines[index + 1]) && isListLine(lines[index + 2])) {
                lines.splice(index + 1, 1);
                if (index > 0) {
                    index--;
                }
            } else {
                index++;
            }
        }
        return lines.join('\n');
    });
}

/**
 * Simplified BR tag processing without table handling
 * The GFM plugin handles table cell content conversion and flattens multi-line content to single lines
 * Rules (applied only to non-code regions):
 *  - Single <br> -> hard line break (two spaces + newline)
 *  - Run of 2+ consecutive <br> (optionally separated by whitespace) -> paragraph break (blank line) '\n\n'
 */
function cleanupBrTags(markdown: string): string {
    if (!/<br\s*\/?/i.test(markdown)) return markdown;

    // Protect fenced code blocks and inline code spans
    return withCodeProtection(markdown, (content) => {
        // Process BR tags in regular content
        return content.replace(/(?:<br\s*\/?>(?:\s*)?)+/gi, (match) => {
            const brCount = (match.match(/<br/gi) || []).length;
            return brCount === 1 ? '  \n' : '\n\n';
        });
    });
}

function withCodeProtection(markdown: string, transform: (content: string) => string): string {
    // Split on fenced code blocks first (highest priority protection)
    const fencedSplit = markdown.split(/(```[\s\S]*?```)/);

    return fencedSplit
        .map((segment, index) => {
            // Odd indices are fenced code blocks - never touch them
            if (index % 2 === 1 || segment.startsWith('```')) {
                return segment;
            }

            // For non-fenced segments, protect inline code spans
            return segment
                .split(/(`[^`\n]*`)/) // Split on inline code spans
                .map((subSegment, subIndex) => {
                    // Odd indices are inline code spans - don't touch them
                    if (subIndex % 2 === 1 || subSegment.startsWith('`')) {
                        return subSegment;
                    }

                    // Apply transformation to regular content only
                    return transform(subSegment);
                })
                .join('');
        })
        .join('');
}

// Utility to protect fenced code blocks while applying a transformation to non-code segments
function withFencedCodeProtection(markdown: string, transform: (segment: string) => string): string {
    // Extract fences to deterministic tokens; avoids complex negative-lookahead logic.
    const fences: string[] = [];
    const token = (i: number) => `__PAM_FENCE_${i}__`;
    const protectedMd = markdown.replace(/```[\s\S]*?```/g, (m) => {
        fences.push(m);
        return token(fences.length - 1);
    });
    const transformed = transform(protectedMd);
    return fences.reduce((acc, fence, i) => acc.replace(token(i), fence), transformed);
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
