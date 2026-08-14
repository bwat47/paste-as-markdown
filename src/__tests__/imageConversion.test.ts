import { describe, test, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { processHtml } from '../html/processHtml';
import { pasteOptions } from './helpers/pasteOptions';

// 1x1 transparent PNG
const ONE_BY_ONE_PNG_BASE64 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';

function buildHtml(images: string[]): string {
    return images.map((src) => `<img src="${src}" data-junk="x" alt="" width="10">`).join('');
}

type JoplinMock = {
    plugins: { dataDir: Mock };
    require: Mock;
    data: { post: Mock };
};
declare const global: typeof globalThis & { joplin: JoplinMock };

describe('image resource conversion', () => {
    const options = pasteOptions({ convertImagesToResources: true });
    let dataPostMock: Mock;
    let fsExtraMock: { writeFileSync: Mock; existsSync: Mock; unlink: Mock };

    beforeEach(() => {
        dataPostMock = vi.fn();
        fsExtraMock = {
            writeFileSync: vi.fn(),
            existsSync: vi.fn().mockReturnValue(true),
            unlink: vi.fn((...args: unknown[]) => {
                const cb = args[1] as ((err?: Error | null) => void) | undefined;
                cb?.(null);
            }),
        };
        (global as unknown as Record<string, unknown>).joplin = {
            plugins: {
                dataDir: vi.fn(() => Promise.resolve('/tmp')),
            },
            require: vi.fn((mod: string) => {
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
        const result = await processHtml(html, options);

        expect(result.resources.resourcesCreated).toBe(1);
        expect(result.resources.attempted).toBe(1);
        expect(result.resources.failed).toBe(0);
        expect(dataPostMock).toHaveBeenCalledTimes(1);
        // Resulting markup should have resource src and only whitelisted attributes
        const body = result.body;
        expect(body).not.toBeNull();
        const outputHtml = body!.innerHTML;
        expect(outputHtml).toContain('src=":/res1"');
        expect(outputHtml).not.toContain('data-junk');
    });

    test('unwraps an external image link after converting its image to a resource', async () => {
        dataPostMock.mockResolvedValue({ id: 'res1' });
        const html = `<a href="https://example.com/original.png"><img src="${ONE_BY_ONE_PNG_BASE64}" alt=""></a>`;
        const result = await processHtml(html, options);

        expect(result.resources.resourcesCreated).toBe(1);
        expect(result.body.querySelector('a')).toBeNull();
        const image = result.body.querySelector('img');
        expect(image?.getAttribute('src')).toBe(':/res1');
        expect(image?.hasAttribute('data-pam-converted')).toBe(false);
    });

    test('partial failure still converts earlier image and reports counts', async () => {
        dataPostMock
            .mockImplementationOnce(() => Promise.resolve({ id: 'resA' }))
            .mockImplementationOnce(() => Promise.reject(new Error('simulate failure')));
        const html = buildHtml([ONE_BY_ONE_PNG_BASE64, ONE_BY_ONE_PNG_BASE64]);
        const result = await processHtml(html, options);

        expect(result.resources.resourcesCreated).toBe(1);
        expect(result.resources.attempted).toBe(2);
        expect(result.resources.failed).toBe(1);
        expect(dataPostMock).toHaveBeenCalledTimes(2);
        // One image should reference resource; second should remain as original data URL (or possibly sanitized original)
        const body = result.body;
        expect(body).not.toBeNull();
        expect(body!.innerHTML).toContain('src=":/resA"');
    });
});
