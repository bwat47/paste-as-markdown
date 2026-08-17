import createDOMPurify from 'dompurify';
import { buildSanitizerConfig } from '../sanitizerConfig';

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

/** Sanitize HTML according to the plugin's complete element and attribute policy. */
export function sanitizeHtml(html: string, includeImages: boolean): string {
    if (typeof window === 'undefined') {
        throw new Error('Window is undefined');
    }

    const purifier = createDOMPurify(window as unknown as typeof window);
    purifier.addHook('afterSanitizeAttributes', restrictInputsToCheckboxes);
    return purifier.sanitize(html, buildSanitizerConfig({ includeImages })) as string;
}
