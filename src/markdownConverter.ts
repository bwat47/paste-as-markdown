import TurndownService from '@joplin/turndown';
import { gfm } from '@joplin/turndown-plugin-gfm';
import { TURNDOWN_OPTIONS } from './constants';
import { applyCustomRules } from './turndownRules';

function createTurndownServiceSync(includeImages: boolean): TurndownService {
    // Clone base options so we can tweak image preservation based on setting.
    // When images are excluded we disable preserveImageTagsWithSize so that sized
    // <img> elements are not force-kept as raw HTML before removal.
    const dynamicOptions = includeImages ? TURNDOWN_OPTIONS : { ...TURNDOWN_OPTIONS, preserveImageTagsWithSize: false };
    const service = new TurndownService(dynamicOptions as typeof TURNDOWN_OPTIONS);
    service.use(gfm);
    // Remove unwanted element types entirely.
    service.remove('script');
    service.remove('style');
    if (!includeImages) {
        // HACK: Inject high-priority rule to remove image-only links before they become empty []() markdown.
        //
        // PROBLEM: When images are disabled, <a href="..."><img src="..."></a> becomes [](...)
        // because Joplin's built-in link rule processes the <a> before we can remove image-only links.
        //
        // SOLUTION: Inject our rule at the BEGINNING of the rules array so it runs first.
        // This prevents the built-in link rule from creating empty markdown links.
        //
        // NOTE: This accesses Turndown's internal rules array structure. If Joplin updates
        // their Turndown version and this breaks, the fallback is harmless empty links.
        try {
            interface MinimalRule {
                filter?: (node: HTMLElement) => boolean;
                replacement?: (content: string, node: HTMLElement) => string;
            }
            const internal = service as unknown as { rules?: { array?: MinimalRule[] } };
            const rulesArray = internal.rules?.array;
            if (Array.isArray(rulesArray)) {
                rulesArray.unshift({
                    filter: function (node: HTMLElement) {
                        if (node.nodeName !== 'A') return false;
                        // If all element children are image-related and all text nodes are whitespace, remove.
                        let sawElement = false;
                        for (const child of Array.from(node.childNodes)) {
                            if (child.nodeType === 1) {
                                sawElement = true;
                                const name = (child as HTMLElement).nodeName;
                                if (name !== 'IMG' && name !== 'PICTURE' && name !== 'SOURCE') return false;
                            } else if (child.nodeType === 3) {
                                if ((child.textContent || '').trim() !== '') return false;
                            }
                        }
                        // Only treat as removable if it actually had an image element child at some point.
                        return sawElement;
                    },
                    replacement: () => '',
                });
            }
        } catch {
            // Non-fatal; if we can't inject rule we fall back to possible empty []() artifact.
        }
        // service.remove('img') is not sufficient because the built-in image rule matches first.
        // Add a high-precedence rule that nukes images (including <picture>/<source>) before default rules run.
        service.addRule('__stripImages', {
            filter: (node: HTMLElement) => {
                const name = node.nodeName.toLowerCase();
                if (name === 'img') return true;
                // Remove whole <picture> trees by filtering picture & its source children.
                if (name === 'picture' || name === 'source') return true;
                return false;
            },
            replacement: () => '',
        });
        service.remove('img'); // still keep for completeness (handles any late additions)
    }
    applyCustomRules(service);
    return service;
}

export function convertHtmlToMarkdown(html: string, includeImages: boolean = true): string {
    // Wrap orphaned table fragments first; no other preprocessing needed.
    const input = wrapOrphanedTableElements(html);
    // Create a fresh service per invocation. Paste is an explicit user action so perf impact is negligible
    // and this guarantees option/rule changes always apply without stale caching.
    const service = createTurndownServiceSync(includeImages);
    let markdown = service.turndown(input);
    // Turndown prepends two leading newlines before the first block element (e.g. <p>, <h1>). For
    // pasted fragments this results in unwanted blank lines at the insertion point. Strip any
    // leading blank lines while leaving internal spacing intact.
    markdown = markdown.replace(/^(?:[ \t]*\n)+/, '');
    // Convert stray <br> artifacts:
    // 1. Runs of 2+ <br> become a paragraph break (blank line) -> \n\n
    // 2. Single <br> becomes a Markdown hard line break (two spaces + newline) -> '  \n'
    // Order matters: handle multi-breaks first so we don't downgrade them.
    // Normalize <br> handling with a placeholder approach to robustly distinguish singles vs runs:
    // 1. Replace all <br> variants with a token
    // 2. Runs of 2+ tokens -> paragraph break (blank line)
    // 3. Single token -> hard line break (two spaces + newline)
    markdown = cleanupBrTagsProtected(markdown);
    markdown = protectAndRemoveNbspOnlyLines(markdown);
    // Remove lines that are only whitespace (artefacts after span/div based email HTML) but skip inside fenced code blocks.
    {
        const fences: string[] = [];
        markdown = markdown.replace(/```[\s\S]*?```/g, (m) => {
            const i = fences.push(m) - 1;
            return `__FENCE_PLACEHOLDER_${i}__`;
        });
        markdown = markdown.replace(/^\s+$/gm, '');
        markdown = markdown.replace(/__FENCE_PLACEHOLDER_(\d+)__/g, (_, d) => fences[Number(d)]);
    }
    // Collapse any remaining sequences of 3+ newlines down to a single blank line delimiter (two newlines),
    // but do NOT alter spacing inside fenced code blocks where intentional vertical spacing may matter.
    {
        const fences: string[] = [];
        markdown = markdown.replace(/```[\s\S]*?```/g, (m) => {
            const idx = fences.push(m) - 1;
            return `__NLC_FENCE_${idx}__`;
        });
        markdown = markdown.replace(/\n{3,}/g, '\n\n');
        markdown = markdown.replace(/__NLC_FENCE_(\d+)__/g, (_, d) => fences[Number(d)]);
    }
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
function protectAndRemoveNbspOnlyLines(markdown: string): string {
    if (!/(?:&nbsp;|&#160;|\u00A0)/.test(markdown)) return markdown;
    const fences: string[] = [];
    markdown = markdown.replace(/```[\s\S]*?```/g, (m) => {
        const idx = fences.push(m) - 1;
        return `__CODE_FENCE_${idx}__`;
    });
    const lines = markdown.split(/\n/).filter((line) => {
        if (line.includes('`')) return true; // don't touch lines with inline code
        return !/^(?:\s*(?:&nbsp;|&#160;|\u00A0)\s*)+$/.test(line);
    });
    markdown = lines.join('\n');
    markdown = markdown.replace(/__CODE_FENCE_(\d+)__/g, (_, d) => fences[Number(d)]);
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
