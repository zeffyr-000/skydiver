/**
 * Generates the flat pixel-art sheets committed under public/assets/sprites/:
 * the horizon (sun, hills) and the menus' key-art (logo, medals, paper grain,
 * rivets). Game-world objects are voxel-baked by tools/bake-voxels.mjs.
 *
 * Pure Node (only node:zlib) — no image library. Each sheet is a horizontal
 * strip of equally-sized frames, authored as text grids (1 character = 1
 * pixel) or drawn with tiny procedural helpers so curves stay clean.
 *
 * Run: node tools/generate-sprites.mjs
 * The PNGs are deterministic: re-running on an unchanged script is a no-op diff.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'sprites');

// Palette mirrors src/styles/_tokens.scss + renderer COLORS — keep in sync.
const PALETTE = {
  '.': null, // transparent
  K: '#2b1f12', // ink (outlines)
  S: '#11161f', // shadow
  R: '#c1352b', // biplane red
  r: '#8f231c', // dark red
  B: '#d9a441', // brass
  b: '#a9781f', // dark brass (--brass-dark)
  H: '#fff7e0', // highlight
  P: '#e8d8b0', // parchment (suspension lines, dust)
  O: '#e0a878', // skin
  G: '#4f7a3a', // ground green
  g: '#3a5c2b', // dark green
  L: '#6f9c4a', // light green
  W: '#3a6ea5', // water
  N: '#7a5230', // wood / boots
  Y: '#8a8a8a', // rock grey
  // golden-hour sky ramp (--sky-* tokens)
  Z: '#1a2b45', // deep dusk (--sky-bg)
  T: '#34416b', // twilight (--sky-twilight)
  M: '#6b5480', // mauve (--sky-mauve)
  E: '#c1683f', // ember (--sky-ember)
  A: '#e8a35c', // amber glow (--sky-glow)
  U: '#4a3a5e', // far hill silhouette (--hill-far)
  V: '#2e2440', // near hill silhouette (--hill-near)
  // hi-bit shading ramps (generator-only; not part of the UI token set)
  Q: '#d96a52', // red lit edge
  C: '#e8c476', // brass lit edge
  D: '#2c4a1e', // deepest green
  p: '#c9b285', // parchment shade (--parchment-dark)
  o: '#c08858', // skin shade
  n: '#9a6a40', // wood lit edge
  y: '#a8a8a8', // rock lit edge
  w: '#5b8cc0', // water lit edge
};

// --------------------------------------------------------------------------
// Minimal PNG encoder (8-bit RGBA, no interlace, filter 0 on every row).
// --------------------------------------------------------------------------

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

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// --------------------------------------------------------------------------
// Frame buffer + drawing helpers.
// --------------------------------------------------------------------------

class Frame {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = Buffer.alloc(w * h * 4); // transparent
  }

  set(x, y, key) {
    const hex = PALETTE[key];
    if (hex === null || hex === undefined) {
      if (hex === undefined) throw new Error(`unknown palette key '${key}'`);
      return;
    }
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = parseInt(hex.slice(1, 3), 16);
    this.data[i + 1] = parseInt(hex.slice(3, 5), 16);
    this.data[i + 2] = parseInt(hex.slice(5, 7), 16);
    this.data[i + 3] = 255;
  }

  rect(x, y, w, h, key) {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) this.set(xx, yy, key);
    }
  }

  /** Filled ellipse with a 1px ink outline at the rim. */
  ellipse(cx, cy, rx, ry, fillKey, outlineKey = 'K') {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
        if (d <= 1) this.set(x, y, d > 1 - 1.2 / Math.min(rx, ry) ? outlineKey : fillKey);
      }
    }
  }

  static fromGrid(rows) {
    const h = rows.length;
    const w = rows[0].length;
    const f = new Frame(w, h);
    rows.forEach((row, y) => {
      if (row.length !== w) {
        throw new Error(`row ${y} is ${row.length} chars, expected ${w}: "${row}"`);
      }
      for (let x = 0; x < w; x++) f.set(x, y, row[x]);
    });
    return f;
  }
}

