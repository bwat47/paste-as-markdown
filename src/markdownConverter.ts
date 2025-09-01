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
