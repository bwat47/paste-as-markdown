import TurndownService from '@joplin/turndown';
import { gfm } from '@joplin/turndown-plugin-gfm';
import { TURNDOWN_OPTIONS } from './constants';
import { processHtml } from './htmlProcessor';
import type { PasteOptions } from './types';

function createTurndownServiceSync(includeImages: boolean): TurndownService {
    // Much simpler now that DOM pre-processing handles most cleanup.
    // Images and unwanted elements are already removed by htmlProcessor.
    const dynamicOptions = includeImages ? TURNDOWN_OPTIONS : { ...TURNDOWN_OPTIONS, preserveImageTagsWithSize: false };
    const service = new TurndownService(dynamicOptions as typeof TURNDOWN_OPTIONS);
    service.use(gfm);
    // Scripts/styles already stripped during sanitization; no need to remove via Turndown.
    // All custom cleanup is now handled in DOM preprocessing.
    return service;
}

export function convertHtmlToMarkdown(html: string, includeImages: boolean = true): string {
    // First, wrap orphaned table fragments (Excel clipboard data often lacks <table> wrapper)
    let input = wrapOrphanedTableElements(html);

    // Apply DOM-based preprocessing to clean and sanitize the HTML
    const options: PasteOptions = { includeImages };
    input = processHtml(input, options);

    // Create a fresh service per invocation. Paste is an explicit user action so perf impact is negligible
    // and this guarantees option/rule changes always apply without stale caching.
    const service = createTurndownServiceSync(includeImages);
    let markdown = service.turndown(input);

    // Post-process the markdown for final cleanup
    markdown = cleanupMarkdown(markdown);

    return markdown;
}

/**
 * Final markdown cleanup operations that can't be easily done during DOM preprocessing
 */
function cleanupMarkdown(markdown: string): string {
    // Turndown prepends two leading newlines before the first block element (e.g. <p>, <h1>). For
    // pasted fragments this results in unwanted blank lines at the insertion point. Strip any
    // leading blank lines while leaving internal spacing intact.
    markdown = markdown.replace(/^(?:[ \t]*\n)+/, '');

    // Convert stray <br> artifacts:
    // 1. Runs of 2+ <br> become a paragraph break (blank line) -> \n\n
    // 2. Single <br> becomes a Markdown hard line break (two spaces + newline) -> '  \n'
    markdown = cleanupBrTagsProtected(markdown);

    // Remove lines that are only whitespace (artifacts after span/div based email HTML) and
    // collapse 3+ newlines to a single blank line while preserving fenced code blocks.
    markdown = withFencedCodeProtection(markdown, (segment) => {
        // remove whitespace-only lines
        segment = segment.replace(/^\s+$/gm, '');
        // collapse excessive vertical spacing
        segment = segment.replace(/\n{3,}/g, '\n\n');
        return segment;
    });

    return markdown;
}

/**
 * Replace <br> sequences outside of code spans and fenced code blocks while preserving
 * literal <br> tags that appear inside code (where they are usually intentional HTML examples).
 *
 * Rules (applied only to non-code regions):
 *  - Single <br> -> hard line break (two spaces + newline)
 *  - Run of 2+ consecutive <br> (optionally separated by whitespace) -> paragraph break (blank line) '\n\n'
 */
function cleanupBrTagsProtected(markdown: string): string {
    if (!/<br\s*\/?/i.test(markdown)) return markdown;

    // 1. Split on fenced code blocks (``` ... ```). The capturing group keeps the delimiters.
    const fencedSplit = markdown.split(/(```[\s\S]*?```)/);

    const processedFenced = fencedSplit.map((block, blockIndex) => {
        // Odd indices (because of capturing group) represent fenced code blocks; leave untouched.
        if (blockIndex % 2 === 1 || block.startsWith('```')) return block;

        // 2. Within this non-code block, protect markdown tables: do not modify <br> tags inside table rows.
        const lines = block.split(/\n/);
        const out: string[] = [];
        let insideTable = false;
        const isTableDelimiterLine = (line: string) =>
            /^(?:\s*\|)?\s*:?[-]{2,}:?\s*(?:\|\s*:?[-]{2,}:?\s*)+\|?\s*$/.test(line);
        const isPotentialHeader = (line: string) => /\|/.test(line) && !/^```/.test(line);

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (insideTable) {
                // End table if line no longer looks like a table row.
                if (!/\|/.test(line) || line.trim() === '') {
                    insideTable = false; // fall through to normal processing for this line
                } else {
                    out.push(line); // keep table row verbatim
                    continue;
                }
            }
            if (!insideTable && isPotentialHeader(line) && i + 1 < lines.length && isTableDelimiterLine(lines[i + 1])) {
                insideTable = true;
                out.push(line); // header line
                continue;
            }
            // Normal (non-table) line: we still must protect inline code spans.
            const processed = line
                .split(/(`[^`\n]+`)/)
                .map((segment, segIndex) => {
                    if (segIndex % 2 === 1 || segment.startsWith('`')) return segment; // inline code span
                    return segment.replace(/(?:<br\s*\/?>(?:\s*)?)+/gi, (run) => {
                        const count = (run.match(/<br/i) || []).length;
                        return count === 1 ? '  \n' : '\n\n';
                    });
                })
                .join('');
            out.push(processed);
        }
        return out.join('\n');
    });

    return processedFenced.join('');
}

/**
 * Removes standalone NBSP-only lines produced by rich email clients (e.g. Outlook placeholder
 * paragraphs like <p><o:p>&nbsp;</o:p></p>) while preserving code:
 *  - Fenced code blocks (temporarily extracted and restored unchanged)
 *  - Inline code spans (any line containing backticks is left untouched)
 *
 * NBSP patterns removed when they are the only content on a line: &nbsp; | &#160; | \u00A0
 */
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
