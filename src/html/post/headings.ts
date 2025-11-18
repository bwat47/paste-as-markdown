/**
 * Force headings to contain plain text only by stripping nested markup.
 * Any descendant element IDs get hoisted to the heading before removal so
 * downstream Markdown renderers still have an anchor to work with.
 */
export function stripHeadingFormatting(body: HTMLElement): void {
    const headings = body.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6');

    headings.forEach((heading) => {
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

/**
 * Normalizes heading levels to be sequential.
 * E.g. if a document has h2, then h5, then h6, it will be normalized to h2, h3, h4.
 * The starting level is preserved (so if it starts at h2, it stays h2).
 */
export function normalizeHeadingLevels(body: HTMLElement): void {
    const headings = Array.from(body.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'));
    if (headings.length === 0) return;

    // 1. Identify unique levels present
    const levels = new Set<number>();
    headings.forEach((h) => {
        const level = parseInt(h.tagName.substring(1), 10);
        levels.add(level);
    });

    // 2. Create mapping from old level to new level
    const sortedLevels = Array.from(levels).sort((a, b) => a - b);
    const mapping = new Map<number, number>();
    const startLevel = sortedLevels[0];

    sortedLevels.forEach((oldLevel, index) => {
        mapping.set(oldLevel, startLevel + index);
    });

    // 3. Apply mapping
    headings.forEach((h) => {
        const oldLevel = parseInt(h.tagName.substring(1), 10);
        const newLevel = mapping.get(oldLevel);

        if (newLevel && newLevel !== oldLevel) {
            const newTag = `H${newLevel}`;
            const newHeading = h.ownerDocument.createElement(newTag);

            // Copy attributes
            Array.from(h.attributes).forEach((attr) => {
                newHeading.setAttribute(attr.name, attr.value);
            });

            // Move children
            while (h.firstChild) {
                newHeading.appendChild(h.firstChild);
            }

            h.replaceWith(newHeading);
        }
    });
}
