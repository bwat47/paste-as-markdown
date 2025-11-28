import { onlyContains, unwrapElement, isTextNode, isElement } from '../shared/dom';
import type { PasteOptions } from '../../types';

const DECORATIVE_SVG_TAGS = new Set(['path', 'g', 'defs', 'use', 'symbol', 'clipPath', 'mask', 'pattern']);
const MEDIA_TAGS = new Set(['img', 'picture', 'source']);
const BLOCK_LEVEL_TAGS = new Set([
    'p',
    'div',
    'blockquote',
    'pre',
    'ul',
    'ol',
    'li',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'table',
    'form',
    'fieldset',
    'address',
    'section',
    'article',
    'aside',
    'header',
    'footer',
    'nav',
    'main',
    'dl',
    'dt',
    'dd',
    'figure',
    'figcaption',
    'details',
    'summary',
]);

/**
 * Analyze an anchor element to determine permalink / heading context.
 */
function analyzeAnchor(node: HTMLElement): {
    isPermalink: boolean;
    wrapsHeading: boolean;
} {
    const clsRaw = node.getAttribute('class') || '';
    const classes = clsRaw ? clsRaw.split(/\s+/).filter(Boolean) : [];
    const hasAnchorClass = classes.includes('anchor');
    const hasHeaderlinkClass = classes.includes('headerlink');
    const href = (node.getAttribute('href') || '').trim();
    const id = (node.getAttribute('id') || '').trim();
    const text = (node.textContent || '').trim();
    const title = (node.getAttribute('title') || '').trim();

    // Common permalink indicators used by GitHub, Sphinx, MkDocs, etc.
    const isPermalinkText = text.length <= 2 && /^[¶#🔗§]*$/.test(text);
    const isPermalinkClass = hasAnchorClass || hasHeaderlinkClass;
    const hashIndex = href.indexOf('#');
    const hasFragment = hashIndex !== -1 && hashIndex < href.length - 1;
    const isPermalinkHref = hasFragment;
    const isPermalinkId = id.startsWith('user-content-');
    const isPermalinkTitle = title.toLowerCase().includes('permalink');

    const isPermalink =
        isPermalinkClass &&
        (isPermalinkHref || isPermalinkId) &&
        (text.length === 0 || isPermalinkText || isPermalinkTitle);
    const headingChild = node.firstElementChild;
    const wrapsHeading = !!headingChild && /^H[1-6]$/.test(headingChild.tagName) && onlyContains(node, headingChild);
    return { isPermalink, wrapsHeading };
}

function hasMeaningfulDescendant(element: Element, options: PasteOptions): boolean {
    const childNodes = Array.from(element.childNodes);
    for (const node of childNodes) {
        if (isTextNode(node)) {
            if ((node.textContent || '').trim().length > 0) return true;
            continue;
        }
        if (!isElement(node)) continue;

        const child = node;
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
 * Check if anchor contains only block-level elements (ignoring whitespace text nodes).
 */
function containsOnlyBlockElements(anchor: HTMLElement): boolean {
    const children = Array.from(anchor.childNodes).filter(
        (node) =>
            !(isTextNode(node) && (!node.textContent || !node.textContent.trim())) &&
            node.nodeType !== Node.COMMENT_NODE
    );

    if (children.length === 0) return false;

    return children.every((child) => {
        if (!isElement(child)) return false;
        return BLOCK_LEVEL_TAGS.has(child.tagName.toLowerCase());
    });
}

/**
 * Unwrap block-level elements from inside anchors to prevent newlines in link syntax.
 * Transforms <a href="url"><p>text</p></a> into <a href="url">text</a>
 */
function unwrapBlockElementsInAnchor(anchor: HTMLElement): void {
    const blockElements = Array.from(anchor.children).filter((child) =>
        BLOCK_LEVEL_TAGS.has(child.tagName.toLowerCase())
    );

    blockElements.forEach((blockEl) => {
        unwrapElement(blockEl as HTMLElement);
    });
}

/**
 * Clean GitHub-style permalink anchors, heading links, and block-wrapping anchors.
 */
export function normalizeAnchors(body: HTMLElement): void {
    const anchors = body.querySelectorAll('a');
    anchors.forEach((anchor) => {
        const { isPermalink, wrapsHeading } = analyzeAnchor(anchor as HTMLElement);
        if (isPermalink) {
            anchor.remove();
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
        } else if (containsOnlyBlockElements(anchor as HTMLElement)) {
            // Unwrap block-level elements to prevent newlines inside link syntax
            unwrapBlockElementsInAnchor(anchor as HTMLElement);
        }
    });
}
