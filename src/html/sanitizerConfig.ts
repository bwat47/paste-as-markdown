import type { Config } from 'dompurify';

// Centralized DOMPurify configuration so adjustments (e.g., adding 'sup','sub','del','mark')
// can be made in one place.
const SANITIZER_ALLOWED_TAGS_BASE = [
    'a',
    'p',
    'div',
    // Preserve semantic block boundaries so Turndown can retain paragraph separation.
    'address',
    'article',
    'aside',
    'footer',
    'header',
    'hgroup',
    'main',
    'nav',
    'section',
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
    // Allow <input> so the sanitizer hook can retain checkboxes for Turndown's GFM task list rule.
    // The hook removes every input whose sanitized type is not "checkbox".
    'input',
    'code',
    'pre',
    'ul',
    'ol',
    'li',
    'blockquote',
    'dl',
    'dt',
    'dd',
    'figure',
    'figcaption',
    'hr',
    'br',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    // Table structure only. 'caption', 'colgroup' and 'col' are deliberately absent: the GFM
    // plugin discards all three (GFM has no caption syntax), so allowing 'caption' would drop
    // its text entirely, whereas stripping the tag lets KEEP_CONTENT keep the text near the table.
    'table',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'th',
    'td',
];

// Add form-related attributes needed for checkbox detection (type, checked, disabled) for task lists.
const SANITIZER_ALLOWED_ATTRS_BASE = [
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
    'start', // for ordered lists, to preserve numbering when converting to Markdown
];

const SANITIZER_IMAGE_TAGS = ['img', 'picture', 'source'];
// Title is already included in SANITIZER_ALLOWED_ATTRS_BASE
const SANITIZER_IMAGE_ATTRS = ['src', 'alt', 'width', 'height'];

// URI validation is delegated to DOMPurify defaults. DOMPurify permits data: URIs only
// for its media-tag allowlist (DATA_URI_TAGS), including img and source.

export interface SanitizerConfigOptions {
    includeImages: boolean;
}

export function buildSanitizerConfig(opts: SanitizerConfigOptions): Config {
    return {
        ALLOWED_TAGS: opts.includeImages
            ? [...SANITIZER_ALLOWED_TAGS_BASE, ...SANITIZER_IMAGE_TAGS]
            : [...SANITIZER_ALLOWED_TAGS_BASE],
        ALLOWED_ATTR: opts.includeImages
            ? [...SANITIZER_ALLOWED_ATTRS_BASE, ...SANITIZER_IMAGE_ATTRS]
            : [...SANITIZER_ALLOWED_ATTRS_BASE],
        // No FORBID_TAGS/FORBID_ATTR: passing ALLOWED_TAGS/ALLOWED_ATTR replaces DOMPurify's
        // defaults rather than extending them, so anything absent from the lists above (script,
        // iframe, object, style, on* handlers, ...) is already dropped. Widening the allowlists
        // is therefore the only way to admit a tag or attribute — audit them, not a denylist.
        // Keep text content of removed nodes (e.g., script/style are dropped but text remains out)
        KEEP_CONTENT: true,
        // Only retain ARIA attributes explicitly included in ALLOWED_ATTR
        ALLOW_ARIA_ATTR: false,
        // Prevent retaining data-* attributes which can store payloads
        ALLOW_DATA_ATTR: false,
    };
}
