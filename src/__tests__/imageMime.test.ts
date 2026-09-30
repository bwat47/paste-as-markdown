import { describe, expect, test } from 'vitest';
import { resolveImageType } from '../imageMime';
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

const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
const TIFF_BYTES = Uint8Array.from([0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0]);
const SVG_MARKUP = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

/** Copy into a plain Uint8Array: file-type rejects Node Buffers from outside the JSDOM realm. */
async function resolveMime(bytes: Uint8Array, declaredMime = ''): Promise<string | null> {
    return (await resolveImageType(Uint8Array.from(bytes), declaredMime))?.mime ?? null;
}

describe('binary image MIME detection', () => {
    test.each([
        { label: 'PNG', bytes: png(), mime: 'image/png' },
        { label: 'APNG (stored as PNG)', bytes: apng(), mime: 'image/png' },
        { label: 'JPEG', bytes: JPEG_BYTES, mime: 'image/jpeg' },
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
        expect(await resolveMime(bytes)).toBe(mime);
    });

    test.each([
        { label: 'empty', bytes: Buffer.alloc(0) },
        { label: 'HTML', bytes: Buffer.from('<html>not an image</html>') },
        { label: 'undeclared SVG', bytes: Buffer.from(SVG_MARKUP) },
        { label: 'WAV', bytes: Buffer.from('RIFF\x00\x00\x00\x00WAVEfmt ') },
        { label: 'HEIC', bytes: ftypBox('heic', ['mif1', 'heic']) },
        { label: 'MP4', bytes: ftypBox('isom', ['isom', 'mp42']) },
        { label: 'TIFF (image outside the allowlist)', bytes: TIFF_BYTES },
        { label: 'CUR (shares the ICO MIME type)', bytes: iconDirectory(2) },
        // Known file-type limitation: AVIF declared only as a compatible brand is classified as HEIF.
        { label: 'AVIF as compatible brand only', bytes: ftypBox('mif1', ['mif1', 'miaf', 'avif']) },
    ])('rejects $label', async ({ bytes }) => {
        expect(await resolveMime(bytes)).toBeNull();
    });
});

describe('declared image types', () => {
    test.each([
        { label: 'declared PNG that is JPEG', declared: 'image/png', bytes: JPEG_BYTES, mime: 'image/jpeg' },
        { label: 'declared APNG', declared: 'image/apng', bytes: apng(), mime: 'image/png' },
        { label: 'declared PNG that is TIFF', declared: 'image/png', bytes: TIFF_BYTES, mime: null },
        { label: 'declared TIFF', declared: 'image/tiff', bytes: TIFF_BYTES, mime: null },
        { label: 'declared PNG that is HTML', declared: 'image/png', bytes: Buffer.from('<html></html>'), mime: null },
    ])('resolves $label from its signature', async ({ declared, bytes, mime }) => {
        expect(await resolveMime(bytes, declared)).toBe(mime);
    });

    test.each([
        { label: 'bare root element', content: SVG_MARKUP },
        { label: 'XML declaration', content: `<?xml version="1.0" encoding="UTF-8"?>${SVG_MARKUP}` },
        { label: 'leading comment', content: `<!-- Generator: editor -->${SVG_MARKUP}` },
        { label: 'long leading comment', content: `<!-- ${'Generator '.repeat(150)} -->${SVG_MARKUP}` },
        { label: 'no namespace', content: '<svg/>' },
        { label: 'namespace prefix', content: '<s:svg xmlns:s="http://www.w3.org/2000/svg"/>' },
        { label: 'long root tag', content: `<svg data-generator="${'editor'.repeat(150)}"/>` },
        {
            label: 'UTF-8 comment',
            content: `<!--${' '.repeat(507)}é-->${SVG_MARKUP}`,
        },
        {
            label: 'doctype',
            content: `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">${SVG_MARKUP}`,
        },
        {
            label: 'BOM and whitespace',
            content: `\uFEFF\n  ${SVG_MARKUP}`,
        },
    ])('accepts declared SVG with $label', async ({ content }) => {
        expect(await resolveImageType(Buffer.from(content), 'image/svg+xml')).toEqual({
            mime: 'image/svg+xml',
            extension: 'svg',
        });
    });

    test.each([
        { label: 'HTML', bytes: Buffer.from('<html><body>error</body></html>') },
        { label: 'element named like svg', bytes: Buffer.from('<svgfoo></svgfoo>') },
        { label: 'XML declaration followed by HTML', bytes: Buffer.from('<?xml version="1.0"?><html/>') },
        { label: 'comment followed by plain text', bytes: Buffer.from('<!-- Generator -->not an image') },
        { label: 'comment only', bytes: Buffer.from('<!-- Generator -->') },
        { label: 'XML declaration only', bytes: Buffer.from('<?xml version="1.0"?>') },
        { label: 'SVG doctype followed by HTML', bytes: Buffer.from('<!DOCTYPE svg><html/>') },
        { label: 'nested SVG in HTML', bytes: Buffer.from(`<html>${SVG_MARKUP}</html>`) },
        { label: 'SVG root with XHTML namespace', bytes: Buffer.from('<svg xmlns="http://www.w3.org/1999/xhtml"/>') },
        { label: 'incomplete root tag', bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"') },
        { label: 'malformed root tag', bytes: Buffer.from('<svg =broken>') },
        { label: 'uppercase root', bytes: Buffer.from('<SVG/>') },
        { label: 'non-SVG root in SVG namespace', bytes: Buffer.from('<html xmlns="http://www.w3.org/2000/svg"/>') },
        { label: 'unclosed root', bytes: Buffer.from('<svg>') },
        { label: 'multiple roots', bytes: Buffer.from(`${SVG_MARKUP}${SVG_MARKUP}`) },
        { label: 'PNG', bytes: png() },
        { label: 'empty', bytes: Buffer.alloc(0) },
    ])('rejects declared SVG containing $label', async ({ bytes }) => {
        expect(await resolveMime(bytes, 'image/svg+xml')).toBeNull();
    });

    test('stores detected types with their canonical extension', async () => {
        expect(await resolveImageType(Uint8Array.from(JPEG_BYTES), 'image/jpg')).toEqual({
            mime: 'image/jpeg',
            extension: 'jpg',
        });
    });
});
