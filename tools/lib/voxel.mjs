/**
 * Voxel "pre-render" kit — the 90s trick (think Donkey Kong Country) of
 * modelling in 3D and baking pixel-art sprites from fixed angles, so every
 * object reads with the same light, scale and outline from any viewpoint the
 * Mode 7 camera needs.
 *
 * Models are built from solid primitives into a voxel grid (model space in
 * metres: x right, y forward, z up, origin = the object's anchor point). A view
 * is an orthographic render at a relative yaw and an elevation angle:
 * z-buffered surface splats, lit from the camera's upper-left-front, shaded
 * by quantising onto a per-material colour ramp (ordered dither), with depth
 * creases and a selective outline. Thin parts (struts, rigging, suspension
 * lines) are drawn as depth-tested lines.
 *
 * Pure Node, deterministic: the same models always bake the same pixels.
 */

// ---------------------------------------------------------------- colours ---

function hex(h) {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

/** Material registry: id → { ramp: [rgb dark … light], dither?: 0..1 }. */
export class Materials {
  constructor() {
    this.list = [null];
    this.byName = new Map();
  }

  /** Register a ramp (hex strings, dark → light). `opts.dither` = coverage (prop blur). */
  add(name, ramp, opts = {}) {
    const id = this.list.length;
    this.list.push({ name, ramp: ramp.map(hex), dither: opts.dither ?? 1, flat: !!opts.flat });
    this.byName.set(name, id);
    return id;
  }

  id(name) {
    const id = this.byName.get(name);
    if (!id) throw new Error(`unknown material ${name}`);
    return id;
  }
}

// ---------------------------------------------------------------- model ---

export class VoxelModel {
  /**
   * @param vs voxel size (m)
   * @param bounds [[x0, x1], [y0, y1], [z0, z1]] in metres
   */
  constructor(vs, bounds) {
    this.vs = vs;
    this.o = bounds.map((b) => b[0]);
    this.n = bounds.map((b) => Math.max(1, Math.ceil((b[1] - b[0]) / vs)));
    this.mat = new Uint8Array(this.n[0] * this.n[1] * this.n[2]);
    this.lines = [];
  }

  idx(i, j, k) {
    return (k * this.n[1] + j) * this.n[0] + i;
  }

  get(i, j, k) {
    if (i < 0 || j < 0 || k < 0 || i >= this.n[0] || j >= this.n[1] || k >= this.n[2]) return 0;
    return this.mat[this.idx(i, j, k)];
  }

  /** Centre of voxel (i, j, k) in metres. */
  pos(i, j, k) {
    return [
      this.o[0] + (i + 0.5) * this.vs,
      this.o[1] + (j + 0.5) * this.vs,
      this.o[2] + (k + 0.5) * this.vs,
    ];
  }

  /**
   * Evaluate `fn(x, y, z)` over the voxels of a world-space box; a non-zero
   * return paints that material (0 / undefined leaves the voxel), -1 carves.
   */
  region(x0, y0, z0, x1, y1, z1, fn) {
    const vs = this.vs;
    const i0 = Math.max(0, Math.floor((Math.min(x0, x1) - this.o[0]) / vs));
    const i1 = Math.min(this.n[0] - 1, Math.ceil((Math.max(x0, x1) - this.o[0]) / vs));
    const j0 = Math.max(0, Math.floor((Math.min(y0, y1) - this.o[1]) / vs));
    const j1 = Math.min(this.n[1] - 1, Math.ceil((Math.max(y0, y1) - this.o[1]) / vs));
    const k0 = Math.max(0, Math.floor((Math.min(z0, z1) - this.o[2]) / vs));
    const k1 = Math.min(this.n[2] - 1, Math.ceil((Math.max(z0, z1) - this.o[2]) / vs));
    for (let k = k0; k <= k1; k++) {
      const z = this.o[2] + (k + 0.5) * vs;
      for (let j = j0; j <= j1; j++) {
        const y = this.o[1] + (j + 0.5) * vs;
        for (let i = i0; i <= i1; i++) {
          const x = this.o[0] + (i + 0.5) * vs;
          const m = fn(x, y, z);
          if (m === -1) this.mat[this.idx(i, j, k)] = 0;
          else if (m) this.mat[this.idx(i, j, k)] = m;
        }
      }
    }
    return this;
  }

  /** `m` is a material id or a function (x, y, z) → id (stripes, panels…). */
  box(x0, y0, z0, x1, y1, z1, m) {
    return this.region(x0, y0, z0, x1, y1, z1, (x, y, z) => mat(m, x, y, z));
  }

  ellipsoid(cx, cy, cz, rx, ry, rz, m) {
    return this.region(cx - rx, cy - ry, cz - rz, cx + rx, cy + ry, cz + rz, (x, y, z) => {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;
      return d <= 1 ? mat(m, x, y, z) : 0;
    });
  }

  sphere(cx, cy, cz, r, m) {
    return this.ellipsoid(cx, cy, cz, r, r, r, m);
  }

  /** Capped cylinder/cone along a segment, radius r0 at `a` → r1 at `b`. */
  capsule(a, b, r0, m, r1 = r0, round = true) {
    const pad = Math.max(r0, r1);
    const [ax, ay, az] = a;
    const [bx, by, bz] = b;
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len2 = dx * dx + dy * dy + dz * dz || 1e-9;
    return this.region(
      Math.min(ax, bx) - pad,
      Math.min(ay, by) - pad,
      Math.min(az, bz) - pad,
      Math.max(ax, bx) + pad,
      Math.max(ay, by) + pad,
      Math.max(az, bz) + pad,
      (x, y, z) => {
        let t = ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / len2;
        if (!round && (t < 0 || t > 1)) return 0;
        t = Math.max(0, Math.min(1, t));
        const px = ax + dx * t - x;
        const py = ay + dy * t - y;
        const pz = az + dz * t - z;
        const r = r0 + (r1 - r0) * t;
        return px * px + py * py + pz * pz <= r * r ? mat(m, x, y, z) : 0;
      },
    );
  }

  /** Vertical cylinder from z0 to z1 (optionally tapering r0 → r1). */
  cylinderZ(cx, cy, z0, z1, r0, m, r1 = r0) {
    return this.capsule([cx, cy, z0], [cx, cy, z1], r0, m, r1, false);
  }

  /** Remove voxels where `fn(x, y, z)` is true inside a box. */
  carve(x0, y0, z0, x1, y1, z1, fn = () => true) {
    return this.region(x0, y0, z0, x1, y1, z1, (x, y, z) => (fn(x, y, z) ? -1 : 0));
  }

  /** The same voxels with the origin moved by -(dx, dy, dz): the model shifts by (dx, dy, dz). */
  moved(dx, dy, dz) {
    const m = Object.create(VoxelModel.prototype);
    const d = [dx, dy, dz];
    m.vs = this.vs;
    m.n = this.n;
    m.mat = this.mat;
    m.o = this.o.map((v, i) => v + d[i]);
    m.lines = this.lines.map(([a, b, c]) => [a.map((v, i) => v + d[i]), b.map((v, i) => v + d[i]), c]);
    return m;
  }

  /** A thin line (rigging) drawn after the voxels, depth-tested. */
  line(a, b, color) {
    this.lines.push([a, b, hex(color)]);
    return this;
  }
}

function mat(m, x, y, z) {
  return typeof m === 'function' ? m(x, y, z) : m;
}

// --------------------------------------------------------------- surfaces ---

/** Surface voxels with smoothed normals (occupancy gradient), cached per model. */
function surfaces(model, radius) {
  const key = `s${radius}`;
  if (model[key]) return model[key];
  const out = [];
  const [nx, ny, nz] = model.n;
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const m = model.mat[model.idx(i, j, k)];
        if (!m) continue;
        if (
          model.get(i + 1, j, k) &&
          model.get(i - 1, j, k) &&
          model.get(i, j + 1, k) &&
          model.get(i, j - 1, k) &&
          model.get(i, j, k + 1) &&
          model.get(i, j, k - 1)
        ) {
          continue; // buried
        }
        let gx = 0;
        let gy = 0;
        let gz = 0;
        for (let c = -radius; c <= radius; c++) {
          for (let b = -radius; b <= radius; b++) {
            for (let a = -radius; a <= radius; a++) {
              if (model.get(i + a, j + b, k + c)) {
                gx += a;
                gy += b;
                gz += c;
              }
            }
          }
        }
        const len = Math.hypot(gx, gy, gz) || 1;
        out.push([...model.pos(i, j, k), m, -gx / len, -gy / len, -gz / len]);
      }
    }
  }
  model[key] = out;
  return out;
}