// --------------------------------------------------------------------------
// Hi-bit pass: the tooling that lifts art from flat 8-bit fills to 16-bit
// modelling. Frames are upscaled 2x, then a directional shading pass lights
// the edge facing the light source and darkens the opposite edge, one
// hi-res pixel deep, using per-material ramps.
// --------------------------------------------------------------------------

const RGB_TO_KEY = Object.fromEntries(
  Object.entries(PALETTE)
    .filter(([, v]) => v)
    .map(([k, v]) => [v.toLowerCase(), k]),
);

function keyAt(f, x, y) {
  if (x < 0 || y < 0 || x >= f.w || y >= f.h) return null;
  const i = (y * f.w + x) * 4;
  if (!f.data[i + 3]) return null;
  const hex =
    '#' +
    [0, 1, 2].map((c) => f.data[i + c].toString(16).padStart(2, '0')).join('');
  return RGB_TO_KEY[hex] ?? null;
}

/** Deterministic LCG so textures stay byte-identical run-to-run. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 0x100000000);
}

/** Nearest-neighbour 2x upscale. */
function upscaleFrame(f, k = 2) {
  const out = new Frame(f.w * k, f.h * k);
  for (let y = 0; y < out.h; y++) {
    const sy = (y / k) | 0;
    for (let x = 0; x < out.w; x++) {
      const si = (sy * f.w + ((x / k) | 0)) * 4;
      if (f.data[si + 3]) f.data.copy(out.data, (y * out.w + x) * 4, si, si + 4);
    }
  }
  return out;
}

// Per-material light/dark variants used by the shading pass.
const SHADE = {
  R: { light: 'Q', dark: 'r' },
  B: { light: 'C', dark: 'b' },
  G: { light: 'L', dark: 'g' },
  g: { light: 'G', dark: 'D' },
  P: { light: 'H', dark: 'p' },
  O: { light: null, dark: 'o' },
  N: { light: 'n', dark: 'K' },
  Y: { light: 'y', dark: 'S' },
  W: { light: 'w', dark: null },
  L: { light: null, dark: 'G' },
};

/** lightDir points TOWARD the light: [-1, -1] = key light up-left (in-game). */
function shadeFrame(f, lightDir = [-1, -1]) {
  const [lx, ly] = lightDir;
  const edits = [];
  for (let y = 0; y < f.h; y++) {
    for (let x = 0; x < f.w; x++) {
      const k = keyAt(f, x, y);
      const ramp = k && SHADE[k];
      if (!ramp) continue;
      if (keyAt(f, x + lx, y + ly) !== k) {
        if (ramp.light) edits.push([x, y, ramp.light]);
      } else if (keyAt(f, x - lx, y - ly) !== k) {
        if (ramp.dark) edits.push([x, y, ramp.dark]);
      }
    }
  }
  for (const [x, y, k] of edits) f.set(x, y, k);
  return f;
}


const hibitFrame = (f, dir = [-1, -1]) => shadeFrame(upscaleFrame(f), dir);
const hibit = (frames, dir = [-1, -1]) => frames.map((f) => hibitFrame(f, dir));

/** Compose frames into one horizontal strip and write the PNG. */
function writeSheet(name, frames, fw, fh) {
  for (const [i, f] of frames.entries()) {
    if (f.w !== fw || f.h !== fh) {
      throw new Error(`${name} frame ${i} is ${f.w}x${f.h}, expected ${fw}x${fh}`);
    }
  }
  const strip = Buffer.alloc(fw * frames.length * fh * 4);
  const stripW = fw * frames.length;
  frames.forEach((f, idx) => {
    for (let y = 0; y < fh; y++) {
      f.data.copy(strip, (y * stripW + idx * fw) * 4, y * fw * 4, (y + 1) * fw * 4);
    }
  });
  const png = encodePng(stripW, fh, strip);
  writeFileSync(join(OUT_DIR, name), png);
  console.log(`  ${name}  ${stripW}x${fh} (${frames.length} frames, ${png.length} bytes)`);
}

