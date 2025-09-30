import { onlyContains, unwrapElement } from '../shared/dom';
import type { PasteOptions } from '../../types';

const DECORATIVE_SVG_TAGS = new Set(['path', 'g', 'defs', 'use', 'symbol', 'clipPath', 'mask', 'pattern']);
const MEDIA_TAGS = new Set(['img', 'picture', 'source']);

/**
 * Analyze an anchor element to determine permalink / heading context.
 */
function analyzeAnchor(node: HTMLElement): {
    isPermalink: boolean;
    insideHeading: boolean;
    wrapsHeading: boolean;
} {
    const parent = node.parentElement;
    const clsRaw = node.getAttribute('class') || '';
    const classes = clsRaw ? clsRaw.split(/\s+/).filter(Boolean) : [];
    const hasAnchorClass = classes.includes('anchor');
    const href = (node.getAttribute('href') || '').trim();
    const id = (node.getAttribute('id') || '').trim();
    const text = (node.textContent || '').trim();
    const isPermalink =
        hasAnchorClass &&
        ((href.startsWith('#') && href.length > 1) || id.startsWith('user-content-')) &&
        text.length === 0;
    const insideHeading = !!parent && /^H[1-6]$/.test(parent.nodeName);
    const headingChild = node.firstElementChild;
    const wrapsHeading = !!headingChild && /^H[1-6]$/.test(headingChild.tagName) && onlyContains(node, headingChild);
    return { isPermalink, insideHeading, wrapsHeading };
}

function hasMeaningfulDescendant(element: Element, options: PasteOptions): boolean {
    const childNodes = Array.from(element.childNodes);
    for (const node of childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            if ((node.textContent || '').trim().length > 0) return true;
            continue;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        const child = node as Element;
        const tag = child.tagName.toLowerCase();

        if (MEDIA_TAGS.has(tag) && options.includeImages) return true;
        if (tag === 'svg') {
            const ariaLabel = child.getAttribute('aria-label') || child.getAttribute('aria-labelledby');
            if (ariaLabel && ariaLabel.trim().length > 0) return true;

            const accessibleNode = child.querySelector('title, desc');
            if (accessibleNode && (accessibleNode.textContent || '').trim().length > 0) return true;
        }
        if (DECORATIVE_SVG_TAGS.has(tag)) continue;

        if (hasMeaningfulDescendant(child, options)) return true;
    }
    return false;
}

/**
 * Remove anchor elements that lack visible content after sanitization.
 */
export function removeEmptyAnchors(body: HTMLElement, options: PasteOptions): void {
    const anchors = body.querySelectorAll('a[href]');
    anchors.forEach((anchor) => {
        const textContent = anchor.textContent?.trim() || '';
        if (textContent.length > 0) return;

        if (!anchor.firstChild) {
            anchor.remove();
            return;
        }

        if (hasMeaningfulDescendant(anchor, options)) return;

        anchor.remove();
    });
}

/**
 * Clean GitHub-style permalink anchors and heading links.
 */
export function cleanHeadingAnchors(body: HTMLElement): void {
    const anchors = body.querySelectorAll('a');
    anchors.forEach((anchor) => {
        const { isPermalink, insideHeading, wrapsHeading } = analyzeAnchor(anchor as HTMLElement);
        if (isPermalink) {
            anchor.remove();
        } else if (insideHeading) {
            unwrapElement(anchor as HTMLElement);
        } else if (wrapsHeading) {
            const heading = anchor.firstElementChild as HTMLElement | null;
            if (heading) {
                const anchorId = anchor.getAttribute('id');
                if (anchorId && !heading.getAttribute('id')) {
                    heading.setAttribute('id', anchorId);
                }
                const parent = anchor.parentNode;
                if (parent) {
                    parent.insertBefore(heading, anchor);
                    parent.removeChild(anchor);
                }
            } else {
                unwrapElement(anchor as HTMLElement);
            }
        }
    });
}
