/**
 * Turns the Gazette's period photographs and documents into pixel-art "plates":
 * each public-domain original is fetched from Wikimedia Commons, cropped,
 * box-filtered down to plate size and ordered-dithered (Bayer 4×4) onto a short
 * ramp anchored on the palette tokens — sepia for photographs, a few inks for
 * the odd coloured document — so it reads like a halftone in a 1920s gazette
 * and sits on the same pixel grid as the rest of the UI (shown at ×2).
 *
 * Writes public/assets/gazette/*.png and the generated manifest
 * src/app/features/gazette/gazette-plates.ts (sizes + Commons page).
 *
 * Run: node tools/gazette-plates.mjs   (macOS: decodes JPEG/PNG with `sips`)
 * Originals are cached in the OS temp dir, so re-runs work offline and give
 * byte-identical plates. Only add files whose Commons licence is public
 * domain / CC0 — and credit them in the Gazette i18n (`plates.<id>.credit`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeIndexedPng } from './lib/png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'assets', 'gazette');
const MANIFEST = join(ROOT, 'src', 'app', 'features', 'gazette', 'gazette-plates.ts');
const CACHE = join(tmpdir(), 'skydiver-gazette-plates');
const USER_AGENT = 'SkydiverGazettePlates/1.0 (pixel-art game; build-time tool)';

// Dark → light. Sepia runs ink → parchment-dark → canvas-cream (_tokens.scss).
const RAMPS = {
  sepia: ['#2b1f12', '#5b4426', '#8e7148', '#c9b285', '#f3e9cf'],
  ticket: ['#2b1f12', '#4f5a3c', '#97a57e', '#d3dcba'],
};
// Free colours matched by distance (a stamp is not a tone ramp).
const INKS = {
  stamp: ['#f3e9cf', '#e0a0a0', '#c1352b', '#8f231c', '#1a2b45', '#34416b', '#5b9bd5'],
};

/**
 * id → Commons file, crop (fractions of the original: x0, y0, x1, y1), the box
 * the plate must fit (plate pixels, shown at ×2) and the ramp/inks to use.
 */
const PLATES = [
  { id: 'souther-field', file: 'Souther Field - World War I Curtiss JN-4 Jenny Trainers on Flight Line.jpg', crop: [0.12, 0.2, 0.88, 0.84] },
  { id: 'buc-1920', file: 'Maharajah de Kapurthala et Adrienne Bolland Buc 1920.jpg', crop: [0.02, 0.05, 0.98, 0.93] },
  { id: 'cody-transfer', file: 'Pilot for the Mabel Cody Flying Circus holds steady as Bugs McGowan transfers from the car to the plane (3984092476).jpg' },
  { id: 'ingle-change', file: 'Gladys Ingle is preparing to "change" from Bon MacDougall\'s Jenny to Art Goebel\'s aircraft.jpg' },
  { id: 'locklear-ladder', file: "In Atlantic City Ormer Locklear of Locklear's Flying Circus clings to one plane waiting for a 2nd plane trailing a rope ladder.jpg" },
  { id: 'boyer-breakaway', file: 'Lillian Boyer doing the breakaway cph.3b18662.jpg', crop: [0, 0.04, 1, 0.96] },
  { id: 'reichelt', file: 'Franz Reichelt, before the fatal attempt.jpg', box: [150, 240] },
  { id: 'broadwick', file: 'Tiny Broadwick.jpg' },
  { id: 'irvin-patent', file: 'Irvin Patent.png', box: [190, 260], gamma: 0.8 },
  { id: 'hendon-1930', file: "27-6-30, parachutiste au meeting de Hendon (debout sur les ailes d'un avion) - btv1b6921515w.jpg", crop: [0.03, 0.03, 0.97, 0.94] },
  { id: 'hilsz', file: 'Maryse Hilsz 1935.jpg', box: [180, 240] },
  { id: 'pegoud-chateaufort', file: '1913 (Châteaufort) parachute Bonnet sur Blériot (piloté par Pégoud) - btv1b53241932w.jpg', crop: [0.05, 0.06, 0.95, 0.92] },
  { id: 'vedrines-roof', file: "L'avion de Védrines sur les Galeries Lafayette - btv1b53238496c.jpg", crop: [0.03, 0.04, 0.97, 0.93] },
  { id: 'godefroy-arc', file: 'Godefroy flight.jpg' },
  { id: 'fronval', file: "Fronval (portrait de l'aviateur devant un avion) - btv1b53240659c.jpg", crop: [0.06, 0.03, 0.94, 0.97], box: [190, 240] },
  { id: 'bolland', file: 'Adrienne Bolland.jpg', box: [170, 240] },
  { id: 'coleman', file: 'Bessie Coleman and her plane (1922).jpg' },
  { id: 'doret', file: 'Marcel Doret 1926.jpg', box: [170, 240] },
  { id: 'balloon-poster', file: 'Miss Hazel Keyes Grand Ascension 1900.jpg', box: [180, 300], gamma: 0.85 },
  { id: 'pegoud-ticket', file: "Expériences de l'aviateur Pégoud. Pleine St-Denis, à Gand. Lundi 3 novembre. Automobile ou voiture. Entrée 5 francs. N° 0582 barcode 800000016804.jpg", crop: [0.02, 0.03, 0.98, 0.97], ramp: 'ticket', gamma: 0.9 },
  { id: 'inverted-jenny', file: 'Inverted Jenny.jpg', box: [210, 200], inks: 'stamp' },
];

