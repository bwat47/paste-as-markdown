import { LOG_PREFIX, MAX_IMAGE_BYTES } from './constants';

/**
 * Image Resource Conversion Module
 * ---------------------------------
 * Responsibilities:
 *  - Identify eligible <img> elements (data: URLs or http/https sources not already Joplin resources)
 *  - Safely obtain binary data (base64 decode or streamed network download with size enforcement)
 *  - Create Joplin resources using a temporary file (sandbox requires a filepath for resource creation)
 *  - Sanitize & normalize resulting <img> tags (attribute whitelist + ordering + alt text fallback)
 *  - Provide metrics (attempted / failed counts) for user feedback
 *  - Unwrap remote hyperlink wrappers around images once converted to local resources to avoid leaving
 *    now-misleading outbound links (anchor is removed if it only wraps the image and no other content)
 *
 * Design Choices / Rationale:
 *  - fs-extra capability check: Some environments may not expose fs-extra; in that case we bail out silently
 *    and leave original <img> sources intact instead of throwing.
 *  - Temporary file approach: Joplin core expects a file path when creating resources. We write the decoded
 *    bytes to the plugin data directory, POST the resource, then attempt best‑effort cleanup.
 *  - Size limits: Enforced early both for base64 (pre‑decode estimate + post‑decode) and streaming downloads to
 *    prevent excessive memory usage. MAX_IMAGE_BYTES is centralized in constants.
 *  - Streaming download: Uses ReadableStream reader with incremental size guard so very large images are cut off
 *    before full allocation.
 *  - Timeouts: Network fetch guarded with AbortController (15s) so conversions don't hang indefinitely.
 *  - Base64 validation: Rejects malformed or suspicious base64 before decode (character set + padding + length check).
 *  - Alt text sanitization: Ensures reasonable alt text (no control chars, length capped, fallback to 'image').
 *  - Attribute normalization: Reduces variance in downstream markdown by only keeping src|alt|width|height in a
 *    deterministic order.
 *  - Failure Isolation: Each image conversion is wrapped so one failure does not abort the whole batch; failures
 *    increment a counter and processing continues.
 *
 * Security Considerations:
 *  - Only processes image MIME types (content-type or data: prefix)
 *  - Enforces strict base64 and size limits
 */

// Internal type describing parsed image data
interface ParsedImageData {
    buffer: ArrayBuffer;
    mime: string;
    filename: string;
}

/**
 * Convert eligible <img> tags to Joplin resources.
 *
 * Eligibility:
 *  - src starts with data: (base64) OR http/https URL
 *  - src does NOT already start with :/ (already a resource)
 *
 * @param body Root element whose descendant <img> nodes are inspected/modified.
 * @returns ids (resource IDs created), attempted (count of images we tried to convert), failed (conversion failures).
 */
