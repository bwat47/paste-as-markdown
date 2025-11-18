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
 * Normalizes heading levels to follow a proper hierarchy.
 * Ensures each heading is at most 1 level deeper than the previous heading.
 * E.g. if a document has h2, h5, h6, it will be normalized to h2, h3, h4.
 * The starting level is preserved (so if it starts at h2, it stays h2).
 */
export function normalizeHeadingLevels(body: HTMLElement): void {
    const headings = Array.from(body.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'));
    if (headings.length === 0) return;

    // Track the previous heading level to ensure proper hierarchy
    let previousLevel = 0;

    headings.forEach((h) => {
        const currentLevel = parseInt(h.tagName.substring(1), 10);

        // Determine the new level based on the previous heading
        let newLevel: number;
        if (previousLevel === 0) {
            // First heading - keep its level
            newLevel = currentLevel;
        } else if (currentLevel <= previousLevel + 1) {
            // Level is acceptable (same, up by 1, or going back up)
            newLevel = currentLevel;
        } else {
            // Level jumps too much (e.g., h2 -> h5), normalize to previousLevel + 1
            newLevel = previousLevel + 1;
        }

        // Apply the new level if it changed
        if (newLevel !== currentLevel) {
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

        // Update the previous level for the next iteration
        previousLevel = newLevel;
    });
}
