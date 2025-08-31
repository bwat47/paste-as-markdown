import TurndownService from '@joplin/turndown';
import { gfm } from '@joplin/turndown-plugin-gfm';
import { TURNDOWN_OPTIONS } from './constants';
import { applyCustomRules } from './turndownRules';

let singletonService: TurndownService | null = null;
let currentIncludeImages: boolean | null = null;

function createTurndownServiceSync(): TurndownService {
    const service = new TurndownService(TURNDOWN_OPTIONS);
    service.use(gfm);
    applyCustomRules(service);
    return service;
}

function getService(includeImages: boolean): TurndownService {
    // Recreate service if includeImages setting changed
    if (!singletonService || currentIncludeImages !== includeImages) {
        singletonService = createTurndownServiceSync();
        currentIncludeImages = includeImages;
    }
    return singletonService;
}

export function convertHtmlToMarkdown(html: string, includeImages: boolean = true): string {
    let input = html;

    // Fix orphaned table fragments (common with Excel clipboard data)
    input = wrapOrphanedTableElements(input);

    try {
        // Use DOMParser if available, as it's more robust for manipulating HTML.
        // This allows us to cleanly remove elements like <style>, <script>, and <img>.
        const ParserCtor = (globalThis as unknown as { DOMParser?: { new (): DOMParser } }).DOMParser;
        if (ParserCtor) {
            const parser = new ParserCtor();
            const doc = parser.parseFromString(input, 'text/html');
            // Remove style & script blocks explicitly
            doc.querySelectorAll('style,script').forEach((el) => el.remove());
            if (!includeImages) doc.querySelectorAll('img').forEach((img) => img.remove());
            input = doc.body.innerHTML;
        } else if (!includeImages) {
            // Fallback for environments without DOMParser: simple regex to remove images.
            input = input.replace(/<img[^>]*>/gi, '');
        }
    } catch {
        // If DOMParser fails for any reason, fall back to regex for image removal.
        if (!includeImages) input = input.replace(/<img[^>]*>/gi, '');
    }
    return getService(includeImages).turndown(input);
}

/**
 * Wraps orphaned table elements (col, tr, td, etc.) in a proper table structure.
 * This fixes Excel clipboard data that often contains table fragments without the <table> wrapper.
 */
function wrapOrphanedTableElements(html: string): string {
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
