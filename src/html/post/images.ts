import { normalizeAltText } from '../../textUtils';

export function normalizeImageAltAttributes(body: HTMLElement): void {
    const imgs = Array.from(body.querySelectorAll('img')) as HTMLImageElement[];
    imgs.forEach((img) => {
        const alt = img.getAttribute('alt');
        if (alt == null) return;
        const normalized = normalizeAltText(alt);
        if (normalized !== alt) img.setAttribute('alt', normalized);
    });
}
