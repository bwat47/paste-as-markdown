import { onlyContains, unwrapElement, isTextNode, isElement } from '../shared/dom';
import type { PasteOptions } from '../../types';

const DECORATIVE_SVG_TAGS = new Set(['path', 'g', 'defs', 'use', 'symbol', 'clipPath', 'mask', 'pattern']);
const MEDIA_TAGS = new Set(['img', 'picture', 'source']);
/** Tags that force a line break in Markdown output and therefore cannot survive inside a link. */
const BLOCK_LEVEL_TAGS = [
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
] as const;
const BLOCK_LEVEL_SELECTOR = BLOCK_LEVEL_TAGS.join(', ');
const BLOCK_BOUNDARY_SEPARATOR = ' ';

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

function startsWithWhitespace(node: Node): boolean {
    const text = node.textContent || '';
    return text.length > 0 && text.trimStart().length < text.length;
}

function endsWithWhitespace(node: Node): boolean {
    const text = node.textContent || '';
    return text.length > 0 && text.trimEnd().length < text.length;
}

/** Preserve the visual boundary around a block before removing its wrapper. */
function preserveBlockBoundaryWhitespace(blockElement: HTMLElement): void {
    const parent = blockElement.parentNode;
    if (!parent) return;

    const previousSibling = blockElement.previousSibling;
    const nextSibling = blockElement.nextSibling;

    // An empty block contributes no label content, but when it separates two content runs it
    // still represents a visual boundary. Avoid adding leading/trailing spaces for empty icons.
    if (!blockElement.hasChildNodes()) {
        if (
            previousSibling &&
            nextSibling &&
            !endsWithWhitespace(previousSibling) &&
            !startsWithWhitespace(nextSibling)
        ) {
            parent.insertBefore(blockElement.ownerDocument.createTextNode(BLOCK_BOUNDARY_SEPARATOR), blockElement);
        }
        return;
    }

    if (previousSibling && !endsWithWhitespace(previousSibling) && !startsWithWhitespace(blockElement)) {
        parent.insertBefore(blockElement.ownerDocument.createTextNode(BLOCK_BOUNDARY_SEPARATOR), blockElement);
    }

    if (nextSibling && !endsWithWhitespace(blockElement) && !startsWithWhitespace(nextSibling)) {
        parent.insertBefore(blockElement.ownerDocument.createTextNode(BLOCK_BOUNDARY_SEPARATOR), nextSibling);
    }
}

/**
 * Unwrap every block-level descendant of an anchor to prevent newlines in link syntax.
 * Markdown inline links cannot span blank lines, so any block inside an anchor breaks the
 * link regardless of whether it sits next to inline siblings:
 * `<a href="url"><div></div><span>text</span></a>` becomes `<a href="url">text</a>`.
 */
function flattenBlockElementsInAnchor(anchor: HTMLElement): void {
    // Static list in document order: unwrapping an outer block leaves its descendants in the
    // tree (re-parented to the anchor), so nested blocks are still unwrapped by later entries.
    const blockElements = anchor.querySelectorAll<HTMLElement>(BLOCK_LEVEL_SELECTOR);
    blockElements.forEach((blockEl) => {
        preserveBlockBoundaryWhitespace(blockEl);
        unwrapElement(blockEl);
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
        } else if (anchor.getAttribute('href')) {
            flattenBlockElementsInAnchor(anchor as HTMLElement);
        }
    });
}
