import { describe, expect, test } from 'vitest';
import { detectImageMime, normalizeImageMime } from '../imageMime';
import { apng, png } from './helpers/imageBytes';

const FTYP_HEADER_BYTES = 16;

/** Build an ISO-BMFF `ftyp` box with the given major and compatible brands. */
function ftypBox(majorBrand: string, compatibleBrands: string[] = []): Uint8Array {
    const brands = Buffer.from(compatibleBrands.join(''), 'ascii');
    const box = Buffer.alloc(FTYP_HEADER_BYTES + brands.length);
    box.writeUInt32BE(box.length, 0);
    box.write('ftyp', 4, 'ascii');
    box.write(majorBrand, 8, 'ascii');
    brands.copy(box, FTYP_HEADER_BYTES);
    return box;
}

/** Minimal single-image ICO (reserved, type 1, count 1) or CUR (type 2) directory. */
function iconDirectory(type: number): Uint8Array {
    return Uint8Array.from([0, 0, type, 0, 1, 0, 16, 16, 0, 0, 1, 0, 32, 0, 0, 0, 0, 0, 22, 0, 0, 0]);
}

/** Copy into a plain Uint8Array: file-type rejects Node Buffers from outside the JSDOM realm. */
function detect(bytes: Uint8Array): Promise<string | null> {
    return detectImageMime(Uint8Array.from(bytes));
}

describe('binary image MIME detection', () => {
    test.each([
        { label: 'PNG', bytes: png(), mime: 'image/png' },
        { label: 'APNG (stored as PNG)', bytes: apng(), mime: 'image/png' },
        { label: 'JPEG', bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]), mime: 'image/jpeg' },
        { label: 'GIF87a', bytes: Buffer.from('GIF87a'), mime: 'image/gif' },
        { label: 'GIF89a', bytes: Buffer.from('GIF89a'), mime: 'image/gif' },
        ...['VP8 ', 'VP8L', 'VP8X'].map((chunk) => ({
            label: `WebP ${chunk}`,
            bytes: Buffer.from(`RIFF\x00\x00\x00\x00WEBP${chunk}`),
            mime: 'image/webp',
        })),
        { label: 'AVIF', bytes: ftypBox('avif', ['mif1', 'miaf']), mime: 'image/avif' },
        { label: 'AVIF sequence', bytes: ftypBox('avis', ['msf1']), mime: 'image/avif' },
        { label: 'BMP', bytes: Buffer.concat([Buffer.from('BM'), Buffer.alloc(52)]), mime: 'image/bmp' },
        { label: 'ICO', bytes: iconDirectory(1), mime: 'image/x-icon' },
    ])('detects $label as $mime', async ({ bytes, mime }) => {
        expect(await detect(bytes)).toBe(mime);
    });

    test.each([
        { label: 'empty', bytes: Buffer.alloc(0) },
        { label: 'HTML', bytes: Buffer.from('<html>not an image</html>') },
        { label: 'SVG', bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>') },
        { label: 'WAV', bytes: Buffer.from('RIFF\x00\x00\x00\x00WAVEfmt ') },
        { label: 'HEIC', bytes: ftypBox('heic', ['mif1', 'heic']) },
        { label: 'MP4', bytes: ftypBox('isom', ['isom', 'mp42']) },
        { label: 'TIFF (image outside the allowlist)', bytes: Uint8Array.from([0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0]) },
        { label: 'CUR (shares the ICO MIME type)', bytes: iconDirectory(2) },
        // Known file-type limitation: AVIF declared only as a compatible brand is classified as HEIF.
        { label: 'AVIF as compatible brand only', bytes: ftypBox('mif1', ['mif1', 'miaf', 'avif']) },
    ])('rejects $label', async ({ bytes }) => {
        expect(await detect(bytes)).toBeNull();
    });
});

describe('image MIME normalization', () => {
    test.each([
        { mime: 'image/apng', expected: 'image/png' },
        { mime: 'image/png', expected: 'image/png' },
        { mime: 'image/webp', expected: 'image/webp' },
    ])('maps $mime to $expected', ({ mime, expected }) => {
        expect(normalizeImageMime(mime)).toBe(expected);
    });
});
