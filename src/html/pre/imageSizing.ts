import { $all } from '../shared/dom';

/**
 * Promote inline style width/height on <img> elements to HTML attributes before sanitization.
 * This ensures sizing survives DOMPurify (which may drop style) and allows our Turndown rule
 * to treat sized images as raw HTML embeds instead of Markdown images.
 */
export function promoteImageSizingStylesToAttributes(body: HTMLElement): void {
    const imgs = $all<HTMLImageElement>(body, 'img[style]');
    imgs.forEach((img) => {
        const style = img.getAttribute('style')!; // Non-null: selector guarantees style exists
        const hasAttrWidth = img.hasAttribute('width');
        const hasAttrHeight = img.hasAttribute('height');
        // Only promote style sizing if neither width nor height attribute is present.
        if (!hasAttrWidth && !hasAttrHeight) {
            // Extract numeric px values; ignore percentages and other units
            const w = style.match(/\bwidth\s*:\s*([0-9.]+)\s*px\b/i);
            const h = style.match(/\bheight\s*:\s*([0-9.]+)\s*px\b/i);
            const parsedWidth = w ? parseInt(w[1], 10) : null;
            const parsedHeight = h ? parseInt(h[1], 10) : null;
            if (parsedWidth && parsedWidth > 0) {
                img.setAttribute('width', String(parsedWidth));
            }
            if (parsedHeight && parsedHeight > 0) {
                img.setAttribute('height', String(parsedHeight));
            }
        }
        // Always remove style for determinism and to avoid leaking CSS
        img.removeAttribute('style');
    });
}
