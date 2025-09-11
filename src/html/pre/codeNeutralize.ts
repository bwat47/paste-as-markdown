/**
 * Neutralize raw code block content prior to sanitization so literal examples of tags like
 * <script> or <style> are preserved as text instead of being removed by DOMPurify.
 */
export function neutralizeCodeBlocksPreSanitize(body: HTMLElement): void {
    const pres = Array.from(body.querySelectorAll('pre')) as HTMLElement[];
    pres.forEach((pre) => {
        const code = pre.querySelector('code') as HTMLElement | null;
        const target = code || pre;
        if (!target) return;
        const collect = (node: Node): string => {
            if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
            if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as HTMLElement;
                if (el.tagName.toLowerCase() === 'br') return '\n';
                let out = '';
                for (const child of Array.from(el.childNodes)) out += collect(child);
                return out;
            }
            return '';
        };
        const text = collect(target);
        if (!text.trim()) return;
        target.textContent = text;
    });
}
