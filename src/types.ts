interface ConversionResult {
    markdown: string;
    success: boolean;
    plainTextFallback?: boolean;
}

// Discriminated result variants for stronger type narrowing
export type ConversionSuccess = ConversionResult & { success: true };
export type ConversionFailure = ConversionResult & { success: false; warnings: readonly string[] };

/**
 * The user cancelled the paste, so nothing was inserted and there is nothing to report.
 * Has no `success` field, so callers must rule out a cancel before checking for failure.
 */
interface PasteCancelled {
    cancelled: true;
}

export type PasteResult = ConversionSuccess | ConversionFailure | PasteCancelled;

export const LIST_INDENTATION = {
    SPACES: 'spaces',
    TABS: 'tabs',
} as const;

export type ListIndentation = (typeof LIST_INDENTATION)[keyof typeof LIST_INDENTATION];

export interface PasteOptions {
    includeImages: boolean;
    convertImagesToResources: boolean;
    normalizeQuotes: boolean;
    forceTightLists: boolean;
    listIndentation: ListIndentation;
}

/**
 * Lets the user adjust the resolved options for a single paste.
 * Resolves to the options to paste with, or `null` when the user cancels the paste.
 */
export type PasteOptionsPrompt = (defaults: PasteOptions) => Promise<PasteOptions | null>;

export type ClipboardSource = 'generic' | 'google-docs';

/** Metadata about the current paste that may control source-specific processing passes. */
export interface PassContext {
    readonly source: ClipboardSource;
}

export interface ResourceConversionMeta {
    readonly resourcesCreated: number;
    readonly resourceIds: readonly string[];
    readonly attempted: number;
    readonly failed: number;
}

// Result from HTML-to-Markdown conversion
export interface HtmlToMarkdownResult {
    readonly markdown: string;
    readonly resources: ResourceConversionMeta;
}

// Image processing types
export interface ParsedImageData {
    /** Exact image bytes; may be a view into a larger (e.g. pooled) buffer, so never use `.buffer` directly. */
    readonly bytes: Uint8Array;
    readonly mime: string;
    /** File extension of the resolved image type, without the dot. */
    readonly extension: string;
    /** Filename stem from the source URL, or null when it has none (a fallback stem is assigned on save). */
    readonly stem: string | null;
    readonly size: number;
}
