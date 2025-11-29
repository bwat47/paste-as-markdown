import { isInCode, isTextNode, isElement, unwrapElement } from '../shared/dom';

/**
 * Check if an element contains meaningful content like images, videos, or accessible SVGs.
 */
function hasMeaningfulContent(element: HTMLElement): boolean {
    // Check for images
    if (element.querySelector('img, picture, source, video, audio, canvas')) {
        return true;
    }

    // Check for SVGs with accessible labels
    const svg = element.querySelector('svg');
    if (svg) {
        const ariaLabel = svg.getAttribute('aria-label') || svg.getAttribute('aria-labelledby');
        if (ariaLabel && ariaLabel.trim().length > 0) return true;

        const accessibleNode = svg.querySelector('title, desc');
        if (accessibleNode && (accessibleNode.textContent || '').trim().length > 0) return true;
    }

    return false;
}

// Remove generic UI elements that are noise in Markdown exports.
export function removeNonContentUi(body: HTMLElement): void {
    // Early exit: check if any UI elements exist before doing work
    const uiSelector =
        'button, [role="button"], [role="toolbar"], [role="tablist"], [role="tab"], [role="menu"], [role="menubar"], [role="combobox"], [role="switch"], input, select';
    if (!body.querySelector(uiSelector)) return;

    const doc = body.ownerDocument;

    // 1) Remove button-like elements entirely when they're standalone UI, but keep inline text labels
    // and unwrap elements with meaningful content (images, videos, etc.).
    // Merged query: both <button> and [role="button"] in one pass
    Array.from(body.querySelectorAll('button, [role="button"]')).forEach((btn) => {
        if (isInCode(btn)) return;

        // If button contains meaningful content (images, etc.), unwrap it to preserve the content
        if (hasMeaningfulContent(btn as HTMLElement)) {
            unwrapElement(btn as HTMLElement);
            return;
        }

        const replacementText = extractInlineButtonText(btn as HTMLElement);
        if (replacementText && doc) {
            const textNode = doc.createTextNode(replacementText);
            btn.parentNode?.replaceChild(textNode, btn);
        } else {
            btn.remove();
        }
    });

    // 2) Remove common role-based UI controls
    // Merged query: all roles in one pass
    const roles = ['toolbar', 'tablist', 'tab', 'menu', 'menubar', 'combobox', 'switch'];
    const roleSelector = roles.map((r) => `[role="${r}"]`).join(', ');
    Array.from(body.querySelectorAll(roleSelector)).forEach((el) => {
        if (!isInCode(el)) (el as HTMLElement).remove();
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
            if (isTextNode(node)) return !!node.textContent?.trim();
            if (isElement(node)) {
                const tag = node.tagName.toLowerCase();
                return tag !== 'br';
            }
            return false;
        });
        if (hasInlineSiblings) return text;
    }

    return null;
}
