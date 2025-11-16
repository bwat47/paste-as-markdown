/**
 * Check if a wrapper element contains only a specific child element.
 * Ignores whitespace-only text nodes when counting children.
 */
export function onlyContains(wrapper: Element, child: Element): boolean {
    const kids = Array.from(wrapper.childNodes).filter(
        (n) => !(n.nodeType === Node.TEXT_NODE && !n.textContent?.trim())
    );
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
