function unwrapElement(element: HTMLElement): void {
    const parent = element.parentNode;
    if (!parent) return;
    while (element.firstChild) parent.insertBefore(element.firstChild, element);
    parent.removeChild(element);
}

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

export function removeEmptyAnchors(body: HTMLElement): void {
    const anchors = body.querySelectorAll('a[href]');
    anchors.forEach((anchor) => {
        const textContent = anchor.textContent?.trim() || '';
        const hasNonImageChildren = Array.from(anchor.children).some(
            (child) => !['img', 'picture', 'source'].includes(child.tagName.toLowerCase())
        );
        if (textContent.length === 0 && !hasNonImageChildren) anchor.remove();
    });
}

export function cleanHeadingAnchors(body: HTMLElement): void {
    const anchors = body.querySelectorAll('a');
    anchors.forEach((anchor) => {
        const { isPermalink, insideHeading } = analyzeAnchor(anchor as HTMLElement);
        if (isPermalink) {
            anchor.remove();
        } else if (insideHeading) {
            unwrapElement(anchor as HTMLElement);
        }
    });
}
