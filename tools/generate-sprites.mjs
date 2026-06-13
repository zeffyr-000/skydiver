/**
 * Generates the pixel-art sprite sheets committed under public/assets/sprites/.
 *
 * Pure Node (only node:zlib) — no image library. Each sheet is a horizontal
 * strip of equally-sized frames. Humanoid frames are authored as text grids
 * (1 character = 1 pixel); round/large shapes (canopy, plane, terrain blobs)
 * are drawn with tiny procedural helpers so curves stay clean.
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

/** Recolour the silhouette edge facing `dir` (e.g. sunset rim light). */
function rimLight(f, key, dir) {
  const [dx, dy] = dir;
  const edits = [];
  for (let y = 0; y < f.h; y++) {
    for (let x = 0; x < f.w; x++) {
      if (keyAt(f, x, y) && !keyAt(f, x + dx, y + dy)) edits.push([x, y]);
    }
  }
  for (const [x, y] of edits) f.set(x, y, key);
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
// diver-freefall.png — 16x16 x5, head pointing up (-Y = the track direction).
// Frame 0 full arch (wide, slow) … 2 neutral … 4 full track (compact, fast).
// --------------------------------------------------------------------------

const FREEFALL = [
  [
    '................',
    '......KKKK......',
    '.....KBBBBK.....',
    '.....KBHHBK.....',
    '.....KBBBBK.....',
    '......KKKK......',
    'KKK...KRRK...KKK',
    'KOOKKKRRRRKKKOOK',
    'KOOKRRRRRRRRKOOK',
    '.KKKRRRRRRRRKKK.',
    '....KRRRRRRK....',
    '....KRRRRRRK....',
    '...KRK....KRK...',
    '..KRRK....KRRK..',
    '.KRRK......KRRK.',
    '..KKK......KKK..',
  ],
  [
    '................',
    '......KKKK......',
    '.....KBBBBK.....',
    '.....KBHHBK.....',
    '.....KBBBBK.....',
    '......KKKK......',
    '.KKK..KRRK..KKK.',
    '.KOOKKRRRRKKOOK.',
    '.KOOKRRRRRRKOOK.',
    '..KKKRRRRRRKKK..',
    '....KRRRRRRK....',
    '.....KRRRRK.....',
    '....KRK..KRK....',
    '...KRRK..KRRK...',
    '...KRRK..KRRK...',
    '....KK....KK....',
  ],
  [
    '................',
    '......KKKK......',
    '.....KBBBBK.....',
    '.....KBHHBK.....',
    '.....KBBBBK.....',
    '......KKKK......',
    '.KK...KRRK...KK.',
    'KOOK.KRRRRK.KOOK',
    'KOOKKRRRRRRKKOOK',
    '.KKKRRRRRRRRKKK.',
    '....KRRRRRRK....',
    '.....KRRRRK.....',
    '....KRK..KRK....',
    '....KRK..KRK....',
    '...KRRK..KRRK...',
    '....KK....KK....',
  ],
  [
    // arms sweeping back, legs narrowing (between neutral and semi-track)
    '................',
    '......KKKK......',
    '.....KBBBBK.....',
    '.....KBHHBK.....',
    '.....KBBBBK.....',
    '......KKKK......',
    '..KK..KRRK..KK..',
    '.KOOKKRRRRKKOOK.',
    '..KKKRRRRRRKKK..',
    '....KRRRRRRK....',
    '....KRRRRRRK....',
    '.....KRRRRK.....',
    '....KRK..KRK....',
    '....KRK..KRK....',
    '....KRK..KRK....',
    '.....KK..KK.....',
  ],
  [
    '................',
    '......KKKK......',
    '.....KBBBBK.....',
    '.....KBHHBK.....',
    '.....KBBBBK.....',
    '......KKKK......',
    '.....KRRRRK.....',
    '....KRRRRRRK....',
    '...KORRRRRROK...',
    '...KOKRRRRKOK...',
    '....KKRRRRKK....',
    '.....KRRRRK.....',
    '.....KRKKRK.....',
    '....KRK..KRK....',
    '....KRRK.KRRK...',
    '.....KK...KK....',
  ],
  [
    // arms pinned, legs closing (between semi-track and full track)
    '................',
    '......KKKK......',
    '.....KBBBBK.....',
    '.....KBHHBK.....',
    '.....KBBBBK.....',
    '......KKKK......',
    '.....KRRRRK.....',
    '....KRRRRRRK....',
    '...KORRRRRROK...',
    '....KORRRROK....',
    '.....KRRRRK.....',
    '.....KRRRRK.....',
    '.....KRKKRK.....',
    '.....KRKKRK.....',
    '.....KRK.KRK....',
    '......KK.KK.....',
  ],
  [
    '................',
    '......KKKK......',
    '.....KBBBBK.....',
    '.....KBHHBK.....',
    '.....KBBBBK.....',
    '......KKKK......',
    '.....KRRRRK.....',
    '....KRRRRRRK....',
    '....KORRRROK....',
    '....KORRRROK....',
    '.....KRRRRK.....',
    '.....KRRRRK.....',
    '.....KRRRRK.....',
    '.....KRRRRK.....',
    '......KRRK......',
    '.......KK.......',
  ],
].map(Frame.fromGrid);

// --------------------------------------------------------------------------
// diver-deploy.png — 16x24 x6. The compact diver sits in the lower 16 rows;
// the top 8 rows show pilot chute → line stretch → snivel → inflation.
// --------------------------------------------------------------------------

const DEPLOY_TOPS = [
  [
    '................',
    '.......KK.......',
    '......KBBK......',
    '.......KK.......',
    '.......P........',
    '........P.......',
    '.......P........',
    '.......P........',
  ],
  [
    '......KBBK......',
    '.....KBBBBK.....',
    '......KKKK......',
    '.......P........',
    '......P.P.......',
    '.......P........',
    '......P.P.......',
    '.......PP.......',
  ],
  [
    '......KRRK......',
    '.....KRHRRK.....',
    '.....KRRRRK.....',
    '.....KRRRRK.....',
    '......KRRK......',
    '......P..P......',
    '......P..P......',
    '.......PP.......',
  ],
  [
    '....KRRHHRRK....',
    '...KRRHHHHRRK...',
    '...KRRRRRRRRK...',
    '....KKRRRRKK....',
    '.....P....P.....',
    '.....P....P.....',
    '......P..P......',
    '.......PP.......',
  ],
  [
    '...KRHHRRHHRK...',
    '..KRRHHRRHHRRK..',
    '..KRRRRRRRRRRK..',
    '...KKRRRRRRKK...',
    '....P......P....',
    '....P......P....',
    '.....P....P.....',
    '......PPPP......',
  ],
  [
    '..KRHHRRRRHHRK..',
    '.KRRHHRRRRHHRRK.',
    '.KRRRRRRRRRRRRK.',
    '..KKRRRRRRRRKK..',
    '...P........P...',
    '....P......P....',
    '.....P....P.....',
    '......PPPP......',
  ],
];

const DEPLOY = DEPLOY_TOPS.map((top) => {
  const trackDiver = FREEFALL.at(-1); // full-track pose
  const f = new Frame(16, 24);
  Frame.fromGrid(top).data.copy(f.data, 0);
  trackDiver.data.copy(f.data, 16 * 8 * 4);
  return f;
});

// --------------------------------------------------------------------------
// canopy.png — 32x32 x4: sway A, sway B, flared, stalled. Round canopy seen
// from above: 8 alternating red/white gores, ink rim, dark centre vent.
// --------------------------------------------------------------------------

function canopyFrame({ cx = 31.5, cy = 31.5, rx = 28, ry = 28, crumple = 0 }) {
  const f = new Frame(64, 64);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const a = Math.atan2(y - cy, x - cx);
      // Crumpling pinches the radius with a fixed 3-lobe wobble (stall frame).
      const wobble = 1 - crumple * (0.5 + 0.5 * Math.sin(a * 3 + 1));
      const d = Math.hypot((x - cx) / (rx * wobble), (y - cy) / (ry * wobble));
      if (d > 1) continue;
      const sector = Math.floor(((a + Math.PI) / (Math.PI / 4)) % 8);
      let key = sector % 2 ? 'R' : 'H';
      if (d > 1 - 2.4 / Math.min(rx, ry)) key = 'K'; // rim
      else if (d > 1 - 6 / Math.min(rx, ry)) key = sector % 2 ? 'r' : 'P'; // curved gore edge
      if (d < 0.14) key = 'S'; // centre vent
      f.set(x, y, key);
    }
  }
  return shadeFrame(f);
}

