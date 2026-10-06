/**
 * Reads pixel dimensions straight from PNG / JPEG / WebP headers without
 * decoding the image — a cheap decompression-bomb guard for the upload path
 * where sharp is unavailable or rejects the file (SEC-023 availability
 * fallback). Returns null when the buffer is malformed or not one of the
 * three supported formats.
 */
export function readImageDimensions(
  buffer: Buffer
): { width: number; height: number } | null {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16) return null;

  // PNG: 8-byte signature, IHDR (length 13) as first chunk,
  // width at byte 16, height at byte 20 (big endian).
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer.length >= 24 &&
    buffer.toString('ascii', 12, 16) === 'IHDR'
  ) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  // JPEG: walk marker segments until a SOF frame header carries height/width.
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      if (marker === 0xff || marker === 0x01) {
        offset += 2;
        continue;
      }
      // Standalone markers (SOI/RST/EOI) carry no length field.
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
        offset += 2;
        continue;
      }
      const segmentLength = buffer.readUInt16BE(offset + 2);
      if (segmentLength < 2) return null;
      const isSOF =
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 && // DHT
        marker !== 0xc8 && // JPG
        marker !== 0xcc; // DAC
      if (isSOF) {
        if (offset + 9 > buffer.length) return null;
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }
      if (marker === 0xda) return null; // start of scan reached without SOF
      offset += 2 + segmentLength;
    }
    return null;
  }

  // WebP: RIFF container, dimensions depend on the chunk type.
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    const chunk = buffer.toString('ascii', 12, 16);
    if (chunk === 'VP8X' && buffer.length >= 30) {
      return {
        width: buffer.readUIntLE(24, 3) + 1,
        height: buffer.readUIntLE(27, 3) + 1,
      };
    }
    if (chunk === 'VP8 ' && buffer.length >= 30) {
      // Key-frame start code 9D 01 2A, then 14-bit width/height (little endian).
      if (buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
        return {
          width: buffer.readUInt16LE(26) & 0x3fff,
          height: buffer.readUInt16LE(28) & 0x3fff,
        };
      }
      return null;
    }
    if (chunk === 'VP8L' && buffer.length >= 25 && buffer[20] === 0x2f) {
      const bits = buffer.readUInt32LE(21);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
    return null;
  }

  return null;
}
