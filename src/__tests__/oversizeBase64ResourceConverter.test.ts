import { describe, test, expect, vi, beforeEach, type Mock } from 'vitest';
import { convertImagesToResources } from '../resourceConverter';
import { pngExceeding } from './helpers/imageBytes';

const TEST_MAX_IMAGE_BYTES = 64;

function body(html: string): HTMLElement {
    const parser = new DOMParser();
    return parser.parseFromString(html, 'text/html').body;
}

let dataPostMock: Mock;
let fsExtraMock: { writeFileSync: Mock; existsSync: Mock; unlink: Mock };

function installJoplin() {
    dataPostMock = vi.fn(() => Promise.resolve({ id: 'res' }));
    fsExtraMock = {
        writeFileSync: vi.fn(),
        existsSync: vi.fn().mockReturnValue(true),
        unlink: vi.fn((...args: unknown[]) => {
            const cb = args[1] as ((e?: Error | null) => void) | undefined;
            cb?.(null);
        }),
    };
    (globalThis as unknown as Record<string, unknown>).joplin = {
        plugins: { dataDir: vi.fn(() => Promise.resolve('/tmp')) },
        data: { post: dataPostMock },
        require: vi.fn((mod: string) => {
            if (mod === 'fs-extra') return fsExtraMock;
            throw new Error('unhandled ' + mod);
        }),
    };
}

beforeEach(() => installJoplin());

describe('oversize base64 (configured small limit)', () => {
    test('rejects base64 exceeding the configured limit', async () => {
        // A valid PNG over the limit, so only the size check can reject it
        const b64 = Buffer.from(pngExceeding(TEST_MAX_IMAGE_BYTES)).toString('base64');
        const url = `data:image/png;base64,${b64}`;
        const b = body(`<img src="${url}">`);
        const result = await convertImagesToResources(b, { maxImageBytes: TEST_MAX_IMAGE_BYTES });
        expect(result.attempted).toBe(1);
        expect(result.failed).toBe(1);
        expect(result.ids).toHaveLength(0);
        expect(dataPostMock).not.toHaveBeenCalled();
    });
});
