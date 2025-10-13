import { isInCode } from '../shared/dom';

// Remove generic UI elements that are noise in Markdown exports.
export function removeNonContentUi(body: HTMLElement): void {
    const doc = body.ownerDocument;

    // 1) Remove button-like elements entirely when they're standalone UI, but keep inline text labels.
    const buttonLikeElements = new Set<HTMLElement>();
    Array.from(body.querySelectorAll('button')).forEach((btn) => buttonLikeElements.add(btn as HTMLElement));
    Array.from(body.querySelectorAll('[role="button"]')).forEach((btn) => buttonLikeElements.add(btn as HTMLElement));

    buttonLikeElements.forEach((btn) => {
        if (isInCode(btn)) return;
        const replacementText = extractInlineButtonText(btn);
        if (replacementText && doc) {
            const textNode = doc.createTextNode(replacementText);
            btn.parentNode?.replaceChild(textNode, btn);
        } else {
            btn.remove();
        }
    });

    // 2) Remove common role-based UI controls
    const roles = ['toolbar', 'tablist', 'tab', 'menu', 'menubar', 'combobox', 'switch'];
    roles.forEach((role) => {
        Array.from(body.querySelectorAll(`[role="${role}"]`)).forEach((el) => {
            if (!isInCode(el)) (el as HTMLElement).remove();
        });
    });

    // 3) Remove non-checkbox inputs (preserve checkboxes for GFM task lists)
    Array.from(body.querySelectorAll('input')).forEach((el) => {
        if (isInCode(el)) return;
        const type = (el.getAttribute('type') || '').toLowerCase();
        if (type !== 'checkbox') (el as HTMLElement).remove();
    });

    // 4) Remove <select>; keep <textarea> so its text content survives
    Array.from(body.querySelectorAll('select')).forEach((el) => {
        if (!isInCode(el)) (el as HTMLElement).remove();
    });
}

function extractInlineButtonText(element: HTMLElement): string | null {
    const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) return null;
    const parent = element.parentElement;
    if (!parent) return null;

    const inlineParents = new Set([
        'p',
        'span',
        'a',
        'li',
        'dd',
        'dt',
        'td',
        'th',
        'cite',
        'em',
        'strong',
        'small',
        'label',
        'abbr',
        'code',
        'figcaption',
    ]);

    const parentTag = parent.tagName.toLowerCase();
    if (inlineParents.has(parentTag)) return text;

    if (parentTag === 'div') {
        const hasInlineSiblings = Array.from(parent.childNodes).some((node) => {
            if (node === element) return false;
            if (node.nodeType === Node.TEXT_NODE) return !!node.textContent?.trim();
            if (node.nodeType === Node.ELEMENT_NODE) {
                const tag = (node as Element).tagName.toLowerCase();
                return tag !== 'br';
            }
            return false;
        });
        if (hasInlineSiblings) return text;
    }

    return null;
}
