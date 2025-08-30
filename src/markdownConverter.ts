import TurndownService from 'turndown';
// turndown-plugin-gfm ships without types

import { gfm } from 'turndown-plugin-gfm';
import { TURNDOWN_OPTIONS } from './constants';
import { applyAllRules } from './turndownRules';

let singletonService: TurndownService | null = null;
let currentIncludeImages: boolean | null = null;

function createTurndownService(includeImages: boolean): TurndownService {
    // Use centralized TURNDOWN_OPTIONS directly (no per-file overrides to avoid divergence)
    const service = new TurndownService(TURNDOWN_OPTIONS);

    // Enable GitHub Flavored Markdown features
    service.use(gfm);

    // Apply all custom conversion rules
    applyAllRules(service, { includeImages });

    return service;
}

function getService(includeImages: boolean): TurndownService {
    // Recreate service if includeImages setting changed
    if (!singletonService || currentIncludeImages !== includeImages) {
        singletonService = createTurndownService(includeImages);
        currentIncludeImages = includeImages;
    }
    return singletonService;
}

export function convertHtmlToMarkdown(html: string, includeImages: boolean = true): string {
    return getService(includeImages).turndown(html);
}
