import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import * as path from 'path';
import { convertImagesToResources } from '../resourceConverter';
import { unwrapAllConvertedImageLinks } from '../html/post/imageLinks';
import { apng, jpeg, png, pngExceeding, tiff } from './helpers/imageBytes';

const TEST_MAX_IMAGE_BYTES = 64;
const TEST_DOWNLOAD_TIMEOUT_MS = 50;
const TEST_CHUNK_BYTES = 5;
// Local time, so the expected fallback stem does not depend on the test machine's time zone
const PASTED_AT = new Date(2026, 9, 3, 14, 30, 25);
const FALLBACK_STEM = 'pasted-2026-10-03-143025';

// Helper to build a DOM body from HTML string
function makeBody(html: string): HTMLElement {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    return doc.body;
}

/** Remote response advertising `contentLength` and streaming `bytes` (a small PNG by default) as a single chunk. */
function mockRemoteResponse(contentLength: number, contentType = 'image/png', bytes: Uint8Array = png()) {
    let served = false;
    return vi.fn(async () => ({
        ok: true,
        headers: {
            get: (h: string) => {
                const name = h.toLowerCase();
                if (name === 'content-type') return contentType;
                if (name === 'content-length') return String(contentLength);
                return null;
            },
        },
        body: {
            getReader: () => ({
                read: async () => {
                    if (served) return { done: true };
                    served = true;
                    return { done: false, value: bytes };
                },
            }),
        },
    }));
}

/** Stream reader `read` spy yielding `bytes` in `TEST_CHUNK_BYTES` chunks. */
function chunkedRead(bytes: Uint8Array) {
    let offset = 0;
    return vi.fn(async () => {
        if (offset >= bytes.length) return { done: true };
        const value = bytes.subarray(offset, offset + TEST_CHUNK_BYTES);
        offset += value.length;
        return { done: false, value };
    });
}

/** Remote response streaming `bytes` in small chunks, splitting signatures to exercise detection after merging. */
function mockChunkedResponse(contentType: string | null, bytes: Uint8Array, read = chunkedRead(bytes)) {
    return vi.fn(async () => ({
        ok: true,
        headers: {
            get: (h: string) => (h.toLowerCase() === 'content-type' ? contentType : null),
        },
        body: { getReader: () => ({ read }) },
    }));
}

/** Promise that never resolves and rejects only when `signal` aborts. */
function rejectOnAbort(signal: AbortSignal | undefined): Promise<never> {
    return new Promise((_resolve, reject) => {
        if (signal?.aborted) return reject(new Error('abort'));
        signal?.addEventListener('abort', () => reject(new Error('abort')));
    });
}

// Small 1x1 transparent png (same as existing tests)
const PNG_DATA_URL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';
const SVG_BYTES = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const WEBP_BYTES = Buffer.from('RIFF\x14\x00\x00\x00WEBPVP8 ');
const AVIF_BYTES = Buffer.from('\x00\x00\x00\x14ftypavif\x00\x00\x00\x00mif1');

function toDataUrl(mime: string, bytes: Uint8Array): string {
    return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

interface JoplinMock {
    plugins: { dataDir: Mock };
    data: { post: Mock };
    require: Mock;
}

let dataPostMock: Mock;
let fsExtraMock: { writeFileSync: Mock; existsSync: Mock; unlink: Mock };
let fetchMock: Mock | undefined;

function setGlobal<T>(key: string, value: T) {
    (globalThis as unknown as Record<string, unknown>)[key] = value;
}

function installJoplinMocks(fsAvailable = true) {
    dataPostMock = vi.fn(() => Promise.resolve({ id: 'res-ok' }));
    fsExtraMock = {
        writeFileSync: vi.fn(),
        existsSync: vi.fn().mockReturnValue(true),
        unlink: vi.fn((...args: unknown[]) => {
            const cb = args[1] as ((err?: Error | null) => void) | undefined;
            cb?.(null);
        }),
    };
    const joplinMock: JoplinMock = {
        plugins: { dataDir: vi.fn(() => Promise.resolve('/tmp')) },
        data: { post: dataPostMock },
        require: vi.fn((...args: unknown[]) => {
            const mod = args[0];
            if (mod === 'fs-extra') {
                if (!fsAvailable) throw new Error('fs-extra missing');
                return fsExtraMock;
            }
            throw new Error('unhandled require ' + mod);
        }),
    };
    setGlobal('joplin', joplinMock);
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(PASTED_AT);
    installJoplinMocks(true);
    fetchMock = undefined;
    setGlobal('fetch', undefined);
});

