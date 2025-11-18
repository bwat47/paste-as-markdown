import { hasTag, isElement, isTextNode } from '../shared/dom';

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
    // Find all images inside anchors, then build a Set of their parent anchors
    // This avoids iterating through text links that never contain images
    const imgsInAnchors = body.querySelectorAll('a img');
    const anchorsWithImages = new Set<HTMLAnchorElement>();

    imgsInAnchors.forEach((img) => {
        const anchor = img.closest('a');
        if (anchor) anchorsWithImages.add(anchor);
    });

    // Process only anchors that actually contain images
    anchorsWithImages.forEach((anchor) => {
        const img = anchor.querySelector('img')!; // Non-null: we know this anchor has an img

        const keepElement = (el: Element): boolean => {
            // Keep image-related elements and any element that contains the image
            return hasTag(el, 'img', 'picture', 'source') || el.contains(img);
        };

        // Remove non-image children (iterate over a copy since we're modifying)
        const childrenToCheck = Array.from(anchor.childNodes);
        for (const child of childrenToCheck) {
            if (isElement(child)) {
                if (!keepElement(child)) {
                    child.remove();
                }
            } else if (isTextNode(child)) {
                // Remove whitespace-only text nodes
                if (!child.textContent || child.textContent.trim() === '') {
                    child.remove();
                }
            }
        }
    });
}
