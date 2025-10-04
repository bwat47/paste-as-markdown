import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { convertImagesToResources } from '../resourceConverter';
import { unwrapAllConvertedImageLinks } from '../html/post/imageLinks';
import { MAX_IMAGE_BYTES } from '../constants';

// Helper to build a DOM body from HTML string
function makeBody(html: string): HTMLElement {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    return doc.body as HTMLElement;
}

// Small 1x1 transparent png (same as existing tests)
const PNG_DATA_URL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';

interface JoplinMock {
    plugins: { dataDir: jest.Mock };
    data: { post: jest.Mock };
    require: jest.Mock;
}

let dataPostMock: jest.Mock;
let fsExtraMock: { writeFileSync: jest.Mock; existsSync: jest.Mock; unlink: jest.Mock };
let fetchMock: jest.Mock | undefined;

function setGlobal<T>(key: string, value: T) {
    (globalThis as unknown as Record<string, unknown>)[key] = value as unknown;
}

function installJoplinMocks(fsAvailable = true) {
    dataPostMock = jest.fn(() => Promise.resolve({ id: 'res-ok' }));
    fsExtraMock = {
        writeFileSync: jest.fn(),
        existsSync: jest.fn().mockReturnValue(true),
        unlink: jest.fn((_: string, cb?: (err?: Error | null) => void) => cb && cb(null)),
    };
    const joplinMock: JoplinMock = {
        plugins: { dataDir: jest.fn(() => Promise.resolve('/tmp')) },
        data: { post: dataPostMock },
        require: jest.fn((mod: string) => {
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
    installJoplinMocks(true);
    fetchMock = undefined;
    setGlobal('fetch', undefined);
});

afterEach(() => {
    jest.useRealTimers();
});

describe('resourceConverter edge cases', () => {
    test('fs-extra unavailable -> graceful skip', async () => {
        installJoplinMocks(false);
        const body = makeBody(`<img src="${PNG_DATA_URL}" alt="">`);
        const result = await convertImagesToResources(body);
        expect(result).toEqual({ ids: [], attempted: 0, failed: 0 });
        // src unchanged
        expect(body.querySelector('img')!.getAttribute('src')).toBe(PNG_DATA_URL);
    });

    test('invalid base64 characters cause failure', async () => {
        const bad = 'data:image/png;base64,@@@###==='; // invalid chars
        const body = makeBody(`<img src="${bad}">`);
        const result = await convertImagesToResources(body);
        expect(result.attempted).toBe(1);
        expect(result.failed).toBe(1);
        expect(result.ids.length).toBe(0);
    });

    test('malformed base64 padding (length %4 == 1) causes failure', async () => {
        // base64 length 5 -> 5 % 4 ==1
        const malformed = 'data:image/png;base64,AAAAA';
        const body = makeBody(`<img src="${malformed}">`);
        const result = await convertImagesToResources(body);
        expect(result.failed).toBe(1);
    });

    test('non-image remote MIME rejected', async () => {
        fetchMock = jest.fn(async () => ({
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
        expect(result.ids.length).toBe(0);
        expect(dataPostMock).not.toHaveBeenCalled();
    });

    test('streaming oversize remote aborts mid-stream', async () => {
        // Single chunk larger than limit to guarantee immediate failure
        const hugeChunk = new Uint8Array(MAX_IMAGE_BYTES + 100);
        let served = false;
        fetchMock = jest.fn(async () => ({
            ok: true,
            headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? 'image/png' : null) },
            body: {
                getReader: () => ({
                    read: async () => {
                        if (served) return { done: true };
                        served = true;
                        return { done: false, value: hugeChunk };
                    },
                }),
            },
        }));
        setGlobal('fetch', fetchMock);
        const body = makeBody('<img src="https://example.com/large.png">');
        const result = await convertImagesToResources(body);
        expect(result.attempted).toBe(1);
        expect(result.failed).toBe(1);
        expect(result.ids.length).toBe(0);
    });

    test('network timeout abort increments failed count', async () => {
        // Use fake timers to trigger the 15s AbortController timeout quickly
        jest.useFakeTimers();
        fetchMock = jest.fn((_: string, opts: unknown) => {
            const signal = (opts as { signal?: AbortSignal } | undefined)?.signal;
            return new Promise((_resolve, reject) => {
                if (signal?.aborted) return reject(new Error('already aborted'));
                signal?.addEventListener('abort', () => reject(new Error('abort')));
                // Never resolve; only abort path will settle the promise.
            });
        });
        setGlobal('fetch', fetchMock);
        const body = makeBody('<img src="https://example.com/slow.png">');
        const conversionPromise = convertImagesToResources(body);
        // Fast-forward time to trigger the 15000ms timeout inside downloadExternalImage
        jest.advanceTimersByTime(15000);
        const result = await conversionPromise;
        expect(result.attempted).toBe(1);
        expect(result.failed).toBe(1);
        expect(result.ids.length).toBe(0);
    });

    test('mixed batch metrics integrity (success + invalid base64)', async () => {
        // success (small png) + invalid base64 only (oversize covered in dedicated test file)
        const bad = 'data:image/png;base64,@@@@';
        const body = makeBody(`<img src="${PNG_DATA_URL}"><img src="${bad}">`);
        const result = await convertImagesToResources(body);
        expect(result.attempted).toBe(2);
        expect(result.failed).toBe(1);
        expect(result.ids.length).toBe(1);
    });

    test('temp file cleanup on success and failure', async () => {
        // Force second post to throw
        dataPostMock
            .mockImplementationOnce(() => Promise.resolve({ id: 'res1' }))
            .mockImplementationOnce(() => Promise.reject(new Error('boom')));
        const body = makeBody(`<img src="${PNG_DATA_URL}"><img src="${PNG_DATA_URL}">`);
        const result = await convertImagesToResources(body);
        expect(result.attempted).toBe(2);
        expect(fsExtraMock.writeFileSync).toHaveBeenCalled();
        expect(fsExtraMock.unlink).toHaveBeenCalled(); // called for each attempt (best effort)
    });

    test('attribute normalization & alt fallback', async () => {
        const body = makeBody(`<img src="${PNG_DATA_URL}" class="c" style="x:y" data-x="1" width="100">`);
        await convertImagesToResources(body); // will convert and then standardize
        const img = body.querySelector('img')!;
        const attrs = Array.from(img.attributes).map((a) => `${a.name}=${a.value}`);
        expect(attrs[0].startsWith('src=')).toBe(true);
        expect(attrs[1].startsWith('alt=')).toBe(true);
        // width preserved, height absent, no extraneous attrs
        expect(attrs.some((a) => a.startsWith('width='))).toBe(true);
        expect(attrs.find((a) => a.startsWith('class='))).toBeUndefined();
        expect(attrs.find((a) => a.startsWith('style='))).toBeUndefined();
        expect(attrs.find((a) => a.startsWith('data-x='))).toBeUndefined();
    });

    test('existing resource image ignored', async () => {
        const body = makeBody('<img src=":/already" alt="prev">');
        const result = await convertImagesToResources(body);
        expect(result.attempted).toBe(0);
        expect(result.failed).toBe(0);
        expect(result.ids.length).toBe(0);
    });

    test('anchor wrapping converted image is removed (unwrap)', async () => {
        const body = makeBody(
            `<a href="https://example.com/original.png">` +
                `<img src="${PNG_DATA_URL}" alt="image" width="10">` +
                `</a>`
        );
        const result = await convertImagesToResources(body);
        expect(result.ids.length).toBe(1);
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
        expect(result.ids.length).toBe(1);
        const img = body.querySelector('img');
        expect(img).toBeTruthy();
        expect(img!.getAttribute('data-pam-converted')).toBe('true');

        unwrapAllConvertedImageLinks(body);

        expect(img!.hasAttribute('data-pam-converted')).toBe(false);
        expect(img!.parentElement?.tagName.toLowerCase()).not.toBe('a');
        expect(body.querySelector('a')).toBeNull();
    });
});
