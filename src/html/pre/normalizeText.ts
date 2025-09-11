/**
 * Normalize text characters commonly found in rich document sources:
 * - Various NBSP representations to regular spaces
 * - Word/Office smart quotes to regular quotes (optional)
 * - Other problematic encoded characters
 * Skips code elements to preserve literal character examples.
 */
export function normalizeTextCharacters(body: HTMLElement, normalizeQuotes: boolean = true): void {
    const nbspPattern = /[Â\u00A0]|&nbsp;/;
    const quotePattern = /&#8220|&#8221|&#8216|&#8217|[\u201C\u201D\u2018\u2019]/;
    const bailOutPattern = normalizeQuotes ? new RegExp(`${nbspPattern.source}|${quotePattern.source}`) : nbspPattern;
    const snapshot = body.innerHTML;
    if (!bailOutPattern.test(snapshot)) return;

    const doc = body.ownerDocument;
    if (!doc) return;

    const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT, null);
    const textNodesToUpdate: { node: Text; newText: string }[] = [];

    let node: Node | null;
    while ((node = walker.nextNode())) {
        const textNode = node as Text;
        const originalText = textNode.textContent || '';

        const parentElement = textNode.parentElement;
        if (
            parentElement &&
            (parentElement.tagName.toLowerCase() === 'code' ||
                parentElement.tagName.toLowerCase() === 'pre' ||
                parentElement.closest('code, pre'))
        ) {
            continue;
        }
        let normalizedText = originalText
            .replace(/Â\s/g, ' ')
            .replace(/\u00A0/g, ' ')
            .replace(/&nbsp;/g, ' ');

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
    }

    textNodesToUpdate.forEach(({ node, newText }) => {
        node.textContent = newText;
    });
}