const CANOPY = [
  canopyFrame({}),
  canopyFrame({ cx: 33.5, cy: 32.1 }), // sway
  canopyFrame({ rx: 31, ry: 23, cy: 34 }), // flared: flatter & wider
  canopyFrame({ rx: 26, ry: 18, cy: 34, crumple: 0.45 }), // stalled: crumpled
];

// --------------------------------------------------------------------------
// diver-land.png — 16x16 x6: crouch → stand → gather chute → plant flag →
// wave A → wave B. Drawn front-on (a tiny ground-level vignette).
// --------------------------------------------------------------------------

const LAND = [
  [
    '................',
    '................',
    '................',
    '......KKKK......',
    '.....KBHHBK.....',
    '......KKKK......',
    '.....KRRRRK.....',
    '....KRRRRRRK....',
    '...KORRRRRROK...',
    '....KKRRRRKK....',
    '....KRK..KRK....',
    '...KRK....KRK...',
    '..KNNK....KNNK..',
    '................',
    '................',
    '................',
  ],
  [
    '................',
    '......KKKK......',
    '.....KBHHBK.....',
    '......KKKK......',
    '.....KRRRRK.....',
    '....KORRRROK....',
    '....KORRRROK....',
    '.....KRRRRK.....',
    '.....KRRRRK.....',
    '.....KRKKRK.....',
    '.....KRK.KRK....',
    '.....KRK.KRK....',
    '....KNNK.KNNK...',
    '................',
    '................',
    '................',
  ],
  [
    '................',
    '......KKKK......',
    '.....KBHHBK.....',
    '......KKKK......',
    '.....KRRRRK.....',
    '....KORRRROK....',
    '....KORRRROK....',
    '.....KRRRRK.....',
    '.....KRRRRK.....',
    '.KK..KRKKRK.....',
    'KRRK.KRK.KRK....',
    'KRRRKKRK.KRK....',
    '.KKKKNNK.KNNK...',
    '................',
    '................',
    '................',
  ],
  [
    '............K...',
    '.........KBBK...',
    '.........KBBK...',
    '......KKKK..K...',
    '.....KBHHBK.K...',
    '......KKKK..K...',
    '.....KRRRRK.K...',
    '....KORRRRKOK...',
    '.....KRRRRK.K...',
    '.....KRRRRK.K...',
    '.....KRKKRK.K...',
    '.....KRK.KRK....',
    '.....KRK.KRK....',
    '....KNNK.KNNK...',
    '................',
    '................',
  ],
  [
    '...........KOK..',
    '......KKKK.KOK..',
    '.....KBHHBKKRK..',
    '......KKKKKRK...',
    '.....KRRRRRK....',
    '....KORRRRK.....',
    '....KORRRRK.....',
    '.....KRRRRK.....',
    '.....KRRRRK.....',
    '.....KRKKRK.....',
    '.....KRK.KRK....',
    '.....KRK.KRK....',
    '....KNNK.KNNK...',
    '................',
    '................',
    '................',
  ],
  [
    '..KOK......KOK..',
    '..KRK......KRK..',
    '...KRKKKKKKRK...',
    '....KKBHHBKK....',
    '.....KKKKKK.....',
    '.....KRRRRK.....',
    '....KORRRROK....',
    '.....KRRRRK.....',
    '.....KRRRRK.....',
    '.....KRKKRK.....',
    '.....KRK.KRK....',
    '.....KRK.KRK....',
    '....KNNK.KNNK...',
    '................',
    '................',
    '................',
  ],
].map(Frame.fromGrid);

