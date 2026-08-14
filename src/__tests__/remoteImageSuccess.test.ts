import { describe, test, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { processHtml } from '../html/processHtml';
import { pasteOptions } from './helpers/pasteOptions';

// 40 byte tiny PNG binary (fake) for streaming
function tinyPngBytes(): Uint8Array {
    return new Uint8Array(40).fill(137);
}

interface JoplinMock {
    plugins: { dataDir: Mock };
    require: Mock;
    data: { post: Mock };
}

declare const global: Omit<typeof globalThis, 'fetch'> & {
    joplin?: JoplinMock;
    fetch?: Mock;
};

describe('remote image success path', () => {
    let dataPostMock: Mock;
    let fsExtraMock: { writeFileSync: Mock; existsSync: Mock; unlink: Mock };

    beforeEach(() => {
        dataPostMock = vi.fn(() => Promise.resolve({ id: 'resRemote' }));
        fsExtraMock = {
            writeFileSync: vi.fn(),
            existsSync: vi.fn(() => true),
            unlink: vi.fn((...args: unknown[]) => {
                const cb = args[1] as ((err?: Error | null) => void) | undefined;
                cb?.(null);
            }),
        };
        global.joplin = {
            plugins: { dataDir: vi.fn(() => Promise.resolve('/tmp')) },
            require: vi.fn((mod: string) => {
                if (mod === 'fs-extra') return fsExtraMock;
                throw new Error('mod');
            }),
            data: { post: dataPostMock },
        } as JoplinMock;
        global.fetch = vi.fn(async () => ({
            ok: true,
            headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? 'image/png' : null) },
            body: {
                getReader: () => ({
                    read: async () => ({ done: true, value: tinyPngBytes() }),
                }),
            },
            arrayBuffer: async () => tinyPngBytes().buffer,
        })) as unknown as Mock;
    });

    test('successful remote image conversion increments metrics and rewrites src', async () => {
        const html = '<img src="https://example.com/image.png" alt="Remote">';
        const options = pasteOptions({ convertImagesToResources: true });
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
