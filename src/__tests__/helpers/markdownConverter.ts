import { DEFAULT_PASS_CONTEXT } from '../../html/passContext';
import { convertHtmlToMarkdown as convertHtmlToMarkdownWithOptions } from '../../markdownConverter';
import { pasteOptions } from './pasteOptions';
import type { HtmlToMarkdownResult, PassContext, PasteOptions } from '../../types';

/**
 * Test-only wrapper around the production converter. It intentionally shares the production
 * name so conversion tests read naturally, but the loose signature is a test convenience only:
 * `convertHtmlToMarkdown` in `src/markdownConverter.ts` requires complete options and an
 * explicit pass context.
 */
export function convertHtmlToMarkdown(
    html: string,
    options: Partial<PasteOptions> = {},
    context: PassContext = DEFAULT_PASS_CONTEXT
): Promise<HtmlToMarkdownResult> {
    return convertHtmlToMarkdownWithOptions(html, pasteOptions(options), context);
}