const DEFAULT_BOX = [280, 200];
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(dirname(MANIFEST), { recursive: true });
mkdirSync(CACHE, { recursive: true });

const manifest = [];
for (const plate of PLATES) {
  const original = await fetchOriginal(plate);
  const img = decode(original);
  const cropped = crop(img, plate.crop ?? [0, 0, 1, 1]);
  const [bw, bh] = plate.box ?? DEFAULT_BOX;
  const scale = Math.min(bw / cropped.width, bh / cropped.height);
  const w = Math.round(cropped.width * scale);
  const h = Math.round(cropped.height * scale);
  const small = downsample(cropped, w, h);
  const { indices, palette } = plate.inks
    ? ditherInks(small, INKS[plate.inks])
    : ditherRamp(small, RAMPS[plate.ramp ?? 'sepia'], plate.gamma ?? 1);
  writeFileSync(join(OUT_DIR, `${plate.id}.png`), encodeIndexedPng(w, h, indices, palette));
  manifest.push({ id: plate.id, w, h, file: plate.file });
  console.log(`${plate.id.padEnd(16)} ${w}×${h}`);
}
writeManifest(manifest);

// ------------------------------------------------------------------ fetch ---

async function fetchOriginal(plate) {
  const path = join(CACHE, `${plate.id}.img`);
  if (existsSync(path)) {
    return path;
  }
  const api = new URL('https://commons.wikimedia.org/w/api.php');
  api.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    titles: `File:${plate.file}`,
    prop: 'imageinfo',
    iiprop: 'url',
    iiurlwidth: '800',
  }).toString();
  const info = await (await politeFetch(api)).json();
  const page = Object.values(info.query.pages)[0];
  if (!page.imageinfo) {
    throw new Error(`Commons has no file "${plate.file}"`);
  }
  const res = await politeFetch(page.imageinfo[0].thumburl);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  await new Promise((r) => setTimeout(r, 2_000)); // be gentle with Commons
  return path;
}

async function politeFetch(url) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (res.ok) {
      return res;
    }
    if (res.status !== 429 || attempt === 6) {
      throw new Error(`${res.status} for ${url}`);
    }
    await new Promise((r) => setTimeout(r, attempt * 10_000));
  }
}

// ----------------------------------------------------------------- decode ---

/** Any image `sips` reads → { width, height, rgb: Float32Array of 0–1 }. */
function decode(path) {
  const bmp = join(CACHE, 'decode.bmp');
  execFileSync('sips', ['-s', 'format', 'bmp', path, '--out', bmp], { stdio: 'ignore' });
  const buf = readFileSync(bmp);
  const offset = buf.readUInt32LE(10);
  const width = buf.readInt32LE(18);
  const rawHeight = buf.readInt32LE(22);
  const bpp = buf.readUInt16LE(28);
  if (bpp !== 24 && bpp !== 32) {
    throw new Error(`unexpected ${bpp}-bit BMP from sips`);
  }
  const height = Math.abs(rawHeight);
  const stride = Math.floor((bpp * width + 31) / 32) * 4;
  const rgb = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const row = offset + (rawHeight > 0 ? height - 1 - y : y) * stride;
    for (let x = 0; x < width; x++) {
      const p = row + x * (bpp / 8);
      const o = (y * width + x) * 3;
      rgb[o] = buf[p + 2] / 255;
      rgb[o + 1] = buf[p + 1] / 255;
      rgb[o + 2] = buf[p] / 255;
    }
  }
  return { width, height, rgb };
}

