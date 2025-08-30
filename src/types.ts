// export interface PasteOptions {
// Reserved for future user-configurable options
// }

export interface ConversionResult {
    markdown: string;
    success: boolean;
    warnings?: string[];
    plainTextFallback?: boolean;
}
