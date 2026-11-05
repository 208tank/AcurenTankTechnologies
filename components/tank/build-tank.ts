import * as THREE from 'three';
import type { Section, TankType } from '@/lib/tank-data';
import { buildFloorScan } from './floor-scan';
import { buildShellScan } from './shell-scan';
export const palette = {
  steel: 0x9aaab3,
  inner: 0x72828e,
  deck: 0x82949e,
  dark: 0x27323c,
  seam: 0x414f59,
  accent: 0x44c5e4,
  clad: 0xc5d0d4,
  concrete: 0x464b4e,
  rail: 0xc5b879,
};
export function buildTank(type: TankType, cutaway: boolean) {
  const root = new THREE.Group();
  // Everything above the floor (shell, roofs, stair, nozzles) goes in `upper`, so the
  // viewer can lift it away and show the floor scan. Floor parts are added to `root`.
  // Floor parts (foundation, plates, annular ring) sit in `floorParts`. Everything above the
  // floor goes in `upper`, which the floor view lifts away. Inside `upper`, the shell plates,
  // the roofs (fixed, floating, seal) and the fittings (stair, rails, nozzles) each have a
  // group, so the shell views can move the roof and floor away and keep the shell.
  const floorParts = new THREE.Group();
  const upper = new THREE.Group();
  const shellParts = new THREE.Group();
  const roofParts = new THREE.Group();
  const fittings = new THREE.Group();
  root.add(floorParts, upper);
  upper.add(shellParts, roofParts, fittings);
  let parent: THREE.Group = floorParts;
  const targets: THREE.Mesh[] = [];
  const start = cutaway ? 1.62 : 0,
    span = cutaway ? Math.PI * 2 - 1.98 : Math.PI * 2;
  const steel = new THREE.MeshStandardMaterial({
    color: palette.steel,
    metalness: 0.72,
    roughness: 0.39,
    side: THREE.DoubleSide,
  });
  const deck = steel.clone();
  deck.color.setHex(palette.deck);
  deck.roughness = 0.52;
  const dark = new THREE.MeshStandardMaterial({
    color: palette.dark,
    roughness: 0.74,
    metalness: 0.3,
    side: THREE.DoubleSide,
  });
  const seam = new THREE.LineBasicMaterial({
    color: palette.seam,
    transparent: true,
    opacity: 0.7,
  });
  const rail = new THREE.MeshStandardMaterial({
    color: palette.rail,
    metalness: 0.48,
    roughness: 0.42,
  });
  function mesh(
    g: THREE.BufferGeometry,
    m: THREE.Material,
    section?: Section,
    pos?: [number, number, number],
  ) {
    const o = new THREE.Mesh(g, section ? m.clone() : m);
    if (pos) o.position.set(...pos);
    o.castShadow = true;
    o.receiveShadow = true;
    if (section) {
      o.userData.section = section;
      targets.push(o);
    }
    parent.add(o);
    return o;
  }
  // Floor seams get their own material so fading the shell's seams leaves them alone.
  // Each group gets its own seam material so fading one group leaves the others alone.
  const seams = new Map<THREE.Group, THREE.LineBasicMaterial>([
    [floorParts, seam.clone()],
    [shellParts, seam.clone()],
    [roofParts, seam.clone()],
    [fittings, seam],
  ]);
  function line(points: THREE.Vector3[]) {
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), seams.get(parent) ?? seam);
    parent.add(l);
    return l;
  }
  function arc(r: number, y: number, a = start, len = span) {
    const p: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const t = a + (i / 128) * len;
      p.push(new THREE.Vector3(Math.sin(t) * r, y, Math.cos(t) * r));
    }
    return line(p);
  }
  function rod(
    a: THREE.Vector3,
    b: THREE.Vector3,
    r = 0.025,
    m: THREE.Material = rail,
    section?: Section,
  ) {
    const d = b.clone().sub(a);
    const o = mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), m, section);
    o.position.copy(a.clone().add(b).multiplyScalar(0.5));
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return o;
  }
  const point = (a: number, r: number, y: number) =>
    new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r);
  function ring(
    r: number,
    t: number,
    y: number,
    m: THREE.Material,
    section: Section,
    a = start,
    len = span,
  ) {
    const g = new THREE.TorusGeometry(r, t, 8, 160, len);
    g.rotateX(-Math.PI / 2);
    g.rotateY(a - Math.PI / 2);
    return mesh(g, m, section, [0, y, 0]);
  }
  // Concrete foundation, bottom and radial annular plates.
  mesh(
    new THREE.CylinderGeometry(5.42, 5.55, 0.23, 128),
    new THREE.MeshStandardMaterial({ color: palette.concrete, roughness: 0.96 }),
    undefined,
    [0, -0.1, 0],
  );
  mesh(new THREE.CylinderGeometry(5.12, 5.12, 0.055, 128), deck, 'floor', [0, 0.055, 0]);
  ring(4.42, 0.018, 0.09, dark, 'floor', 0, Math.PI * 2);
  ring(5.03, 0.025, 0.11, steel, 'floor', 0, Math.PI * 2);
  for (let z = -3.6; z <= 3.6; z += 1.2) {
    const end = Math.sqrt(4.42 ** 2 - z * z);
    line([new THREE.Vector3(-end, 0.088, z), new THREE.Vector3(end, 0.088, z)]);
    for (let x = -3.2 + (Math.round(z / 1.2) % 2) * 0.9; x <= 3.3; x += 2.2) {
      if (x * x + z * z < 17) {
        const z2 = Math.min(z + 1.2, Math.sqrt(Math.max(0, 4.42 ** 2 - x * x)));
        line([new THREE.Vector3(x, 0.09, z), new THREE.Vector3(x, 0.09, z2)]);
      }
    }
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    line([point(a, 4.42, 0.09), point(a, 5.1, 0.09)]);
  }
  const floorScan = buildFloorScan();
  root.add(floorScan.group);
  const shellScan = buildShellScan(start, span);
  root.add(shellScan.group);
  parent = shellParts;
  // Individual plate courses preserve subtle differences in steel response.
  for (let c = 0; c < 6; c++) {
    const mat = steel.clone();
    mat.color.setHex(c % 2 ? 0x98a8b2 : 0xa6b4bc);
    if (type === 'insulated') {
      mat.color.setHex(c % 2 ? 0xb9c6cc : 0xcad3d8);
      mat.roughness = 0.3;
    }
    mesh(new THREE.CylinderGeometry(5, 5, 0.995, 160, 1, true, start, span), mat, 'shell', [
      0,
      0.6 + c,
      0,
    ]);
    arc(5.013, 0.103 + c);
    const n = type === 'insulated' ? 40 : 12;
    for (let p = 0; p < n; p++) {
      const a = ((p + (c % 2) * 0.5) / n) * Math.PI * 2;
      if (a >= start && a <= start + span) {
        line([point(a, 5.015, 0.105 + c), point(a, 5.015, 1.095 + c)]);
      }
    }
  }
  arc(5.014, 6.1);
  ring(5.03, 0.055, 6.12, steel, 'shell');
  ring(5.11, 0.065, 5.72, steel, 'shell');
  // Weather jacket overlaps and a thicker exposed cut edge distinguish insulated shells.
  if (type === 'insulated') {
    for (let c = 0; c < 6; c++) ring(5.04, 0.026, c + 0.2, steel, 'shell');
    if (cutaway) {
      for (const a of [start, start + span]) {
        const o = mesh(
          new THREE.BoxGeometry(0.15, 6, 0.11),
          new THREE.MeshStandardMaterial({ color: 0xc8bc93, roughness: 1 }),
          'shell',
        );
        o.position.copy(point(a, 5, 3.1));
        o.rotation.y = a;
      }
    }
  }
  parent = roofParts;
  const fy = type === 'efr' ? 4.55 : 3.75;
  const fmat = deck.clone();
  fmat.color.setHex(0x84959d);
  // Steel pan, closed compartment pontoon annulus and resilient rim seal.
  mesh(
    new THREE.CylinderGeometry(4.03, 4.03, 0.075, 128, 1, false, start, span),
    fmat,
    'floating',
    [0, fy, 0],
  );
  const annulus = new THREE.RingGeometry(4.02, 4.78, 128, 1, start, span);
  annulus.rotateX(-Math.PI / 2);
  annulus.rotateY(-Math.PI / 2);
  mesh(annulus, fmat, 'floating', [0, fy + 0.23, 0]);
  mesh(new THREE.CylinderGeometry(4.78, 4.78, 0.38, 128, 1, true, start, span), deck, 'floating', [
    0,
    fy + 0.04,
    0,
  ]);
  mesh(new THREE.CylinderGeometry(4.03, 4.03, 0.26, 128, 1, true, start, span), steel, 'floating', [
    0,
    fy + 0.1,
    0,
  ]);
  ring(4.88, 0.095, fy + 0.14, dark, 'seal');
  ring(4.77, 0.025, fy + 0.25, steel, 'floating');
  ring(4.03, 0.018, fy + 0.25, dark, 'floating');
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    if (a >= start && a <= start + span) {
      line([point(a, 4.03, fy + 0.24), point(a, 4.78, fy + 0.24)]);
      if (i % 2 === 0) {
        mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 16), dark, 'floating', [
          Math.sin(a) * 4.42,
          fy + 0.28,
          Math.cos(a) * 4.42,
        ]);
        const p = point(a, 3.6, fy);
        rod(p.clone().setY(fy - 0.8), p.clone().setY(fy + 0.35), 0.045, steel, 'floating');
      }
    }
  }
  for (let i = 0; i < 12; i++) {
    const a = start + (i / 12) * span;
    line([point(a, 0.2, fy + 0.05), point(a, 4, fy + 0.05)]);
  }
  if (type !== 'efr') {
    const roofmat = steel.clone();
    roofmat.color.setHex(0xaab8bf);
    roofmat.roughness = 0.48;
    mesh(
      new THREE.CylinderGeometry(0.13, 5.05, 1.22, 160, 1, false, start, span),
      roofmat,
      'roof',
      [0, 6.72, 0],
    );
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      if (a >= start && a <= start + span) line([point(a, 0.14, 7.335), point(a, 5.06, 6.112)]);
    }
    mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.35, 16), steel, 'roof', [0, 7.5, 0]);
    mesh(new THREE.ConeGeometry(0.3, 0.13, 24), steel, 'roof', [0, 7.72, 0]);
    for (const a of [2.1, 3.2, 4.3, 5.4]) {
      rod(point(a, 2.8, 0.1), point(a, 2.8, 6.66), 0.055, steel, 'roof');
    }
  }
  parent = fittings;
  // Helical external stair: treads, stringers, landings and paired safety rails.
  const steps = 48,
    a0 = 3.55,
    da = 2.12;
  for (let i = 0; i < steps; i++) {
    const a = a0 + (i / (steps - 1)) * da,
      y = 0.2 + (i / (steps - 1)) * 5.9;
    const o = mesh(new THREE.BoxGeometry(0.66, 0.055, 0.28), dark, 'shell');
    o.position.copy(point(a, 5.4, y));
    o.rotation.y = a;
    if (i % 4 === 0 || i === steps - 1) {
      for (const r of [5.12, 5.7]) rod(point(a, r, y), point(a, r, y + 0.84), 0.022, rail, 'shell');
    }
    if (i > 0) {
      const prev = a0 + ((i - 1) / (steps - 1)) * da,
        py = 0.2 + ((i - 1) / (steps - 1)) * 5.9;
      for (const r of [5.12, 5.7]) {
        rod(point(prev, r, py + 0.84), point(a, r, y + 0.84), 0.025, rail, 'shell');
        rod(point(prev, r, py + 0.45), point(a, r, y + 0.45), 0.018, rail, 'shell');
        rod(point(prev, r, py - 0.05), point(a, r, y - 0.05), 0.04, steel, 'shell');
      }
    }
  }
  // Rim safety rail behind the cutaway.
  for (let i = 0; i <= 40; i++) {
    const a = start + (i / 40) * span;
    rod(point(a, 5.04, 6.12), point(a, 5.04, 6.67), 0.018, rail, 'shell');
    if (i > 0) rod(point(a - span / 40, 5.04, 6.67), point(a, 5.04, 6.67), 0.022, rail, 'shell');
  }
  parent = roofParts;
  if (type === 'efr') {
    const a = new THREE.Vector3(-3.4, 6.18, -3.55),
      b = new THREE.Vector3(-0.5, fy + 0.14, -0.55);
    for (const dx of [-0.25, 0.25])
      rod(
        a.clone().add(new THREE.Vector3(dx, 0, 0)),
        b.clone().add(new THREE.Vector3(dx, 0, 0)),
        0.035,
        steel,
        'floating',
      );
    for (let i = 0; i <= 14; i++) {
      const p = a.clone().lerp(b, i / 14);
      rod(
        p.clone().add(new THREE.Vector3(-0.27, 0, 0)),
        p.clone().add(new THREE.Vector3(0.27, 0, 0)),
        0.025,
        rail,
        'floating',
      );
    }
    mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 20), dark, 'floating', [0, fy + 0.09, 0]);
  }
  parent = fittings;
  // Shell nozzles, reinforcement pads and a manway on the intact side.
  for (const [a, y, r] of [
    [2.0, 0.7, 0.2],
    [4.8, 1.0, 0.37],
    [2.2, 1.8, 0.15],
  ]) {
    const p = point(a, 5.1, y);
    const end = point(a, 5.42, y);
    rod(p, end, r, steel, 'shell');
    rod(end, point(a, 5.5, y), r * 1.3, dark, 'shell');
  }
  return {
    root,
    upper,
    floorParts,
    shellParts,
    roofParts,
    fittings,
    floorScan,
    shellScan,
    targets,
    anchors: {
      floor: new THREE.Vector3(2, 0.1, 3.8),
      shell: new THREE.Vector3(4.9, 2.1, -0.6),
      roof: new THREE.Vector3(-1.8, 6.85, 1.8),
      floating: new THREE.Vector3(-2, fy + 0.25, 2),
      seal: new THREE.Vector3(-2.1, fy + 0.15, 4.3),
    } as Record<Section, THREE.Vector3>,
  };
}
