import * as THREE from 'three';

/**
 * Floor "C-scan" shown when the floor section is opened: every bottom and annular
 * plate is painted the way an MFL floor scanner's C-scan plot looks (scan lanes
 * along the plate, a blue baseline, colour-graded indications, unscanned weld and
 * critical-zone strips), and the deeper indications get 3D pins.
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
  /** Height of the C-scan image above the plate surface (just over the seam lines). */
  y: 0.0915,
};

/** Wall-loss colour scale, low to high. Also used for the on-screen legend. */
export const scanScale: [number, string][] = [
  [0, '#0b1f5c'],
  [0.12, '#123c94'],
  [0.26, '#1592d2'],
  [0.4, '#22c08a'],
  [0.56, '#e9e330'],
  [0.74, '#f39a1d'],
  [1, '#d7191c'],
];
/** Wall loss (%) at the top of the scale. */
export const SCALE_MAX = 80;
const UNSCANNED = [138, 149, 158];
const SEAM = 'rgba(6, 12, 24, 0.85)';

export type ScanIndication = {
  no: number;
  x: number;
  z: number;
  rx: number;
  rz: number;
  /** Wall loss, % of nominal thickness. */
  loss: number;
  side: 'top' | 'under';
};
export type ScanPatch = { x: number; z: number; w: number; d: number };

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

/* ------------------------------------------------------------------------ demo data --- */

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const scanPatches: ScanPatch[] = [
  { x: 0.55, z: 0.95, w: 0.55, d: 0.5 },
  { x: -2.75, z: -0.85, w: 0.45, d: 0.62 },
];
const underPatch = (x: number, z: number) =>
  scanPatches.some((p) => Math.abs(x - p.x) < p.w / 2 + 0.08 && Math.abs(z - p.z) < p.d / 2 + 0.08);

function makeIndications(): ScanIndication[] {
  const r = rng(653);
  const out: Omit<ScanIndication, 'no'>[] = [];
  const add = (x: number, z: number, rx: number, rz: number, loss: number, side: 'top' | 'under') => {
    if (Math.hypot(x, z) < FLOOR.shell - 0.2 && !underPatch(x, z))
      out.push({ x, z, rx, rz, loss: Math.round(loss), side });
  };
  // Soil-side general corrosion with deeper spots inside it.
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2,
      d = r() * 0.42;
    add(-1.6 + Math.cos(a) * d, 2.1 + Math.sin(a) * d, 0.05 + r() * 0.05, 0.05 + r() * 0.05, 30 + r() * 38, 'under');
  }
  // Product-side pitting cluster.
  for (let i = 0; i < 8; i++) {
    add(1.9 + (r() - 0.5) * 0.7, -1.3 + (r() - 0.5) * 0.5, 0.03 + r() * 0.025, 0.03 + r() * 0.025, 25 + r() * 40, 'top');
  }
  // Soil-side line along a scan lane.
  add(2.55, 2.85, 0.42, 0.055, 52, 'under');
  // Annular plate corrosion just inside the shell (critical zone).
  for (const a of [3.4, 3.48, 3.57]) {
    add(Math.sin(a) * (4.62 + r() * 0.1), Math.cos(a) * (4.62 + r() * 0.1), 0.07, 0.06, 55 + r() * 25, 'under');
  }
  // The deepest call on the floor.
  add(-0.7, -2.4, 0.09, 0.08, 78, 'under');
  // Isolated calls scattered over the floor.
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2,
      d = Math.sqrt(r()) * 4.7;
    add(Math.sin(a) * d, Math.cos(a) * d, 0.03 + r() * 0.04, 0.03 + r() * 0.04, 20 + r() * 26, r() < 0.55 ? 'under' : 'top');
  }
  // Number them across the floor, row by row, the way a scan report lists them.
  return out
    .sort((a, b) => Math.round(a.z / 0.6) - Math.round(b.z / 0.6) || a.x - b.x)
    .map((d, i) => ({ ...d, no: i + 1 }));
}
export const scanIndications = makeIndications();