// --------------------------------------------------------------------------
// diver-crash.png — 16x16 x4: impact splat → dust puff → seeing stars A/B.
// --------------------------------------------------------------------------

const CRASH = [
  [
    '................',
    '................',
    '................',
    '................',
    '................',
    '......KK........',
    '....KKrrKK......',
    '...KrrrrrrK.....',
    '..KrrRRrrrrK....',
    '...KrrrrrrK.....',
    '....KKrrKK......',
    '......KK........',
    '................',
    '................',
    '................',
    '................',
  ],
  [
    '................',
    '................',
    '................',
    '.....PP.PP......',
    '...PPPPPPPPP....',
    '..PPPHPPPHPPP...',
    '..PPPPPPPPPPP...',
    '...PPPPPPPPP....',
    '.....PPPPP......',
    '................',
    '......KrrK......',
    '.....KrrrrK.....',
    '......KKKK......',
    '................',
    '................',
    '................',
  ],
  [
    '....H......H....',
    '................',
    '.......H........',
    '................',
    '..KKKKKKKKKK....',
    '.KrrRRRRrrrrK...',
    '..KKKKKKKKKK....',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  [
    '..H.........H...',
    '................',
    '.........H......',
    '................',
    '..KKKKKKKKKK....',
    '.KrrRRRRrrrrK...',
    '..KKKKKKKKKK....',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
].map(Frame.fromGrid);

// --------------------------------------------------------------------------
// plane.png — 48x32 x3: top-down biplane pointing right (+X), three prop
// positions. Drawn procedurally: wings span Y, fuselage runs along X.
// --------------------------------------------------------------------------

function planeFrame(prop) {
  const f = new Frame(48, 32);
  // tail: horizontal stabiliser + fin
  f.rect(2, 10, 5, 12, 'R');
  f.rect(2, 9, 5, 1, 'K');
  f.rect(2, 22, 5, 1, 'K');
  f.rect(1, 10, 1, 12, 'K');
  f.rect(4, 14, 3, 4, 'r');
  // fuselage
  f.rect(6, 13, 33, 6, 'R');
  f.rect(6, 12, 33, 1, 'K');
  f.rect(6, 19, 33, 1, 'K');
  f.rect(10, 14, 26, 1, 'H'); // pinstripe
  // lower wing peeking out behind the upper one
  f.rect(20, 3, 8, 26, 'r');
  // upper wing
  f.rect(18, 1, 10, 30, 'R');
  f.rect(18, 0, 10, 1, 'K');
  f.rect(18, 31, 10, 1, 'K');
  f.rect(17, 1, 1, 30, 'K');
  f.rect(28, 1, 1, 30, 'K');
  f.rect(20, 2, 2, 28, 'H'); // wing stripe
  // cockpit
  f.rect(30, 14, 4, 4, 'S');
  f.rect(30, 13, 4, 1, 'B');
  // engine cowl + nose
  f.rect(39, 13, 3, 6, 'B');
  f.rect(42, 14, 2, 4, 'K');
  // propeller: 3 positions around the hub at (44, 16)
  if (prop === 0) {
    f.rect(44, 8, 1, 16, 'P');
  } else if (prop === 1) {
    for (let i = -7; i <= 7; i++) f.set(44 + (i > 0 ? 1 : 0), 16 + i, 'P');
  } else {
    f.rect(43, 15, 3, 1, 'P');
    f.rect(43, 17, 3, 1, 'P');
  }
  f.set(44, 16, 'K'); // hub
  return f;
}

const PLANE = [planeFrame(0), planeFrame(1), planeFrame(2)];

// --------------------------------------------------------------------------
// terrain.png — 16x16 x10: tree A, tree B, bush, rock, hay bale, pond, tent,
// spectator A, spectator B, windsock (pointing +X; renderer rotates it).
// --------------------------------------------------------------------------

// Trees & co are rendered natively at 32x32 (not upscaled) so the curves stay
// smooth at the doubled resolution; foliage gets deterministic leaf clusters.
function treeFrame(r, light, seed) {
  const f = new Frame(32, 32);
  f.ellipse(15.5, 15.5, r, r, 'g');
  f.ellipse(13.5, 13.5, r * 0.55, r * 0.55, light, light);
  const rand = lcg(seed);
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2;
    const d = rand() * (r - 3);
    f.set(15.5 + Math.cos(a) * d, 15.5 + Math.sin(a) * d, i % 3 ? 'G' : 'D');
  }
  return shadeFrame(f);
}

function bushFrame() {
  const f = new Frame(32, 32);
  f.ellipse(15.5, 19, 10, 7, 'G');
  f.ellipse(12.5, 16.5, 4.5, 3, 'L', 'L');
  f.ellipse(20, 19, 3, 2, 'g', 'g');
  return shadeFrame(f);
}

function rockFrame() {
  const f = new Frame(32, 32);
  f.ellipse(15.5, 19, 10, 8, 'Y');
  f.ellipse(12, 16, 4, 2.5, 'P', 'P');
  f.ellipse(20, 21, 3, 2, 'S', 'S');
  return shadeFrame(f);
}

function hayFrame() {
  const f = new Frame(32, 32);
  f.ellipse(15.5, 16, 10, 9, 'B');
  f.ellipse(15.5, 16, 7.5, 6.5, 'b', 'b');
  f.ellipse(15.5, 16, 5.5, 4.5, 'N');
  f.ellipse(15.5, 16, 2.5, 2, 'B', 'B');
  return shadeFrame(f);
}

function pondFrame() {
  const f = new Frame(32, 32);
  f.ellipse(15.5, 16, 13, 9, 'W', 'S');
  f.ellipse(15.5, 16, 10, 6.5, 'w', '.');
  f.ellipse(15.5, 16, 8, 5, 'W', 'W');
  f.rect(10, 14, 6, 1, 'H');
  f.rect(18, 18, 4, 1, 'H');
  f.rect(8, 19, 3, 1, 'w');
  return f;
}

const TENT = Frame.fromGrid([
  '................',
  '................',
  '................',
  '...KKKKKKKKKK...',
  '..KHHRRHHRRHHK..',
  '..KHHRRHHRRHHK..',
  '..KHHRRHHRRHHK..',
  '..KHHRRHHRRHHK..',
  '..KHHRRHHRRHHK..',
  '..KHHRRHHRRHHK..',
  '...KKKKKKKKKK...',
  '......KSSK......',
  '................',
  '................',
  '................',
  '................',
]);

const SPECTATOR_A = Frame.fromGrid([
  '................',
  '................',
  '................',
  '................',
  '......KKK.......',
  '.....KOOOK......',
  '......KKK.......',
  '.....KWWWK......',
  '....KOWWWOK.....',
  '.....KWWWK......',
  '.....KK.KK......',
  '.....K...K......',
  '................',
  '................',
  '................',
  '................',
]);

const SPECTATOR_B = Frame.fromGrid([
  '................',
  '................',
  '................',
  '....KOK.........',
  '....KPK.KKK.....',
  '.....KPKOOOK....',
  '......KPKKK.....',
  '.....KPPPK......',
  '.....KPPPK......',
  '.....KK.KK......',
  '.....K...K......',
  '................',
  '................',
  '................',
  '................',
  '................',
]);

const WINDSOCK = Frame.fromGrid([
  '................',
  '................',
  '................',
  '................',
  '................',
  '..K.KKKKKK......',
  '..KKRRRRRRKKK...',
  '..KKRRRRRRRRK...',
  '..KKRRRRRRKKK...',
  '..K.KKKKKK......',
  '..K.............',
  '..K.............',
  '..K.............',
  '..KK............',
  '................',
  '................',
]);

// Slack flutter pose (frame 10) — the menus toggle 9 ↔ 10; in-game the sock
// stays on frame 9 and is rotated by the wind instead.
const WINDSOCK_B = Frame.fromGrid([
  '................',
  '................',
  '................',
  '................',
  '................',
  '..K.KKKKK.......',
  '..KKRRRRRKK.....',
  '..KKRRRRRRRK....',
  '..K.KKKRRRK.....',
  '..K....KKK......',
  '..K.............',
  '..K.............',
  '..K.............',
  '..KK............',
  '................',
  '................',
]);

const TERRAIN = [
  treeFrame(13, 'L', 0xa11ce),
  treeFrame(11, 'G', 0xb0b42),
  bushFrame(),
  rockFrame(),
  hayFrame(),
  pondFrame(),
  hibitFrame(TENT),
  hibitFrame(SPECTATOR_A),
  hibitFrame(SPECTATOR_B),
  hibitFrame(WINDSOCK),
  hibitFrame(WINDSOCK_B),
];

// --------------------------------------------------------------------------
// clouds.png — 96x48 x3: billow, long drift, bank pair. Modelled with three
// shades (cream tops, parchment mid, shaded underside) plus an amber sunset
// rim on the lower-left, sun-facing edge. No ink outline; transparent margins
// let the raw strip tile as a natural cloud field via repeat-x.
// --------------------------------------------------------------------------

function cloudFrame(puffs) {
  const f = new Frame(96, 48);
  for (const [cx, cy, rx, ry, key] of puffs) {
    f.ellipse(cx, cy, rx, ry, key, key);
  }
  rimLight(f, 'p', [0, 1]); // shaded base
  rimLight(f, 'A', [-1, 1]); // amber sunset rim, sun side
  return f;
}

const CLOUDS = [
  cloudFrame([
    [44, 33, 28, 9, 'p'],
    [44, 31, 26, 8, 'P'],
    [28, 24, 13, 9, 'P'],
    [50, 20, 16, 11, 'P'],
    [30, 22, 11, 7, 'H'],
    [52, 18, 13, 8, 'H'],
    [65, 27, 11, 7, 'H'],
    [42, 27, 17, 9, 'H'],
  ]),
  cloudFrame([
    [48, 31, 34, 7, 'p'],
    [48, 29, 32, 6, 'P'],
    [28, 24, 15, 7, 'P'],
    [53, 21, 17, 8, 'P'],
    [30, 22, 12, 5, 'H'],
    [54, 19, 14, 6, 'H'],
    [71, 26, 12, 5, 'H'],
  ]),
  cloudFrame([
    [32, 29, 19, 7, 'p'],
    [32, 27, 17, 6, 'P'],
    [26, 21, 10, 6, 'H'],
    [41, 23, 10, 5, 'H'],
    [72, 35, 15, 5, 'p'],
    [71, 33, 13, 4, 'P'],
    [68, 30, 8, 4, 'H'],
  ]),
];

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
// sky.png — 16x544 x1: golden-hour gradient strip. Each band boundary blends
// through a dense (checker) then sparse dither row pair — far finer steps
// than an 8-bit gradient. Tiled horizontally, stretched to viewport height.
// --------------------------------------------------------------------------

// [height, key] solid · [height, [a, b]] 2x2 checker · [height, [a, b, 1]] sparse b in a
const SKY_BANDS = [
  [150, 'Z'], // deep dusk top
  [10, ['Z', 'T', 1]],
  [14, ['Z', 'T']],
  [10, ['T', 'Z', 1]],
  [76, 'T'], // twilight
  [9, ['T', 'M', 1]],
  [12, ['T', 'M']],
  [9, ['M', 'T', 1]],
  [58, 'M'], // mauve
  [8, ['M', 'E', 1]],
  [10, ['M', 'E']],
  [8, ['E', 'M', 1]],
  [46, 'E'], // ember
  [7, ['E', 'A', 1]],
  [8, ['E', 'A']],
  [7, ['A', 'E', 1]],
  [112, 'A'], // amber horizon glow
]; // heights sum to 544

function skyFrame() {
  const f = new Frame(16, 544);
  let y = 0;
  for (const [h, key] of SKY_BANDS) {
    for (let yy = y; yy < y + h; yy++) {
      for (let x = 0; x < 16; x++) {
        let k = key;
        if (Array.isArray(key)) {
          const [a, b, sparse] = key;
          if (sparse) k = (x * 5 + yy * 3) % 4 === 0 ? b : a;
          else k = ((x >> 1) + (yy >> 1)) % 2 ? b : a;
        }
        f.set(x, yy, k);
      }
    }
    y += h;
  }
  return f;
}

// --------------------------------------------------------------------------
// sun.png — 48x48 x1: low setting sun, dithered corona → ember rim → amber →
// brass → cream core.
// --------------------------------------------------------------------------

function sunFrame() {
  const f = new Frame(48, 48);
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < 48; x++) {
      const d = Math.hypot(x - 23.5, y - 23.5);
      if (d < 23.5 && d >= 20 && (x + y) % 2 === 0) f.set(x, y, 'A'); // corona
    }
  }
  f.ellipse(23.5, 23.5, 19.5, 19.5, 'A', 'E');
  f.ellipse(23.5, 23.5, 14.5, 14.5, 'B', 'C');
  f.ellipse(22, 22, 8, 8, 'H', 'H');
  return f;
}