// --------------------------------------------------------------------------
// medals.png — 16x16 x3: gold, silver, bronze (Hall of Aces top-3 ranks).
// One grid templated on 'B'; the metal key is substituted per frame.
// --------------------------------------------------------------------------

const MEDAL_GRID = [
  '................',
  '....KK....KK....',
  '....KRK..KRK....',
  '....KRRKKRRK....',
  '.....KRrrRK.....',
  '......KrrK......',
  '.....KKKKKK.....',
  '....KBBBBBBK....',
  '...KBHBBBBBBK...',
  '...KBHBBBBBBK...',
  '...KBBBBBBBBK...',
  '....KBBBBBBK....',
  '.....KKKKKK.....',
  '......SSSS......',
  '................',
  '................',
];

const medalFrame = (metal) =>
  Frame.fromGrid(MEDAL_GRID.map((row) => row.replaceAll('B', metal)));

const MEDALS = [medalFrame('B'), medalFrame('Y'), medalFrame('N')];

// --------------------------------------------------------------------------
// paper.png — 48x48 x1: subtle parchment texture tile for panel surfaces
// (sparse speckles + short horizontal fibres, low contrast).
// --------------------------------------------------------------------------

function paperFrame() {
  const f = new Frame(48, 48);
  f.rect(0, 0, 48, 48, 'P');
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < 48; x++) {
      if ((x * 53 + y * 97) % 83 === 0) f.set(x, y, 'p');
    }
  }
  const rand = lcg(0x9a9e2);
  for (let i = 0; i < 10; i++) {
    const x = (rand() * 44) | 0;
    const y = (rand() * 48) | 0;
    const len = 2 + ((rand() * 3) | 0);
    for (let dx = 0; dx < len; dx++) f.set(x + dx, y, 'p');
  }
  f.set(7, 31, 'H');
  return f;
}

// --------------------------------------------------------------------------
// rivet.png — 8x8 x1: brass dome rivet for panel corners.
// --------------------------------------------------------------------------

const RIVET = Frame.fromGrid([
  '..KKKK..',
  '.KBHHBK.',
  'KBHHHBBK',
  'KBHHBBBK',
  'KBBBBBbK',
  '.KBBBbK.',
  '..KKKK..',
  '........',
]);

// --------------------------------------------------------------------------
// logo.png — 24x26 x8: the SKYDIVER logotype, one letter per frame. Glyphs are
// authored as 10x11 binary grids, doubled to 20x22, then given a five-band
// metal ramp (cream → light brass → brass → dark brass → ember reflection),
// a 1px ink outline and a baked drop shadow.
// --------------------------------------------------------------------------

function logoLetter(base) {
  // Double the glyph resolution so the ramp and outline read at 2x display.
  const rows = base.flatMap((r) => {
    const doubled = [...r].map((c) => c + c).join('');
    return [doubled, doubled];
  });
  const gw = rows[0].length;
  const gh = rows.length;
  const f = new Frame(gw + 4, gh + 4);
  const lit = (x, y) => y >= 0 && y < gh && x >= 0 && x < gw && rows[y][x] === 'X';
  const nearGlyph = (x, y) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) if (lit(x + dx, y + dy)) return true;
    }
    return false;
  };
  for (let y = -1; y <= gh; y++) {
    for (let x = -1; x <= gw; x++) {
      if (nearGlyph(x, y)) f.set(x + 3, y + 3, 'S'); // shadow: outline mask at +2,+2
    }
  }
  for (let y = -1; y <= gh; y++) {
    for (let x = -1; x <= gw; x++) {
      if (nearGlyph(x, y) && !lit(x, y)) f.set(x + 1, y + 1, 'K'); // ink outline ring
    }
  }
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      if (!lit(x, y)) continue;
      const k = y < 4 ? 'H' : y < 9 ? 'C' : y < 15 ? 'B' : y < 19 ? 'b' : 'E';
      f.set(x + 1, y + 1, k); // five-band metal ramp
    }
  }
  return f;
}

