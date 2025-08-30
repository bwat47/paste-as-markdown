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
    return service;
}

function getService(): TurndownService {
    if (!singletonService) singletonService = createTurndownService();
    return singletonService;
}

export function convertHtmlToMarkdown(html: string): string {
    return getService().turndown(html);
}
