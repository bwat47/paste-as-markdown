/**
 * Type guard to check if a node is an Element.
 * Provides type narrowing without instanceof checks that break in JSDOM.
 *
 * @example
 * if (isElement(node)) {
 *   // node is narrowed to Element
 *   console.log(node.tagName);
 * }
 */
export function isElement(node: Node): node is Element {
    return node.nodeType === Node.ELEMENT_NODE;
}

/**
 * Type guard to check if a node is a Text node.
 * Provides type narrowing for text content operations.
 *
 * @example
 * if (isTextNode(node)) {
 *   // node is narrowed to Text
 *   return node.textContent || '';
 * }
 */
export function isTextNode(node: Node): node is Text {
    return node.nodeType === Node.TEXT_NODE;
}

/**
 * Check if a wrapper element contains only a specific child element.
 * Ignores whitespace-only text nodes when counting children.
 */
export function onlyContains(wrapper: Element, child: Element): boolean {
    const kids = Array.from(wrapper.childNodes).filter((n) => !(isTextNode(n) && !n.textContent?.trim()));
    return kids.length === 1 && kids[0] === child;
}

/**
 * Check if an element is inside a code block or is itself a code/pre element.
 * Checks both the element itself and its ancestors.
 */
export function isInCode(el: Element): boolean {
    const tag = el.tagName.toLowerCase();
    if (tag === 'code' || tag === 'pre') return true;
    return !!el.closest && !!el.closest('code, pre');
}

/**
 * Type guard to check if a node is an HTMLElement.
 */
export function isHtmlElement(node: Element): node is HTMLElement {
    const view = node.ownerDocument?.defaultView;
    if (view && view.HTMLElement) {
        return node instanceof view.HTMLElement;
    }
    if (typeof HTMLElement !== 'undefined') {
        return node instanceof HTMLElement;
    }
    return false;
}

/**
 * Walk all text nodes in a subtree, optionally skipping code blocks.
 * Useful for bulk text transformations that should preserve code literals.
 */
export function walkTextNodes(root: HTMLElement, callback: (node: Text) => void, skipCode: boolean = true): void {
    const doc = root.ownerDocument;
    if (!doc) return;

    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let node: Node | null;

    while ((node = walker.nextNode())) {
        const textNode = node as Text;
        if (skipCode) {
            const parent = textNode.parentElement;
            if (parent && isInCode(parent)) continue;
        }
        callback(textNode);
    }
}

/**
 * Unwrap an element by replacing it with its children.
 * Moves all child nodes to the parent and removes the wrapper element.
 */
export function unwrapElement(element: HTMLElement): void {
    const parent = element.parentNode;
    if (!parent) return;

    while (element.firstChild) {
        parent.insertBefore(element.firstChild, element);
    }
    parent.removeChild(element);
}

/**
 * Query selector helper that returns an array instead of NodeList.
 * Eliminates the need for Array.from() boilerplate throughout the codebase.
 */
export function $all<T extends Element = Element>(root: ParentNode, selector: string): T[] {
    return Array.from(root.querySelectorAll<T>(selector));
}

/**
 * Check if an element has one of the specified tag names (case-insensitive).
 * More readable and consistent than manual tagName comparisons.
 *
 * @example
 * hasTag(element, 'li') // instead of element.tagName === 'LI'
 * hasTag(element, 'ul', 'ol') // instead of element.tagName === 'UL' || element.tagName === 'OL'
 */
export function hasTag(element: Element, ...tags: string[]): boolean {
    const upperTag = element.tagName.toUpperCase();
    return tags.some((tag) => tag.toUpperCase() === upperTag);
}

/**
 * Check if an element is a heading (h1-h6).
 * More semantic than regex or manual tag checks.
 *
 * @example
 * isHeading(element) // instead of /^H[1-6]$/.test(element.tagName)
 */
export function isHeading(element: Element): boolean {
    return hasTag(element, 'h1', 'h2', 'h3', 'h4', 'h5', 'h6');
}
