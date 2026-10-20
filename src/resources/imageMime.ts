import { fileTypeFromBuffer } from 'file-type/core';

/** MIME type and file extension an image resource is stored with. */
export interface ImageType {
    readonly mime: string;
    readonly extension: string;
}

const SVG_MIME = 'image/svg+xml';
const SVG_TYPE: ImageType = { mime: SVG_MIME, extension: 'svg' };
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * Formats accepted from content sniffing, keyed by `file-type` extension. Limited to binary raster
 * formats that Joplin can render; everything else (TIFF, HEIC, CUR, ...) is rejected. APNG is a
 * backward-compatible PNG, conventionally served as `image/png` with a `.png` extension.
 */
const SNIFFED_IMAGE_TYPES: ReadonlyMap<string, ImageType> = new Map([
    ['png', { mime: 'image/png', extension: 'png' }],
    ['apng', { mime: 'image/png', extension: 'png' }],
    ['jpg', { mime: 'image/jpeg', extension: 'jpg' }],
    ['gif', { mime: 'image/gif', extension: 'gif' }],
    ['webp', { mime: 'image/webp', extension: 'webp' }],
    ['avif', { mime: 'image/avif', extension: 'avif' }],
    ['bmp', { mime: 'image/bmp', extension: 'bmp' }],
    ['ico', { mime: 'image/x-icon', extension: 'ico' }],
]);

/**
 * Identify supported raster image types from binary signatures; this is type detection, not decoder validation.
 * `bytes` must be a `Uint8Array` from the current realm (`file-type` rejects foreign-realm instances).
 */
async function detectImageType(bytes: Uint8Array): Promise<ImageType | null> {
    const result = await fileTypeFromBuffer(bytes);
    return (result && SNIFFED_IMAGE_TYPES.get(result.ext)) ?? null;
}

/**
 * Resolve the type an image is stored as. Raster types always come from the binary signature, so the
 * declared type is ignored. SVG is text with no signature: it is accepted only when declared and its
 * content is well-formed XML with an SVG root in the SVG namespace.
 * This checks XML syntax, not SVG feature validity or sanitization. Declared SVG is inert when rendered through `<img>`.
 *
 * @param declaredMime Lowercase MIME type from a data URL or Content-Type header ('' when absent).
 * @returns The stored type, or null when the content is not a supported image.
 */
export async function resolveImageType(bytes: Uint8Array, declaredMime: string): Promise<ImageType | null> {
    if (declaredMime === SVG_MIME) return isWellFormedSvg(bytes) ? SVG_TYPE : null;
    return detectImageType(bytes);
}

/**
 * The SVG namespace is required: without it, browsers treat a standalone file as generic XML and
 * `<img>` renders nothing.
 */
function isWellFormedSvg(bytes: Uint8Array): boolean {
    try {
        const doc = new DOMParser().parseFromString(new TextDecoder().decode(bytes), SVG_MIME);
        const root = doc.documentElement;
        return !doc.querySelector('parsererror') && root.localName === 'svg' && root.namespaceURI === SVG_NAMESPACE;
    } catch {
        // Reject this image if parsing is unavailable or throws, without aborting the paste.
        return false;
    }
}
