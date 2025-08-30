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
    try {
        const ParserCtor = (globalThis as unknown as { DOMParser?: { new (): DOMParser } }).DOMParser;
        if (ParserCtor) {
            const parser = new ParserCtor();
            const doc = parser.parseFromString(html, 'text/html');
            // Remove style & script blocks explicitly
            doc.querySelectorAll('style,script').forEach((el) => el.remove());
            if (!includeImages) doc.querySelectorAll('img').forEach((img) => img.remove());
            input = doc.body.innerHTML;
        } else if (!includeImages) {
            input = html.replace(/<img[^>]*>/gi, '');
        }
    } catch {
        if (!includeImages) input = html.replace(/<img[^>]*>/gi, '');
    }
    return getService(includeImages).turndown(input);
}
