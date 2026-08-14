interface ConversionResult {
    markdown: string;
    success: boolean;
    plainTextFallback?: boolean;
}

// Discriminated result variants for stronger type narrowing
export type ConversionSuccess = ConversionResult & { success: true };
export type ConversionFailure = ConversionResult & { success: false; warnings: readonly string[] };

export interface PasteOptions {
    includeImages: boolean;
    convertImagesToResources: boolean;
    normalizeQuotes: boolean;
    forceTightLists: boolean;
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

// Generic validation result for user inputs/settings or parsed data
export interface ValidationResult<T> {
    readonly isValid: boolean;
    readonly value?: T;
    readonly error?: string;
}

// Image processing types
export interface ParsedImageData {
    readonly buffer: ArrayBuffer;
    readonly mime: string;
    readonly filename: string;
    readonly size: number;
}

// Settings validation helpers
export type SettingsInput = Partial<Record<string, unknown>>;
export type ValidatedSettings = PasteOptions;
