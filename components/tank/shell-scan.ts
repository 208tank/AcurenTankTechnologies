import * as THREE from 'three';

/**
 * Shell inspection views, shown when the shell section is opened:
 *
 *  - ut:    conventional UT readings, a strip at each settlement station with a reading
 *           every foot up the shell, coloured against nominal and t-min
 *  - aut:   an automated UT C-scan band at each station (remaining wall, % of nominal)
 *  - laser: a 3D laser scan of the shell, its surface shaped and coloured by radial
 *           deviation: peaking at the vertical welds, banding at the girth welds and one
 *           large bulge
 *
 * The UT readings and the C-scan sample the same thickness field, so they agree.
 * All data is illustrative and generated from fixed seeds.
 */

export type ShellMode = 'ut' | 'aut' | 'laser';
export const shellModes: { id: ShellMode; name: string }[] = [
  { id: 'ut', name: 'UT readings' },
  { id: 'aut', name: 'AUT C-scan' },
  { id: 'laser', name: '3D laser scan' },
];

/* -------------------------------------------------------------------- tank geometry --- */
// Model shell: radius 5, six 1-unit courses from y = 0.1 to 6.1. One course is 8 ft,
// so one model unit is 8 ft (an 80 ft diameter, 48 ft tall tank).
const R = 5;
const Y0 = 0.1;
const COURSES = 6;
const FT_PER_UNIT = 8;
const HEIGHT_FT = COURSES * FT_PER_UNIT;
const CIRC_FT = Math.PI * 2 * R * FT_PER_UNIT;
/** Course nominal and minimum thickness, in inches, bottom course first. */
export const NOM_IN = [0.5, 0.4375, 0.375, 0.3125, 0.25, 0.25];
export const TMIN_IN = [0.41, 0.34, 0.27, 0.2, 0.13, 0.1];
/** Settlement stations: 8 for an 80 ft tank (at most 32 ft apart, API 653 Annex B). */
export const STATIONS = Array.from({ length: 8 }, (_, i) => ({ no: i + 1, deg: i * 45 }));

const rad = (deg: number) => (deg * Math.PI) / 180;
const yOf = (ft: number) => Y0 + ft / FT_PER_UNIT;

/* --------------------------------------------------------------------------- random --- */

