import type { PasteOptions } from './types';
import { LOG_PREFIX } from './constants';

/**
 * DOM-based HTML preprocessing for cleaning and sanitizing HTML before Turndown conversion.
 * This centralizes all HTML manipulations that were previously scattered across Turndown rules
 * and post-processing regex operations.
 */
export function processHtml(html: string, options: PasteOptions): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const body = doc.body;

    if (!body) {
        console.warn(LOG_PREFIX, 'No body element found in parsed HTML');
        return html;
    }

    // Apply all DOM transformations
    removeScriptAndStyleElements(body);

    if (!options.includeImages) {
        removeImageElements(body);
        removeEmptyAnchors(body);
    }

    fixJoplinInsertRuleBug(body);
    applySemanticTransformations(body);
    cleanHeadingAnchors(body);
    normalizeWhitespaceCharacters(body);
    removeEmptyElements(body);

    return body.innerHTML;
}

/**
 * Remove script and style elements entirely as they should never be converted
 */
function removeScriptAndStyleElements(body: HTMLElement): void {
    const scriptElements = body.querySelectorAll('script, style');
    scriptElements.forEach((el) => el.remove());
}

/**
 * Remove all image-related elements when images are disabled
 */
function removeImageElements(body: HTMLElement): void {
    // Remove img, picture, and source elements
    const imageElements = body.querySelectorAll('img, picture, source');
    imageElements.forEach((el) => el.remove());
}

/**
 * Remove anchor elements that become empty after image removal
 */
function removeEmptyAnchors(body: HTMLElement): void {
    const anchors = body.querySelectorAll('a[href]');
    anchors.forEach((anchor) => {
        const textContent = anchor.textContent?.trim() || '';
        const hasNonImageChildren = Array.from(anchor.children).some(
            (child) => !['img', 'picture', 'source'].includes(child.tagName.toLowerCase())
        );

        // Remove anchors that have no text content and no non-image children
        if (textContent.length === 0 && !hasNonImageChildren) {
            anchor.remove();
        }
    });
}

/**
 * Fix the Joplin insert rule bug by removing text-decoration: underline from anchor elements.
 * This prevents the insert rule from matching anchor elements and creating empty <ins> tags.
 */
function fixJoplinInsertRuleBug(body: HTMLElement): void {
    const anchors = body.querySelectorAll('a');
    anchors.forEach((anchor) => {
        const style = anchor.style;
        if (style && style.textDecoration === 'underline') {
            style.removeProperty('text-decoration');
        }

        // Also handle inline style attribute
        const styleAttr = anchor.getAttribute('style');
        if (styleAttr && styleAttr.includes('text-decoration')) {
            const newStyle = styleAttr.replace(/text-decoration\s*:\s*underline\s*;?/gi, '');
            if (newStyle.trim()) {
                anchor.setAttribute('style', newStyle);
            } else {
                anchor.removeAttribute('style');
            }
        }
    });
}

/**
 * Convert CSS-styled spans to proper semantic HTML elements
 */
function applySemanticTransformations(body: HTMLElement): void {
    // Convert bold spans to <strong>
    const boldSpans = body.querySelectorAll('span');
    boldSpans.forEach((span) => {
        const style = getComputedStyleSafely(span);
        if (isBoldStyle(span, style)) {
            convertSpanToElement(span, 'strong');
        } else if (isItalicStyle(span, style)) {
            convertSpanToElement(span, 'em');
        }
    });
}

/**
 * Safely get computed styles, falling back to inline styles if needed
 */
function getComputedStyleSafely(element: HTMLElement): CSSStyleDeclaration | null {
    try {
        return window.getComputedStyle(element);
    } catch {
        // Fallback to inline styles only
        return null;
    }
}

/**
 * Check if element has bold styling
 */
function isBoldStyle(element: HTMLElement, computedStyle: CSSStyleDeclaration | null): boolean {
    // Check inline style first
    const inlineStyle = element.style.fontWeight;
    if (inlineStyle === 'bold' || inlineStyle === '700' || parseInt(inlineStyle) >= 700) {
        return true;
    }

    // Check style attribute
    const styleAttr = element.getAttribute('style') || '';
    if (/font-weight\s*:\s*(bold|700|[8-9]\d\d)/i.test(styleAttr)) {
        return true;
    }

    // Check computed style if available
    if (computedStyle) {
        const weight = computedStyle.fontWeight;
        return weight === 'bold' || weight === '700' || parseInt(weight) >= 700;
    }

    return false;
}

/**
 * Check if element has italic styling
 */
function isItalicStyle(element: HTMLElement, computedStyle: CSSStyleDeclaration | null): boolean {
    // Check inline style first
    if (element.style.fontStyle === 'italic') {
        return true;
    }

    // Check style attribute
    const styleAttr = element.getAttribute('style') || '';
    if (/font-style\s*:\s*italic/i.test(styleAttr)) {
        return true;
    }

    // Check computed style if available
    if (computedStyle && computedStyle.fontStyle === 'italic') {
        return true;
    }

    return false;
}

