import { DEFAULT_PASS_CONTEXT, DEFAULT_PASTE_OPTIONS } from '../../constants';
import { convertHtmlToMarkdown as convertHtmlToMarkdownWithOptions } from '../../markdownConverter';
import type { HtmlToMarkdownResult, PassContext, PasteOptions } from '../../types';

/** Builds complete paste options while keeping individual conversion tests concise. */
export function pasteOptions(overrides: Partial<PasteOptions> = {}): PasteOptions {
    return { ...DEFAULT_PASTE_OPTIONS, ...overrides };
}

/** Test-only conversion helper that resolves concise option overrides into the production contract. */
export function convertHtmlToMarkdown(
    html: string,
    options: Partial<PasteOptions> = {},
    context: PassContext = DEFAULT_PASS_CONTEXT
): Promise<HtmlToMarkdownResult> {
    return convertHtmlToMarkdownWithOptions(html, pasteOptions(options), context);
}
