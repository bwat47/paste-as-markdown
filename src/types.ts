interface ConversionResult {
    markdown: string;
    success: boolean;
    plainTextFallback?: boolean;
}

// Discriminated result variants for stronger type narrowing
export type ConversionSuccess = ConversionResult & { success: true };
export type ConversionFailure = ConversionResult & { success: false; warnings: readonly string[] };

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
    readonly filename: string;
    readonly size: number;
}
