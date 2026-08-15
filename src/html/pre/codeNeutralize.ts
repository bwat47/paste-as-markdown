import { isTextNode, isElement } from '../shared/dom';

/**
 * Flatten a code block subtree to plain text, mapping <br> to a newline.
 *
 * The DOM keeps a code block's line breaks as <br> elements, which textContent drops entirely,
 * so reading the text back needs an explicit walk rather than a single property access.
 */
function collectTextWithLineBreaks(node: Node): string {
    if (isTextNode(node)) return node.textContent || '';
    if (isElement(node)) {
        if (node.tagName.toLowerCase() === 'br') return '\n';
        let out = '';
        for (const child of Array.from(node.childNodes)) out += collectTextWithLineBreaks(child);
        return out;
    }
    return '';
}

/**
 * Neutralize raw code block content prior to sanitization so literal examples of tags like
 * <script> or <style> are preserved as text instead of being removed by DOMPurify.
 */
export function neutralizeCodeBlocksPreSanitize(body: HTMLElement): void {
    const pres = Array.from(body.querySelectorAll('pre')) as HTMLElement[];
    pres.forEach((pre) => {
        // some sources wrap tables in pre tags
        if (pre.querySelector('table')) {
            return;
        }
        const code = pre.querySelector('code') as HTMLElement | null;
        const target = code || pre;
        if (!target) return;
        const text = collectTextWithLineBreaks(target);
        if (!text.trim()) return;
        target.textContent = text;
    });
}
