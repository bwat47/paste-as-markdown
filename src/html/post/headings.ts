import { $all } from '../shared/dom';

/**
 * Force headings to contain plain text only by stripping nested markup.
 * Any descendant element IDs get hoisted to the heading before removal so
 * downstream Markdown renderers still have an anchor to work with.
 */
export function stripHeadingFormatting(body: HTMLElement): void {
    $all<HTMLElement>(body, 'h1, h2, h3, h4, h5, h6').forEach((heading) => {
        if (!heading.hasAttribute('id')) {
            const descendantWithId = heading.querySelector<HTMLElement>('[id]');
            if (descendantWithId) {
                const descendantId = descendantWithId.getAttribute('id');
                if (descendantId) {
                    heading.setAttribute('id', descendantId);
                }
            }
        }

        const rawText = heading.textContent || '';
        const normalized = rawText.replace(/\s+/g, ' ').trim();

        heading.textContent = normalized;
    });
}
