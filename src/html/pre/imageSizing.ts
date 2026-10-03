/**
 * Pixel length value as serialized by CSSStyleDeclaration, for example "120px" or "120.5px".
 * Other units ("100%", "10em") and keywords ("auto") do not match.
 */
const PX_LENGTH = /^([0-9.]+)px$/i;

/** Parse a CSS px length into a positive integer, or null when it is not a positive px value. */
function parsePxLength(value: string): number | null {
    const match = PX_LENGTH.exec(value.trim());
    const parsed = match ? parseInt(match[1], 10) : NaN;
    return parsed > 0 ? parsed : null;
}

/**
 * Promote inline style width/height on <img> elements to HTML attributes before sanitization.
 * This ensures sizing survives DOMPurify (which may drop style) and allows our Turndown rule
 * to treat sized images as raw HTML embeds instead of Markdown images.
 *
 * Reads the parsed `style.width` / `style.height` declarations rather than scanning the raw
 * style string, so properties like `max-width`, `line-height` or `--card-border-width` are ignored.
 */
export function promoteImageSizingStylesToAttributes(body: HTMLElement): void {
    const imgs = Array.from(body.querySelectorAll<HTMLImageElement>('img[style]'));
    imgs.forEach((img) => {
        const hasAttrWidth = img.hasAttribute('width');
        const hasAttrHeight = img.hasAttribute('height');
        // Only promote style sizing if neither width nor height attribute is present.
        if (!hasAttrWidth && !hasAttrHeight) {
            // Only px values are promoted; percentages, other units and keywords are ignored
            const width = parsePxLength(img.style.width);
            const height = parsePxLength(img.style.height);
            if (width) {
                img.setAttribute('width', String(width));
            }
            if (height) {
                img.setAttribute('height', String(height));
            }
        }
        // Always remove style for determinism and to avoid leaking CSS
        img.removeAttribute('style');
    });
}