function hash(a: number, b: number, seed: number) {
  let n = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(seed, 1442695041)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
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
/** Shortest signed difference between two angles, in degrees. */
const dDeg = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180;

/* --------------------------------------------------------------- wall thickness field --- */

const n1 = noise(5),
  n2 = noise(17),
  n3 = noise(41);
/** Isolated pits: [degrees, ft up, depth in]. */
const PITS: [number, number, number][] = [
  [270.3, 1.05, 0.085],
  [133, 13.2, 0.06],
  [44.5, 3.4, 0.05],
  [181, 27.5, 0.045],
  [313, 6.1, 0.07],
];

/** Wall thickness at a point on the shell, inches. */
export function wall(deg: number, ft: number) {
  const c = Math.min(COURSES - 1, Math.max(0, Math.floor(ft / FT_PER_UNIT)));
  const nom = NOM_IN[c],
    tmin = TMIN_IN[c];
  const s = (((deg % 360) + 360) % 360) / 360 * CIRC_FT;
  let loss = 0.004 + n1(s * 0.35, ft * 0.35) * 0.01 + (n2(s * 2.4, ft * 2.4) - 0.5) * 0.004;
  // General corrosion at the bottom of the shell, worse on the low side of the tank (~250°).
  const low = 0.5 + 0.5 * Math.cos(rad(dDeg(deg, 250)));
  if (ft < 3.2) loss += 0.062 * (1 - ft / 3.2) ** 1.2 * (0.35 + 1.2 * low) * (0.7 + 0.6 * n3(s * 0.08, 0.5));
  // Corrosion band at the product / vapour interface, 33–35 ft, between 70° and 200°.
  const arcIn = smooth(55, 80, deg) * (1 - smooth(190, 215, deg));
  loss += arcIn * Math.exp(-(((ft - 34) / 0.9) ** 2)) * 0.032 * (0.6 + 0.6 * n3(s * 0.4, ft));
  for (const [pd, pf, depth] of PITS) {
    const ds = (dDeg(deg, pd) / 360) * CIRC_FT;
    loss += depth * Math.exp(-((ds / 0.35) ** 2 + ((ft - pf) / 0.35) ** 2));
  }
  return { nom, tmin, t: nom - loss, course: c + 1 };
}

/* ------------------------------------------------------------------ colour scales --- */

const hexRGB = (hex: string) => {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
function ramp(stops: [number, string][]) {
  const s = stops.map(([t, c]) => [t, ...hexRGB(c)] as [number, number, number, number]);
  return (v: number): [number, number, number] => {
    if (v <= s[0][0]) return [s[0][1], s[0][2], s[0][3]];
    for (let i = 1; i < s.length; i++) {
      if (v <= s[i][0]) {
        const a = s[i - 1],
          b = s[i],
          k = (v - a[0]) / (b[0] - a[0]);
        return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
      }
    }
    const l = s[s.length - 1];
    return [l[1], l[2], l[3]];
  };
}
const css = (stops: [number, string][]) => {
  const lo = stops[0][0],
    hi = stops[stops.length - 1][0];
  return `linear-gradient(90deg, ${stops.map(([t, c]) => `${c} ${((t - lo) / (hi - lo)) * 100}%`).join(', ')})`;
};

/** UT reading status colours. */
export const utStatus = [
  { id: 'ok', label: 'OK (≥ 90% nominal)', fill: '#bfe8cf', text: '#0d3b22' },
  { id: 'watch', label: 'Monitor (< 90% nominal)', fill: '#ffd979', text: '#3d2c00' },
  { id: 'low', label: 'Below t-min', fill: '#e53935', text: '#ffffff' },
] as const;
const statusOf = (t: number, nom: number, tmin: number) =>
  t < tmin ? utStatus[2] : t < nom * 0.9 ? utStatus[1] : utStatus[0];

/** AUT C-scan scale: remaining wall, % of nominal. */
export const autStops: [number, string][] = [
  [70, '#7a0d0d'],
  [75, '#e0302a'],
  [80, '#f39a1d'],
  [85, '#efe236'],
  [90, '#36c172'],
  [95, '#1aa0dc'],
  [100, '#1b3db8'],
];
export const autGradient = css(autStops);
const autRGB = ramp(autStops);
export const AUT_NODATA = '#9aa3ab';

/** Laser scan scale: radial deviation from a true cylinder, mm (+ outward). */
export const laserStops: [number, string][] = [
  [-40, '#1c2fa8'],
  [-20, '#1f9ee0'],
  [-4, '#3cc46a'],
  [4, '#3cc46a'],
  [20, '#f1df3a'],
  [40, '#e2402b'],
];
export const laserGradient = css(laserStops);
const laserRGB = ramp(laserStops);

/* ------------------------------------------------------------------ painted strips --- */

const PX_FT = 48; // pixels per foot on the strip images
const HEAD_FT = 2.2; // label area above the top of the shell
const UT_W_FT = 1.7,
  AUT_W_FT = 3.4;

function stationHeader(ctx: CanvasRenderingContext2D, w: number, no: number, deg: number) {
  const h = HEAD_FT * PX_FT;
  ctx.fillStyle = '#002b5c';
  ctx.fillRect(0, 0, w, h - 6);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(w * 0.24)}px ui-monospace, Menlo, monospace`;
  ctx.fillText(`S${no}`, w / 2, h * 0.33);
  ctx.font = `600 ${Math.round(w * 0.15)}px ui-monospace, Menlo, monospace`;
  ctx.fillText(`${deg}°`, w / 2, h * 0.7);
}

const cache = new Map<string, HTMLCanvasElement>();

function paintUT(no: number, deg: number) {
  const key = `ut${no}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const w = 128,
    h = Math.round((HEIGHT_FT + HEAD_FT) * PX_FT);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.fillRect(0, HEAD_FT * PX_FT, w, HEIGHT_FT * PX_FT);
  stationHeader(ctx, w, no, deg);
  const top = HEAD_FT * PX_FT;
  ctx.font = `700 ${Math.round(PX_FT * 0.48)}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let ft = 1; ft < HEIGHT_FT; ft++) {
    const r = wall(deg, ft);
    const st = statusOf(r.t, r.nom, r.tmin);
    const y = top + (HEIGHT_FT - ft - 0.5) * PX_FT;
    ctx.fillStyle = st.fill;
    ctx.fillRect(4, y + 3, w - 8, PX_FT - 6);
    ctx.fillStyle = st.text;
    ctx.fillText(r.t.toFixed(3), w / 2, y + PX_FT / 2 + 1);
  }
  // Girth welds: ticks at the strip edges, clear of the readings.
  ctx.fillStyle = '#002b5c';
  for (let k = 1; k < COURSES; k++) {
    const y = top + (HEIGHT_FT - k * FT_PER_UNIT) * PX_FT - 3;
    ctx.fillRect(0, y, 4, 6);
    ctx.fillRect(w - 4, y, 4, 6);
  }
  cache.set(key, c);
  return c;
}

function paintAUT(no: number, deg: number) {
  const key = `aut${no}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const w = 192,
    h = Math.round((HEIGHT_FT + HEAD_FT) * PX_FT);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const top = Math.round(HEAD_FT * PX_FT);
  const img = ctx.createImageData(w, h - top);
  const px = img.data;
  const nd = hexRGB(AUT_NODATA);
  const degPerPx = (AUT_W_FT / CIRC_FT) * 360 / w;
  for (let j = 0; j < h - top; j++) {
    const ft = HEIGHT_FT - (j + 0.5) / PX_FT;
    const nearWeld = Math.abs(ft - Math.round(ft / FT_PER_UNIT) * FT_PER_UNIT) < 0.14 && ft > 1;
    for (let i = 0; i < w; i++) {
      const o = (j * w + i) * 4;
      let rgb: number[];
      if (nearWeld || ft < 0.25) rgb = nd;
      else {
        const r = wall(deg + (i - w / 2) * degPerPx, ft);
        rgb = autRGB((r.t / r.nom) * 100);
      }
      px[o] = rgb[0];
      px[o + 1] = rgb[1];
      px[o + 2] = rgb[2];
      px[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, top);
  stationHeader(ctx, w, no, deg);
  // Scan index lines every foot, like the encoder grid on an AUT plot.
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let ft = 1; ft < HEIGHT_FT; ft++) {
    const y = top + (HEIGHT_FT - ft) * PX_FT + 0.5;
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();
  ctx.strokeStyle = '#002b5c';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, top + 1.5, w - 3, h - top - 3);
  cache.set(key, c);
  return c;
}

/* ---------------------------------------------------------------- laser deviation --- */

/** The large deformation: an outward bulge on course 3. */
export const BULGE = { deg: 26, ft: 20.5, w: 0.8, h: 0.75 };
/** Display exaggeration of radial deviation (mm → model units). */
const EXAG = (R / (R * FT_PER_UNIT * 304.8)) * 12;
export const LASER_EXAGGERATION = 12;

/** Radial deviation from a true cylinder at a point on the shell, mm (+ outward). */
export function deviation(theta: number, y: number) {
  const c = Math.min(COURSES - 1, Math.max(0, Math.floor(y - Y0)));
  const yc = y - Y0 - c;
  let mm = 0;
  // Peaking at the vertical welds of each course (alternate courses offset half a plate).
  const taper = 0.35 + 0.65 * smooth(0, 0.15, yc) * smooth(0, 0.15, 1 - yc);
  for (let p = 0; p < 12; p++) {
    const a = ((p + (c % 2) * 0.5) / 12) * Math.PI * 2;
    let d = theta - a;
    d = Math.atan2(Math.sin(d), Math.cos(d)) * R;
    if (Math.abs(d) > 0.6) continue;
    const sign = hash(p, c, 3) < 0.78 ? 1 : -1;
    const amp = sign * (12 + hash(p, c, 9) * 16);
    mm += amp * Math.exp(-((d / 0.13) ** 2)) * taper;
  }
  // Banding at the girth welds (inward).
  for (let k = 1; k < COURSES; k++) {
    const amp = -(12 + hash(k, 1, 21) * 10) * (0.7 + 0.3 * Math.cos(theta * 3 + k));
    mm += amp * Math.exp(-(((y - Y0 - k) / 0.085) ** 2));
  }
  // Out of round, growing toward the top.
  mm += 12 * Math.cos(2 * theta + 0.4) * (0.3 + 0.7 * ((y - Y0) / COURSES)) + 4 * Math.cos(3 * theta + 1.1);
  // The bulge.
  let dt = theta - rad(BULGE.deg);
  dt = Math.atan2(Math.sin(dt), Math.cos(dt)) * R;
  const dy = y - yOf(BULGE.ft);
  const e = (dt / BULGE.w) ** 2 + (dy / BULGE.h) ** 2;
  mm += 82 * Math.exp(-e * 1.2) * (1 + 0.08 * Math.sin(dt * 9));
  mm += (n3(theta * 18, y * 5) - 0.5) * 3;
  return mm;
}
/** Height of the bulge at its crown, for the legend. */
export const bulgeHeight = Math.round(deviation(rad(BULGE.deg), yOf(BULGE.ft)));

/* ------------------------------------------------------------------------ 3D objects --- */

export function buildShellScan(start: number, span: number) {
  const group = new THREE.Group();
  group.name = 'shell-scan';
  const inCut = (a: number) => {
    if (span >= Math.PI * 2 - 1e-6) return true;
    const rel = (((a - start) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return rel <= span;
  };
  const textures: THREE.Texture[] = [];
  const stripMats: Record<'ut' | 'aut', THREE.MeshBasicMaterial[]> = { ut: [], aut: [] };
  const views: Record<ShellMode, THREE.Group> = {
    ut: new THREE.Group(),
    aut: new THREE.Group(),
    laser: new THREE.Group(),
  };
  for (const v of Object.values(views)) {
    v.visible = false;
    group.add(v);
  }

  // Strips at each settlement station, wrapped on the outside of the shell.
  for (const st of STATIONS) {
    const a = rad(st.deg);
    if (!inCut(a)) continue;
    for (const mode of ['ut', 'aut'] as const) {
      const wFt = mode === 'ut' ? UT_W_FT : AUT_W_FT;
      const rr = R + (mode === 'ut' ? 0.03 : 0.024);
      const dTheta = wFt / FT_PER_UNIT / rr;
      const hUnits = (HEIGHT_FT + HEAD_FT) / FT_PER_UNIT;
      const tex = new THREE.CanvasTexture(mode === 'ut' ? paintUT(st.no, st.deg) : paintAUT(st.no, st.deg));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      textures.push(tex);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0,
        toneMapped: false,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      stripMats[mode].push(mat);
      const geo = new THREE.CylinderGeometry(rr, rr, hUnits, 12, 1, true, a - dTheta / 2, dTheta);
      const m = new THREE.Mesh(geo, mat);
      m.position.y = Y0 + hUnits / 2;
      m.renderOrder = 2;
      views[mode].add(m);
    }
  }

  // Laser scan surface: the shell displaced by its (exaggerated) deviation and coloured by it.
  const H = COURSES;
  const geo = new THREE.CylinderGeometry(R, R, H, 480, 180, true, start, span);
  geo.translate(0, Y0 + H / 2, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      y = pos.getY(i),
      z = pos.getZ(i);
    const theta = Math.atan2(x, z);
    const mm = deviation(theta, y);
    const k = (R + mm * EXAG) / R;
    pos.setXYZ(i, x * k, y, z * k);
    const [r, g, b] = laserRGB(mm);
    col.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const laserMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.55,
    metalness: 0.05,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
  });
  const laser = new THREE.Mesh(geo, laserMat);
  laser.castShadow = true;
  views.laser.add(laser);

  return {
    group,
    /** Show each view at its own level, 0 hidden … 1 fully shown. */
    setLevels(levels: Record<ShellMode, number>) {
      for (const mode of ['ut', 'aut'] as const) {
        views[mode].visible = levels[mode] > 0.002;
        for (const m of stripMats[mode]) m.opacity = levels[mode];
      }
      views.laser.visible = levels.laser > 0.002;
      laserMat.opacity = levels.laser;
      const see = levels.laser < 0.999;
      if (see !== laserMat.transparent) {
        laserMat.transparent = see;
        laserMat.needsUpdate = true;
      }
      laserMat.depthWrite = levels.laser > 0.5;
    },
    dispose() {
      textures.forEach((t) => t.dispose());
    },
  };
}
