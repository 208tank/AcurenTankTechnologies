'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildTank, palette } from './build-tank';
import { edgeStations, stationAnchor, stationView, statusColor, type EdgeStatus } from './edge-settlement';
import EdgeStationPanel from './edge-station-panel';
import { LOWER_THRESHOLD, WELD_DISCONTINUITY, scanBins } from './floor-scan';
import {
  AUT_NODATA,
  BULGE,
  LASER_EXAGGERATION,
  NOM_IN,
  STATIONS,
  type ShellMode,
  autGradient,
  autStops,
  bulgeHeight,
  laserGradient,
  laserStops,
  shellModes,
  utStatus,
} from './shell-scan';
import { Section, TankType, sections } from '@/lib/tank-data';
type Props = {
  type: TankType;
  cutaway: boolean;
  selected: Section;
  onSelect: (section: Section) => void;
  reset: number;
  labels: boolean;
  /** Slowly orbit the tank, for unattended booth displays. */
  autoRotate?: boolean;
  /** Lift the shell and roof away and show the floor C-scan. */
  floorView?: boolean;
  /** Called from the "Show full tank" button on the floor legend. */
  onCloseFloor?: () => void;
  /** Shell inspection view to show, or null for the normal tank. */
  shellView?: ShellMode | null;
  /** Called when the user picks another shell view, or closes it (null). */
  onShellView?: (mode: ShellMode | null) => void;
};
const MODES: ShellMode[] = ['ut', 'aut', 'laser'];
type FloorMode = 'scan' | 'edge';
/** Seconds to cross-fade between the floor scan and edge settlement. */
const EDGE_TIME = 0.7;
/** Zooming the camera closer than this (in edge settlement) opens the nearest station. */
const STATION_ZOOM = 11.2;
/** Seconds for the roof and floor to move away when the shell opens. */
const SHELL_OPEN_TIME = 2.4;
/** Seconds to cross-fade between shell views. */
const SHELL_TIME = 0.9;
/** Seconds for the full open (or close) of the floor view. */
const REVEAL_TIME = 2.6;
const smooth = (a: number, b: number, t: number) => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
export default function TankViewer({
  type,
  cutaway,
  selected,
  onSelect,
  reset,
  labels,
  autoRotate = false,
  floorView = false,
  onCloseFloor,
  shellView = null,
  onShellView,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const pins = useRef<Partial<Record<Section, HTMLButtonElement | null>>>({});
  const pick = useRef(onSelect);
  const selection = useRef(selected);
  const labelState = useRef(labels);
  const floorState = useRef(floorView);
  const shellState = useRef(shellView);
  // Floor view tabs (MFL scan or edge settlement) and the open settlement station.
  const [floorMode, setFloorMode] = useState<FloorMode>('scan');
  const [station, setStation] = useState<number | null>(null);
  const floorModeState = useRef(floorMode);
  const stationState = useRef(station);
  const openStation = useRef(setStation);
  const edgePins = useRef<Record<number, HTMLButtonElement | null>>({});
  const api = useRef<{
    focus: (s: Section) => void;
    reset: () => void;
    floor: (open: boolean) => void;
    shell: (mode: ShellMode | null) => void;
    edge: (on: boolean) => void;
    station: (no: number | null) => void;
  } | null>(null);
  const [error, setError] = useState('');
  // Bumped to rebuild the scene after the browser drops the WebGL context
  // (a GPU driver reset, or the machine waking from sleep).
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    pick.current = onSelect;
    selection.current = selected;
    api.current?.focus(selected);
  }, [onSelect, selected]);
  useEffect(() => {
    labelState.current = labels;
  }, [labels]);
  useEffect(() => {
    api.current?.reset();
  }, [reset]);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) {
      console.error(e);
      setError(
        '3D rendering is unavailable in this browser. Enable hardware acceleration or try a WebGL-capable browser. You can still explore every technology using the section tabs.',
      );
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.28;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 150);
    const home = new THREE.Vector3(13, 10.5, 17);
    camera.position.copy(home);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 3, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.085;
    controls.minDistance = 10;
    controls.maxDistance = 34;
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
    controls.enablePan = true;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.45;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04);
    scene.environment = env.texture;
    scene.environmentIntensity = 0.65;
    room.dispose();
    pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xdbe8ff, 0x44494f, 2));
    const sun = new THREE.DirectionalLight(0xfff0d4, 3.5);
    sun.position.set(-10, 18, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    sun.shadow.normalBias = 0.035;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xa8c6e8, 1.5);
    fill.position.set(12, 7, -8);
    scene.add(fill);
    const tank = buildTank(type, cutaway);
    scene.add(tank.root);
    // Fading: the floor view lifts and fades everything above the floor; the shell views
    // fade the roofs, stair and fittings, and the laser view also replaces the shell plates.
    type Fade = {
      group: THREE.Group;
      mats: Map<THREE.Material, { opacity: number; transparent: boolean }>;
      fading: boolean;
      shadows: boolean;
    };
    const fadeOf = (group: THREE.Group): Fade => {
      const mats = new Map<THREE.Material, { opacity: number; transparent: boolean }>();
      group.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        if (!m) return;
        for (const mat of Array.isArray(m) ? m : [m])
          mats.set(mat, { opacity: mat.opacity, transparent: mat.transparent });
      });
      return { group, mats, fading: false, shadows: true };
    };
    const parts = fadeOf(tank.shellParts);
    const roof = fadeOf(tank.roofParts);
    const fittings = fadeOf(tank.fittings);
    const floorParts = fadeOf(tank.floorParts);
    function setFade(f: Fade, k: number) {
      f.group.visible = k > 0.005;
      const nowFading = k < 1;
      for (const [mat, base] of f.mats) {
        if (nowFading !== f.fading) {
          mat.transparent = nowFading || base.transparent;
          mat.needsUpdate = true;
        }
        mat.opacity = base.opacity * k;
      }
      f.fading = nowFading;
      const wantShadows = k > 0.8;
      if (wantShadows !== f.shadows) {
        f.shadows = wantShadows;
        f.group.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) o.castShadow = wantShadows;
        });
      }
    }
    // 0 = whole tank … 1 = floor open. Always starts closed and animates to the target,
    // so a rebuild (tank type or cutaway change) replays the reveal.
    let reveal = 0;
    let revealTarget = floorState.current ? 1 : 0;
    // Shell: `shellOpen` moves the roof up and the floor down and away (0 … 1); each view
    // then has its own level so switching views cross-fades.
    let shellOpen = 0;
    let shellOpenTarget = 0;
    const level: Record<ShellMode, number> = { ut: 0, aut: 0, laser: 0 };
    const levelTarget: Record<ShellMode, number> = { ut: 0, aut: 0, laser: 0 };
    // Floor view: 0 = MFL scan … 1 = edge settlement.
    let edgeLevel = floorModeState.current === 'edge' ? 1 : 0;
    let edgeTarget = edgeLevel;
    function applyFades() {
      const lift = smooth(0, 0.55, reveal);
      const floorFade = 1 - smooth(0.04, 0.45, reveal);
      tank.upper.position.y = lift * 9;
      const away = smooth(0, 0.6, shellOpen);
      const gone = smooth(0.05, 0.5, shellOpen);
      const show = smooth(0.45, 1, shellOpen);
      tank.roofParts.position.y = away * 7;
      tank.floorParts.position.y = -away * 3.5;
      setFade(roof, floorFade * (1 - gone));
      setFade(fittings, floorFade * (1 - gone));
      setFade(floorParts, 1 - gone);
      setFade(parts, floorFade * (1 - smooth(0.1, 0.9, level.laser) * show));
      const floorIn = smooth(0.3, 1, reveal);
      tank.floorScan.setReveal(floorIn * (1 - edgeLevel));
      tank.edgeOverlay.setLevel(smooth(0.45, 1, reveal) * edgeLevel);
      tank.shellScan.setLevels({
        ut: smooth(0.2, 1, level.ut) * show,
        aut: smooth(0.2, 1, level.aut) * show,
        laser: smooth(0.1, 0.9, level.laser) * show,
      });
    }
    applyFades();
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.ShadowMaterial({ opacity: 0.28 }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.225;
    plane.receiveShadow = true;
    scene.add(plane);
    const grid = new THREE.GridHelper(50, 50, 0x93b9cd, 0xc4dce7);
    grid.position.y = -0.23;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.42;
    scene.add(grid);
    const ray = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let hovered: Section | null = null;
    let down = [0, 0];
    let tween: THREE.Vector3 | null = null;
    let targetTween: THREE.Vector3 | null = null;
    function resize() {
      const w = el?.clientWidth ?? 1,
        h = el?.clientHeight ?? 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    function hit(e: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      ray.setFromCamera(mouse, camera);
      // While the floor is open the rest of the tank is gone, so there is nothing to pick.
      if (floorState.current) return undefined;
      // Skip anything faded out of view (the roof while a shell view is open).
      const shown = (o: THREE.Object3D | null) => {
        for (let p = o; p; p = p.parent) if (!p.visible) return false;
        return true;
      };
      return ray.intersectObjects(tank.targets.filter(shown), false)?.[0]?.object?.userData
        ?.section as Section | undefined;
    }
    function move(e: PointerEvent) {
      hovered = hit(e) ?? null;
      renderer.domElement.style.cursor = hovered ? 'pointer' : 'grab';
    }
    function pointerdown(e: PointerEvent) {
      down = [e.clientX, e.clientY];
      tween = null;
      targetTween = null;
    }
    function pointerup(e: PointerEvent) {
      if (Math.hypot(e.clientX - (down?.[0] ?? 0), e.clientY - (down?.[1] ?? 0)) < 5) {
        const s = hit(e);
        if (s) pick.current?.(s);
      }
    }
    function leave() {
      hovered = null;
    }
    let recover = 0;
    function contextLost(e: Event) {
      e.preventDefault();
      console.error('WebGL context lost; rebuilding the 3D view.');
      recover = window.setTimeout(() => setGeneration((g) => g + 1), 1000);
    }
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    renderer.domElement.addEventListener('pointermove', move);
    renderer.domElement.addEventListener('pointerdown', pointerdown);
    renderer.domElement.addEventListener('pointerup', pointerup);
    renderer.domElement.addEventListener('pointerleave', leave);
    // Swing down over the floor, keeping the direction the user was looking from.
    function floorCamera() {
      const flat = camera.position.clone().sub(controls.target).setY(0);
      if (flat.lengthSq() < 1e-6) flat.set(0, 0, 1);
      flat.normalize();
      const el = 0.98,
        dist = 14.5;
      targetTween = new THREE.Vector3(0, 0.1, 0.4);
      tween = targetTween
        .clone()
        .add(flat.multiplyScalar(Math.cos(el) * dist))
        .add(new THREE.Vector3(0, Math.sin(el) * dist, 0));
    }
    api.current = {
      focus: (s: Section) => {
        const h = s === 'floor' ? 2 : s === 'roof' ? 4.6 : 3.5;
        targetTween = new THREE.Vector3(0, h, 0);
        const direction = camera.position.clone().sub(controls.target).normalize();
        tween = new THREE.Vector3(0, h, 0).add(direction.multiplyScalar(s === 'seal' ? 18 : 22));
      },
      reset: () => {
        tween = home.clone();
        targetTween = new THREE.Vector3(0, 3, 0);
      },
      floor: (open: boolean) => {
        revealTarget = open ? 1 : 0;
        if (open) floorCamera();
        else if (!tween) api.current?.focus(selection.current);
      },
      edge: (on: boolean) => {
        edgeTarget = on ? 1 : 0;
      },
      station: (no: number | null) => {
        const st = edgeStations.find((s) => s.no === no);
        if (st) {
          const v = stationView(st);
          tween = v.position;
          targetTween = v.target;
        } else if (floorState.current) floorCamera();
      },
      shell: (mode: ShellMode | null) => {
        const wasOpen = shellOpenTarget > 0;
        shellOpenTarget = mode ? 1 : 0;
        for (const m of MODES) levelTarget[m] = m === mode ? 1 : 0;
        if (mode && !wasOpen) {
          // Come in closer so the strips are readable, keeping the viewing direction.
          const flat = camera.position.clone().sub(controls.target).setY(0);
          if (flat.lengthSq() < 1e-6) flat.set(0, 0, 1);
          flat.normalize();
          targetTween = new THREE.Vector3(0, 3.1, 0);
          tween = targetTween
            .clone()
            .add(flat.multiplyScalar(17.5))
            .add(new THREE.Vector3(0, 3.2, 0));
        }
      },
    };
    if (revealTarget) api.current.floor(true);
    if (shellState.current) api.current.shell(shellState.current);
    const clock = new THREE.Clock();
    let frame = 0;
    let dead = false;
    function animate() {
      if (dead) return;
      frame = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const k = 1 - Math.exp(-dt * 7);
      if (tween) {
        camera.position.lerp(tween, k);
        if (camera.position.distanceTo(tween) < 0.01) tween = null;
      }
      if (targetTween) {
        controls.target.lerp(targetTween, k);
        if (controls.target.distanceTo(targetTween) < 0.01) targetTween = null;
      }
      controls.update(dt);
      let changed = false;
      if (reveal !== revealTarget) {
        const step = dt / REVEAL_TIME;
        // Closing runs a little faster than opening.
        reveal =
          revealTarget > reveal
            ? Math.min(revealTarget, reveal + step)
            : Math.max(revealTarget, reveal - step * 1.6);
        changed = true;
      }
      if (edgeLevel !== edgeTarget) {
        const step = dt / EDGE_TIME;
        edgeLevel = edgeTarget > edgeLevel ? Math.min(1, edgeLevel + step) : Math.max(0, edgeLevel - step);
        changed = true;
      }
      if (shellOpen !== shellOpenTarget) {
        const step = dt / SHELL_OPEN_TIME;
        shellOpen =
          shellOpenTarget > shellOpen
            ? Math.min(1, shellOpen + step)
            : Math.max(0, shellOpen - step * 1.6);
        changed = true;
      }
      for (const m of MODES) {
        if (level[m] === levelTarget[m]) continue;
        const step = dt / SHELL_TIME;
        level[m] =
          levelTarget[m] > level[m]
            ? Math.min(levelTarget[m], level[m] + step)
            : Math.max(levelTarget[m], level[m] - step);
        changed = true;
      }
      if (changed) applyFades();
      for (const o of tank.targets) {
        const material = o.material as THREE.MeshStandardMaterial;
        const s = o.userData?.section;
        material.emissive?.setHex(
          s === hovered ? palette.accent : s === selection.current ? 0x1686ac : 0x000000,
        );
        material.emissiveIntensity = s === hovered ? 0.22 : s === selection.current ? 0.11 : 0;
      }
      for (const s of sections) {
        const pin = pins.current?.[s.id];
        if (!pin) continue;
        const p = tank.anchors[s.id].clone().project(camera);
        const hidden =
          !labelState.current ||
          reveal > 0.02 ||
          shellOpen > 0.02 ||
          (type === 'efr' && s.id === 'roof') ||
          p.z > 1 ||
          p.z < -1;
        pin.style.display = hidden ? 'none' : 'flex';
        pin.style.left = `${(p.x * 0.5 + 0.5) * 100}%`;
        pin.style.top = `${(-p.y * 0.5 + 0.5) * 100}%`;
      }
      // Edge settlement station tags, once the floor is open in edge settlement.
      const showEdge = reveal > 0.9 && edgeLevel > 0.6;
      for (const st of edgeStations) {
        const pin = edgePins.current[st.no];
        if (!pin) continue;
        const p = stationAnchor(st).project(camera);
        const hidden = !showEdge || p.z > 1 || p.z < -1;
        pin.style.display = hidden ? 'none' : 'flex';
        pin.style.left = `${(p.x * 0.5 + 0.5) * 100}%`;
        pin.style.top = `${(-p.y * 0.5 + 0.5) * 100}%`;
      }
      // Zooming in over the edge opens the station nearest the camera.
      if (
        showEdge &&
        edgeTarget === 1 &&
        stationState.current === null &&
        !tween &&
        camera.position.distanceTo(controls.target) < STATION_ZOOM
      ) {
        const look = Math.atan2(camera.position.x, camera.position.z);
        let best = edgeStations[0],
          bestD = Infinity;
        for (const st of edgeStations) {
          const d = Math.abs(Math.atan2(Math.sin(look - (st.deg * Math.PI) / 180), Math.cos(look - (st.deg * Math.PI) / 180)));
          if (d < bestD) {
            best = st;
            bestD = d;
          }
        }
        stationState.current = best.no;
        openStation.current(best.no);
      }
      renderer.render(scene, camera);
    }
    animate();
    if (autoRotate) api.current.focus(selection.current);
    return () => {
      dead = true;
      window.clearTimeout(recover);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      cancelAnimationFrame(frame);
      ro.disconnect();
      controls.dispose();
      api.current = null;
      renderer.domElement.removeEventListener('pointermove', move);
      renderer.domElement.removeEventListener('pointerdown', pointerdown);
      renderer.domElement.removeEventListener('pointerup', pointerup);
      renderer.domElement.removeEventListener('pointerleave', leave);
      const mats = new Set<THREE.Material>();
      scene.traverse((o: THREE.Object3D) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        if (m.material) {
          for (const material of Array.isArray(m.material) ? m.material : [m.material])
            mats.add(material);
        }
      });
      mats.forEach((m) => m.dispose());
      tank.floorScan.dispose();
      tank.shellScan.dispose();
      tank.edgeOverlay.dispose();
      env.dispose();
      renderer.dispose();
      // Release the GPU context now rather than waiting for garbage collection;
      // browsers cap live contexts, which matters when a booth loops for hours.
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [type, cutaway, autoRotate, generation]);
  useEffect(() => {
    if (floorState.current === floorView) return;
    floorState.current = floorView;
    api.current?.floor(floorView);
  }, [floorView]);
  // Leaving the floor view closes any open station.
  useEffect(() => {
    if (!floorView) setStation(null);
  }, [floorView]);
  useEffect(() => {
    if (floorModeState.current === floorMode) return;
    floorModeState.current = floorMode;
    api.current?.edge(floorMode === 'edge');
    if (floorMode !== 'edge') setStation(null);
  }, [floorMode]);
  useEffect(() => {
    if (stationState.current === station) {
      // Opened by zooming in: the camera still needs to frame the station.
      if (station !== null) api.current?.station(station);
      return;
    }
    stationState.current = station;
    api.current?.station(station);
  }, [station]);
  useEffect(() => {
    if (shellState.current === shellView) return;
    shellState.current = shellView;
    api.current?.shell(shellView);
  }, [shellView]);
  const shellOpen = !!shellView;
  const mode = shellView ?? 'ut';
  const ticks = (stops: [number, string][], step: number, unit: string, plus = false) => {
    const lo = stops[0][0],
      hi = stops[stops.length - 1][0],
      out: string[] = [];
    for (let v = lo; v <= hi + 1e-9; v += step) out.push(`${plus && v > 0 ? '+' : ''}${v}${unit}`);
    return out;
  };
  return (
    <>
      <div
        ref={host}
        className="absolute inset-0"
        role="img"
        aria-label={`${type === 'efr' ? 'External floating roof' : type === 'insulated' ? 'Insulated internal floating roof' : 'Internal floating roof'} storage tank, interactive 3D model. Use the labeled buttons to select a section.`}
      />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {sections.map((s) => (
          <button
            key={s.id}
            ref={(node) => {
              pins.current[s.id] = node;
            }}
            onClick={() => onSelect(s.id)}
            className={`model-label pointer-events-auto ${selected === s.id ? 'active' : ''}`}
            style={{ display: 'none' }}
          >
            {s.name.toUpperCase()}
          </button>
        ))}
      </div>
      <div
        className={`floor-legend ${floorView ? 'open' : ''}`}
        aria-hidden={!floorView}
        role="group"
        aria-label="Floor legend"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="eyebrow">
            {floorMode === 'scan' ? 'Top & bottom discontinuities' : 'Edge settlement · Annex B'}
          </span>
          {onCloseFloor && (
            <button
              className="tool-button !px-2 !py-1 text-[10px]"
              onClick={onCloseFloor}
              tabIndex={floorView ? 0 : -1}
            >
              Show full tank
            </button>
          )}
        </div>
        <div className="shell-modes mt-3" role="group" aria-label="Floor view">
          <button
            aria-pressed={floorMode === 'scan'}
            tabIndex={floorView ? 0 : -1}
            onClick={() => setFloorMode('scan')}
          >
            Floor scan
          </button>
          <button
            aria-pressed={floorMode === 'edge'}
            tabIndex={floorView ? 0 : -1}
            onClick={() => setFloorMode('edge')}
          >
            Edge settlement
          </button>
        </div>
        {floorMode === 'scan' ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10px]">
              {scanBins.map((b) => (
                <span key={b.from} className="flex items-center gap-2">
                  <span className="floor-key-swatch" style={{ background: b.color }} />
                  {b.to === 100 ? `${b.from}% – 100%` : `${b.from}% – ${b.to}%`}
                </span>
              ))}
              <span className="flex items-center gap-2">
                <span className="floor-key-weld" style={{ background: WELD_DISCONTINUITY }} />
                Weld disc.
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
              <span className="flex items-center gap-2">
                <span className="floor-key-swatch floor-key-track" /> Scanned
              </span>
              <span className="flex items-center gap-2">
                <span className="floor-key-swatch floor-key-blank" /> Not scanned
              </span>
            </div>
            <div className="mt-3 border-t border-border pt-2 text-[9px] text-muted-foreground">
              Wall loss, % of nominal. Lower threshold {LOWER_THRESHOLD}%. Illustrative data.
            </div>
          </>
        ) : (
          <>
            <div className="mt-3 grid gap-1.5 text-[10px]">
              {(['Acceptable', 'NDE required', 'Exceeds', 'No edge settlement'] as EdgeStatus[]).map((k) => (
                <span key={k} className="flex items-center gap-2">
                  <span className="floor-key-swatch" style={{ background: statusColor[k] }} />
                  {k === 'Acceptable'
                    ? 'Acceptable (under 75% of allowable)'
                    : k === 'NDE required'
                      ? 'NDE required (75–100%)'
                      : k === 'Exceeds'
                        ? 'Exceeds allowable'
                        : 'No edge settlement (6 ft edge zone)'}
                  <span className="ml-auto font-mono text-muted-foreground">
                    {edgeStations.filter((st) => st.status === k).length}
                  </span>
                </span>
              ))}
            </div>
            <div className="mt-3 border-t border-border pt-2 text-[9px] text-muted-foreground">
              Coloured band is the settled width R; colour is B as a % of the Fig. B.11 / B.12
              allowable. Zoom in or tap a station to see its cross-section. Illustrative data.
            </div>
          </>
        )}
      </div>
      <div
        className={`floor-legend shell-panel ${shellOpen ? 'open' : ''}`}
        aria-hidden={!shellOpen}
        role="group"
        aria-label="Shell inspection"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="eyebrow">Shell inspection</span>
          {onShellView && (
            <button
              className="tool-button !px-2 !py-1 text-[10px]"
              onClick={() => onShellView(null)}
              tabIndex={shellOpen ? 0 : -1}
            >
              Show full tank
            </button>
          )}
        </div>
        <div className="shell-modes mt-3" role="group" aria-label="Shell view">
          {shellModes.map((m) => (
            <button
              key={m.id}
              aria-pressed={mode === m.id}
              tabIndex={shellOpen ? 0 : -1}
              onClick={() => onShellView?.(m.id)}
            >
              {m.name}
            </button>
          ))}
        </div>
        {mode === 'ut' && (
          <div className="mt-3 grid gap-1.5 text-[10px]">
            {utStatus.map((st) => (
              <span key={st.id} className="flex items-center gap-2">
                <span className="floor-key-swatch" style={{ background: st.fill }} />
                {st.label}
              </span>
            ))}
            <p className="mt-1 text-[9px] text-muted-foreground">
              {STATIONS.length} settlement stations, one reading every foot, inches. Nominal{' '}
              {NOM_IN[0].toFixed(3)} in (course 1) to {NOM_IN[NOM_IN.length - 1].toFixed(3)} in
              (course {NOM_IN.length}).
            </p>
          </div>
        )}
        {mode === 'aut' && (
          <div className="mt-3 text-[10px]">
            <div className="h-2.5 rounded-sm" style={{ background: autGradient }} />
            <div className="mt-1 flex justify-between font-mono text-[9px] text-muted-foreground">
              {ticks(autStops, 10, '%').map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
            <div className="mt-1 text-[9px] text-muted-foreground">Remaining wall, % of nominal</div>
            <span className="mt-2 flex items-center gap-2">
              <span className="floor-key-swatch" style={{ background: AUT_NODATA }} /> No data
              (girth weld caps)
            </span>
          </div>
        )}
        {mode === 'laser' && (
          <div className="mt-3 text-[10px]">
            <div className="h-2.5 rounded-sm" style={{ background: laserGradient }} />
            <div className="mt-1 flex justify-between font-mono text-[9px] text-muted-foreground">
              {ticks(laserStops, 20, '', true).map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
            <div className="mt-1 text-[9px] text-muted-foreground">
              Radial deviation from a true cylinder, mm (+ outward). Shape exaggerated ×
              {LASER_EXAGGERATION}.
            </div>
            <ul className="mt-2 grid gap-1">
              <li>Peaking at the vertical welds</li>
              <li>Banding at the girth welds</li>
              <li>
                Bulge, +{bulgeHeight} mm at {BULGE.deg}°, {BULGE.ft} ft up (course{' '}
                {Math.floor(BULGE.ft / 8) + 1})
              </li>
            </ul>
          </div>
        )}
        <div className="mt-3 border-t border-border pt-2 text-[9px] text-muted-foreground">
          Illustrative data.
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {edgeStations.map((st) => (
          <button
            key={st.no}
            ref={(node) => {
              edgePins.current[st.no] = node;
            }}
            onClick={() => setStation(st.no)}
            className={`edge-pin pointer-events-auto ${station === st.no ? 'active' : ''}`}
            style={{ display: 'none', borderColor: statusColor[st.status] }}
            aria-label={`Station ${st.no}, ${st.status}`}
          >
            <span className="dot" style={{ background: statusColor[st.status] }} />S{st.no}
            {st.pct !== null && <b>{Math.round(st.pct)}%</b>}
          </button>
        ))}
      </div>
      {floorView && floorMode === 'edge' && station !== null && (
        <EdgeStationPanel station={station} onClose={() => setStation(null)} onPick={setStation} />
      )}
      {error && (
        <div
          role="alert"
          className="absolute inset-0 flex items-center justify-center bg-background/90 p-12 text-center text-sm text-muted-foreground"
        >
          {error}
        </div>
      )}
    </>
  );
}
