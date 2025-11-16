/**
 * Normalize <img alt> attributes by removing line breaks and control characters that
 * can break Markdown image syntax. Collapses all whitespace runs to a single space.
 */
import { normalizeAltText } from '../../textUtils';

export function normalizeImageAltAttributes(body: HTMLElement): void {
    const imgs = Array.from(body.querySelectorAll('img[alt]')) as HTMLImageElement[];
    imgs.forEach((img) => {
        const alt = img.getAttribute('alt')!; // Non-null: selector guarantees alt exists
        const normalized = normalizeAltText(alt);
        if (normalized !== alt) img.setAttribute('alt', normalized);
    });
}
