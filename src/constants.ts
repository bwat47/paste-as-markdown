export const COMMANDS = {
    PASTE_AS_MARKDOWN: 'pasteAsMarkdown',
} as const;

export const TURNDOWN_OPTIONS = {
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
    br: '\n', // Convert <br> to newline instead of double space
    linkStyle: 'inlined',
    preserveImageTagsWithSize: true, // Keep <img> tags with width/height as HTML instead of converting to markdown
} as const;

export const SETTINGS = {
    INCLUDE_IMAGES: 'includeImages',
} as const;

// Settings section identifiers
export const SETTINGS_SECTION = 'pasteAsMarkdown' as const;

export const SHORTCUTS = {
    PASTE_AS_MARKDOWN: 'Ctrl+Alt+V',
} as const;

export const TOAST_DURATION = 4000; // ms

export const LOG_PREFIX = '[paste-as-markdown]';
