// Centralized DOMPurify configuration so adjustments (e.g., adding 'sup','sub','del','mark')
// can be made in one place.
export const SANITIZER_ALLOWED_TAGS_BASE = [
    'a',
    'p',
    'div',
    'span',
    'strong',
    'em',
    'b',
    'i',
    'u',
    's',
    'sup',
    'sub',
    'del',
    'mark',
    'ins',
    // Keep <input type="checkbox"> so Turndown GFM task list rule can detect task list items.
    'input',
    'code',
    'pre',
    'ul',
    'ol',
    'li',
    'blockquote',
    'hr',
    'br',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
];

// Add form-related attributes needed for checkbox detection (type, checked, disabled) for task lists.
export const SANITIZER_ALLOWED_ATTRS_BASE = [
    'href',
    'name',
    'id',
    'title',
    'aria-label',
    'aria-labelledby',
    'colspan',
    'rowspan',
    'align',
    'class',
    'type',
    'checked',
    'disabled',
];

export const SANITIZER_IMAGE_TAGS = ['img', 'picture', 'source'];
export const SANITIZER_IMAGE_ATTRS = ['src', 'alt', 'width', 'height', 'title'];

export interface SanitizerConfigOptions {
    includeImages: boolean;
}

export function buildSanitizerConfig(opts: SanitizerConfigOptions) {
    return {
        ALLOWED_TAGS: opts.includeImages
            ? [...SANITIZER_ALLOWED_TAGS_BASE, ...SANITIZER_IMAGE_TAGS]
            : [...SANITIZER_ALLOWED_TAGS_BASE],
        ALLOWED_ATTR: opts.includeImages
            ? [...SANITIZER_ALLOWED_ATTRS_BASE, ...SANITIZER_IMAGE_ATTRS]
            : [...SANITIZER_ALLOWED_ATTRS_BASE],
        // Explicitly forbid dangerous tags beyond DOMPurify defaults
        FORBID_TAGS: [
            'script',
            'style',
            'iframe',
            'frame',
            'frameset',
            'noframes',
            'object',
            'embed',
            'applet',
            'base',
            'meta',
            'link',
        ],
        // Forbid inline event handler attributes and inline styles
        FORBID_ATTR: [
            'style',
            'onload',
            'onerror',
            'onclick',
            'onmouseover',
            'onmouseout',
            'onmousedown',
            'onmouseup',
            'onkeydown',
            'onkeyup',
            'onkeypress',
            'onblur',
            'onfocus',
            'onchange',
            'onsubmit',
            'onreset',
            'onabort',
            'onunload',
            'onresize',
            'onscroll',
        ],
        // Keep text content of removed nodes (e.g., script/style are dropped but text remains out)
        KEEP_CONTENT: true,
        // Prevent retaining data-* attributes which can store payloads
        ALLOW_DATA_ATTR: false,
        // Restrict allowed URL schemes; explicitly block javascript: and similar
        ALLOWED_URI_REGEXP:
            /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|data):|[^a-z]|[a-z+\.\-]+(?:[^a-z+\.\-:]|$))/i,
    };
}
