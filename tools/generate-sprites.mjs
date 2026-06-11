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
  H: '#fff7e0', // highlight
  P: '#e8d8b0', // parchment (suspension lines, dust)
  O: '#e0a878', // skin
  G: '#4f7a3a', // ground green
  g: '#3a5c2b', // dark green
  L: '#6f9c4a', // light green
  W: '#3a6ea5', // water
  N: '#7a5230', // wood / boots
  Y: '#8a8a8a', // rock grey
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
  const trackDiver = FREEFALL[4];
  const f = new Frame(16, 24);
  Frame.fromGrid(top).data.copy(f.data, 0);
  trackDiver.data.copy(f.data, 16 * 8 * 4);
  return f;
});

// --------------------------------------------------------------------------
// canopy.png — 32x32 x4: sway A, sway B, flared, stalled. Round canopy seen
// from above: 8 alternating red/white gores, ink rim, dark centre vent.
// --------------------------------------------------------------------------

function canopyFrame({ cx = 15.5, cy = 15.5, rx = 14, ry = 14, crumple = 0 }) {
  const f = new Frame(32, 32);
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const a = Math.atan2(y - cy, x - cx);
      // Crumpling pinches the radius with a fixed 3-lobe wobble (stall frame).
      const wobble = 1 - crumple * (0.5 + 0.5 * Math.sin(a * 3 + 1));
      const d = Math.hypot((x - cx) / (rx * wobble), (y - cy) / (ry * wobble));
      if (d > 1) continue;
      const sector = Math.floor(((a + Math.PI) / (Math.PI / 4)) % 8);
      let key = sector % 2 ? 'R' : 'H';
      if (d > 1 - 1.6 / Math.min(rx, ry)) key = 'K'; // rim
      if (d < 0.16) key = 'S'; // centre vent
      f.set(x, y, key);
    }
  }
  return f;
}

const CANOPY = [
  canopyFrame({}),
  canopyFrame({ cx: 16.5, cy: 15.8 }), // sway
  canopyFrame({ rx: 15.5, ry: 11.5, cy: 17 }), // flared: flatter & wider
  canopyFrame({ rx: 13, ry: 9, cy: 17, crumple: 0.45 }), // stalled: crumpled
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

function treeFrame(r, light) {
  const f = new Frame(16, 16);
  f.ellipse(7.5, 7.5, r, r, 'g');
  f.ellipse(6.5, 6.5, r * 0.55, r * 0.55, light, light);
  f.set(7, 7, 'G');
  f.set(8, 9, 'G');
  return f;
}

function bushFrame() {
  const f = new Frame(16, 16);
  f.ellipse(7.5, 9, 5, 3.5, 'G');
  f.ellipse(6.5, 8, 2, 1.5, 'L', 'L');
  return f;
}

function rockFrame() {
  const f = new Frame(16, 16);
  f.ellipse(7.5, 9, 5, 4, 'Y');
  f.ellipse(6, 8, 1.8, 1.2, 'P', 'P');
  return f;
}

function hayFrame() {
  const f = new Frame(16, 16);
  f.ellipse(7.5, 8, 5, 4.5, 'B');
  f.ellipse(7.5, 8, 2.6, 2.2, 'N');
  f.ellipse(7.5, 8, 1.2, 1, 'B', 'B');
  return f;
}

function pondFrame() {
  const f = new Frame(16, 16);
  f.ellipse(7.5, 8, 6.5, 4.5, 'W', 'S');
  f.rect(5, 7, 3, 1, 'H');
  f.rect(9, 9, 2, 1, 'H');
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

const TERRAIN = [
  treeFrame(6.5, 'L'),
  treeFrame(5.5, 'G'),
  bushFrame(),
  rockFrame(),
  hayFrame(),
  pondFrame(),
  TENT,
  SPECTATOR_A,
  SPECTATOR_B,
  WINDSOCK,
];

// --------------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });
console.log(`Writing sprite sheets to ${OUT_DIR}`);
writeSheet('diver-freefall.png', FREEFALL, 16, 16);
writeSheet('diver-deploy.png', DEPLOY, 16, 24);
writeSheet('canopy.png', CANOPY, 32, 32);
writeSheet('diver-land.png', LAND, 16, 16);
writeSheet('diver-crash.png', CRASH, 16, 16);
writeSheet('plane.png', PLANE, 48, 32);
writeSheet('terrain.png', TERRAIN, 16, 16);
