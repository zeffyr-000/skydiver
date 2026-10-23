/**
 * Minimal PNG encoder (8-bit RGBA, no interlace, filter 0 on every row).
 * Pure Node (node:zlib only) — shared by the sprite tools.
 */
import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) {
    c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/**
 * Encode a `width`×`height` palette image: `indices` holds one palette index per
 * pixel (row-major), `palette` up to 256 `#rrggbb` colours. Opaque, unless
 * `transparent0`: then palette entry 0 is fully transparent (a tRNS chunk).
 */
export function encodeIndexedPng(width, height, indices, palette, transparent0 = false) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 3;
  const plte = Buffer.alloc(palette.length * 3);
  palette.forEach((hex, i) => {
    plte.writeUIntBE(parseInt(hex.slice(1), 16), i * 3, 3);
  });
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0;
    for (let x = 0; x < width; x++) {
      raw[y * (width + 1) + 1 + x] = indices[y * width + x];
    }
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    ...(transparent0 ? [chunk('tRNS', Buffer.from([0]))] : []),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Encode a `width`×`height` RGBA buffer (row-major, 4 bytes per pixel). */
export function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Encode an RGBA buffer as small as it goes, losslessly: a palette PNG (index 0
 * transparent) when its alpha is all-or-nothing and it has at most 255
 * colours — every baked sheet does, at a third of the size — else plain RGBA.
 */
export function encodeCompactPng(width, height, rgba) {
  const slots = new Map();
  const palette = ['#000000'];
  const indices = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const a = rgba[i * 4 + 3];
    if (a === 0) {
      continue;
    }
    const rgb = rgba.readUIntBE(i * 4, 3);
    let k = slots.get(rgb);
    if (k === undefined) {
      if (a !== 255 || palette.length === 256) {
        return encodePng(width, height, rgba);
      }
      k = palette.length;
      slots.set(rgb, k);
      palette.push(`#${rgb.toString(16).padStart(6, '0')}`);
    } else if (a !== 255) {
      return encodePng(width, height, rgba);
    }
    indices[i] = k;
  }
  return encodeIndexedPng(width, height, indices, palette, true);
}
