import { walkTextNodes } from '../shared/dom';

/**
 * Normalize text characters commonly found in rich document sources:
 * - Various NBSP representations to regular spaces
 * - Zero-width space variants to regular spaces
 * - Removes directional control characters that appear as red dots in Joplin
 * - Word/Office smart quotes to regular quotes (optional)
 * - Other problematic encoded characters
 * Skips code elements to preserve literal character examples.
 */
export function normalizeTextCharacters(body: HTMLElement, normalizeQuotes: boolean = true): void {
    const nbspPattern = /[Â\u00A0]|&nbsp;/;
    const zeroWidthPattern = /[\u200B\u200C\u200D\u2060\uFEFF]/;
    const directionalControlPattern = /[\u2066\u2067\u2068\u2069\u202A\u202B\u202C\u202D\u202E\u200E\u200F\u061C]/;
    const directionalControlMatcher = new RegExp(`${directionalControlPattern.source}+`, 'g');
    const quotePattern = /&#8220|&#8221|&#8216|&#8217|[\u201C\u201D\u2018\u2019]/;
    const basePattern = new RegExp(
        `${nbspPattern.source}|${zeroWidthPattern.source}|${directionalControlPattern.source}`
    );
    const bailOutPattern = normalizeQuotes ? new RegExp(`${basePattern.source}|${quotePattern.source}`) : basePattern;
    const snapshot = body.innerHTML;
    if (!bailOutPattern.test(snapshot)) return;

    const textNodesToUpdate: { node: Text; newText: string }[] = [];

    walkTextNodes(body, (textNode) => {
        const originalText = textNode.textContent || '';

        let normalizedText = originalText
            .replace(/Â\s/g, ' ')
            .replace(/\u00A0/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/[\u200B\u200C\u200D\u2060\uFEFF]+/g, ' ')
            .replace(directionalControlMatcher, '');

        if (normalizeQuotes) {
            normalizedText = normalizedText
                .replace(/&#8220;?/g, '"')
                .replace(/&#8221;?/g, '"')
                .replace(/&#8216;?/g, "'")
                .replace(/&#8217;?/g, "'")
                .replace(/[\u201C\u201D]/g, '"')
                .replace(/[\u2018\u2019]/g, "'");
        }

        if (normalizedText !== originalText) {
            textNodesToUpdate.push({ node: textNode, newText: normalizedText });
        }
    });

    textNodesToUpdate.forEach(({ node, newText }) => {
        node.textContent = newText;
    });
}
