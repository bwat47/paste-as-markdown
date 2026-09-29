import { processHtml } from './html/processHtml';
import { domToMarkdown } from './markdownConverter';
import type { HtmlToMarkdownResult, PassContext, PasteOptions } from './types';

/** Runs HTML preparation, resource conversion, and Markdown conversion in order. */
export async function convertHtmlToMarkdown(
    html: string,
    options: PasteOptions,
    context: PassContext
): Promise<HtmlToMarkdownResult> {
    const { body, resources } = await processHtml(html, options, context);
    return { markdown: domToMarkdown(body, options), resources };
}
