import TurndownService from 'turndown';
// turndown-plugin-gfm ships without types
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { gfm } from 'turndown-plugin-gfm';
import { TURNDOWN_OPTIONS } from './constants';

let singletonService: TurndownService | null = null;

function createTurndownService(): TurndownService {
    const service = new TurndownService(TURNDOWN_OPTIONS);
    service.use(gfm); // Enable GFM features (tables, strikethrough, task lists)
    // General rule: drop empty-text anchors (common for heading permalink anchors) unless they wrap an image.
    // This avoids generating invisible []() links across different sites without maintaining site-specific patterns.
    service.addRule('dropEmptyAnchors', {
        filter: (node: HTMLElement) => {
            if (!node || node.nodeName !== 'A') return false;
            const anchor = node as HTMLAnchorElement;
            // If it contains an <img>, allow default processing (image link).
            if (anchor.querySelector('img')) return false;
            const text = (anchor.textContent || '').replace(/\u00a0/g, ' ').trim();
            if (text.length > 0) return false; // Has visible text
            return true; // Empty text -> drop
        },
        replacement: () => '',
    });
    return service;
}

function getService(): TurndownService {
    if (!singletonService) singletonService = createTurndownService();
    return singletonService;
}

export function convertHtmlToMarkdown(html: string): string {
    return getService().turndown(html);
}
