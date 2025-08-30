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
    // Flatten complex anchor content: remove any nested markup inside <a> and just keep plain text as link label.
    // Example: <a href="url"><div><strong>Title</strong></div></a> => [Title](url)
    service.addRule('flattenAnchorContent', {
        filter: (node: HTMLElement) => {
            if (!node || node.nodeName !== 'A') return false;
            const anchor = node as HTMLAnchorElement;
            // Skip if anchor has an <img> (let default image markdown or other rules handle it)
            if (anchor.querySelector('img')) return false;
            // Must have some text content
            const text = (anchor.textContent || '').replace(/\u00a0/g, ' ').trim();
            if (!text) return false; // empty handled by dropEmptyAnchors
            // Only act if there is nested element structure (child elements) so we don't override simple anchors unnecessarily
            return anchor.children.length > 0;
        },
        replacement: (_content: string, node: HTMLElement) => {
            const anchor = node as HTMLAnchorElement;
            const href = anchor.getAttribute('href') || '';
            const titleAttr = anchor.getAttribute('title');
            // Normalize whitespace in text content
            const text = (anchor.textContent || '')
                .replace(/\u00a0/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            const safeText = text || href; // fallback just in case
            const titlePart = titleAttr ? ` "${titleAttr.replace(/"/g, '\\"')}"` : '';
            return `[${safeText}](${href}${titlePart})`;
        },
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
