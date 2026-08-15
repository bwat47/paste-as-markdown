import { isElement, isTextNode } from '../shared/dom';

const ANCHOR_TAG = 'a';
const PICTURE_TAG = 'picture';
const SOURCE_TAG = 'source';

function isWhitespace(node: Node): boolean {
    return isTextNode(node) && !node.textContent.trim();
}

/**
 * A <source> is an alternative for the same <picture> image, not separate anchor content.
 * The check stays parent-scoped so a <source> outside a <picture> still blocks unwrapping.
 */
function isPictureSource(parent: Element, child: Node): boolean {
    return (
        parent.tagName.toLowerCase() === PICTURE_TAG && isElement(child) && child.tagName.toLowerCase() === SOURCE_TAG
    );
}

/** Child nodes that count as anchor content: whitespace and picture sources do not. */
function relevantChildren(el: Element): Node[] {
    return Array.from(el.childNodes).filter((n) => !isWhitespace(n) && !isPictureSource(el, n));
}

/**
 * Unwrap anchors that only wrap converted image resources so the resulting Markdown
 * does not leave resource-backed images as clickable external links.
 */
export function unwrapAllConvertedImageLinks(body: HTMLElement): void {
    const imgs = Array.from(body.querySelectorAll('img[data-pam-converted="true"]')) as HTMLImageElement[];
    imgs.forEach((img) => {
        img.removeAttribute('data-pam-converted');
        unwrapConvertedImageLink(img);
    });
}

function unwrapConvertedImageLink(img: HTMLImageElement): void {
    let anchor: HTMLElement | null = null;
    let cur: HTMLElement | null = img.parentElement;
    while (cur) {
        if (cur.tagName.toLowerCase() === ANCHOR_TAG) {
            anchor = cur;
            break;
        }
        cur = cur.parentElement;
    }
    if (!anchor) return;

    const href = (anchor as HTMLAnchorElement).getAttribute('href') || '';
    if (!/^https?:\/\//i.test(href)) return;
    if (!img.getAttribute('src')?.startsWith(':/')) return;

    let node: Node = img;
    while (node.parentElement && node.parentElement !== anchor) {
        const p = node.parentElement;
        const kids = relevantChildren(p);
        if (!(kids.length === 1 && kids[0] === node)) return;
        node = p;
    }

    const topNode = node;
    const anchorKids = relevantChildren(anchor);
    if (!(anchorKids.length === 1 && anchorKids[0] === topNode)) return;

    const grand = anchor.parentNode;
    if (!grand) return;
    grand.insertBefore(img, anchor);
    grand.removeChild(anchor);
}
