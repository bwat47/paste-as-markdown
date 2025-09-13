/**
 * Protect literal HTML tag mentions in prose by wrapping them in <code>...</code> so that
 * Turndown will emit inline code (for example, `<table>`) instead of raw HTML that Joplin
 * might interpret as actual tags.
 *
 * - Operates only on text nodes outside of <code>/<pre>.
 * - Matches simple tag-like tokens: <tag> and </tag> where tag is [A-Za-z][A-Za-z0-9-]*.
 * - The main problematic tag is table, as a literal table tag can result in all text after being rendered as a table in joplin.
 */
const DEFAULT_PROBLEMATIC_TAGS = new Set([
    'table',
    'tr',
    'td',
    'th',
    'div',
    'span',
    'img',
    'a',
    'br',
    'ul',
    'ol',
    'li',
    'hr',
    // keep small and focused; extend if real-world cases arise
]);

export function protectLiteralHtmlTagMentions(
    body: HTMLElement,
    problematicTags: Set<string> = DEFAULT_PROBLEMATIC_TAGS
): void {
    const doc = body.ownerDocument;
    if (!doc) return;

    const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT, null);
    const textNodes: Text[] = [];

    let node: Node | null;
    while ((node = walker.nextNode())) {
        const textNode = node as Text;
        const parentElement = textNode.parentElement;
        if (!parentElement) continue;
        if (
            parentElement.tagName.toLowerCase() === 'code' ||
            parentElement.tagName.toLowerCase() === 'pre' ||
            parentElement.closest('code, pre')
        ) {
            continue;
        }
        const text = textNode.textContent || '';
        if (!text || text.indexOf('<') === -1 || text.indexOf('>') === -1) continue;
        // Quick check for patterns like <tag>, </tag>, <tag/>, and <tag attr="v"> in text
        if (!/<\/?[A-Za-z][A-Za-z0-9-]*(?:\s+[^<>]*?)?\s*\/?\>/.test(text)) continue;
        textNodes.push(textNode);
    }

    // Match simple HTML-like tokens with optional attributes and optional self-closing slash.
    // Capture the tag name in group 1 to allow whitelist filtering.
    const tagTokenRe = /<\/?([A-Za-z][A-Za-z0-9-]*)(?:\s+[^<>]*?)?\s*\/?\>/g;

    textNodes.forEach((textNode) => {
        const content = textNode.textContent || '';
        let lastIndex = 0;
        let hasMatch = false;
        const frag = doc.createDocumentFragment();
        let match: RegExpExecArray | null;
        tagTokenRe.lastIndex = 0;
        while ((match = tagTokenRe.exec(content))) {
            hasMatch = true;
            const start = match.index;
            const end = start + match[0].length;
            const before = content.slice(lastIndex, start);
            if (before) frag.appendChild(doc.createTextNode(before));
            const tagName = (match[1] || '').toLowerCase();
            if (problematicTags.has(tagName)) {
                const code = doc.createElement('code');
                code.textContent = match[0];
                frag.appendChild(code);
            } else {
                // Leave token as literal text when not in the problematic list
                frag.appendChild(doc.createTextNode(match[0]));
            }
            lastIndex = end;
        }
        if (!hasMatch) return;
        const tail = content.slice(lastIndex);
        if (tail) frag.appendChild(doc.createTextNode(tail));
        if (textNode.parentNode) textNode.parentNode.replaceChild(frag, textNode);
    });
}
