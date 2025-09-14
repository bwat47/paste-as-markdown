export function onlyContains(wrapper: Element, child: Element): boolean {
    const kids = Array.from(wrapper.childNodes).filter(
        (n) => !(n.nodeType === Node.TEXT_NODE && !n.textContent?.trim())
    );
    return kids.length === 1 && kids[0] === child;
}

export function isInCode(el: Element): boolean {
    return !!el.closest && !!el.closest('code, pre');
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
