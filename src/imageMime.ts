import { fileTypeFromBuffer } from 'file-type/core';

/**
 * Formats accepted from content sniffing, keyed by `file-type` extension. Limited to raster formats
 * the resource converter already supports; SVG is never sniffed because it can carry active content.
 */
const ALLOWED_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'gif', 'webp', 'avif', 'bmp', 'ico']);

/** Identify supported raster image types from binary signatures; this is type detection, not decoder validation. */
export async function detectImageMime(bytes: Uint8Array): Promise<string | null> {
    const result = await fileTypeFromBuffer(bytes);
    return result && ALLOWED_IMAGE_EXTENSIONS.has(result.ext) ? result.mime : null;
}
