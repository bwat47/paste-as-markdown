import { isElement, isTextNode, onlyContains, unwrapElement } from '../shared/dom';
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
const BLOCK_LEVEL_SELECTOR = Array.from(BLOCK_LEVEL_TAGS).join(',');
const HAS_NON_WHITESPACE = /\S/;
const STARTS_WITH_WHITESPACE = /^\s/;
const ENDS_WITH_WHITESPACE = /\s$/;

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
    const isPermalinkText = text.length <= 2 && /^[¶#🔗§]*$/u.test(text);
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

/**
 * Check whether an <svg> exposes an accessible name (aria-label / aria-labelledby,
 * or a non-empty <title>/<desc>), which makes it meaningful content rather than decoration.
 */
function hasAccessibleSvgLabel(svg: Element): boolean {
    const ariaLabel = svg.getAttribute('aria-label') || svg.getAttribute('aria-labelledby');
    if (ariaLabel && ariaLabel.trim().length > 0) return true;

    const accessibleNode = svg.querySelector('title, desc');
    return !!accessibleNode && (accessibleNode.textContent || '').trim().length > 0;
}

/**
 * Check whether a single child node counts as meaningful anchor content.
 * Decorative SVG internals are ignored; everything else is inspected recursively.
 */
function isMeaningfulNode(node: ChildNode, options: PasteOptions): boolean {
    if (isTextNode(node)) return (node.textContent || '').trim().length > 0;
    if (!isElement(node)) return false;

    const tag = node.tagName.toLowerCase();

    if (MEDIA_TAGS.has(tag) && options.includeImages) return true;
    if (tag === 'svg' && hasAccessibleSvgLabel(node)) return true;
    if (DECORATIVE_SVG_TAGS.has(tag)) return false;

    return hasMeaningfulDescendant(node, options);
}

function hasMeaningfulDescendant(element: Element, options: PasteOptions): boolean {
    return Array.from(element.childNodes).some((node) => isMeaningfulNode(node, options));
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

function findSiblingText(node: ChildNode | null, direction: 'previousSibling' | 'nextSibling'): string | null {
    let sibling = node;
    while (sibling) {
        const text = sibling.textContent || '';
        if (text.length > 0) return text;
        sibling = sibling[direction];
    }
    return null;
}

function needsBoundarySpace(left: string | null, right: string | null): boolean {
    if (left === null || right === null) return false;
    return (
        HAS_NON_WHITESPACE.test(left) &&
        HAS_NON_WHITESPACE.test(right) &&
        !ENDS_WITH_WHITESPACE.test(left) &&
        !STARTS_WITH_WHITESPACE.test(right)
    );
}

/** Preserve word boundaries that block rendering supplied before its wrapper is removed. */
function insertBlockBoundarySpaces(block: HTMLElement): void {
    const text = block.textContent || '';
    if (!HAS_NON_WHITESPACE.test(text)) return;

    const parent = block.parentNode;
    const doc = block.ownerDocument;
    if (!parent || !doc) return;

    const needsLeadingSpace = needsBoundarySpace(findSiblingText(block.previousSibling, 'previousSibling'), text);
    const needsTrailingSpace = needsBoundarySpace(text, findSiblingText(block.nextSibling, 'nextSibling'));

    if (needsLeadingSpace) parent.insertBefore(doc.createTextNode(' '), block);
    if (needsTrailingSpace) parent.insertBefore(doc.createTextNode(' '), block.nextSibling);
}

/**
 * Unwrap block-level elements from inside anchors to prevent newlines in link syntax.
 * Transforms <a href="url"><div></div><span>text</span></a> into
 * <a href="url"><span>text</span></a>. All descendant wrappers are inspected because a
 * block nested inside inline content can also make Turndown emit a multiline link label. Spaces
 * are inserted at touching text boundaries so flattening does not concatenate words.
 */
function unwrapBlockElementsInAnchor(anchor: HTMLElement): void {
    const blockElements = Array.from(anchor.querySelectorAll<HTMLElement>(BLOCK_LEVEL_SELECTOR));

    blockElements.forEach((block) => {
        insertBlockBoundarySpaces(block);
        unwrapElement(block);
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
        } else {
            // Markdown links cannot contain blocks; flatten every block wrapper even when the
            // anchor also has inline content.
            unwrapBlockElementsInAnchor(anchor as HTMLElement);
        }
    });
}
