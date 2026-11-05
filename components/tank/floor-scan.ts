import * as THREE from 'three';

/**
 * Floor scan shown when the floor section is opened. Every bottom and annular plate
 * is painted like an Eddyfi / Silverwing Floormap "Tank Floor Layout Showing Top and
 * Bottom Discontinuities" plot: light-grey scan tracks along each plate with ragged
 * ends and white unscanned gaps, black plate outlines, and discontinuities drawn as
 * pixel speckle in banded colours (yellow 20–29 % up to red 80 %+). The deeper calls
 * also get 3D pins.
 *
 * The data is illustrative only. It is generated from a fixed seed so the same
 * floor appears every time.
 */

/** Floor geometry, matching the plate seams drawn in build-tank.ts. */
export const FLOOR = {
  /** Inside edge of the annular ring. */
  inner: 4.42,
  /** Shell radius: the scan stops here. */
  shell: 5,
  /** Width of a bottom-plate row. */
  rowH: 1.2,
  /** Annular plates around the ring. */
  annN: 24,
  /** Height of the scan image above the plate surface (just over the seam lines). */
  y: 0.0915,
};

/** Discontinuity colour scheme (wall loss bands), as on the Floormap plot. */
export const scanBins: { from: number; to: number; color: string }[] = [
  { from: 20, to: 29, color: '#ffff00' },
  { from: 30, to: 39, color: '#ffa500' },
  { from: 40, to: 49, color: '#00e600' },
  { from: 50, to: 59, color: '#00ffff' },
  { from: 60, to: 69, color: '#1e90ff' },
  { from: 70, to: 79, color: '#ff00ff' },
  { from: 80, to: 100, color: '#ff0000' },
];
/** Lowest wall loss shown (the scanner's lower threshold). */
export const LOWER_THRESHOLD = 20;
export const WELD_DISCONTINUITY = '#e00000';
/** Wall loss (%) at which a call gets a 3D pin. */
export const PIN_MIN = 50;

const WHITE = [250, 250, 250];
const TRACK = [226, 227, 229];
const TRACK_EDGE = [204, 206, 209];
const OUTLINE = '#141414';
const MARKER = '#d8b46a';

export type ScanIndication = {
  no: number;
  x: number;
  z: number;
  rx: number;
  rz: number;
  /** Wall loss, % of nominal thickness. */
  loss: number;
};

/* ----------------------------------------------------------------------- plate layout --- */

/** Vertical seams of the bottom-plate row that starts at zStart (same rule as build-tank.ts). */
function rowSeams(zStart: number) {
  const xs: number[] = [];
  for (let x = -3.2 + (Math.round(zStart / FLOOR.rowH) % 2) * 0.9; x <= 3.3; x += 2.2) {
    if (x * x + zStart * zStart < 17) xs.push(x);
  }
  return xs;
}
const ROW_STARTS = Array.from({ length: 7 }, (_, k) => -3.6 + k * FLOOR.rowH);
const ROW_SEAMS = ROW_STARTS.map(rowSeams);

/** Row band for a point inside the annular ring: -1 is the top sketch-plate row. */
function bandOf(z: number) {
  if (z < ROW_STARTS[0]) return -1;
  return Math.min(6, Math.floor((z - ROW_STARTS[0]) / FLOOR.rowH));
}