// --------------------------------------------------------------------------
// hills-far.png 128x40 / hills-near.png 128x48 — repeat-x horizon silhouettes
// with a backlit ridge line and sparse interior texture. Profiles use whole
// sine cycles over the strip width so they tile seamlessly.
// --------------------------------------------------------------------------

function hillsFrame(w, h, key, darkKey, rim, profile, seed) {
  const f = new Frame(w, h);
  for (let x = 0; x < w; x++) {
    const top = Math.max(0, Math.round(profile((x / w) * 2 * Math.PI)));
    for (let y = top; y < h; y++) f.set(x, y, key);
  }
  const rand = lcg(seed);
  for (let i = 0; i < w / 2; i++) {
    const x = (rand() * w) | 0;
    const y = h - 1 - ((rand() * (h * 0.55)) | 0);
    f.set(x, y, darkKey);
    if (rand() > 0.5) f.set(x + 1, y, darkKey);
  }
  rimLight(f, rim, [0, -1]); // backlit ridge
  return f;
}

const HILLS_FAR = hillsFrame(
  128,
  40,
  'U',
  'V',
  'M',
  (a) => 14 + 6 * Math.sin(a) + 4 * Math.sin(3 * a + 1.3),
  0xfa44,
);
const HILLS_NEAR = hillsFrame(
  128,
  48,
  'V',
  'S',
  'U',
  (a) => 18 + 8 * Math.sin(a + 2.2) + 6 * Math.sin(2 * a + 0.6),
  0x9ea4,
);

