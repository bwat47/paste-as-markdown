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

export const SANITIZER_ALLOWED_ATTRS_BASE = ['href', 'name', 'id', 'title', 'colspan', 'rowspan', 'align', 'class'];

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
        FORBID_ATTR: ['style'],
        KEEP_CONTENT: true,
    };
}
