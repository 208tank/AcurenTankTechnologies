import * as THREE from 'three';

/**
 * Edge settlement (API 653 Annex B, B.2.3 / B.3.4) for the floor view.
 *
 * The allowable curves and the evaluation are the same as the Tank Floor Inspector app
 * (tables.js / settle.js): Fig. B.11 (Bew, bottom lap welds approximately parallel to the
 * shell) and Fig. B.12 (Be, approximately perpendicular, or no lap welds) tabulated by tank
 * diameter; lap welds at an angle α use B = Be − (Be − Bew)·sin α (B.3.4.4); 75 % of the
 * allowable triggers NDE (B.3.4.1–2).
 *
 * The radial survey readings are illustrative and fixed. R and B are found from them the
 * way the inspector app does: a straight line is fitted through the outer readings (the
 * unsettled bottom, allowing for cone slope) and the breakover is the last reading, walking
 * in toward the shell, that sits within 1/8 in of that line.
 */

/* ------------------------------------------ Fig. B.11 / B.12 as tabulated (inches vs ft) --- */
// Rows: [R (ft), allowable for each tank diameter in EDGE_D (ft)], values in inches.
export const EDGE_D = [20, 30, 40, 50, 60, 80, 100, 120, 160];
const EDGE_BEW = [
  [0, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  [1.5, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  [1.7, 2, 2, 2, 2, 2, 2.151, 2.39291, 2.39291, 2.39291],
  [1.75, 2, 2, 2, 2, 2, 2.19, 2.4911, 2.491125, 2.491125],
  [1.91, 2, 2, 2, 2, 2, 2.313, 2.626, 2.805413, 2.805413],
  [1.98, 2, 2, 2, 2, 2.075, 2.366, 2.684, 2.942914, 2.942914],
  [2, 2, 2, 2, 2, 2.093, 2.38, 2.7, 2.953, 2.9822],
  [2.25, 2, 2, 2, 2, 2.25, 2.563, 2.915, 3.131, 3.473275],
  [2.29, 2, 2, 2, 2.024, 2.272, 2.591, 2.95, 3.164, 3.551847],
  [2.52, 2, 2, 2, 2.162, 2.4, 2.759, 3.126, 3.363, 4],
  [2.65, 2, 2, 2, 2.239, 2.473, 2.853, 3.223, 3.476, 4.1096],
  [3, 2, 2, 2.2, 2.45, 2.67, 3.1, 3.48, 3.78, 4.4043],
  [3.38, 2, 2, 2.366, 2.64, 2.872, 3.347, 3.756, 4.089, 4.72426],
  [3.46, 2, 2.031, 2.403, 2.68, 2.915, 3.399, 3.813, 4.15, 4.79162],
  [4, 2, 2.24, 2.64, 2.95, 3.19, 3.75, 4.2, 4.55, 5.2463],
  [4.5, 2, 2.425, 2.846, 3.178, 3.45, 4.058, 4.525, 4.925, 5.6673],
  [5, 2.15, 2.61, 3.05, 3.4, 3.71, 4.35, 4.85, 5.28, 6.0883],
  [5.53, 2.309, 2.817, 3.262, 3.639, 3.995, 4.641, 5.168, 5.662, 6.53456],
  [6, 2.45, 3, 3.45, 3.85, 4.23, 4.9, 5.45, 6, 6.9303],
];
const EDGE_BE = [
  [0, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  [1.5, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  [1.7, 2, 2, 2, 2, 2.18, 2.39291, 2.39291, 2.39291, 2.39291],
  [1.75, 2, 2, 2, 2.046, 2.225, 2.491125, 2.491125, 2.491125, 2.491125],
  [1.91, 2, 2, 2, 2.192, 2.369, 2.805413, 2.805413, 2.805413, 2.805413],
  [1.98, 2, 2, 2.075, 2.256, 2.432, 2.942914, 2.942914, 2.942914, 2.942914],
  [2, 2, 2, 2.093, 2.275, 2.45, 2.953, 2.9822, 2.9822, 2.9822],
  [2.25, 2, 2, 2.25, 2.454, 2.647, 3.131, 3.473275, 3.473275, 3.473275],
  [2.29, 2, 2, 2.272, 2.482, 2.678, 3.164, 3.551847, 3.551847, 3.551847],
  [2.52, 2, 2, 2.4, 2.647, 2.858, 3.363, 3.758, 4.003636, 4.003636],
  [2.65, 2, 2.074, 2.473, 2.739, 2.961, 3.476, 3.875, 4.258995, 4.258995],
  [3, 2, 2.275, 2.67, 2.99, 3.24, 3.78, 4.2, 4.63, 4.9465],
  [3.38, 2, 2.448, 2.872, 3.205, 3.498, 4.089, 4.533, 4.991, 5.692934],
  [3.46, 2.031, 2.485, 2.915, 3.254, 3.553, 4.15, 4.604, 5.066, 5.85],
  [4, 2.24, 2.73, 3.19, 3.59, 3.92, 4.55, 5.07, 5.58, 6.4107],
  [4.5, 2.425, 2.966, 3.45, 3.875, 4.237, 4.925, 5.48, 6.044, 6.93],
  [5, 2.61, 3.19, 3.71, 4.17, 4.55, 5.28, 5.89, 6.48, 7.4493],
  [5.53, 2.817, 3.423, 3.995, 4.445, 4.876, 5.662, 6.312, 6.906, 8],
  [6, 3, 3.63, 4.23, 4.69, 5.13, 6, 6.67, 7.27, 8],
];
/** Largest settled width R (ft) the curves cover. */
export const R_MAX_FT = 6;

function interpCurve(tbl: number[][], R: number, ci: number) {
  if (R <= 1.5) return 2; // 2 in. allowed up to R = 1.5 ft
  if (R > R_MAX_FT + 1e-9) return null; // beyond the tabulated curves
  for (let i = 0; i < tbl.length - 1; i++) {
    const r0 = tbl[i][0],
      r1 = tbl[i + 1][0];
    if (R >= r0 - 1e-9 && R <= r1 + 1e-9)
      return r1 - r0 < 1e-9 ? tbl[i][ci] : tbl[i][ci] + ((R - r0) / (r1 - r0)) * (tbl[i + 1][ci] - tbl[i][ci]);
  }
  return tbl[tbl.length - 1][ci];
}
/** Bew and Be (in) for tank diameter D (ft) and settled width R (ft); linear in R and in D. */
export function edgeAllow(Dft: number, Rft: number) {
  const at = (tbl: number[][]) => {
    if (Dft <= EDGE_D[0]) return interpCurve(tbl, Rft, 1);
    if (Dft >= EDGE_D[EDGE_D.length - 1]) return interpCurve(tbl, Rft, EDGE_D.length);
    for (let j = 0; j < EDGE_D.length - 1; j++) {
      if (Dft >= EDGE_D[j] && Dft <= EDGE_D[j + 1]) {
        const lo = interpCurve(tbl, Rft, j + 1),
          hi = interpCurve(tbl, Rft, j + 2);
        if (lo === null || hi === null) return null;
        return lo + ((Dft - EDGE_D[j]) / (EDGE_D[j + 1] - EDGE_D[j])) * (hi - lo);
      }
    }
    return null;
  };
  return { Bew: at(EDGE_BEW), Be: at(EDGE_BE) };
}

/* ---------------------------------------------------------------------- evaluation --- */

export type Weld = { kind: 'par' } | { kind: 'perp' } | { kind: 'angle'; alpha: number };
export type EdgeStatus = 'No edge settlement' | 'Acceptable' | 'NDE required' | 'Exceeds';

/** Allowable B for the lap weld orientation (B.3.4). */
export function allowFor(Bew: number, Be: number, weld: Weld) {
  if (weld.kind === 'par') return { allow: Bew, basis: 'Bew, Fig. B.11 (lap welds parallel to shell)' };
  if (weld.kind === 'perp') return { allow: Be, basis: 'Be, Fig. B.12 (lap welds perpendicular to shell)' };
  const a = weld.alpha;
  if (a >= 70) return { allow: Bew, basis: `Bew, Fig. B.11 (lap weld within 20° of parallel, α ${a}°)` };
  if (a <= 20) return { allow: Be, basis: `Be, Fig. B.12 (lap weld within 20° of perpendicular, α ${a}°)` };
  return {
    allow: Be - (Be - Bew) * Math.sin((a * Math.PI) / 180),
    basis: `Be − (Be − Bew)·sin ${a}° (B.3.4.4, lap weld at α ${a}°)`,
  };
}

export const statusColor: Record<EdgeStatus, string> = {
  'No edge settlement': '#9db4a4',
  Acceptable: '#2f9e5b',
  'NDE required': '#e9a21a',
  Exceeds: '#d7261e',
};
export const statusNote: Record<EdgeStatus, string> = {
  'No edge settlement': 'No breakover found: the bottom follows its plane right to the shell.',
  Acceptable: 'Within allowable.',
  'NDE required':
    'Over 75% of allowable: examine the shell-to-bottom weld and bottom welds in the settled area visually and by MT or PT, and welds within 12 in of the breakover visually (B.3.4.1–2).',
  Exceeds: 'Over allowable: repair (re-level or replace the bottom) or a rigorous engineering evaluation (B.3.4, B.4).',
};

/* ------------------------------------------------------------------- survey stations --- */

/** Tank diameter used for the curves: the model tank is 80 ft. */
export const TANK_D_FT = 80;
/** Radial reading offsets from the shell, inches. */
export const OFFSETS_IN = [0, 6, 12, 18, 24, 36, 48, 60, 72, 84, 96, 108, 120];
const TOL_IN = 0.125;

/** Settled areas: [station, drop at the shell B0 (in), settled width (in), weld]. */
const SETTLED: [number, number, number, Weld][] = [
  [3, 1.2, 30, { kind: 'par' }],
  [6, 2.9, 42, { kind: 'angle', alpha: 40 }],
  [7, 3.6, 36, { kind: 'par' }],
  [8, 0.9, 24, { kind: 'par' }],
];

export type Station = {
  no: number;
  deg: number;
  weld: Weld;
  /** Readings: offset from the shell (in) and bottom elevation (in, relative). */
  pts: { x: number; z: number }[];
  /** Fitted unsettled bottom plane: z = q + m·x. */
  line: { m: number; q: number };
  /** Breakover distance from the shell (in), or null for no edge settlement. */
  R: number | null;
  /** Settlement below the projected plane (in) and where it is largest. */
  B: number;
  xB: number;
  Bew: number | null;
  Be: number | null;
  allow: number | null;
  basis: string;
  pct: number | null;
  status: EdgeStatus;
};

function lineFit(pts: { x: number; z: number }[]) {
  const n = pts.length;
  let sx = 0,
    sz = 0,
    sxx = 0,
    sxz = 0;
  for (const p of pts) {
    sx += p.x;
    sz += p.z;
    sxx += p.x * p.x;
    sxz += p.x * p.z;
  }
  const d = n * sxx - sx * sx;
  const m = (n * sxz - sx * sz) / d;
  return { m, q: (sz - m * sx) / n };
}

function makeStation(no: number): Station {
  const deg = (no - 1) * 45;
  const set = SETTLED.find((s) => s[0] === no);
  const weld: Weld = set?.[3] ?? { kind: 'par' };
  // Bottom elevation: planar tilt around the tank, a 1 in / 10 ft cone-up slope, a little
  // survey noise, and the settled dish at the shell.
  const base = 24 + 1.05 * Math.cos(((deg - 30) * Math.PI) / 180);
  const pts = OFFSETS_IN.map((x, k) => {
    const [B0, Rb] = set ? [set[1], set[2]] : [0, 1];
    const drop = x < Rb ? B0 * (1 - x / Rb) ** 2 : 0;
    const noise = (((no * 7 + k * 3) % 5) - 2) * 0.01;
    return { x, z: Math.round((base + x / 120 - drop + noise) * 100) / 100 };
  });
  // Walk inward from the outermost readings to find the breakover.
  const desc = pts.slice().sort((a, b) => b.x - a.x);
  let inc = desc.slice(0, 2),
    line = lineFit(inc),
    R: number | null = null;
  for (let k = 2; k < desc.length; k++) {
    const p = desc[k];
    if (line.q + line.m * p.x - p.z > TOL_IN + 1e-9) {
      R = inc[inc.length - 1].x;
      break;
    }
    inc = [...inc, p];
    line = lineFit(inc);
  }
  let B = 0,
    xB = 0;
  for (const p of pts) {
    if (R !== null && p.x >= R - 1e-6) continue;
    const d = line.q + line.m * p.x - p.z;
    if (d > B) {
      B = d;
      xB = p.x;
    }
  }
  const out: Station = { no, deg, weld, pts, line, R, B, xB, Bew: null, Be: null, allow: null, basis: '', pct: null, status: 'No edge settlement' };
  if (R === null || !(R > 0)) {
    out.B = 0;
    return out;
  }
  const { Bew, Be } = edgeAllow(TANK_D_FT, R / 12);
  out.Bew = Bew;
  out.Be = Be;
  if (Bew === null || Be === null) return out;
  const a = allowFor(Bew, Be, weld);
  out.allow = a.allow;
  out.basis = a.basis;
  out.pct = (B / a.allow) * 100;
  out.status = B > a.allow + 1e-9 ? 'Exceeds' : out.pct >= 75 - 1e-9 ? 'NDE required' : 'Acceptable';
  return out;
}
/** The 8 settlement stations (45° apart, station 1 at 0°). */
export const edgeStations: Station[] = Array.from({ length: 8 }, (_, i) => makeStation(i + 1));

/* --------------------------------------------------------------------- floor overlay --- */

const SHELL = 5; // model shell radius
const UNITS_PER_FT = 1 / 8;
const OVERLAY_Y = 0.094;

const hex = (c: string) => {
  const v = parseInt(c.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

/** The ring texture: the 6 ft edge zone, with each settled area at its width R, coloured by status. */
function paintOverlay(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const px = img.data;
  const zone = R_MAX_FT * UNITS_PER_FT;
  const quiet = hex(statusColor['No edge settlement']);
  const settled = edgeStations.filter((s) => s.R !== null);
  for (let j = 0; j < size; j++) {
    const z = ((j + 0.5) / size) * 2 * SHELL - SHELL;
    for (let i = 0; i < size; i++) {
      const x = ((i + 0.5) / size) * 2 * SHELL - SHELL;
      const r = Math.hypot(x, z),
        fromShell = SHELL - r;
      if (fromShell < 0 || fromShell > zone) continue;
      const o = (j * size + i) * 4;
      const deg = ((Math.atan2(x, z) * 180) / Math.PI + 360) % 360;
      // Each settled area spans about ±16° around its station, tapering in width.
      let best: { st: Station; w: number } | null = null;
      for (const st of settled) {
        const d = Math.abs(((deg - st.deg + 540) % 360) - 180);
        const w = Math.max(0, 1 - (d / 16) ** 2);
        if (w > 0 && (!best || w > best.w)) best = { st, w };
      }
      const width = best ? (best.st.R! / 12) * UNITS_PER_FT * Math.sqrt(best.w) : 0;
      const edgeFade = Math.min(1, (zone - fromShell) / 0.05);
      if (best && fromShell <= width) {
        const [r, g, b] = hex(statusColor[best.st.status]);
        const soft = Math.min(1, (width - fromShell) / 0.04);
        px[o] = r;
        px[o + 1] = g;
        px[o + 2] = b;
        px[o + 3] = 255 * (0.55 + 0.4 * soft);
      } else {
        px[o] = quiet[0];
        px[o + 1] = quiet[1];
        px[o + 2] = quiet[2];
        px[o + 3] = 90 * edgeFade;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  // Station ticks across the zone.
  ctx.strokeStyle = 'rgba(0, 43, 92, 0.85)';
  ctx.lineWidth = size / 400;
  const s = size / (2 * SHELL);
  for (const st of edgeStations) {
    const a = (st.deg * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo((Math.sin(a) * (SHELL - zone) + SHELL) * s, (Math.cos(a) * (SHELL - zone) + SHELL) * s);
    ctx.lineTo((Math.sin(a) * SHELL + SHELL) * s, (Math.cos(a) * SHELL + SHELL) * s);
    ctx.stroke();
  }
  return c;
}
let painted: HTMLCanvasElement | null = null;

/** Where each station's tag sits over the floor (model units). */
export function stationAnchor(st: Station) {
  const a = (st.deg * Math.PI) / 180,
    r = SHELL - R_MAX_FT * UNITS_PER_FT - 0.18;
  return new THREE.Vector3(Math.sin(a) * r, 0.12, Math.cos(a) * r);
}
/** Camera framing for a station's close-up: look across the settled edge from just outside. */
export function stationView(st: Station) {
  const a = (st.deg * Math.PI) / 180;
  const target = new THREE.Vector3(Math.sin(a) * 4.6, 0.1, Math.cos(a) * 4.6);
  const out = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
  const side = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
  const position = target.clone().add(out.multiplyScalar(5.5)).add(side.multiplyScalar(4)).add(new THREE.Vector3(0, 7.2, 0));
  return { target, position };
}

export function buildEdgeOverlay() {
  const group = new THREE.Group();
  group.name = 'edge-settlement';
  group.visible = false;
  if (!painted) painted = paintOverlay(1024);
  const texture = new THREE.CanvasTexture(painted);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
  });
  const geo = new THREE.CircleGeometry(SHELL, 192);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = OVERLAY_Y;
  mesh.renderOrder = 2;
  group.add(mesh);
  return {
    group,
    setLevel(t: number) {
      group.visible = t > 0.002;
      mat.opacity = t;
    },
    dispose() {
      texture.dispose();
    },
  };
}
