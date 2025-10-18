import { onlyContains, unwrapElement } from '../shared/dom';

/**
 * Finds <b> and <strong> tags within heading elements (h1-h6)
 * and unwraps them, as headings are already rendered as bold,
 * making the extra tags redundant.
 *
 * Additionally unwraps redundant block-level wrappers (e.g., <p>)
 * that some editors nest directly inside headings, which can lead
 * to empty Markdown headings once converted.
 */
export function normalizeHeadingStructure(body: HTMLElement): void {
    const headings = body.querySelectorAll('h1, h2, h3, h4, h5, h6');

    headings.forEach((heading) => {
        const boldTags = heading.querySelectorAll('b, strong');
        boldTags.forEach(unwrapElement);

        let soleChild = heading.firstElementChild as HTMLElement | null;
        while (
            soleChild &&
            onlyContains(heading, soleChild) &&
            soleChild.tagName &&
            soleChild.tagName.toLowerCase() === 'p'
        ) {
            unwrapElement(soleChild);
            soleChild = heading.firstElementChild as HTMLElement | null;
        }
    });
}
