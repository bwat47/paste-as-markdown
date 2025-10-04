import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { processHtml } from '../html/processHtml';
import type { PasteOptions } from '../types';

// 40 byte tiny PNG binary (fake) for streaming
function tinyPngBytes(): Uint8Array {
    return new Uint8Array(40).fill(137);
}

interface JoplinMock {
    plugins: { dataDir: jest.Mock };
    require: jest.Mock;
    data: { post: jest.Mock };
}

interface GlobalWithFetch extends Global {
    joplin?: JoplinMock;
    fetch?: jest.Mock;
}

declare const global: GlobalWithFetch;

describe('remote image success path', () => {
    let dataPostMock: jest.Mock;
    let fsExtraMock: { writeFileSync: jest.Mock; existsSync: jest.Mock; unlink: jest.Mock };

    beforeEach(() => {
        dataPostMock = jest.fn(() => Promise.resolve({ id: 'resRemote' }));
        fsExtraMock = {
            writeFileSync: jest.fn(),
            existsSync: jest.fn(() => true),
            unlink: jest.fn((_: string, cb?: (err?: Error | null) => void) => {
                cb?.(null);
            }),
        };
        global.joplin = {
            plugins: { dataDir: jest.fn(() => Promise.resolve('/tmp')) },
            require: jest.fn((mod: string) => {
                if (mod === 'fs-extra') return fsExtraMock;
                throw new Error('mod');
            }),
            data: { post: dataPostMock },
        } as JoplinMock;
        global.fetch = jest.fn(async () => ({
            ok: true,
            headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? 'image/png' : null) },
            body: {
                getReader: () => ({
                    read: async () => ({ done: true, value: tinyPngBytes() }),
                }),
            },
            arrayBuffer: async () => tinyPngBytes().buffer,
        })) as unknown as jest.Mock;
    });

    test('successful remote image conversion increments metrics and rewrites src', async () => {
        const html = '<img src="https://example.com/image.png" alt="Remote">';
        const options: PasteOptions = {
            includeImages: true,
            convertImagesToResources: true,
            normalizeQuotes: true,
            forceTightLists: false,
        };
        const result = await processHtml(html, options);
        expect(result.resources.attempted).toBe(1);
        expect(result.resources.failed).toBe(0);
        expect(result.resources.resourcesCreated).toBe(1);
        const body = result.body;
        expect(body).not.toBeNull();
        expect(body!.innerHTML).toMatch(/src=":\/resRemote"/);
        expect(dataPostMock).toHaveBeenCalledTimes(1);
    });
});
