import { unwrapElement } from '../shared/dom';

/**
 * Finds <b> and <strong> tags within heading elements (h1-h6)
 * and unwraps them, as headings are already rendered as bold,
 * making the extra tags redundant.
 */
export function unwrapRedundantBoldInHeadings(body: HTMLElement): void {
    const headings = body.querySelectorAll('h1, h2, h3, h4, h5, h6');

    headings.forEach((heading) => {
        const boldTags = heading.querySelectorAll('b, strong');
        boldTags.forEach(unwrapElement);
    });
}
