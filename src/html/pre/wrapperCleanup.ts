import { unwrapElement } from '../shared/dom';

/**
 * Remove Google Docs wrapper elements that cause unwanted markdown artifacts.
 * Google Docs wraps entire clipboard content in a single formatting tag,
 * causing Turndown to emit ** or * at the beginning/end of all pasted content.
 */
export function removeGoogleDocsWrappers(body: HTMLElement): void {
    const children = Array.from(body.children);

    // Find the main Google Docs wrapper (look for formatting tags with docs-internal-guid)
    const googleDocsWrapper = children.find((child) => {
        const tagName = child.tagName.toLowerCase();
        const wrapperTags = ['b', 'strong', 'i', 'em', 'span'];
        if (!wrapperTags.includes(tagName)) return false;

        // Check if this looks like a Google Docs wrapper
        const id = child.getAttribute('id') || '';
        return id.startsWith('docs-internal-guid-');
    });

    if (!googleDocsWrapper) {
        return; // No Google Docs wrapper found
    }

    const tagName = googleDocsWrapper.tagName.toLowerCase();
    console.debug('[paste-as-markdown]', `Unwrapping Google Docs ${tagName} wrapper`);
    unwrapElement(googleDocsWrapper as HTMLElement);
}
