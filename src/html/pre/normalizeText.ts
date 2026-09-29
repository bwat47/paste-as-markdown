import { walkTextNodes } from '../shared/dom';

/**
 * Normalize text characters commonly found in rich document sources:
 * - NBSP to regular spaces
 * - Thin/narrow space variants to regular spaces
 * - Removes zero-width space variants
 * - Removes directional control characters that appear as red dots in Joplin
 * - Word/Office smart quotes to regular quotes (optional)
 * Skips code elements to preserve literal character examples.
 * Operates on decoded text node content, so entity-like strings in text
 * (e.g. a literal "&nbsp;") are user content and left untouched.
 */
export function normalizeTextCharacters(body: HTMLElement, normalizeQuotes = true): void {
    const nbspPattern = /\u00A0/;
    const thinSpacePattern = /[\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F]/;
    // \u200B-\u200D expressed as a range so ZWNJ/ZWJ are not read as a joined character sequence
    const zeroWidthPattern = /[\u200B-\u200D\u2060\uFEFF]/;
    const directionalControlPattern = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/;
    const zeroWidthMatcher = new RegExp(`${zeroWidthPattern.source}+`, 'g');
    const directionalControlMatcher = new RegExp(`${directionalControlPattern.source}+`, 'g');
    const quotePattern = /[\u201C\u201D\u2018\u2019]/;
    const basePattern = new RegExp(
        `${nbspPattern.source}|${thinSpacePattern.source}|${zeroWidthPattern.source}|${directionalControlPattern.source}`
    );
    const bailOutPattern = normalizeQuotes ? new RegExp(`${basePattern.source}|${quotePattern.source}`) : basePattern;
    if (!bailOutPattern.test(body.textContent || '')) return;

    const textNodesToUpdate: { node: Text; newText: string }[] = [];

    walkTextNodes(body, (textNode) => {
        const originalText = textNode.textContent || '';

        let normalizedText = originalText
            .replace(/\u00A0/g, ' ')
            .replace(/[\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F]+/g, ' ')
            .replace(zeroWidthMatcher, '')
            .replace(directionalControlMatcher, '');

        if (normalizeQuotes) {
            normalizedText = normalizedText.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
        }

        if (normalizedText !== originalText) {
            textNodesToUpdate.push({ node: textNode, newText: normalizedText });
        }
    });

    textNodesToUpdate.forEach(({ node, newText }) => {
        node.textContent = newText;
    });
}
