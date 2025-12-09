/**
 * Image attribute normalization for the post-sanitize phase.
 *
 * Responsibilities:
 * - Normalize existing alt text (remove control chars, collapse whitespace)
 * - Generate fallback alt text from src URL when alt is missing or empty
 * - Apply length cap to auto-generated alt text
 *
 * Note: Attribute whitelisting is handled by DOMPurify configuration.
 */
import { normalizeAltText } from '../../textUtils';
import { MAX_ALT_TEXT_LENGTH } from '../../constants';

/**
 * Derive a human-readable name from an image src for fallback alt text.
 */
function deriveAltFromSrc(src: string): string {
    if (!src) return 'image';

    // Data URLs -> generic name
    if (src.toLowerCase().startsWith('data:')) return 'pasted image';

    // Joplin resource URLs -> generic name
    if (src.startsWith(':/')) return 'image';

    // Try to extract filename from URL path
    try {
        const url = new URL(src, 'https://placeholder.local');
        const segments = url.pathname.split('/').filter(Boolean);
        const last = segments.pop() || '';

        // Remove query/hash fragments and extension
        const cleaned = last.split('?')[0].split('#')[0];
        const withoutExt = cleaned.replace(/\.[a-z0-9]{2,5}$/i, '');

        // Sanitize: keep only safe characters, replace separators with spaces
        const readable = withoutExt
            .replace(/[_-]+/g, ' ')
            .replace(/[^a-zA-Z0-9 ]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        return readable || 'image';
    } catch {
        return 'image';
    }
}

/**
 * Sanitize and cap alt text for auto-generated values.
 */
function sanitizeGeneratedAlt(raw: string): string {
    let out = normalizeAltText(raw);
    if (!out) out = 'image';
    if (out.length > MAX_ALT_TEXT_LENGTH) {
        out = out.slice(0, MAX_ALT_TEXT_LENGTH - 3) + '...';
    }
    return out;
}

/**
 * Normalize and ensure alt attributes for all images.
 *
 * - Images with existing alt: normalize whitespace/control chars
 * - Images without alt or empty alt: generate fallback from src
 */
export function normalizeImageAltAttributes(body: HTMLElement): void {
    const imgs = Array.from(body.querySelectorAll('img[src]')) as HTMLImageElement[];

    imgs.forEach((img) => {
        const existingAlt = img.getAttribute('alt');
        const normalized = existingAlt != null ? normalizeAltText(existingAlt) : '';

        if (normalized) {
            // Has meaningful alt - just ensure it's normalized
            if (normalized !== existingAlt) {
                img.setAttribute('alt', normalized);
            }
        } else {
            // Missing or empty alt - generate fallback from src
            const src = img.getAttribute('src') || '';
            const fallback = sanitizeGeneratedAlt(deriveAltFromSrc(src));
            img.setAttribute('alt', fallback);
        }
    });
}
