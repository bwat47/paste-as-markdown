const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_CHUNK_HEADER_BYTES = 8;
const PNG_IHDR_BYTES = 13;
const PNG_CRC_BYTES = 4;
const APNG_ACTL_BYTES = 8;

/** Build a PNG chunk (length, type, data, placeholder CRC). */
function pngChunk(type: string, dataLength = 0): Buffer {
    const chunk = Buffer.alloc(PNG_CHUNK_HEADER_BYTES + dataLength + PNG_CRC_BYTES);
    chunk.writeUInt32BE(dataLength, 0);
    chunk.write(type, 4, 'ascii');
    return chunk;
}

/** Build a minimal PNG; `file-type` reads past the signature to distinguish PNG from APNG. */
export function png(extraChunks: Buffer[] = []): Uint8Array {
    return Uint8Array.from(
        Buffer.concat([
            Buffer.from(PNG_SIGNATURE),
            pngChunk('IHDR', PNG_IHDR_BYTES),
            ...extraChunks,
            pngChunk('IDAT', 4),
            pngChunk('IEND'),
        ])
    );
}

/** Build a minimal APNG: a PNG with an animation control (`acTL`) chunk before the image data. */
export function apng(): Uint8Array {
    return png([pngChunk('acTL', APNG_ACTL_BYTES)]);
}
