/**
 * Prune non-image children from anchors that wrap images.
 *
 * Many platforms (e.g., Discourse) wrap an <img> in an <a> and append UI/metadata
 * elements (div/span/svg) as siblings inside the same anchor. Turndown will then
 * convert the anchor to a Markdown link that contains the image and leftover text,
 * producing unwanted bracketed blocks.
 *
 * Strategy:
 * - For each <a> element that contains an <img> descendant, remove all direct child
 *   nodes that are not images (allow <picture> wrapper as well) and drop whitespace-only
 *   text nodes.
 * - This reduces the anchor to only contain the image, which enables downstream logic
 *   (e.g., resource conversion unwrapping) to remove the anchor entirely.
 */
export function pruneNonImageAnchorChildren(body: HTMLElement): void {
    const anchors = Array.from(body.querySelectorAll('a')) as HTMLAnchorElement[];

    anchors.forEach((anchor) => {
        const img = anchor.querySelector('img');
        if (!img) return; // Only target anchors that contain an image

        const keepElement = (el: Element): boolean => {
            const tagName = el.tagName.toLowerCase();
            // Keep image-related elements and any element that contains the image
            return tagName === 'img' || tagName === 'picture' || tagName === 'source' || el.contains(img);
        };

        // Remove non-image children (iterate over a copy since we're modifying)
        const childrenToCheck = Array.from(anchor.childNodes);
        for (const child of childrenToCheck) {
            if (child.nodeType === Node.ELEMENT_NODE) {
                const el = child as Element;
                if (!keepElement(el)) {
                    el.remove();
                }
            } else if (child.nodeType === Node.TEXT_NODE) {
                // Remove whitespace-only text nodes
                if (!child.textContent || child.textContent.trim() === '') {
                    child.remove();
                }
            }
        }
    });
}
