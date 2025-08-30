export const COMMANDS = {
    PASTE_AS_MARKDOWN: 'pasteAsMarkdown',
} as const;

export const TURNDOWN_OPTIONS = {
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
} as const;

export const SHORTCUTS = {
    PASTE_AS_MARKDOWN: 'Ctrl+Alt+V',
} as const;

export const TOAST_DURATION = 4000; // ms