export async function convertImagesToResources(
    body: HTMLElement
): Promise<{ ids: string[]; attempted: number; failed: number }> {
    let fsExtraAvailable = true;
    try {
        // @ts-expect-error joplin global runtime
        joplin.require('fs-extra');
    } catch {
        fsExtraAvailable = false;
    }
    if (!fsExtraAvailable) {
        console.info(LOG_PREFIX, 'fs-extra unavailable; skipping resource conversion (leaving image sources intact)');
        return { ids: [], attempted: 0, failed: 0 };
    }
    const imgs = Array.from(body.querySelectorAll('img[src]')).filter((img) => {
        const src = img.getAttribute('src') || '';
        return src && !src.startsWith(':/') && (src.startsWith('data:') || /^https?:\/\//i.test(src));
    });
    const ids: string[] = [];
    let attempted = 0;
    let failed = 0;
    for (const img of imgs) {
        const src = img.getAttribute('src') || '';
        try {
            attempted++;
            let data: ParsedImageData | null = null;
            if (src.startsWith('data:')) data = await parseBase64Image(src);
            else if (/^https?:\/\//i.test(src)) data = await downloadExternalImage(src);
            if (!data) continue;
            const id = await createJoplinResource(data);
            img.setAttribute('src', `:/${id}`);
            standardizeImageElement(img as HTMLImageElement, data.filename);
            unwrapConvertedImageLink(img as HTMLImageElement);
            ids.push(id);
        } catch (e) {
            failed++;
            console.warn(LOG_PREFIX, 'Failed to convert image to resource', truncateForLog(src), e);
        }
    }
    return { ids, attempted, failed };
}

/**
 * Standardize every <img> element regardless of conversion outcome so output HTML is uniform.
 * - Ensures only whitelisted attributes remain
 * - Applies canonical ordering (src, alt, width, height)
 * - Fills missing alt from an inferred filename
 */
export function standardizeRemainingImages(body: HTMLElement): void {
    const imgs = Array.from(body.querySelectorAll('img[src]')) as HTMLImageElement[];
    imgs.forEach((img) => {
        const src = img.getAttribute('src') || '';
        const filename = deriveOriginalFilename(src) || 'image';
        standardizeImageElement(img, filename);
    });
}

/**
 * Apply normalization rules to a single <img> element.
 * Internal helper – not exported to keep surface minimal.
 */
function standardizeImageElement(img: HTMLImageElement, originalFilename: string): void {
    const existingAlt = (img.getAttribute('alt') || '').trim();
    if (!existingAlt) {
        const base = originalFilename.replace(/\.[a-z0-9]{2,5}$/i, '');
        img.setAttribute('alt', sanitizeAltText(base));
    }
    const allowed = new Set(['src', 'alt', 'width', 'height']);
    for (const attr of Array.from(img.attributes)) {
        if (!allowed.has(attr.name.toLowerCase())) img.removeAttribute(attr.name);
    }
    const srcVal = img.getAttribute('src') || '';
    const altVal = img.getAttribute('alt');
    const widthVal = img.getAttribute('width');
    const heightVal = img.getAttribute('height');
    ['src', 'alt', 'width', 'height'].forEach((a) => img.removeAttribute(a));
    if (srcVal) img.setAttribute('src', srcVal);
    if (altVal) img.setAttribute('alt', altVal);
    if (widthVal) img.setAttribute('width', widthVal);
    if (heightVal) img.setAttribute('height', heightVal);
}

/**
 * Infer a stable pseudo filename from a source URL or data URI for alt text fallback.
 */
function deriveOriginalFilename(src: string): string {
    if (src.startsWith('data:')) return 'pasted';
    if (src.startsWith(':/')) return 'resource';
    try {
        const u = new URL(src, 'https://placeholder.local');
        const last = u.pathname.split('/').filter(Boolean).pop() || 'image';
        return last.split('?')[0].split('#')[0];
    } catch {
        return 'image';
    }
}

/**
 * Sanitize derived alt text: strip control chars, collapse whitespace, cap length.
 */
function sanitizeAltText(raw: string): string {
    let out = raw.replace(/[\x00-\x1F\x7F]/g, '');
    out = out.replace(/\s+/g, ' ').trim();
    if (!out) out = 'image';
    if (out.length > 120) out = out.slice(0, 117) + '...';
    return out;
}

/**
 * Decode and validate a base64 data URL image.
 * Performs early size estimation before allocating full decoded buffer.
 */
async function parseBase64Image(dataUrl: string): Promise<ParsedImageData> {
    const match = dataUrl.match(/^data:([^;]+)(?:;charset=[^;]+)?;base64,(.+)$/i);
    if (!match) throw new Error('Invalid data URL');
    const mime = match[1].toLowerCase();
    if (!mime.startsWith('image/')) throw new Error('Not image');
    let b64 = match[2];
    b64 = b64.replace(/\s+/g, '');
    if (/[^A-Za-z0-9+/=]/.test(b64)) throw new Error('Invalid base64 characters');
    if (b64.length % 4 === 1) throw new Error('Malformed base64 length');
    const estimatedBytes = Math.floor((b64.length * 3) / 4);
    if (estimatedBytes > MAX_IMAGE_BYTES) throw new Error('Image exceeds maximum size');
    let binary: string;
    try {
        binary = atob(b64);
    } catch {
        throw new Error('Base64 decode failed');
    }
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('Image exceeds maximum size');
    return { buffer: bytes.buffer, mime, filename: `pasted.${extensionForMime(mime)}` };
}

/**
 * Download an external image with streaming size enforcement.
 * Aborts if cumulative bytes exceed MAX_IMAGE_BYTES.
 */
async function downloadExternalImage(url: string): Promise<ParsedImageData> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const contentType = (resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!contentType.startsWith('image/')) throw new Error('Not image');
    const contentLengthHeader = resp.headers.get('content-length');
    if (contentLengthHeader) {
        const asInt = parseInt(contentLengthHeader, 10);
        if (!isNaN(asInt) && asInt > MAX_IMAGE_BYTES) throw new Error('Image exceeds maximum size');
    }
    const reader = resp.body?.getReader();
    if (!reader) {
        const buffer = await resp.arrayBuffer();
        if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error('Image exceeds maximum size');
        const filenameImmediate = deriveFilenameFromUrl(url, extensionForMime(contentType));
        return { buffer, mime: contentType, filename: filenameImmediate };
    }
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
            chunks.push(value);
            received += value.length;
            if (received > MAX_IMAGE_BYTES) {
                controller.abort();
                throw new Error('Image exceeds maximum size');
            }
        }
    }
    const merged = concatChunks(chunks, received);
    const filename = deriveFilenameFromUrl(url, extensionForMime(contentType));
    return { buffer: merged, mime: contentType, filename };
}

/**
 * Extract filename (if present) from URL path or synthesize one with provided fallback extension.
 */
function deriveFilenameFromUrl(url: string, fallbackExt: string): string {
    try {
        const u = new URL(url);
        const last = u.pathname.split('/').filter(Boolean).pop() || '';
        if (last && /\.[a-z0-9]{2,5}$/i.test(last)) return last;
        return `pasted.${fallbackExt}`;
    } catch {
        return `pasted.${fallbackExt}`;
    }
}

