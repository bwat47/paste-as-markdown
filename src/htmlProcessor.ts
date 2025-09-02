import type { PasteOptions } from './types';
import { LOG_PREFIX } from './constants';

/**
 * DOM-based HTML preprocessing for cleaning and sanitizing HTML before Turndown conversion.
 * This centralizes all HTML manipulations that were previously scattered across Turndown rules
 * and post-processing regex operations.
 */
export function processHtml(html: string, options: PasteOptions): string {
    try {
        // Use DOMParser to create a proper DOM structure for manipulation
        const ParserCtor = (globalThis as unknown as { DOMParser?: { new (): DOMParser } }).DOMParser;
        if (!ParserCtor) {
            console.warn(LOG_PREFIX, 'DOMParser not available, falling back to basic processing');
            return basicHtmlProcessing(html, options);
        }

        const parser = new ParserCtor();
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
        }

        fixJoplinInsertRuleBug(body);
        applySemanticTransformations(body);
        cleanHeadingAnchors(body);
        removeEmptyElements(body);

        return body.innerHTML;
    } catch (error) {
        console.warn(LOG_PREFIX, 'DOM processing failed, falling back to basic processing:', error);
        return basicHtmlProcessing(html, options);
    }
}

/**
 * Fallback processing for environments without DOMParser
 */
function basicHtmlProcessing(html: string, options: PasteOptions): string {
    let processed = html;

    // Basic script/style removal
    processed = processed.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    processed = processed.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    // Basic image removal if disabled
    if (!options.includeImages) {
        processed = processed.replace(/<img[^>]*>/gi, '');
        processed = processed.replace(/<picture[^>]*>[\s\S]*?<\/picture>/gi, '');
    }

    return processed;
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
 * Remove elements that contain only whitespace and have no meaningful child elements
 */
function removeEmptyElements(body: HTMLElement): void {
    // Elements that are considered meaningful even when empty
    const meaningfulElements = new Set([
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
    ]);

    // Process elements from bottom-up to handle nested empty elements
    const walker = body.ownerDocument.createTreeWalker(body, NodeFilter.SHOW_ELEMENT, null);

    const elements: HTMLElement[] = [];
    let node = walker.nextNode();
    while (node) {
        elements.push(node as HTMLElement);
        node = walker.nextNode();
    }

    // Process in reverse order (deepest first)
    elements.reverse().forEach((element) => {
        if (meaningfulElements.has(element.tagName.toLowerCase())) {
            return; // Skip meaningful elements
        }

        if (isEmptyElement(element)) {
            element.remove();
        }
    });
}

/**
 * Check if an element is effectively empty (only whitespace, no meaningful children)
 */
function isEmptyElement(element: HTMLElement): boolean {
    // Elements that are considered meaningful even when empty
    const meaningfulElements = new Set([
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
    ]);

    // Check if element has meaningful child elements
    const children = Array.from(element.children) as HTMLElement[];
    for (const child of children) {
        if (meaningfulElements.has(child.tagName.toLowerCase())) {
            return false;
        }
        if (!isEmptyElement(child)) {
            return false;
        }
    }

    // Check if element has meaningful text content
    const textContent = element.textContent || '';
    return textContent.trim().length === 0;
}
