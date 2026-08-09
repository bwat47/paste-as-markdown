// Centralized DOMPurify configuration so adjustments (e.g., adding 'sup','sub','del','mark')
// can be made in one place.
const SANITIZER_ALLOWED_TAGS_BASE = [
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
// DOMPurify's ALLOWED_ATTR is global: it has no per-tag scoping, so every entry here is
// permitted on any allowed tag.
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
];

const SANITIZER_IMAGE_TAGS = ['img', 'picture', 'source'];

// Allowed only when the includeImages setting is on. Named for the toggle, not for a category:
// these are NOT scoped to the image tags above, so enabling images permits src/alt/width/height
// on every allowed tag (e.g. <input type="image" src>). Keeping them behind the toggle is what
// makes "images off" mean no element carries a remote reference. 'title' is a global attribute
// and lives in SANITIZER_ALLOWED_ATTRS_BASE, which already covers images.
const SANITIZER_IMAGE_MODE_ATTRS = ['src', 'alt', 'width', 'height'];

// URI validation is delegated to DOMPurify defaults. DOMPurify permits data: URIs only
// for its media-tag allowlist (DATA_URI_TAGS), including img and source.

export interface SanitizerConfigOptions {
    includeImages: boolean;
}

export function buildSanitizerConfig(opts: SanitizerConfigOptions) {
    return {
        ALLOWED_TAGS: opts.includeImages
            ? [...SANITIZER_ALLOWED_TAGS_BASE, ...SANITIZER_IMAGE_TAGS]
            : [...SANITIZER_ALLOWED_TAGS_BASE],
        ALLOWED_ATTR: opts.includeImages
            ? [...SANITIZER_ALLOWED_ATTRS_BASE, ...SANITIZER_IMAGE_MODE_ATTRS]
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
