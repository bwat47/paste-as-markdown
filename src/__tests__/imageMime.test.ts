import { describe, expect, test } from 'vitest';
import { detectImageMime } from '../imageMime';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_IHDR_BYTES = 13;
const PNG_CRC_BYTES = 4;
const FTYP_HEADER_BYTES = 16;

/** Build a PNG chunk (length, type, data, placeholder CRC). */
function pngChunk(type: string, dataLength = 0): Buffer {
    const chunk = Buffer.alloc(8 + dataLength + PNG_CRC_BYTES);
    chunk.writeUInt32BE(dataLength, 0);
    chunk.write(type, 4, 'ascii');
    return chunk;
}

/** Build a minimal PNG; `file-type` reads past the signature to distinguish PNG from APNG. */
function png(extraChunks: Buffer[] = []): Uint8Array {
    return Buffer.concat([
        Buffer.from(PNG_SIGNATURE),
        pngChunk('IHDR', PNG_IHDR_BYTES),
        ...extraChunks,
        pngChunk('IDAT', 4),
        pngChunk('IEND'),
    ]);
}

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

// Copy into a plain Uint8Array: file-type rejects Node Buffers from outside the JSDOM realm.
describe('binary image MIME detection', () => {
    test.each([
        { label: 'PNG', bytes: png(), mime: 'image/png' },
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
        expect(await detectImageMime(Uint8Array.from(bytes))).toBe(mime);
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
        // Known file-type limitations: APNG is reported as `apng` (outside the allowlist), and AVIF
        // declared only as a compatible brand is classified as HEIF.
        { label: 'APNG', bytes: png([pngChunk('acTL', 8)]) },
        { label: 'AVIF as compatible brand only', bytes: ftypBox('mif1', ['mif1', 'miaf', 'avif']) },
    ])('rejects $label', async ({ bytes }) => {
        expect(await detectImageMime(Uint8Array.from(bytes))).toBeNull();
    });
});