/**
 * Map common image MIME types to file extensions; fallback to 'bin' for unknown types.
 */
function extensionForMime(mime: string): string {
    const map: Record<string, string> = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'image/svg+xml': 'svg',
        'image/bmp': 'bmp',
        'image/x-icon': 'ico',
        'image/vnd.microsoft.icon': 'ico',
    };
    return map[mime] || 'bin';
}

/**
 * Concatenate streamed byte chunks into a single ArrayBuffer of known total length.
 */
function concatChunks(chunks: Uint8Array[], totalBytes: number): ArrayBuffer {
    const out = new Uint8Array(totalBytes);
    let offset = 0;
    for (const c of chunks) {
        out.set(c, offset);
        offset += c.length;
    }
    return out.buffer;
}

/**
 * Truncate very long strings for log output to avoid flooding the console (e.g., giant data URLs).
 * Shows beginning and end with a count of omitted characters.
 */
function truncateForLog(input: string, keep: number = 80): string {
    if (input.length <= keep * 2 + 20) return input; // small enough
    const omitted = input.length - keep * 2;
    return `${input.slice(0, keep)}...[${omitted} chars omitted]...${input.slice(-keep)}`;
}

/**
 * If the converted <img> is wrapped in a simple remote <a href="http(s)://..."> whose only child is the image,
 * unwrap it (remove the anchor) so the local resource image is not a clickable external link.
 * We purposefully do NOT reinsert the original link elsewhere to keep output minimal and prevent issues with Rich Markdown plugin.
 */
function unwrapConvertedImageLink(img: HTMLImageElement): void {
    const parent = img.parentElement;
    if (!parent || parent.tagName.toLowerCase() !== 'a') return;
    if (parent.childNodes.length !== 1) return; // anchor has other content; skip
    const href = (parent as HTMLAnchorElement).getAttribute('href') || '';
    if (!/^https?:\/\//i.test(href)) return; // only remote links
    if (!img.getAttribute('src')?.startsWith(':/')) return; // only after conversion
    const grand = parent.parentNode;
    if (!grand) return;
    grand.insertBefore(img, parent); // move image out
    grand.removeChild(parent); // drop anchor
}

/**
 * Persist image bytes to a temporary file and create a Joplin resource from it.
 * Notes:
 *  - Joplin's data API expects a file path instead of raw bytes in this context.
 *  - Uses synchronous write when available for simplicity (files are small & sequential).
 *  - Best-effort cleanup of temp file (errors during cleanup are logged but not rethrown).
 */
async function createJoplinResource(img: ParsedImageData): Promise<string> {
    // @ts-expect-error runtime joplin global
    const dataDir: string = await joplin.plugins.dataDir();
    interface FsExtraLike {
        writeFileSync?: (path: string, data: Uint8Array | Buffer) => void;
        writeFile?: (path: string, data: Uint8Array | Buffer, cb: (err?: Error | null) => void) => void;
        existsSync?: (path: string) => boolean;
        unlink?: (path: string, cb: (err?: Error | null) => void) => void;
    }
    let fs: FsExtraLike;
    try {
        // @ts-expect-error runtime joplin global
        fs = joplin.require('fs-extra');
    } catch (e) {
        console.warn(LOG_PREFIX, 'fs-extra unavailable; skipping image resource conversion');
        throw e;
    }
    const ext = img.filename.split('.').pop() || extensionForMime(img.mime);
    const tmpName = `pam-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const normalizedDir = dataDir.replace(/\\/g, '/');
    const tmpPath = `${normalizedDir.endsWith('/') ? normalizedDir : normalizedDir + '/'}${tmpName}`;
    const fsLike: FsExtraLike = fs;
    try {
        const buffer =
            typeof Buffer !== 'undefined' ? Buffer.from(new Uint8Array(img.buffer)) : new Uint8Array(img.buffer);
        if (typeof fsLike.writeFileSync === 'function') {
            fsLike.writeFileSync(tmpPath, buffer);
        } else if (typeof fsLike.writeFile === 'function') {
            await new Promise<void>((resolve, reject) => {
                fsLike.writeFile!(tmpPath, buffer, (err) => (err ? reject(err) : resolve()));
            });
        } else {
            throw new Error('fs write unavailable');
        }
        // @ts-expect-error runtime joplin global
        const resource = await joplin.data.post(['resources'], null, { title: img.filename, mime: img.mime }, [
            { path: tmpPath },
        ]);
        return resource.id;
    } catch (e) {
        console.warn(LOG_PREFIX, 'Failed to create resource from temp file', e);
        throw e;
    } finally {
        try {
            if (fsLike.existsSync?.(tmpPath)) fsLike.unlink?.(tmpPath, () => {});
        } catch (cleanupErr) {
            console.warn(LOG_PREFIX, 'Temp file cleanup failed', cleanupErr);
        }
    }
}