/* --------------------------------------------------------------------------- random --- */

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Repeatable 0–1 value for integer coordinates. */
function hash(a: number, b: number, seed: number) {
  let n = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(seed, 1442695041)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
/** Smooth value noise, 0–1. */
function noise(seed: number) {
  return (x: number, y: number) => {
    const xi = Math.floor(x),
      yi = Math.floor(y),
      xf = x - xi,
      yf = y - yi,
      u = xf * xf * (3 - 2 * xf),
      v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, seed),
      b = hash(xi + 1, yi, seed),
      c = hash(xi, yi + 1, seed),
      d = hash(xi + 1, yi + 1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
const smooth = (a: number, b: number, t: number) => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/* ------------------------------------------------------------------------ demo data --- */

/** Corrosion areas: heavier around the outer plates, as is typical of a soil-side scan. */
const AREAS = [
  { x: -3.3, z: -0.5, r: 0.9, k: 0.75 },
  { x: 3.6, z: 0.4, r: 0.8, k: 0.8 },
  { x: 3.4, z: -1.6, r: 0.7, k: 0.65 },
  { x: -0.4, z: -3.8, r: 1.1, k: 0.7 },
  { x: 0.3, z: 3.8, r: 1.0, k: 0.75 },
  { x: 3.3, z: 2.4, r: 0.6, k: 0.7 },
  { x: -3.5, z: 1.9, r: 0.6, k: 0.5 },
  { x: -2.6, z: -2.9, r: 0.6, k: 0.6 },
];

function makeIndications(): ScanIndication[] {
  const r = rng(653);
  const out: Omit<ScanIndication, 'no'>[] = [];
  const add = (x: number, z: number, rx: number, rz: number, loss: number) => {
    if (Math.hypot(x, z) < FLOOR.shell - 0.2) out.push({ x, z, rx, rz, loss: Math.round(loss) });
  };
  // Deeper spots inside the corrosion areas.
  for (const a of AREAS) {
    const n = Math.round(2 + a.k * 4);
    for (let i = 0; i < n; i++) {
      const t = r() * Math.PI * 2,
        d = Math.sqrt(r()) * a.r * 0.7;
      add(a.x + Math.cos(t) * d, a.z + Math.sin(t) * d, 0.03 + r() * 0.05, 0.03 + r() * 0.05, 35 + r() * 40 * a.k);
    }
  }
  // A few deep isolated calls.
  add(-0.7, -2.4, 0.06, 0.05, 82);
  add(3.95, 0.9, 0.05, 0.05, 74);
  add(-3.75, -0.2, 0.05, 0.04, 66);
  // Annular plate calls just inside the shell.
  for (const a of [3.4, 3.48, 0.9]) {
    add(Math.sin(a) * (4.6 + r() * 0.15), Math.cos(a) * (4.6 + r() * 0.15), 0.05, 0.05, 45 + r() * 20);
  }
  return out
    .sort((a, b) => Math.round(a.z / 0.6) - Math.round(b.z / 0.6) || a.x - b.x)
    .map((d, i) => ({ ...d, no: i + 1 }));
}
export const scanIndications = makeIndications();

/* ---------------------------------------------------------------------- colour helpers --- */

const binRGB = scanBins.map((b) => {
  const v = parseInt(b.color.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
});
function binIndex(loss: number) {
  for (let i = scanBins.length - 1; i >= 0; i--) if (loss >= scanBins[i].from) return i;
  return -1;
}
/** Colour of the band a wall loss falls in. */
export function lossColor(loss: number) {
  const [r, g, b] = binRGB[Math.max(0, binIndex(loss))];
  return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
}

/* ------------------------------------------------------------------------ the image --- */

const R = FLOOR.shell;
const LANE = 0.19; // scanner track width (six tracks to a plate row)
const LANE_A = 0.12; // track width on the annular plates
const DEAD = 0.03; // unscanned strip either side of a weld
const SHELL_GAP = 0.05; // unscanned strip at the shell
const CELL = 4; // discontinuity speckle size, in pixels of the 2048 image

/**
 * Scan-track position of a floor point: which plate and track it is in, how far
 * along the track, and the track's start / end on that plate. Null where no
 * track can run (welds, the shell).
 */
function trackAt(x: number, z: number) {
  const r = Math.hypot(x, z);
  if (r > R - SHELL_GAP) return null;
  if (r >= FLOOR.inner) {
    if (r - FLOOR.inner < DEAD) return null;
    const step = (Math.PI * 2) / FLOOR.annN,
      a = Math.atan2(x, z) + Math.PI,
      plate = Math.floor(a / step),
      along = (a - plate * step) * r,
      len = step * r;
    if (along < DEAD || len - along < DEAD) return null;
    const off = r - FLOOR.inner - DEAD;
    return { plate: 100 + plate, lane: Math.floor(off / LANE_A), across: off % LANE_A, laneW: LANE_A, along, len };
  }
  if (FLOOR.inner - r < DEAD) return null;
  const b = bandOf(z),
    chord = Math.sqrt(FLOOR.inner ** 2 - z * z);
  let left = -chord,
    right = chord,
    z0 = -FLOOR.inner,
    col = 0;
  if (b >= 0) {
    z0 = ROW_STARTS[b];
    if (z - z0 < DEAD || (b < 6 && z0 + FLOOR.rowH - z < DEAD)) return null;
    for (const s of ROW_SEAMS[b]) {
      if (Math.abs(x - s) < DEAD) return null;
      if (s < x) {
        left = Math.max(left, s);
        col++;
      } else right = Math.min(right, s);
    }
  } else if (ROW_STARTS[0] - z < DEAD) return null;
  const off = z - z0 - DEAD;
  return {
    plate: (b + 1) * 10 + col,
    lane: Math.floor(off / LANE),
    across: off % LANE,
    laneW: LANE,
    along: x - left,
    len: right - left,
  };
}

let painted: HTMLCanvasElement | null = null;

/** The scan image, painted once per page load (it is the same every time). */
function paintScan(): HTMLCanvasElement {
  if (painted) return painted;
  const N = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = N;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(N, N);
  const px = img.data;
  const scanned = new Uint8Array(N * N);
  const s = N / (2 * R);
  const toW = (p: number) => (p + 0.5) / s - R;

  // 1. Scan tracks: light grey bands along each plate, ends ragged, an occasional missed patch.
  const holes = new Map<number, { a0: number; a1: number; l0: number; l1: number } | null>();
  const holeFor = (plate: number) => {
    if (!holes.has(plate)) {
      holes.set(
        plate,
        hash(plate, 1, 91) < 0.4
          ? {
              a0: 0.15 + hash(plate, 2, 91) * 0.5,
              a1: 0,
              l0: Math.floor(hash(plate, 3, 91) * 5),
              l1: 0,
            }
          : null,
      );
      const h = holes.get(plate);
      if (h) {
        h.a1 = h.a0 + 0.08 + hash(plate, 4, 91) * 0.15;
        h.l1 = h.l0 + (hash(plate, 5, 91) < 0.5 ? 0 : 1);
      }
    }
    return holes.get(plate) ?? null;
  };
  for (let j = 0; j < N; j++) {
    const z = toW(j);
    for (let i = 0; i < N; i++) {
      const x = toW(i),
        o = (j * N + i) * 4;
      if (x * x + z * z > R * R) continue; // transparent outside the shell
      let c = WHITE;
      const t = trackAt(x, z);
      if (t) {
        const start = 0.02 + hash(t.plate, t.lane, 7) ** 2 * 0.3,
          end = 0.02 + hash(t.plate, t.lane, 13) ** 2 * 0.3;
        const h = holeFor(t.plate);
        const missed =
          h && t.lane >= h.l0 && t.lane <= h.l1 && t.along / t.len > h.a0 && t.along / t.len < h.a1;
        if (t.along > start && t.len - t.along > end && !missed) {
          c = t.across < 0.007 || t.laneW - t.across < 0.004 ? TRACK_EDGE : TRACK;
          scanned[j * N + i] = 1;
        }
      }
      px[o] = c[0];
      px[o + 1] = c[1];
      px[o + 2] = c[2];
      px[o + 3] = 255;
    }
  }

  // 2. Discontinuities: square speckle, mostly 20–29 %, deeper toward the middle of each area.
  const n1 = noise(11),
    n2 = noise(29);
  for (let cj = 0; cj < N / CELL; cj++) {
    for (let ci = 0; ci < N / CELL; ci++) {
      const pi = ci * CELL + CELL / 2,
        pj = cj * CELL + CELL / 2;
      if (!scanned[pj * N + pi]) continue;
      const x = toW(pi),
        z = toW(pj),
        r = Math.hypot(x, z);
      // How corroded this part of the floor is, 0–1.
      const ring = smooth(2.5, 4.1, r) * (1 - 0.55 * smooth(4.45, 4.9, r));
      const side = 0.45 + 0.75 * n2(Math.atan2(x, z) * 1.6 + 5, 3.3);
      let D = 0.025 + ring * 0.5 * side;
      for (const a of AREAS) {
        const g = Math.hypot(x - a.x, z - a.z) / a.r;
        if (g < 1.6) D += a.k * Math.exp(-g * g * 1.6);
      }
      D = Math.min(1, D);
      const clump = n1(x * 13, z * 13) * 0.7 + n1(x * 41 + 9, z * 41) * 0.3;
      const p = D * D * smooth(0.25, 0.7, clump + D * 0.25) * 1.6;
      let loss = 0;
      if (hash(ci, cj, 3) < p) {
        // Each step up a band is less likely; deeper in the thick of an area.
        let k = 0;
        const q = Math.min(0.42, D * clump * 0.6);
        while (k < 6 && hash(ci * 7 + k, cj, 17) < q * (k ? 0.7 : 1)) k++;
        loss = scanBins[k].from + hash(ci, cj, 23) * 9;
      }
      for (const d of scanIndications) {
        const dx = (x - d.x) / (d.rx * 1.3),
          dz = (z - d.z) / (d.rz * 1.3);
        if (dx * dx + dz * dz > 4) continue;
        const g = Math.exp(-(dx * dx + dz * dz));
        if (hash(ci, cj, 31) < g * 0.75) {
          loss = Math.max(loss, LOWER_THRESHOLD + (d.loss - LOWER_THRESHOLD) * g ** 0.7 * (0.75 + hash(ci, cj, 37) * 0.25));
        }
      }
      if (loss < LOWER_THRESHOLD) continue;
      const c = binRGB[binIndex(loss)];
      for (let y = cj * CELL; y < cj * CELL + CELL; y++) {
        for (let xx = ci * CELL; xx < ci * CELL + CELL; xx++) {
          if (!scanned[y * N + xx]) continue;
          const o = (y * N + xx) * 4;
          px[o] = c[0];
          px[o + 1] = c[1];
          px[o + 2] = c[2];
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);

  const P = (v: number) => (v + R) * s;
  const half = (z: number) => Math.sqrt(Math.max(0, FLOOR.inner ** 2 - z * z));

  // 3. Plate outlines.
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (const z of ROW_STARTS) {
    ctx.moveTo(P(-half(z)), P(z));
    ctx.lineTo(P(half(z)), P(z));
  }
  ROW_STARTS.forEach((z0, b) => {
    for (const x of ROW_SEAMS[b]) {
      const z1 = Math.min(z0 + FLOOR.rowH, half(x));
      if (z1 > z0) {
        ctx.moveTo(P(x), P(z0));
        ctx.lineTo(P(x), P(z1));
      }
    }
  });
  ctx.moveTo(P(FLOOR.inner), P(0));
  ctx.arc(P(0), P(0), FLOOR.inner * s, 0, Math.PI * 2);
  ctx.moveTo(P(R) - 1, P(0));
  ctx.arc(P(0), P(0), R * s - 1, 0, Math.PI * 2);
  for (let k = 0; k < FLOOR.annN; k++) {
    const a = (k / FLOOR.annN) * Math.PI * 2;
    ctx.moveTo(P(Math.sin(a) * FLOOR.inner), P(Math.cos(a) * FLOOR.inner));
    ctx.lineTo(P(Math.sin(a) * R), P(Math.cos(a) * R));
  }
  ctx.stroke();

  // 4. Weld discontinuities (red) on a couple of seams.
  ctx.strokeStyle = WELD_DISCONTINUITY;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(P(ROW_SEAMS[1][1]), P(ROW_STARTS[1] + 0.25));
  ctx.lineTo(P(ROW_SEAMS[1][1]), P(ROW_STARTS[1] + 0.7));
  ctx.moveTo(P(-2.1), P(ROW_STARTS[5]));
  ctx.lineTo(P(-1.55), P(ROW_STARTS[5]));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(P(0), P(0), FLOOR.inner * s, 0.35, 0.52);
  ctx.stroke();

  // 5. Small markers where the seams meet, as on the plot.
  ctx.fillStyle = MARKER;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.2;
  const mark = (x: number, z: number) => {
    ctx.fillRect(P(x) - 6, P(z) - 6, 12, 12);
    ctx.strokeRect(P(x) - 6, P(z) - 6, 12, 12);
  };
  ROW_STARTS.forEach((z0, b) => {
    for (const x of ROW_SEAMS[b]) if (Math.abs(x) < half(z0) - 0.05) mark(x, z0);
  });
  for (let k = 0; k < FLOOR.annN; k++) {
    const a = (k / FLOOR.annN) * Math.PI * 2;
    mark(Math.sin(a) * FLOOR.inner, Math.cos(a) * FLOOR.inner);
  }
  painted = canvas;
  return canvas;
}

/* ------------------------------------------------------------------------ 3D objects --- */

export function buildFloorScan() {
  const group = new THREE.Group();
  group.name = 'floor-scan';
  group.visible = false;

  const texture = new THREE.CanvasTexture(paintScan());
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const scanMat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
  });
  const disc = new THREE.CircleGeometry(R, 160);
  disc.rotateX(-Math.PI / 2);
  const scan = new THREE.Mesh(disc, scanMat);
  scan.position.y = FLOOR.y;
  scan.renderOrder = 1;
  group.add(scan);

  // Pins on the deeper calls, coloured by their band.
  const pinMat = new THREE.MeshBasicMaterial({ color: 0x2a2f35, transparent: true, opacity: 0 });
  const stem = new THREE.CylinderGeometry(0.011, 0.011, 1, 6);
  stem.translate(0, 0.5, 0);
  const sphere = new THREE.SphereGeometry(0.065, 18, 12);
  const ringGeo = new THREE.RingGeometry(0.07, 0.095, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const pins = scanIndications
    .filter((d) => d.loss >= PIN_MIN)
    .map((d, i) => {
      const height = 0.25 + (d.loss / 100) * 0.7;
      const pin = new THREE.Group();
      pin.position.set(d.x, FLOOR.y + 0.002, d.z);
      const color = lossColor(d.loss);
      const headMat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.35,
        roughness: 0.35,
        metalness: 0.1,
        transparent: true,
        opacity: 0,
      });
      const ringMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        toneMapped: false,
        depthWrite: false,
      });
      const head = new THREE.Mesh(sphere, headMat);
      head.castShadow = true;
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.002;
      pin.add(new THREE.Mesh(stem, pinMat), head, ring);
      pin.userData = { height, headMat, ringMat, delay: (i * 0.618) % 1 };
      group.add(pin);
      return pin;
    });

  return {
    group,
    pinCount: pins.length,
    /** t = 0 hidden … 1 fully shown: scan fades in first, then the pins rise one after another. */
    setReveal(t: number) {
      group.visible = t > 0.001;
      scanMat.opacity = smooth(0, 0.45, t);
      let anyPin = 0;
      for (const pin of pins) {
        const { height, headMat, ringMat, delay } = pin.userData as {
          height: number;
          headMat: THREE.MeshStandardMaterial;
          ringMat: THREE.MeshBasicMaterial;
          delay: number;
        };
        const k = smooth(0.4 + delay * 0.45, 0.55 + delay * 0.45, t);
        pin.visible = k > 0.001;
        const [stemMesh, headMesh] = pin.children;
        stemMesh.scale.y = Math.max(0.001, height * k);
        headMesh.position.y = height * k;
        headMesh.scale.setScalar(0.4 + 0.6 * k);
        headMat.opacity = k;
        ringMat.opacity = k * 0.95;
        anyPin = Math.max(anyPin, k);
      }
      pinMat.opacity = anyPin * 0.85;
    },
    dispose() {
      texture.dispose();
    },
  };
}
