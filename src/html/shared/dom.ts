export function onlyContains(wrapper: Element, child: Element): boolean {
    const kids = Array.from(wrapper.childNodes).filter(
        (n) => !(n.nodeType === Node.TEXT_NODE && !n.textContent?.trim())
    );
    return kids.length === 1 && kids[0] === child;
}

export function isInCode(el: Element): boolean {
    return !!el.closest && !!el.closest('code, pre');
}