/* ---------------------------------------------------------------------- colour helpers --- */

// Parsed straight from the hex (sRGB, 0–255) so the canvas gets the exact scale colours.
const stops = scanScale.map(([t, hex]) => {
  const v = parseInt(hex.slice(1), 16);
  return [t, (v >> 16) & 255, (v >> 8) & 255, v & 255] as const;
});
/** Colour for a 0–1 value on the scale, as 0–255 RGB. */
export function scanRGB(v: number): [number, number, number] {
  const t = Math.min(1, Math.max(0, v));
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const a = stops[i - 1],
        b = stops[i],
        k = (t - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
    }
  }
  const l = stops[stops.length - 1];
  return [l[1], l[2], l[3]];
}
/** Colour for a wall-loss percentage. */
export function lossColor(loss: number) {
  const [r, g, b] = scanRGB(loss / SCALE_MAX);
  return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
}
/** CSS gradient of the scale, for the legend. */
export const scanGradient = `linear-gradient(90deg, ${scanScale.map(([t, c]) => `${c} ${t * 100}%`).join(', ')})`;

/** Smooth value noise, 0–1. */
function noise(seed: number) {
  const h = (x: number, y: number) => {
    let n = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  return (x: number, y: number) => {
    const xi = Math.floor(x),
      yi = Math.floor(y),
      xf = x - xi,
      yf = y - yi,
      u = xf * xf * (3 - 2 * xf),
      v = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi),
      b = h(xi + 1, yi),
      c = h(xi, yi + 1),
      d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/* ------------------------------------------------------------------------ the image --- */

const R = FLOOR.shell;
const LANE = 0.2; // scanner head width in model units (six lanes to a plate row)
const DEAD = 0.035; // unscanned strip either side of a weld
const CRITICAL = 0.14; // unscanned ring just inside the shell

function paintScan(size: number) {
  const N = 1024;
  const field = document.createElement('canvas');
  field.width = field.height = N;
  const fctx = field.getContext('2d')!;
  const img = fctx.createImageData(N, N);
  const px = img.data;
  const n1 = noise(11),
    n2 = noise(29),
    n3 = noise(47);
  const lane = rng(7);
  const laneOffset = Array.from({ length: 400 }, () => (lane() - 0.5) * 0.045);
  const toW = (p: number) => ((p + 0.5) / N) * 2 * R - R;
  for (let j = 0; j < N; j++) {
    const z = toW(j);
    for (let i = 0; i < N; i++) {
      const x = toW(i),
        r = Math.hypot(x, z),
        o = (j * N + i) * 4;
      if (r > R) {
        px[o + 3] = 0;
        continue;
      }
      let unscanned = r > R - CRITICAL;
      let laneId = 0;
      if (!unscanned && r >= FLOOR.inner) {
        // Annular plate: radial butt welds and the lap onto the bottom plates.
        const a = Math.atan2(x, z),
          step = (Math.PI * 2) / FLOOR.annN,
          m = ((a % step) + step) % step;
        if (Math.min(m, step - m) * r < DEAD || r - FLOOR.inner < DEAD) unscanned = true;
        laneId = 300 + Math.floor((r - FLOOR.inner) / 0.17) + Math.floor((a + Math.PI) / step) * 5;
      } else if (!unscanned) {
        if (FLOOR.inner - r < DEAD) unscanned = true;
        const b = bandOf(z);
        if (b >= 0) {
          const z0 = ROW_STARTS[b];
          if (z - z0 < DEAD || (b < 6 && z0 + FLOOR.rowH - z < DEAD)) unscanned = true;
          const seams = ROW_SEAMS[b];
          let col = 0;
          for (const s of seams) {
            if (Math.abs(x - s) < DEAD) unscanned = true;
            if (x > s) col++;
          }
          laneId = (b + 1) * 30 + col * 6 + Math.floor((z - z0) / LANE);
        } else {
          if (ROW_STARTS[0] - z < DEAD) unscanned = true;
          laneId = Math.floor((z + R) / LANE);
        }
      }
      if (!unscanned && underPatch(x, z) && scanPatches.some((p) => Math.abs(x - p.x) < p.w / 2 && Math.abs(z - p.z) < p.d / 2))
        unscanned = true;
      if (unscanned) {
        const hatch = (i + j) % 9 < 2 ? 0.78 : 1;
        px[o] = UNSCANNED[0] * hatch;
        px[o + 1] = UNSCANNED[1] * hatch;
        px[o + 2] = UNSCANNED[2] * hatch;
        px[o + 3] = 255;
        continue;
      }
      // Baseline: per-lane gain difference, fine speckle along the lane, slow mottling.
      let v =
        0.075 +
        laneOffset[laneId % laneOffset.length] +
        (n1(x * 26, z * 70) - 0.5) * 0.07 +
        (n2(x * 4, z * 4) - 0.5) * 0.05;
      // Broad soil-side corrosion under the cluster at (-1.6, 2.1).
      const g = Math.hypot(x + 1.6, z - 2.1);
      if (g < 0.75) v += (1 - g / 0.75) ** 1.4 * (0.18 + n3(x * 9, z * 9) * 0.22);
      for (const d of scanIndications) {
        const dx = (x - d.x) / d.rx,
          dz = (z - d.z) / d.rz;
        if (dx > 3 || dx < -3 || dz > 3 || dz < -3) continue;
        const e = Math.exp(-(dx * dx + dz * dz) * 0.9);
        v = Math.max(v, (d.loss / SCALE_MAX) * e + v * (1 - e) * 0.6);
      }
      const [cr, cg, cb] = scanRGB(v);
      px[o] = cr;
      px[o + 1] = cg;
      px[o + 2] = cb;
      px[o + 3] = 255;
    }
  }
  fctx.putImageData(img, 0, 0);

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(field, 0, 0, size, size);
  const s = size / (2 * R);
  const P = (v: number) => (v + R) * s;

  // Weld lines through the middle of each unscanned strip.
  ctx.strokeStyle = SEAM;
  ctx.lineWidth = Math.max(1.5, size / 900);
  ctx.beginPath();
  const half = (z: number) => Math.sqrt(Math.max(0, FLOOR.inner ** 2 - z * z));
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
  for (let k = 0; k < FLOOR.annN; k++) {
    const a = (k / FLOOR.annN) * Math.PI * 2;
    ctx.moveTo(P(Math.sin(a) * FLOOR.inner), P(Math.cos(a) * FLOOR.inner));
    ctx.lineTo(P(Math.sin(a) * R), P(Math.cos(a) * R));
  }
  ctx.stroke();

  // Plate numbers: rows lettered from the top, plates numbered left to right.
  ctx.font = `600 ${Math.round(size / 95)}px ui-monospace, Menlo, monospace`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.textBaseline = 'top';
  const bands = [
    { z0: -FLOOR.inner, z1: ROW_STARTS[0], seams: [] as number[] },
    ...ROW_STARTS.map((z0, b) => ({ z0, z1: Math.min(z0 + FLOOR.rowH, FLOOR.inner), seams: ROW_SEAMS[b] })),
  ];
  bands.forEach((band, b) => {
    const zl = band.z0 + 0.07,
      zm = (band.z0 + band.z1) / 2;
    const w = Math.min(half(band.z0), half(band.z1)) || half(zm) * 0.6;
    const edges = [-half(zm), ...band.seams.filter((x) => Math.abs(x) < half(zm)), half(zm)];
    for (let c = 0; c < edges.length - 1; c++) {
      let x = edges[c] + 0.07;
      if (Math.abs(x) > w) x = Math.sign(x) * w + (x < 0 ? 0.07 : -0.4);
      if (edges[c + 1] - x < 0.35) continue;
      const zl2 = b === 0 ? zm - 0.06 : zl;
      ctx.fillText(`${String.fromCharCode(65 + b)}${c + 1}`, P(x), P(zl2));
    }
  });

  // Repair patches: outlined and labelled (not scanned through).
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = Math.max(2, size / 700);
  ctx.font = `700 ${Math.round(size / 110)}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(20, 30, 40, 0.9)';
  for (const p of scanPatches) {
    ctx.strokeRect(P(p.x - p.w / 2), P(p.z - p.d / 2), p.w * s, p.d * s);
    ctx.fillText('PATCH', P(p.x), P(p.z));
  }

  // Call-outs on the indications a technician would prove up (30 % and over).
  ctx.font = `700 ${Math.round(size / 120)}px ui-monospace, Menlo, monospace`;
  ctx.lineWidth = Math.max(1.5, size / 1000);
  // Deepest first, and skip any whose label would land on one already drawn (pitting clusters).
  const placed: [number, number][] = [];
  const clear = size / 40;
  for (const d of [...scanIndications].sort((a, b) => b.loss - a.loss)) {
    if (d.loss < 35) continue;
    const ex = (d.rx + 0.045) * s,
      ez = (d.rz + 0.045) * s,
      lx = P(d.x) + ex * 0.72,
      ly = P(d.z) - ez - size / 260;
    if (placed.some(([x, y]) => Math.abs(x - lx) < clear * 1.4 && Math.abs(y - ly) < clear * 0.7)) continue;
    placed.push([lx, ly]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.ellipse(P(d.x), P(d.z), ex, ez, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(String(d.no).padStart(3, '0'), lx, ly + size / 260);
  }
  return canvas;
}

/* ------------------------------------------------------------------------ 3D objects --- */

export function buildFloorScan() {
  const group = new THREE.Group();
  group.name = 'floor-scan';
  group.visible = false;

  const texture = new THREE.CanvasTexture(paintScan(2048));
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

  // Repair patches: thin lap-welded plates sitting on the floor.
  const patchMat = new THREE.MeshStandardMaterial({
    color: 0xb9c4ca,
    metalness: 0.6,
    roughness: 0.42,
    transparent: true,
    opacity: 0,
  });
  const patches = scanPatches.map((p) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(p.w, 0.018, p.d), patchMat);
    m.position.set(p.x, FLOOR.y + 0.01, p.z);
    m.castShadow = true;
    group.add(m);
    return m;
  });

  // Pins on the deeper calls: sphere head = product (top) side, diamond = soil (under) side.
  const pinMat = new THREE.MeshBasicMaterial({ color: 0xf4f7f9, transparent: true, opacity: 0 });
  const stem = new THREE.CylinderGeometry(0.011, 0.011, 1, 6);
  stem.translate(0, 0.5, 0);
  const sphere = new THREE.SphereGeometry(0.065, 18, 12);
  const diamond = new THREE.OctahedronGeometry(0.08);
  const ringGeo = new THREE.RingGeometry(0.07, 0.095, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const pins = scanIndications
    .filter((d) => d.loss >= 40)
    .map((d, i) => {
      const height = 0.25 + (d.loss / SCALE_MAX) * 0.6;
      const pin = new THREE.Group();
      pin.position.set(d.x, FLOOR.y + 0.002, d.z);
      const color = lossColor(d.loss);
      const headMat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.45,
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
      const s = new THREE.Mesh(stem, pinMat);
      const head = new THREE.Mesh(d.side === 'top' ? sphere : diamond, headMat);
      head.position.y = height;
      head.castShadow = true;
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.002;
      pin.add(s, head, ring);
      pin.userData = { height, headMat, ringMat, delay: (i * 0.618) % 1 };
      group.add(pin);
      return pin;
    });

  const smooth = (a: number, b: number, t: number) => {
    const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
    return k * k * (3 - 2 * k);
  };

  return {
    group,
    pinCount: pins.length,
    /** t = 0 hidden … 1 fully shown: scan fades in first, then the pins rise one after another. */
    setReveal(t: number) {
      group.visible = t > 0.001;
      const scanIn = smooth(0, 0.45, t);
      scanMat.opacity = scanIn;
      patchMat.opacity = scanIn;
      for (const p of patches) p.visible = scanIn > 0.01;
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
