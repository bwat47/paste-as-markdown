import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { convertImagesToResources } from '../resourceConverter';

// Mock constants to drastically reduce MAX_IMAGE_BYTES for test (e.g., 64 bytes)
jest.mock('../constants', () => ({
    ...(jest.requireActual('../constants') as Record<string, unknown>),
    MAX_IMAGE_BYTES: 64,
}));

function body(html: string): HTMLElement {
    const parser = new DOMParser();
    return parser.parseFromString(html, 'text/html').body;
}

let dataPostMock: jest.Mock;
let fsExtraMock: { writeFileSync: jest.Mock; existsSync: jest.Mock; unlink: jest.Mock };

function installJoplin() {
    dataPostMock = jest.fn(() => Promise.resolve({ id: 'res' }));
    fsExtraMock = {
        writeFileSync: jest.fn(),
        existsSync: jest.fn().mockReturnValue(true),
        unlink: jest.fn((_: string, cb?: (e?: Error | null) => void) => cb && cb(null)),
    };
    (globalThis as unknown as Record<string, unknown>).joplin = {
        plugins: { dataDir: jest.fn(() => Promise.resolve('/tmp')) },
        data: { post: dataPostMock },
        require: jest.fn((mod: string) => {
            if (mod === 'fs-extra') return fsExtraMock;
            throw new Error('unhandled ' + mod);
        }),
    };
}

beforeEach(() => installJoplin());

describe('oversize base64 (mocked small limit)', () => {
    test('rejects base64 exceeding mocked limit', async () => {
        // For 64 byte limit: need estimatedBytes > 64. estimatedBytes=floor(len*3/4)
        // Choose base64 length 100 -> floor(100*3/4)=75 > 64
        const b64 = 'A'.repeat(100);
        const url = `data:image/png;base64,${b64}`;
        const b = body(`<img src="${url}">`);
        const result = await convertImagesToResources(b);
        expect(result.attempted).toBe(1);
        expect(result.failed).toBe(1);
        expect(result.ids.length).toBe(0);
        expect(dataPostMock).not.toHaveBeenCalled();
    });
});
