/**
 * Promote inline style width/height on <img> elements to HTML attributes before sanitization.
 * This ensures sizing survives DOMPurify (which may drop style) and allows our Turndown rule
 * to treat sized images as raw HTML embeds instead of Markdown images.
 */
export function promoteImageSizingStylesToAttributes(body: HTMLElement): void {
    const imgs = Array.from(body.querySelectorAll('img')) as HTMLImageElement[];
    imgs.forEach((img) => {
        const style = img.getAttribute('style') || '';
        if (!style) return;
        const hasAttrWidth = img.hasAttribute('width');
        const hasAttrHeight = img.hasAttribute('height');
        // Only promote style sizing if neither width nor height attribute is present.
        if (!hasAttrWidth && !hasAttrHeight) {
            // Extract numeric px values; ignore percentages and other units
            const w = style.match(/\bwidth\s*:\s*([0-9.]+)\s*px\b/i);
            const h = style.match(/\bheight\s*:\s*([0-9.]+)\s*px\b/i);
            if (w) img.setAttribute('width', String(parseInt(w[1], 10)));
            if (h) img.setAttribute('height', String(parseInt(h[1], 10)));
        }
        // Always remove style for determinism and to avoid leaking CSS
        img.removeAttribute('style');
    });
}
