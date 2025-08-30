import TurndownService from 'turndown';
// turndown-plugin-gfm ships without types

import { gfm } from 'turndown-plugin-gfm';
import { TURNDOWN_OPTIONS } from './constants';
import { applyAllRules } from './turndownRules';

let singletonService: TurndownService | null = null;

function createTurndownService(): TurndownService {
    const service = new TurndownService({
        ...TURNDOWN_OPTIONS,
        linkStyle: 'inlined',
        br: '\n',
    });

    // Enable GitHub Flavored Markdown features
    service.use(gfm);

    // Apply all custom conversion rules
    applyAllRules(service);

    return service;
}

function getService(): TurndownService {
    if (!singletonService) {
        singletonService = createTurndownService();
    }
    return singletonService;
}

export function convertHtmlToMarkdown(html: string): string {
    return getService().turndown(html);
}