const LOGO_GLYPHS = {
  S: [
    '.XXXXXXXX.',
    'XXXXXXXXXX',
    'XXX....XXX',
    'XXX.......',
    '.XXXXXXX..',
    '..XXXXXXX.',
    '.......XXX',
    '.......XXX',
    'XXX....XXX',
    'XXXXXXXXXX',
    '.XXXXXXXX.',
  ],
  K: [
    'XXX....XXX',
    'XXX...XXX.',
    'XXX..XXX..',
    'XXX.XXX...',
    'XXXXXX....',
    'XXXXX.....',
    'XXXXXX....',
    'XXX.XXX...',
    'XXX..XXX..',
    'XXX...XXX.',
    'XXX....XXX',
  ],
  Y: [
    'XXX....XXX',
    'XXX....XXX',
    '.XXX..XXX.',
    '.XXX..XXX.',
    '..XXXXXX..',
    '...XXXX...',
    '...XXX....',
    '...XXX....',
    '...XXX....',
    '...XXX....',
    '...XXX....',
  ],
  D: [
    'XXXXXXXX..',
    'XXXXXXXXX.',
    'XXX....XXX',
    'XXX....XXX',
    'XXX....XXX',
    'XXX....XXX',
    'XXX....XXX',
    'XXX....XXX',
    'XXX....XXX',
    'XXXXXXXXX.',
    'XXXXXXXX..',
  ],
  I: [
    '.XXXXXXXX.',
    '.XXXXXXXX.',
    '...XXXX...',
    '...XXXX...',
    '...XXXX...',
    '...XXXX...',
    '...XXXX...',
    '...XXXX...',
    '...XXXX...',
    '.XXXXXXXX.',
    '.XXXXXXXX.',
  ],
  V: [
    'XXX....XXX',
    'XXX....XXX',
    'XXX....XXX',
    'XXX....XXX',
    'XXX....XXX',
    '.XXX..XXX.',
    '.XXX..XXX.',
    '.XXX..XXX.',
    '..XXXXXX..',
    '...XXXX...',
    '....XX....',
  ],
  E: [
    'XXXXXXXXXX',
    'XXXXXXXXXX',
    'XXX.......',
    'XXX.......',
    'XXXXXXXX..',
    'XXXXXXXX..',
    'XXX.......',
    'XXX.......',
    'XXX.......',
    'XXXXXXXXXX',
    'XXXXXXXXXX',
  ],
  R: [
    'XXXXXXXXX.',
    'XXXXXXXXXX',
    'XXX....XXX',
    'XXX....XXX',
    'XXXXXXXXXX',
    'XXXXXXXXX.',
    'XXX.XXX...',
    'XXX..XXX..',
    'XXX...XXX.',
    'XXX....XXX',
    'XXX....XXX',
  ],
};

const LOGO = [...'SKYDIVER'].map((ch) => logoLetter(LOGO_GLYPHS[ch]));

// --------------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });
console.log(`Writing sprite sheets to ${OUT_DIR}`);
// The menus' key-art. The game world is voxel-baked (tools/bake-voxels.mjs) and
// its sky, sun and hills are painted procedurally (engine/horizon.ts).
writeSheet('medals.png', hibit(MEDALS), 32, 32);
writeSheet('paper.png', [paperFrame()], 48, 48);
writeSheet('rivet.png', [hibitFrame(RIVET)], 16, 16);
writeSheet('logo.png', LOGO, 24, 26);
