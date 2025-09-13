import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { processHtml } from '../html/processHtml';
import type { PasteOptions } from '../types';

// 1x1 transparent PNG
const ONE_BY_ONE_PNG_BASE64 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';

function buildHtml(images: string[]): string {
    return images.map((src) => `<img src="${src}" data-junk="x" alt="" width="10">`).join('');
}

type JoplinMock = {
    plugins: { dataDir: jest.Mock };
    require: jest.Mock;
    data: { post: jest.Mock };
};
declare const global: typeof globalThis & { joplin: JoplinMock };

describe('image resource conversion', () => {
    let dataPostMock: jest.Mock;
    let fsExtraMock: { writeFileSync: jest.Mock; existsSync: jest.Mock; unlink: jest.Mock };

    beforeEach(() => {
        dataPostMock = jest.fn();
        fsExtraMock = {
            writeFileSync: jest.fn(),
            existsSync: jest.fn().mockReturnValue(true),
            unlink: jest.fn(),
        };
        (global as unknown as Record<string, unknown>).joplin = {
            plugins: {
                dataDir: jest.fn(() => Promise.resolve('/tmp')),
            },
            require: jest.fn((mod: string) => {
                if (mod === 'fs-extra') return fsExtraMock;
                throw new Error('module not mocked: ' + mod);
            }),
            data: {
                post: dataPostMock,
            },
        } as JoplinMock;
    });

    test('converts a single base64 image to a resource and sanitizes attributes', async () => {
        dataPostMock.mockImplementation(() => Promise.resolve({ id: 'res1' }));
        const html = buildHtml([ONE_BY_ONE_PNG_BASE64]);
        const options: PasteOptions = {
            includeImages: true,
            convertImagesToResources: true,
            normalizeQuotes: true,
            forceTightLists: false,
        };
        const result = await processHtml(html, options);

        expect(result.resources.resourcesCreated).toBe(1);
        expect(result.resources.attempted).toBe(1);
        expect(result.resources.failed).toBe(0);
        expect(dataPostMock).toHaveBeenCalledTimes(1);
        // Resulting HTML should have resource src and only whitelisted attributes
        expect(result.html).toContain('src=":/res1"');
        expect(result.html).not.toContain('data-junk');
    });

    test('partial failure still converts earlier image and reports counts', async () => {
        dataPostMock
            .mockImplementationOnce(() => Promise.resolve({ id: 'resA' }))
            .mockImplementationOnce(() => Promise.reject(new Error('simulate failure')));
        const html = buildHtml([ONE_BY_ONE_PNG_BASE64, ONE_BY_ONE_PNG_BASE64]);
        const options: PasteOptions = {
            includeImages: true,
            convertImagesToResources: true,
            normalizeQuotes: true,
            forceTightLists: false,
        };
        const result = await processHtml(html, options);

        expect(result.resources.resourcesCreated).toBe(1);
        expect(result.resources.attempted).toBe(2);
        expect(result.resources.failed).toBe(1);
        expect(dataPostMock).toHaveBeenCalledTimes(2);
        // One image should reference resource; second should remain as original data URL (or possibly sanitized original)
        expect(result.html).toContain('src=":/resA"');
    });
});