afterEach(() => {
    vi.useRealTimers();
});

describe('resourceConverter edge cases', () => {
    const OCTET_STREAM = 'Application/Octet-Stream; charset=binary';
    test.each([
        { label: 'octet-stream WebP', contentType: OCTET_STREAM, content: 'RIFF\x14\x00\x00\x00WEBPVP8 ', ext: 'webp' },
        {
            label: 'binary/octet-stream WebP',
            contentType: 'binary/octet-stream',
            content: 'RIFF\x14\x00\x00\x00WEBPVP8 ',
            ext: 'webp',
        },
        {
            label: 'octet-stream AVIF',
            contentType: OCTET_STREAM,
            content: '\x00\x00\x00\x14ftypavif\x00\x00\x00\x00mif1',
            ext: 'avif',
        },
        { label: 'octet-stream HTML', contentType: OCTET_STREAM, content: '<html>not an image</html>', ext: null },
        { label: 'octet-stream SVG', contentType: OCTET_STREAM, content: '<svg></svg>', ext: null },
        { label: 'empty octet-stream', contentType: OCTET_STREAM, content: '', ext: null },
        { label: 'untyped WebP', contentType: null, content: 'RIFF\x14\x00\x00\x00WEBPVP8 ', ext: 'webp' },
        { label: 'untyped HTML', contentType: null, content: '<html>not an image</html>', ext: null },
    ])('validates $label download by signature', async ({ contentType, content, ext }) => {
        const bytes = Buffer.from(content);
        setGlobal('fetch', mockChunkedResponse(contentType, bytes));
        const body = makeBody('<img src="https://example.com/image.jpg" alt="">');
        const result = await convertImagesToResources(body);
        expect(result).toEqual({ ids: ext ? ['res-ok'] : [], attempted: 1, failed: ext ? 0 : 1 });
        if (!ext) {
            expect(fsExtraMock.writeFileSync).not.toHaveBeenCalled();
            expect(dataPostMock).not.toHaveBeenCalled();
            expect(body.querySelector('img')?.getAttribute('src')).toBe('https://example.com/image.jpg');
        } else {
            expect(dataPostMock).toHaveBeenCalledWith(
                ['resources'],
                null,
                { title: `image.${ext}`, mime: `image/${ext}` },
                [{ path: expect.stringMatching(new RegExp(`\\.${ext}$`)) }]
            );
            expect(fsExtraMock.writeFileSync.mock.calls[0][1]).toEqual(Uint8Array.from(bytes));
            expect(body.querySelector('img')?.getAttribute('src')).toBe(':/res-ok');
        }
    });

    test('fs-extra unavailable -> graceful skip', async () => {
        installJoplinMocks(false);
        const body = makeBody(`<img src="${PNG_DATA_URL}" alt="">`);
        const result = await convertImagesToResources(body);
        expect(result).toEqual({ ids: [], attempted: 0, failed: 0 });
        // src unchanged
        expect(body.querySelector('img')!.getAttribute('src')).toBe(PNG_DATA_URL);
    });

    // Malformed encodings of GIF bytes ("R0lGODlh" = "GIF89a", "R0lGODlhIQ==" = "GIF89a!"). Buffer's lenient
    // decoder would still yield a valid GIF from each, so only base64 validation can reject them.
    test.each([
        { label: 'invalid character', b64: 'R0lGOD@lhIQ=' },
        { label: 'data length % 4 == 1', b64: 'R0lGODlhA' },
        { label: 'padding in the middle', b64: 'R0lGODlhIQ==QQ==' },
        { label: 'padding on a non-multiple-of-4 length', b64: 'R0lGODlhIQ=' },
        { label: 'excess padding', b64: 'R0lGODlh==' },
        { label: 'padding after a dangling data character', b64: 'R0lGODlhA==' },
    ])('malformed base64 ($label) causes failure', async ({ b64 }) => {
        const body = makeBody(`<img src="data:image/gif;base64,${b64}">`);
        const result = await convertImagesToResources(body);
        expect(result).toEqual({ ids: [], attempted: 1, failed: 1 });
        expect(fsExtraMock.writeFileSync).not.toHaveBeenCalled();
    });

    test('valid unpadded base64 is accepted', async () => {
        const gif = Buffer.from('GIF89a!');
        const unpadded = gif.toString('base64').replace(/=/g, '');
        const body = makeBody(`<img src="data:image/gif;base64,${unpadded}">`);
        const result = await convertImagesToResources(body);
        expect(result.failed).toBe(0);
        const written = fsExtraMock.writeFileSync.mock.calls[0][1] as Uint8Array;
        expect(Array.from(written)).toEqual(Array.from(gif));
    });

    test.each([
        { label: 'unsupported type (TIFF)', src: toDataUrl('image/tiff', tiff()) },
        { label: 'non-image content declared as PNG', src: toDataUrl('image/png', Buffer.from('not an image')) },
        { label: 'declared SVG with non-SVG content', src: toDataUrl('image/svg+xml', png()) },
    ])('data URL with $label is rejected and left inline', async ({ src }) => {
        const body = makeBody(`<img src="${src}">`);
        const result = await convertImagesToResources(body);
        expect(result).toEqual({ ids: [], attempted: 1, failed: 1 });
        expect(fsExtraMock.writeFileSync).not.toHaveBeenCalled();
        expect(body.querySelector('img')?.getAttribute('src')).toBe(src);
    });

    test('data URL is stored with its detected type, not the declared one', async () => {
        const result = await convertImagesToResources(makeBody(`<img src="${toDataUrl('image/png', jpeg())}">`));
        expect(result).toEqual({ ids: ['res-ok'], attempted: 1, failed: 0 });
        expect(dataPostMock).toHaveBeenCalledWith(
            ['resources'],
            null,
            { title: `${FALLBACK_STEM}.jpg`, mime: 'image/jpeg' },
            [{ path: expect.stringMatching(/\.jpg$/) }]
        );
    });

    test('fallback titles are unique within a paste and skip URL-named and rejected images', async () => {
        setGlobal('fetch', mockRemoteResponse(SVG_BYTES.length, 'image/svg+xml', SVG_BYTES));
        const body = makeBody(
            `<img src="${PNG_DATA_URL}">` +
                `<img src="${toDataUrl('image/png', tiff())}">` +
                '<img src="https://example.com/diagram.svg">' +
                `<img src="${toDataUrl('image/jpeg', jpeg())}">`
        );
        const result = await convertImagesToResources(body);
        expect(result).toEqual({ ids: ['res-ok', 'res-ok', 'res-ok'], attempted: 4, failed: 1 });
        const titles = dataPostMock.mock.calls.map((call) => (call[2] as { title: string }).title);
        expect(titles).toEqual([`${FALLBACK_STEM}.png`, 'diagram.svg', `${FALLBACK_STEM}-2.jpg`]);
    });

    test('a failed resource creation does not use up its fallback title', async () => {
        dataPostMock.mockRejectedValueOnce(new Error('Joplin API error'));
        const body = makeBody(`<img src="${PNG_DATA_URL}"><img src="${toDataUrl('image/jpeg', jpeg())}">`);
        const result = await convertImagesToResources(body);
        expect(result).toEqual({ ids: ['res-ok'], attempted: 2, failed: 1 });
        const titles = dataPostMock.mock.calls.map((call) => (call[2] as { title: string }).title);
        expect(titles).toEqual([`${FALLBACK_STEM}.png`, `${FALLBACK_STEM}.jpg`]);
    });

    test('small base64 image writes exactly its decoded bytes', async () => {
        // Small Buffers are views into a shared pool; writing the backing ArrayBuffer would leak extra bytes
        const b64 = PNG_DATA_URL.split(',')[1];
        const expected = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const body = makeBody(`<img src="${PNG_DATA_URL}">`);
        await convertImagesToResources(body);
        const written = fsExtraMock.writeFileSync.mock.calls[0][1] as Uint8Array;
        expect(written.byteLength).toBe(expected.byteLength);
        expect(Array.from(written)).toEqual(Array.from(expected));
    });

    test('non-image remote MIME rejected', async () => {
        fetchMock = vi.fn(async () => ({
            ok: true,
            headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? 'text/html' : null) },
            body: null,
            arrayBuffer: async () => new ArrayBuffer(10),
        }));
        setGlobal('fetch', fetchMock);
        const body = makeBody('<img src="https://example.com/file.txt">');
        const result = await convertImagesToResources(body);
        expect(result.attempted).toBe(1);
        expect(result.failed).toBe(1);
        expect(result.ids).toHaveLength(0);
        expect(dataPostMock).not.toHaveBeenCalled();
    });

    test.each(['image/png', 'application/octet-stream'])('streaming oversize %s aborts mid-stream', async (mime) => {
        // A valid PNG well over the limit, without content-length, so only the streaming check can reject it
        const bytes = pngExceeding(TEST_MAX_IMAGE_BYTES * 3);
        const read = chunkedRead(bytes);
        setGlobal('fetch', mockChunkedResponse(mime, bytes, read));
        const body = makeBody('<img src="https://example.com/large.png">');
        const result = await convertImagesToResources(body, { maxImageBytes: TEST_MAX_IMAGE_BYTES });
        expect(result).toEqual({ ids: [], attempted: 1, failed: 1 });
        expect(fsExtraMock.writeFileSync).not.toHaveBeenCalled();
        // Reading stops at the first chunk that crosses the limit
        expect(read).toHaveBeenCalledTimes(Math.ceil((TEST_MAX_IMAGE_BYTES + 1) / TEST_CHUNK_BYTES));
    });

    test('oversize octet-stream content-length is rejected before reading the body', async () => {
        setGlobal('fetch', mockRemoteResponse(TEST_MAX_IMAGE_BYTES + 1, 'application/octet-stream'));
        const result = await convertImagesToResources(makeBody('<img src="https://example.com/large.webp">'), {
            maxImageBytes: TEST_MAX_IMAGE_BYTES,
        });
        expect(result).toEqual({ ids: [], attempted: 1, failed: 1 });
        expect(fsExtraMock.writeFileSync).not.toHaveBeenCalled();
    });

    test('image/avif response without a URL extension gets an avif filename', async () => {
        setGlobal('fetch', mockRemoteResponse(AVIF_BYTES.length, 'image/avif', AVIF_BYTES));
        const result = await convertImagesToResources(makeBody('<img src="https://example.com/photo">'));
        expect(result).toEqual({ ids: ['res-ok'], attempted: 1, failed: 0 });
        expect(dataPostMock).toHaveBeenCalledWith(
            ['resources'],
            null,
            { title: `${FALLBACK_STEM}.avif`, mime: 'image/avif' },
            [{ path: expect.stringMatching(/\.avif$/) }]
        );
    });

    test.each([
        {
            label: 'contradicting URL extension',
            contentType: 'image/webp',
            bytes: WEBP_BYTES,
            src: 'photo.jpg',
            title: 'photo.webp',
            mime: 'image/webp',
        },
        {
            label: 'contradicting signature',
            contentType: 'image/png',
            bytes: jpeg(),
            src: 'photo.png',
            title: 'photo.jpg',
            mime: 'image/jpeg',
        },
    ])('declared type with $label is stored as $title', async ({ contentType, bytes, src, title, mime }) => {
        setGlobal('fetch', mockRemoteResponse(bytes.length, contentType, bytes));
        const result = await convertImagesToResources(makeBody(`<img src="https://example.com/${src}">`));
        expect(result).toEqual({ ids: ['res-ok'], attempted: 1, failed: 0 });
        const ext = path.extname(title);
        expect(dataPostMock).toHaveBeenCalledWith(['resources'], null, { title, mime }, [
            { path: expect.stringMatching(new RegExp(`\\${ext}$`)) },
        ]);
    });

    test.each([
        { label: 'unsupported image type (TIFF)', contentType: 'image/tiff', bytes: tiff() },
        { label: 'HTML error page declared as PNG', contentType: 'image/png', bytes: Buffer.from('<html></html>') },
        { label: 'non-SVG content declared as SVG', contentType: 'image/svg+xml', bytes: png() },
    ])('declared $label is rejected', async ({ contentType, bytes }) => {
        setGlobal('fetch', mockRemoteResponse(bytes.length, contentType, bytes));
        const body = makeBody('<img src="https://example.com/scan.tif">');
        const result = await convertImagesToResources(body);
        expect(result).toEqual({ ids: [], attempted: 1, failed: 1 });
        expect(fsExtraMock.writeFileSync).not.toHaveBeenCalled();
        expect(body.querySelector('img')?.getAttribute('src')).toBe('https://example.com/scan.tif');
    });

    // SVG has no binary signature, so octet-stream SVG is rejected above; declared SVG is kept.
    test.each([
        { label: 'declared image/svg+xml download', src: 'https://example.com/diagram.svg', title: 'diagram.svg' },
        { label: 'SVG data URL', src: toDataUrl('image/svg+xml', SVG_BYTES), title: `${FALLBACK_STEM}.svg` },
    ])('$label is stored as SVG', async ({ src, title }) => {
        setGlobal('fetch', mockRemoteResponse(SVG_BYTES.length, 'image/svg+xml', SVG_BYTES));
        const result = await convertImagesToResources(makeBody(`<img src="${src}">`));
        expect(result).toEqual({ ids: ['res-ok'], attempted: 1, failed: 0 });
        expect(dataPostMock).toHaveBeenCalledWith(['resources'], null, { title, mime: 'image/svg+xml' }, [
            { path: expect.stringMatching(/\.svg$/) },
        ]);
    });

    test.each([
        {
            label: 'octet-stream download',
            contentType: 'application/octet-stream',
            src: 'https://example.com/anim.apng',
        },
        { label: 'declared image/apng download', contentType: 'image/apng', src: 'https://example.com/anim.apng' },
        {
            label: 'declared image/apng without a URL extension',
            contentType: 'image/apng',
            src: 'https://example.com/anim',
        },
    ])('APNG $label is stored as PNG', async ({ contentType, src }) => {
        setGlobal('fetch', mockChunkedResponse(contentType, apng()));
        const result = await convertImagesToResources(makeBody(`<img src="${src}">`));
        expect(result).toEqual({ ids: ['res-ok'], attempted: 1, failed: 0 });
        const title = src.endsWith('.apng') ? 'anim.png' : `${FALLBACK_STEM}.png`;
        expect(dataPostMock).toHaveBeenCalledWith(['resources'], null, { title, mime: 'image/png' }, [
            { path: expect.stringMatching(/\.png$/) },
        ]);
    });

    test('APNG data URL is stored as PNG', async () => {
        const dataUrl = `data:image/apng;base64,${Buffer.from(apng()).toString('base64')}`;
        const result = await convertImagesToResources(makeBody(`<img src="${dataUrl}">`));
        expect(result).toEqual({ ids: ['res-ok'], attempted: 1, failed: 0 });
        expect(dataPostMock).toHaveBeenCalledWith(
            ['resources'],
            null,
            { title: `${FALLBACK_STEM}.png`, mime: 'image/png' },
            [{ path: expect.stringMatching(/\.png$/) }]
        );
    });

    // The content-length guard compares with a strict `>`, so exactly-at-cap must pass.
    test.each([
        { label: 'at the cap is accepted', contentLength: TEST_MAX_IMAGE_BYTES, failed: 0, ids: 1 },
        { label: 'one byte over the cap is rejected', contentLength: TEST_MAX_IMAGE_BYTES + 1, failed: 1, ids: 0 },
    ])('remote image whose content-length sits $label', async ({ contentLength, failed, ids }) => {
        fetchMock = mockRemoteResponse(contentLength);
        setGlobal('fetch', fetchMock);
        const body = makeBody('<img src="https://example.com/sized.png">');
        const result = await convertImagesToResources(body, { maxImageBytes: TEST_MAX_IMAGE_BYTES });
        expect(result.attempted).toBe(1);
        expect(result.failed).toBe(failed);
        expect(result.ids).toHaveLength(ids);
        expect(dataPostMock).toHaveBeenCalledTimes(ids);
    });

    test('network timeout abort increments failed count', async () => {
        // Use fake timers to trigger the configured AbortController timeout quickly
        vi.useFakeTimers();
        fetchMock = vi.fn((...args: unknown[]) =>
            rejectOnAbort((args[1] as { signal?: AbortSignal } | undefined)?.signal)
        );
        setGlobal('fetch', fetchMock);
        const body = makeBody('<img src="https://example.com/slow.png">');
        const conversionPromise = convertImagesToResources(body, { downloadTimeoutMs: TEST_DOWNLOAD_TIMEOUT_MS });
        // Fast-forward time to trigger the download timeout inside downloadExternalImage
        vi.advanceTimersByTime(TEST_DOWNLOAD_TIMEOUT_MS);
        const result = await conversionPromise;
        expect(result.attempted).toBe(1);
        expect(result.failed).toBe(1);
        expect(result.ids).toHaveLength(0);
    });

    test.each(['image/png', 'application/octet-stream'])('timeout aborts a stalled %s body stream', async (mime) => {
        vi.useFakeTimers();
        fetchMock = vi.fn(async (...args: unknown[]) => {
            const signal = (args[1] as { signal?: AbortSignal } | undefined)?.signal;
            return {
                ok: true,
                headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? mime : null) },
                body: {
                    // Never yields data; only the abort signal settles the read.
                    getReader: () => ({ read: () => rejectOnAbort(signal) }),
                },
            };
        });
        setGlobal('fetch', fetchMock);
        const body = makeBody('<img src="https://example.com/stalled.png">');
        const conversionPromise = convertImagesToResources(body, { downloadTimeoutMs: TEST_DOWNLOAD_TIMEOUT_MS });
        await vi.advanceTimersByTimeAsync(TEST_DOWNLOAD_TIMEOUT_MS);
        const result = await conversionPromise;
        expect(result.attempted).toBe(1);
        expect(result.failed).toBe(1);
        expect(result.ids).toHaveLength(0);
    });

    test('mixed batch metrics integrity (success + invalid base64)', async () => {
        // success (small png) + invalid base64 only (oversize covered in dedicated test file)
        const bad = 'data:image/png;base64,@@@@';
        const body = makeBody(`<img src="${PNG_DATA_URL}"><img src="${bad}">`);
        const result = await convertImagesToResources(body);
        expect(result.attempted).toBe(2);
        expect(result.failed).toBe(1);
        expect(result.ids).toHaveLength(1);
    });

    test('temp file cleanup on success and failure', async () => {
        // Force second post to throw
        dataPostMock
            .mockImplementationOnce(() => Promise.resolve({ id: 'res1' }))
            .mockImplementationOnce(() => Promise.reject(new Error('boom')));
        const body = makeBody(`<img src="${PNG_DATA_URL}"><img src="${PNG_DATA_URL}">`);
        const result = await convertImagesToResources(body);
        expect(result).toEqual({ ids: ['res1'], attempted: 2, failed: 1 });
        const writtenPaths = fsExtraMock.writeFileSync.mock.calls.map((call) => call[0]);
        expect(new Set(writtenPaths).size).toBe(2);
        for (const writtenPath of writtenPaths) {
            expect(fsExtraMock.unlink).toHaveBeenCalledWith(writtenPath, expect.any(Function));
        }
    });

    test('converts src to resource ID and marks as converted', async () => {
        // Note: Attribute filtering (class, style, data-*) is handled by DOMPurify in processHtml,
        // and alt fallback is handled by normalizeImageAltAttributes in post-sanitize passes.
        // convertImagesToResources only updates src and adds the conversion marker.
        const body = makeBody(`<img src="${PNG_DATA_URL}" alt="test" width="100">`);
        await convertImagesToResources(body);
        const img = body.querySelector('img')!;
        // src updated to resource reference
        expect(img.getAttribute('src')).toMatch(/^:\/res-/);
        // conversion marker added
        expect(img.getAttribute('data-pam-converted')).toBe('true');
        // other attributes preserved (not modified by convertImagesToResources)
        expect(img.getAttribute('alt')).toBe('test');
        expect(img.getAttribute('width')).toBe('100');
    });

    test('existing resource image ignored', async () => {
        const body = makeBody('<img src=":/already" alt="prev">');
        const result = await convertImagesToResources(body);
        expect(result.attempted).toBe(0);
        expect(result.failed).toBe(0);
        expect(result.ids).toHaveLength(0);
    });

    test('anchor wrapping converted image is removed (unwrap)', async () => {
        const body = makeBody(
            `<a href="https://example.com/original.png">` +
                `<img src="${PNG_DATA_URL}" alt="image" width="10">` +
                `</a>`
        );
        const result = await convertImagesToResources(body);
        expect(result.ids).toHaveLength(1);
        const img = body.querySelector('img');
        expect(img).toBeTruthy();
        expect(img!.getAttribute('data-pam-converted')).toBe('true');

        unwrapAllConvertedImageLinks(body);

        expect(img!.hasAttribute('data-pam-converted')).toBe(false);
        expect(img!.parentElement?.tagName.toLowerCase()).not.toBe('a');
        expect(body.querySelector('a')).toBeNull();
    });

    test('anchor wrapping converted image via single wrapper is removed (unwrap)', async () => {
        const body = makeBody(
            `<a href="https://example.com/original.png">` +
                `<span class="wrap"><img src="${PNG_DATA_URL}" alt="image" width="10"></span>` +
                `</a>`
        );
        const result = await convertImagesToResources(body);
        expect(result.ids).toHaveLength(1);
        const img = body.querySelector('img');
        expect(img).toBeTruthy();
        expect(img!.getAttribute('data-pam-converted')).toBe('true');

        unwrapAllConvertedImageLinks(body);

        expect(img!.hasAttribute('data-pam-converted')).toBe(false);
        expect(img!.parentElement?.tagName.toLowerCase()).not.toBe('a');
        expect(body.querySelector('a')).toBeNull();
    });

    test('anchor wrapping a converted picture image is removed despite source siblings', async () => {
        const body = makeBody(
            `<a href="https://example.com/original.png"><div><picture>` +
                `<source srcset="small.webp 1x"><source srcset="large.webp 2x">` +
                `<img src="${PNG_DATA_URL}" alt="image">` +
                `</picture></div></a>`
        );
        const result = await convertImagesToResources(body);
        expect(result.ids).toHaveLength(1);

        unwrapAllConvertedImageLinks(body);

        const img = body.querySelector('img');
        expect(img?.parentElement).toBe(body);
        expect(img?.hasAttribute('data-pam-converted')).toBe(false);
        expect(body.querySelector('a')).toBeNull();
        expect(body.querySelector('picture')).toBeNull();
        expect(body.querySelector('source')).toBeNull();
    });

    test('picture source exception does not unwrap an anchor with other sibling content', async () => {
        const body = makeBody(
            `<a href="https://example.com/original.png"><div>` +
                `<picture><source srcset="image.webp 1x"><img src="${PNG_DATA_URL}" alt="image"></picture>` +
                `<span>Caption</span>` +
                `</div></a>`
        );
        const result = await convertImagesToResources(body);
        expect(result.ids).toHaveLength(1);

        unwrapAllConvertedImageLinks(body);

        expect(body.querySelector('a')).not.toBeNull();
        expect(body.querySelector('span')?.textContent).toBe('Caption');
    });
});
