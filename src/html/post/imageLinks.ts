import { $all } from '../shared/dom';

/**
 * Unwrap anchors that only wrap converted image resources so the resulting Markdown
 * does not leave resource-backed images as clickable external links.
 */
export function unwrapAllConvertedImageLinks(body: HTMLElement): void {
    const imgs = $all<HTMLImageElement>(body, 'img[data-pam-converted="true"]');
    imgs.forEach((img) => {
        img.removeAttribute('data-pam-converted');
        unwrapConvertedImageLink(img);
    });
}

function unwrapConvertedImageLink(img: HTMLImageElement): void {
    let anchor: HTMLElement | null = null;
    let cur: HTMLElement | null = img.parentElement;
    while (cur) {
        if (cur.tagName.toLowerCase() === 'a') {
            anchor = cur;
            break;
        }
        cur = cur.parentElement;
    }
    if (!anchor) return;

    const href = (anchor as HTMLAnchorElement).getAttribute('href') || '';
    if (!/^https?:\/\//i.test(href)) return;
    if (!img.getAttribute('src')?.startsWith(':/')) return;

    const isWhitespace = (n: Node) => n.nodeType === Node.TEXT_NODE && !(n.textContent || '').trim();
    const childrenWithoutWs = (el: Element) => Array.from(el.childNodes).filter((n) => !isWhitespace(n));

    let node: Node = img;
    while (node.parentElement && node.parentElement !== anchor) {
        const p = node.parentElement;
        const kids = childrenWithoutWs(p);
        if (!(kids.length === 1 && kids[0] === node)) return;
        node = p;
    }

    const topNode = node;
    const anchorKids = childrenWithoutWs(anchor);
    if (!(anchorKids.length === 1 && anchorKids[0] === topNode)) return;

    const grand = anchor.parentNode;
    if (!grand) return;
    grand.insertBefore(img, anchor);
    grand.removeChild(anchor);
}
