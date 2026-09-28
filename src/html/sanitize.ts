import createDOMPurify from 'dompurify';
import { buildSanitizerConfig } from './sanitizerConfig';
import { isHtmlElement } from './shared/dom';

const INPUT_TAG_NAME = 'INPUT';
const CHECKBOX_INPUT_TYPE = 'checkbox';

/**
 * Remove allowlisted input elements unless they are checkboxes needed for GFM task lists.
 * DOMPurify tag allowlists cannot restrict an element according to one of its attribute values.
 */
function restrictInputsToCheckboxes(node: Node): void {
    if (node.nodeName !== INPUT_TAG_NAME) return;

    const input = node as HTMLInputElement;
    const inputType = input.getAttribute('type')?.toLowerCase();
    if (inputType !== CHECKBOX_INPUT_TYPE) input.remove();
}

/**
 * Sanitize parsed content according to the plugin's complete element and attribute policy.
 * DOMPurify imports a clone of `content` into its own body and returns that body directly, so the
 * result is never serialized and re-parsed (which also avoids the mutation-XSS window of a string
 * round-trip). Content is passed as a fragment rather than a body element because DOMPurify cannot
 * strip a disallowed, parentless root such as a detached `<body>`.
 */
export function sanitizeHtml(content: DocumentFragment, includeImages: boolean): HTMLElement {
    if (typeof window === 'undefined') {
        throw new Error('Window is undefined');
    }

    const purifier = createDOMPurify(window as unknown as typeof window);
    purifier.addHook('afterSanitizeAttributes', restrictInputsToCheckboxes);
    const sanitized = purifier.sanitize(content, { ...buildSanitizerConfig({ includeImages }), RETURN_DOM: true });
    if (!isHtmlElement(sanitized)) {
        throw new Error('Sanitizer did not return an HTML element');
    }
    return sanitized;
}
