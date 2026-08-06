import { walkTextNodes } from '../shared/dom';

/**
 * Matches HTML-like tokens:
 * - Opening tags: <tag>, <tag attr="value">
 * - Closing tags: </tag>
 * - Self-closing: <tag/>, <tag />
 *
 * Pattern breakdown:
 *   <\/? - optional closing slash
 *   [A-Za-z][A-Za-z0-9-]* - tag name (letters, then alphanumeric/dash)
 *   (?:\s[^<>]*|\/)? - either attributes (introduced by whitespace) or a bare
 *                      self-closing slash. The alternatives start with disjoint
 *                      characters and [^<>] cannot consume the terminating '>',
 *                      so the pattern never backtracks.
 *   > - closing bracket
 */
const TAG_TOKEN_SOURCE = String.raw`<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*|\/)?>`;

/** Non-global copy used for cheap `test()` checks (a global regex would carry `lastIndex`). */
const tagTokenTestRe = new RegExp(TAG_TOKEN_SOURCE);

/**
 * Protect literal HTML tag mentions in prose by wrapping them in <code>...</code> so that
 * Turndown will emit inline code (for example, `<table>`) instead of raw HTML that Joplin
 * might interpret as actual tags.
 *
 * - Operates only on text nodes outside of <code>/<pre>.
 * - Matches simple tag-like tokens: <tag> and </tag> where tag is [A-Za-z][A-Za-z0-9-]*.
 */
export function protectLiteralHtmlTagMentions(body: HTMLElement): void {
    const doc = body.ownerDocument;
    if (!doc) return;

    const textNodes: Text[] = [];

    walkTextNodes(body, (textNode) => {
        const text = textNode.textContent || '';
        if (!text || text.indexOf('<') === -1 || text.indexOf('>') === -1) return;
        // Quick check for patterns like <tag>, </tag>, <tag/>, and <tag attr="v"> in text
        if (!tagTokenTestRe.test(text)) return;
        textNodes.push(textNode);
    });

    const tagTokenRe = new RegExp(TAG_TOKEN_SOURCE, 'g');

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
            const code = doc.createElement('code');
            code.textContent = match[0];
            frag.appendChild(code);
            lastIndex = end;
        }
        if (!hasMatch) return;
        const tail = content.slice(lastIndex);
        if (tail) frag.appendChild(doc.createTextNode(tail));
        if (textNode.parentNode) textNode.parentNode.replaceChild(frag, textNode);
    });
}
