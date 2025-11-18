import { $all, hasTag, isTextNode, isElement } from '../shared/dom';

/**
 * Neutralize raw code block content prior to sanitization so literal examples of tags like
 * <script> or <style> are preserved as text instead of being removed by DOMPurify.
 */
export function neutralizeCodeBlocksPreSanitize(body: HTMLElement): void {
    const pres = $all<HTMLElement>(body, 'pre');
    pres.forEach((pre) => {
        // some sources wrap tables in pre tags
        if (pre.querySelector('table')) {
            return;
        }
        const code = pre.querySelector('code') as HTMLElement | null;
        const target = code || pre;
        if (!target) return;
        const collect = (node: Node): string => {
            if (isTextNode(node)) return node.textContent || '';
            if (isElement(node)) {
                if (hasTag(node, 'br')) return '\n';
                let out = '';
                for (const child of Array.from(node.childNodes)) out += collect(child);
                return out;
            }
            return '';
        };
        const text = collect(target);
        if (!text.trim()) return;
        target.textContent = text;
    });
}
