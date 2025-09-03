// Reserved for future user-configurable options

export interface ConversionResult {
    markdown: string;
    success: boolean;
    warnings?: string[];
    plainTextFallback?: boolean;
}

export interface PasteOptions {
    includeImages: boolean;
    convertImagesToResources: boolean;
}

export interface ResourceConversionMeta {
    resourcesCreated: number;
    resourceIds: string[];
    attempted?: number;
    failed?: number;
}
