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
} as const;

export const SHORTCUTS = {
    PASTE_AS_MARKDOWN: 'Ctrl+Alt+V',
} as const;

export const TOAST_DURATION = 4000; // ms
