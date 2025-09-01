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
    // Replace sequences of <br/> lines that Turndown sometimes leaves behind (e.g. span+<br><br>)
    // with a proper blank line separation. Pattern: a newline followed by one or more <br/> tags
    // (possibly with whitespace) optionally followed by another newline => becomes two newlines.
    // This avoids literal '<br/>' artifacts in final markdown.
    markdown = markdown.replace(/\n(?:<br\s*\/?>(?:\s*)?)+\n?/g, '\n\n');
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
