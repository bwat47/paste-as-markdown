import { fileTypeFromBuffer } from 'file-type/core';

/**
 * Formats accepted from content sniffing, keyed by `file-type` extension. Limited to raster formats
 * the resource converter already supports; SVG is never sniffed because it can carry active content.
 */
const ALLOWED_IMAGE_EXTENSIONS = new Set(['png', 'apng', 'jpg', 'gif', 'webp', 'avif', 'bmp', 'ico']);

/**
 * MIME types stored under a more widely recognized equivalent. APNG is a backward-compatible PNG,
 * conventionally served as `image/png` with a `.png` extension.
 */
const IMAGE_MIME_ALIASES: Readonly<Record<string, string>> = { 'image/apng': 'image/png' };

/** Map a lowercase image MIME type to the type used for Joplin resources. */
export function normalizeImageMime(mime: string): string {
    return IMAGE_MIME_ALIASES[mime] ?? mime;
}

/** Identify supported raster image types from binary signatures; this is type detection, not decoder validation. */
export async function detectImageMime(bytes: Uint8Array): Promise<string | null> {
    const result = await fileTypeFromBuffer(bytes);
    return result && ALLOWED_IMAGE_EXTENSIONS.has(result.ext) ? normalizeImageMime(result.mime) : null;
}