/**
 * Convert a span element to a semantic element
 */
function convertSpanToElement(span: HTMLElement, tagName: string): void {
    const newElement = span.ownerDocument.createElement(tagName);

    // Copy all attributes except style-related ones we've already processed
    Array.from(span.attributes).forEach((attr) => {
        if (attr.name !== 'style') {
            newElement.setAttribute(attr.name, attr.value);
        }
    });

    // Copy all child nodes
    while (span.firstChild) {
        newElement.appendChild(span.firstChild);
    }

    // Replace the span with the new element
    span.parentNode?.replaceChild(newElement, span);
}

/**
 * Clean GitHub-style permalink anchors and heading links.
 * Migrated from turndownRules.ts cleanHeadingAnchors functionality.
 */
function cleanHeadingAnchors(body: HTMLElement): void {
    const anchors = body.querySelectorAll('a');
    anchors.forEach((anchor) => {
        const { isPermalink, insideHeading } = analyzeAnchor(anchor);

        if (isPermalink) {
            // Remove permalink anchors entirely
            anchor.remove();
        } else if (insideHeading) {
            // Unwrap heading links - replace with their content
            unwrapElement(anchor);
        }
    });
}

/**
 * Analyze an anchor element to determine permalink / heading context.
 * Migrated from turndownRules.ts
 */
function analyzeAnchor(node: HTMLElement): { isPermalink: boolean; insideHeading: boolean } {
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

    return { isPermalink, insideHeading };
}

/**
 * Unwrap an element by replacing it with its children
 */
function unwrapElement(element: HTMLElement): void {
    const parent = element.parentNode;
    if (!parent) return;

    // Move all children before the element
    while (element.firstChild) {
        parent.insertBefore(element.firstChild, element);
    }

    // Remove the now-empty element
    parent.removeChild(element);
}

/**
 * Normalize whitespace characters to ensure proper rendering in markdown
 * Convert various NBSP encodings to regular spaces for better markdown compatibility
 */
function normalizeWhitespaceCharacters(body: HTMLElement): void {
    // Walk through all text nodes and normalize whitespace characters
    const doc = body.ownerDocument;
    if (!doc) return;

    const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT, null);

    const textNodesToUpdate: { node: Text; newText: string }[] = [];

    let node: Node | null;
    while ((node = walker.nextNode())) {
        const textNode = node as Text;
        const originalText = textNode.textContent || '';

        // Skip normalization inside code elements to preserve semantic whitespace
        const parentElement = textNode.parentElement;
        if (
            parentElement &&
            (parentElement.tagName.toLowerCase() === 'code' ||
                parentElement.tagName.toLowerCase() === 'pre' ||
                parentElement.closest('code, pre'))
        ) {
            continue;
        }

        // Normalize various NBSP representations to regular spaces
        // This handles UTF-8 encoded NBSP (Â ) and Unicode NBSP (\u00A0)
        const normalizedText = originalText
            .replace(/Â\s/g, ' ') // UTF-8 encoded NBSP + space -> regular space
            .replace(/\u00A0/g, ' ') // Unicode NBSP -> regular space
            .replace(/&nbsp;/g, ' '); // HTML entity -> regular space

        if (normalizedText !== originalText) {
            textNodesToUpdate.push({ node: textNode, newText: normalizedText });
        }
    }

    // Apply the updates (done separately to avoid modifying while iterating)
    textNodesToUpdate.forEach(({ node, newText }) => {
        node.textContent = newText;
    });
}

/**
 * Remove elements that contain only whitespace and have no meaningful child elements
 * Inspired by Obsidian paste-reformatter plugin's cleaner approach
 */
function removeEmptyElements(body: HTMLElement): void {
    // Use a simpler approach: repeatedly find and remove empty elements until none remain
    // This handles nested empty structures naturally
    let removedSomething = true;
    while (removedSomething) {
        removedSomething = false;
        const elements = body.querySelectorAll('*');

        for (const element of Array.from(elements)) {
            const htmlElement = element as HTMLElement;
            if (isElementEmpty(htmlElement)) {
                // Only remove if it's not providing meaningful spacing
                if (!isSpacingElement(htmlElement)) {
                    htmlElement.remove();
                    removedSomething = true;
                }
            }
        }
    }
}

/**
 * Check if an element is effectively empty using a recursive approach
 * Based on the cleaner pattern from the Obsidian plugin
 */