// --------------------------------------------------------------------------
// ground.png — 192x48 x1: tileable airfield grass. A wide tile keeps the
// repeat from reading: mowing stripes, grass-tuft clusters, daisies and a
// worn dirt patch. Also overlaid in-game by the renderer as a low-alpha
// texture pattern.
// --------------------------------------------------------------------------

function groundFrame() {
  const f = new Frame(192, 48);
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < 192; x++) {
      const stripe = ((x / 24) | 0) % 2;
      let k = 'G';
      if (stripe && (x * 31 + y * 17) % 11 < 3) k = 'g'; // darker mowing pass
      if (!stripe && (x * 13 + y * 29) % 23 === 0) k = 'L'; // light blades
      f.set(x, y, k);
    }
  }
  // Worn dirt patch, away from the tile edges so the repeat stays seamless.
  f.ellipse(58, 30, 9, 4, 'N', 'N');
  f.ellipse(56, 29, 5, 2, 'n', 'n');
  const rand = lcg(0x6a55);
  for (let i = 0; i < 36; i++) {
    const x = (rand() * 192) | 0;
    const y = 3 + ((rand() * 42) | 0);
    f.set(x, y, 'D');
    f.set(x + 1, y, 'g');
    f.set(x - 1, y + 1, 'g');
    if (rand() > 0.5) f.set(x, y - 1, 'L');
  }
  for (let i = 0; i < 9; i++) {
    const x = (rand() * 192) | 0;
    const y = 4 + ((rand() * 40) | 0);
    f.set(x, y, 'H');
    f.set(x + 1, y, 'P');
  }
  return f;
}