// ------------------------------------------------------------------ views ---

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** 3×3 rotation helpers (row-major). */
export function rotX(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [1, 0, 0, 0, c, -s, 0, s, c];
}
export function rotY(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}
export function rotZ(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}
export function mul(a, b) {
  const r = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
    }
  }
  return r;
}
export const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function apply(m, v) {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/**
 * Render one view of a model.
 * @param opts.w,h frame size; opts.ax, ay = pixel where the model origin lands
 * @param opts.ppm pixels per metre
 * @param opts.yaw relative yaw (rad, clockwise: 0 = the object faces away from the camera)
 * @param opts.elev camera elevation above the horizon (rad)
 * @param opts.pose optional 3×3 rotation applied in model space first
 * @returns RGBA Buffer (w*h*4)
 */
export function renderView(model, mats, opts) {
  const { w, h, ax, ay, ppm, yaw = 0, elev, pose = IDENTITY } = opts;
  const radius = opts.normalRadius ?? 2;
  const light = opts.light ?? [-0.55, 0.45, 0.72]; // (right, toward viewer, up)
  const ll = Math.hypot(...light);
  const L = light.map((v) => v / ll);
  const ambient = opts.ambient ?? 0.3;
  const edgeDepth = opts.edgeDepth ?? 0.5;

  // Model → camera: pose, then yaw (about z), then elevation.
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const ce = Math.cos(elev);
  const se = Math.sin(elev);
  const toCam = (p) => {
    const q = apply(pose, p);
    const x = q[0] * cy + q[1] * sy;
    const y = -q[0] * sy + q[1] * cy;
    return [x, q[2] * ce + y * se, y * ce - q[2] * se]; // [right, up, depth]
  };

  const N = w * h;
  const depth = new Float32Array(N).fill(Infinity);
  const matBuf = new Uint8Array(N);
  const shade = new Float32Array(N);
  const lineColor = new Array(N);

  for (const [x, y, z, m, nx, ny, nz] of surfaces(model, radius)) {
    const [px, pu, pd] = toCam([x, y, z]);
    const sx = Math.floor(ax + px * ppm);
    const syy = Math.floor(ay - pu * ppm);
    if (sx < 0 || syy < 0 || sx >= w || syy >= h) continue;
    const n = toCam([nx, ny, nz]); // rotation only (no translation in toCam)
    const toward = -n[2];
    if (toward < -0.35) continue; // back face
    const i = syy * w + sx;
    if (pd >= depth[i]) continue;
    depth[i] = pd;
    matBuf[i] = m;
    lineColor[i] = undefined;
    const lambert = Math.max(0, n[0] * L[0] + n[1] * L[2] + toward * L[1]);
    shade[i] = Math.min(1, ambient + (1 - ambient) * lambert * 1.15);
  }

  // Pinhole fill. At ~1 px per voxel, oblique surfaces leave gaps (dots and
  // 1-px slits) that show empty space or the far side of a shell (a canopy's
  // lining). A pixel with both neighbours on one axis — or three of four —
  // well in front of it takes the nearest of them. Two passes close 2-px gaps.
  const gap = model.vs * 2.5;
  for (let pass = 0; pass < 2; pass++) {
    const d0 = Float32Array.from(depth);
    const m0 = Uint8Array.from(matBuf);
    const s0 = Float32Array.from(shade);
    const front = (j, i) => m0[j] !== 0 && d0[j] < d0[i] - gap;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const l = front(i - 1, i);
        const r = front(i + 1, i);
        const u = front(i - w, i);
        const d = front(i + w, i);
        if (!((l && r) || (u && d) || l + r + u + d >= 3)) continue;
        let best = -1;
        for (const j of [i - 1, i + 1, i - w, i + w]) {
          if (front(j, i) && (best < 0 || d0[j] < d0[best])) best = j;
        }
        depth[i] = d0[best];
        matBuf[i] = m0[best];
        shade[i] = s0[best];
      }
    }
  }

  // Thin rigging, depth-tested.
  for (const [a, b, rgb] of model.lines) {
    const pa = toCam(apply(IDENTITY, a));
    const pb = toCam(apply(IDENTITY, b));
    const x0 = ax + pa[0] * ppm;
    const y0 = ay - pa[1] * ppm;
    const x1 = ax + pb[0] * ppm;
    const y1 = ay - pb[1] * ppm;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const sx = Math.floor(x0 + (x1 - x0) * t);
      const syy = Math.floor(y0 + (y1 - y0) * t);
      if (sx < 0 || syy < 0 || sx >= w || syy >= h) continue;
      const d = pa[2] + (pb[2] - pa[2]) * t - 0.05;
      const i = syy * w + sx;
      if (d < depth[i]) {
        depth[i] = d;
        lineColor[i] = rgb;
        matBuf[i] = 255;
      }
    }
  }

  // Resolve colours: ramp quantisation with a light ordered dither, darker
  // creases where depth jumps (parts in front of others).
  const out = Buffer.alloc(N * 4);
  const ramps = mats.list;
  const filled = (i) => matBuf[i] !== 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const m = matBuf[i];
      if (!m) continue;
      if (m === 255) {
        const rgb = lineColor[i];
        out[i * 4] = rgb[0];
        out[i * 4 + 1] = rgb[1];
        out[i * 4 + 2] = rgb[2];
        out[i * 4 + 3] = 255;
        continue;
      }
      const mt = ramps[m];
      if (mt.dither < 1 && BAYER4[(y & 3) * 4 + (x & 3)] / 16 >= mt.dither) {
        matBuf[i] = 0; // translucent material: drop pixels in a fixed pattern
        continue;
      }
      const n = mt.ramp.length;
      let v = mt.flat ? n - 2 : shade[i] * (n - 1) + (BAYER4[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 0.55;
      let crease = false;
      for (const j of [i - 1, i + 1, i - w, i + w]) {
        if (j >= 0 && j < N && filled(j) && matBuf[j] !== 255 && depth[i] - depth[j] > edgeDepth) {
          crease = true;
        }
      }
      if (crease) v -= 1.2;
      const idx = Math.max(0, Math.min(n - 1, Math.round(v)));
      const rgb = mt.ramp[idx];
      out[i * 4] = rgb[0];
      out[i * 4 + 1] = rgb[1];
      out[i * 4 + 2] = rgb[2];
      out[i * 4 + 3] = 255;
    }
  }

  // Selective outline: empty pixels touching the sprite take a darkened
  // version of the neighbouring material's darkest tone.
  const outline = Buffer.from(out);
  const ink = hex(opts.ink ?? '#1a1210');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (out[i * 4 + 3]) continue;
      let src = -1;
      for (const j of [i - w, i - 1, i + 1, i + w]) {
        const jx = j % w;
        if (j < 0 || j >= N || Math.abs(jx - x) > 1) continue;
        if (out[j * 4 + 3] && matBuf[j] && matBuf[j] !== 255) {
          src = j;
          break;
        }
      }
      if (src < 0) continue;
      const dark = ramps[matBuf[src]].ramp[0];
      outline[i * 4] = Math.round(dark[0] * 0.5 + ink[0] * 0.5);
      outline[i * 4 + 1] = Math.round(dark[1] * 0.5 + ink[1] * 0.5);
      outline[i * 4 + 2] = Math.round(dark[2] * 0.5 + ink[2] * 0.5);
      outline[i * 4 + 3] = 255;
    }
  }
  return outline;
}

// ------------------------------------------------------------------ sheets ---

/** Lay frames (equal size) out as one horizontal strip. */
export function strip(frames, w, h) {
  const sheet = Buffer.alloc(frames.length * w * h * 4);
  const stride = frames.length * w * 4;
  frames.forEach((f, n) => {
    for (let y = 0; y < h; y++) {
      f.copy(sheet, y * stride + n * w * 4, y * w * 4, (y + 1) * w * 4);
    }
  });
  return { width: frames.length * w, height: h, data: sheet };
}