function isElementEmpty(element: HTMLElement): boolean {
    // Elements that are always meaningful, even when empty
    const alwaysMeaningful = new Set([
        'img',
        'br',
        'hr',
        'input',
        'area',
        'base',
        'col',
        'embed',
        'link',
        'meta',
        'param',
        'source',
        'track',
        'wbr',
        'code', // Code elements preserve whitespace semantically
        'pre', // Preformatted text preserves whitespace
    ]);

    if (alwaysMeaningful.has(element.tagName.toLowerCase())) {
        return false;
    }

    // Check if element has non-whitespace text content
    const textContent = element.textContent || '';
    if (textContent.trim().length > 0) {
        return false;
    }

    // Check if all child elements are also empty
    const children = Array.from(element.children) as HTMLElement[];
    return children.every((child) => isElementEmpty(child));
}

/**
 * Simplified check for elements that provide meaningful spacing between content
 * Much cleaner than the previous complex adjacency detection
 */
function isSpacingElement(element: HTMLElement): boolean {
    // Only consider inline elements for spacing preservation
    const inlineElements = new Set([
        'span',
        'a',
        'em',
        'strong',
        'code',
        'i',
        'b',
        'u',
        's',
        'sub',
        'sup',
        'small',
        'mark',
    ]);

    if (!inlineElements.has(element.tagName.toLowerCase())) {
        return false;
    }

    const textContent = element.textContent || '';

    // Must contain only whitespace to be a spacing element
    if (textContent.trim().length > 0) {
        return false;
    }

    // Must actually contain some whitespace (not completely empty)
    if (textContent.length === 0) {
        return false;
    }

    // Simple heuristic: if the element is between non-whitespace content, preserve it
    return hasContentContext(element);
}

/**
 * Context detection - check if element is positioned between meaningful content
 * Handles both direct siblings and parent-level context for nested cases
 */
function hasContentContext(element: HTMLElement): boolean {
    // Check if element provides spacing in its immediate context
    if (hasLocalSpacingContext(element)) {
        return true;
    }

    // For nested inline elements, check if the parent would benefit from this spacing
    // e.g., <span>text<span> </span></span><a>link</a> - the inner span provides spacing between text and link
    const parent = element.parentElement;
    if (parent && isInlineParent(parent)) {
        return hasLocalSpacingContext(parent);
    }

    return false;
}

/**
 * Check if element provides spacing in its local context (either within parent or parent's context)
 */
function hasLocalSpacingContext(element: HTMLElement): boolean {
    const parent = element.parentElement;
    if (!parent) return false;

    const siblings = Array.from(parent.childNodes);
    const elementIndex = siblings.indexOf(element);

    // Check for meaningful content before this element
    const hasContentBefore = siblings.slice(0, elementIndex).some((node) => {
        if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
            return true;
        }
        if (node.nodeType === Node.ELEMENT_NODE) {
            const elem = node as HTMLElement;
            // Check if element has meaningful content or contains images
            return elem.textContent?.trim() || elem.querySelector('img, picture, source');
        }
        return false;
    });

    // Check for meaningful content after this element
    const hasContentAfter = siblings.slice(elementIndex + 1).some((node) => {
        if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
            return true;
        }
        if (node.nodeType === Node.ELEMENT_NODE) {
            const elem = node as HTMLElement;
            // Check if element has meaningful content or contains images
            return elem.textContent?.trim() || elem.querySelector('img, picture, source');
        }
        return false;
    });

    // Standard case: content before and after
    if (hasContentBefore && hasContentAfter) {
        return true;
    }

    // Special case for elements at boundaries that still provide meaningful spacing
    // e.g., <span>text<span> </span></span> - the inner span provides trailing spacing
    if (hasContentBefore && !hasContentAfter) {
        // Check if parent has content after it (for trailing spacing)
        const grandParent = parent.parentElement;
        if (grandParent) {
            const parentSiblings = Array.from(grandParent.childNodes);
            const parentIndex = parentSiblings.indexOf(parent);
            const hasParentContentAfter = parentSiblings
                .slice(parentIndex + 1)
                .some(
                    (node) =>
                        (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) ||
                        (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).textContent?.trim())
                );
            if (hasParentContentAfter) {
                return true;
            }
        }
    }

    // Special case for leading spacing
    if (!hasContentBefore && hasContentAfter) {
        // Check if parent has content before it (for leading spacing)
        const grandParent = parent.parentElement;
        if (grandParent) {
            const parentSiblings = Array.from(grandParent.childNodes);
            const parentIndex = parentSiblings.indexOf(parent);
            const hasParentContentBefore = parentSiblings
                .slice(0, parentIndex)
                .some(
                    (node) =>
                        (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) ||
                        (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).textContent?.trim())
                );
            if (hasParentContentBefore) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Check if parent is an inline element that could be providing spacing context
 */
function isInlineParent(element: HTMLElement): boolean {
    const inlineElements = new Set([
        'span',
        'a',
        'em',
        'strong',
        'code',
        'i',
        'b',
        'u',
        's',
        'sub',
        'sup',
        'small',
        'mark',
    ]);
    return inlineElements.has(element.tagName.toLowerCase());
}