// --------------------------------------------------------------------------
// birds.png — 16x8 x2: distant gull silhouettes (wings up / down) drifting
// across the menu sky in a small flock.
// --------------------------------------------------------------------------

const BIRDS = [
  Frame.fromGrid([
    '...V........V...',
    '..VVV......VVV..',
    '....VVV..VVV....',
    '......VVVV......',
    '................',
    '................',
    '................',
    '................',
  ]),
  Frame.fromGrid([
    '................',
    '................',
    '......VVVV......',
    '....VVV..VVV....',
    '..VVV......VVV..',
    '...V........V...',
    '................',
    '................',
  ]),
];

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
// Game sheets ship at 2x source resolution (res: 2 in engine SHEET_SPECS).
writeSheet('diver-freefall.png', hibit(FREEFALL), 32, 32);
writeSheet('diver-deploy.png', hibit(DEPLOY), 32, 48);
writeSheet('canopy.png', CANOPY, 64, 64);
writeSheet('diver-land.png', hibit(LAND), 32, 32);
writeSheet('diver-crash.png', hibit(CRASH), 32, 32);
writeSheet('plane.png', hibit(PLANE), 96, 64);
writeSheet('terrain.png', TERRAIN, 32, 32);
// Menu key-arts.
writeSheet('clouds.png', CLOUDS, 96, 48);
writeSheet('birds.png', BIRDS, 16, 8);
writeSheet('medals.png', hibit(MEDALS), 32, 32);
writeSheet('sky.png', [skyFrame()], 16, 544);
writeSheet('sun.png', [sunFrame()], 48, 48);
writeSheet('hills-far.png', [HILLS_FAR], 128, 40);
writeSheet('hills-near.png', [HILLS_NEAR], 128, 48);
writeSheet('ground.png', [groundFrame()], 192, 48);
writeSheet('paper.png', [paperFrame()], 48, 48);
writeSheet('rivet.png', [hibitFrame(RIVET)], 16, 16);
writeSheet('logo.png', LOGO, 24, 26);