function crop(img, [x0, y0, x1, y1]) {
  const left = Math.round(x0 * img.width);
  const top = Math.round(y0 * img.height);
  const width = Math.round(x1 * img.width) - left;
  const height = Math.round(y1 * img.height) - top;
  const rgb = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const from = ((top + y) * img.width + left) * 3;
    rgb.set(img.rgb.subarray(from, from + width * 3), y * width * 3);
  }
  return { width, height, rgb };
}

/** Area-average down to w×h (every source pixel weighs the same). */
function downsample(img, w, h) {
  const rgb = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    const sy0 = Math.floor((y * img.height) / h);
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * img.height) / h));
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor((x * img.width) / w);
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * img.width) / w));
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const p = (sy * img.width + sx) * 3;
          r += img.rgb[p];
          g += img.rgb[p + 1];
          b += img.rgb[p + 2];
        }
      }
      const n = (sy1 - sy0) * (sx1 - sx0);
      const o = (y * w + x) * 3;
      rgb[o] = r / n;
      rgb[o + 1] = g / n;
      rgb[o + 2] = b / n;
    }
  }
  return { width: w, height: h, rgb };
}

// ----------------------------------------------------------------- dither ---

/**
 * Luminance, auto-levelled (2nd–98th percentile, so a scratch or a black
 * border doesn't flatten the picture), then ordered-dithered between adjacent
 * steps of the ramp.
 */
function ditherRamp(img, ramp, gamma) {
  const n = img.width * img.height;
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    lum[i] = 0.299 * img.rgb[i * 3] + 0.587 * img.rgb[i * 3 + 1] + 0.114 * img.rgb[i * 3 + 2];
  }
  const sorted = Float32Array.from(lum).sort();
  const lo = sorted[Math.floor(n * 0.02)];
  const hi = sorted[Math.floor(n * 0.98)];
  const steps = ramp.length - 1;
  const indices = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const v = Math.min(1, Math.max(0, (lum[i] - lo) / Math.max(1e-6, hi - lo))) ** gamma;
    const scaled = v * steps;
    const base = Math.min(steps - 1, Math.floor(scaled));
    const threshold = (bayerAt(i, img.width) + 0.5) / 16;
    indices[i] = base + (scaled - base > threshold ? 1 : 0);
  }
  return { indices, palette: ramp };
}

/** Nearest ink after a Bayer nudge (for colour documents). */
function ditherInks(img, inks) {
  const colors = inks.map((hex) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255));
  const n = img.width * img.height;
  const indices = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const nudge = ((bayerAt(i, img.width) + 0.5) / 16 - 0.5) * 0.2;
    let best = 0;
    let bestD = Infinity;
    colors.forEach(([r, g, b], k) => {
      const d =
        (img.rgb[i * 3] + nudge - r) ** 2 +
        (img.rgb[i * 3 + 1] + nudge - g) ** 2 +
        (img.rgb[i * 3 + 2] + nudge - b) ** 2;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    });
    indices[i] = best;
  }
  return { indices, palette: inks };
}

function bayerAt(i, width) {
  return BAYER4[((Math.floor(i / width) & 3) << 2) | (i % width & 3)];
}

// --------------------------------------------------------------- manifest ---

function writeManifest(plates) {
  // encodeURIComponent leaves ' alone, and the manifest quotes with it.
  const commons = (file) =>
    `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replaceAll(' ', '_')).replaceAll("'", '%27')}`;
  const rows = plates.map(
    (p) =>
      `  '${p.id}': {\n    src: 'assets/gazette/${p.id}.png',\n    w: ${p.w},\n    h: ${p.h},\n    commons: '${commons(p.file)}',\n  },`,
  );
  writeFileSync(
    MANIFEST,
    `// Generated by tools/gazette-plates.mjs — do not edit by hand.

/** A dithered period plate: its size in plate pixels (shown at ×2) and its Commons page. */
export interface GazettePlate {
  readonly src: string;
  readonly w: number;
  readonly h: number;
  readonly commons: string;
}

export const PLATES = {
${rows.join('\n')}
} as const satisfies Record<string, GazettePlate>;

export type PlateId = keyof typeof PLATES;
`,
  );
}
