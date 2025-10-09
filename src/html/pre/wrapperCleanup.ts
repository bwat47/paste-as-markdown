import { unwrapElement } from '../shared/dom';
import logger from '../../logger';

/**
 * Remove Google Docs wrapper elements that cause unwanted markdown artifacts.
 * Google Docs wraps entire clipboard content in a single formatting tag,
 * causing Turndown to emit ** or * at the beginning/end of all pasted content.
 */
export function removeGoogleDocsWrappers(body: HTMLElement): void {
    const WRAPPER_TAGS = new Set(['b', 'strong', 'i', 'em', 'span']);

    // Find the Google Docs marker anywhere within the pasted HTML.
    // Some pastes place the docs-internal id on a descendant rather than the wrapper node.
    const marker = body.querySelector('[id^="docs-internal-guid-"]') as HTMLElement | null;

    // If a marker exists, ensure we only unwrap wrappers that actually contain it.
    const markerContainedBy = (el: Element) => (marker ? el.contains(marker) : true);

    // Unwrap chains of top-level wrappers that contain the marker (if present), even if other benign
    // siblings exist (e.g., <meta>, <br class="Apple-interchange-newline">). This targets only the
    // wrapper(s) around the actual content.
    // Repeat until no more top-level wrappers that contain the marker remain.
    // This handles structures like: <b id=...><p>..</p></b><br ...>
    // and nested variants: <b><span id=...>..</span></b>
    // To remain conservative, we only unwrap direct children of <body>.
    // If no marker is present, we still allow unwrapping wrapper tags at top-level (Docs detection gates this).
    while (true) {
        const candidates = Array.from(body.children).filter((el) => {
            const tag = el.tagName.toLowerCase();
            return WRAPPER_TAGS.has(tag) && markerContainedBy(el);
        }) as HTMLElement[];
        if (candidates.length === 0) break;
        // Unwrap each candidate once per pass; in typical Docs HTML this is a single element
        for (const el of candidates) {
            logger.debug(`Unwrapping Google Docs ${el.tagName.toLowerCase()} wrapper`);
            unwrapElement(el);
        }
        // Loop to catch nested wrappers that become top-level after previous unwrap
    }
}
