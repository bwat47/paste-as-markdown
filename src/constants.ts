export const COMMANDS = {
    PASTE_AS_MARKDOWN: 'pasteAsMarkdown',
} as const;

export const TURNDOWN_OPTIONS = {
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
    br: '  ', //two spaces to ensure <br> converts correctly, see: https://github.com/laurent22/joplin/commit/ac66332a4eb83d8829fbd6cc68a11ef3053c41de
    linkStyle: 'inlined',
} as const;

export const SETTINGS = {
    INCLUDE_IMAGES: 'includeImages',
    CONVERT_IMAGES_TO_RESOURCES: 'convertImagesToResources',
    NORMALIZE_QUOTES: 'normalizeQuotes',
    FORCE_TIGHT_LISTS: 'forceTightLists',
} as const;

// Settings section identifiers
export const SETTINGS_SECTION = 'pasteAsMarkdown' as const;

export const SHORTCUTS = {
    PASTE_AS_MARKDOWN: 'Ctrl+Alt+V',
} as const;

export const TOAST_DURATION = 4000; // ms

export const LOG_PREFIX = '[paste-as-markdown]';

// Hard cap for image resource conversion to avoid excessive memory/disk usage (approx 15MB)
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

// Resource conversion timeouts and limits
export const DOWNLOAD_TIMEOUT_MS = 15000; // 15 seconds for image downloads
export const MAX_ALT_TEXT_LENGTH = 120; // Maximum length for auto-generated alt text
