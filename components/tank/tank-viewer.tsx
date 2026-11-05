'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildTank, palette } from './build-tank';
import { SCALE_MAX, scanGradient } from './floor-scan';
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
};
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
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const pins = useRef<Partial<Record<Section, HTMLButtonElement | null>>>({});
  const pick = useRef(onSelect);
  const selection = useRef(selected);
  const labelState = useRef(labels);
  const floorState = useRef(floorView);
  const api = useRef<{
    focus: (s: Section) => void;
    reset: () => void;
    floor: (open: boolean) => void;
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
    // Materials of everything above the floor, with their normal opacity, for fading.
    const upperMats = new Map<THREE.Material, { opacity: number; transparent: boolean }>();
    tank.upper.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (!m) return;
      for (const mat of Array.isArray(m) ? m : [m])
        upperMats.set(mat, { opacity: mat.opacity, transparent: mat.transparent });
    });
    // 0 = whole tank … 1 = floor open. Always starts closed and animates to the target,
    // so a rebuild (tank type or cutaway change) replays the reveal.
    let reveal = 0;
    let revealTarget = floorState.current ? 1 : 0;
    let fading = false;
    let shadows = true;
    function applyReveal(t: number) {
      const lift = smooth(0, 0.55, t);
      const fade = 1 - smooth(0.04, 0.45, t);
      tank.upper.position.y = lift * 9;
      tank.upper.visible = fade > 0.005;
      const nowFading = t > 0;
      for (const [mat, base] of upperMats) {
        if (nowFading !== fading) {
          mat.transparent = nowFading || base.transparent;
          mat.needsUpdate = true;
        }
        mat.opacity = base.opacity * (nowFading ? fade : 1);
      }
      fading = nowFading;
      const wantShadows = t < 0.2;
      if (wantShadows !== shadows) {
        shadows = wantShadows;
        tank.upper.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) o.castShadow = wantShadows;
        });
      }
      tank.floorScan.setReveal(smooth(0.3, 1, t));
    }
    applyReveal(0);
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
      return ray.intersectObjects(tank.targets, false)?.[0]?.object?.userData?.section as
        | Section
        | undefined;
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
        if (open) {
          // Swing down over the floor, keeping the direction the user was looking from.
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
        } else if (!tween) {
          api.current?.focus(selection.current);
        }
      },
    };
    if (revealTarget) api.current.floor(true);
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
      if (reveal !== revealTarget) {
        const step = dt / REVEAL_TIME;
        // Closing runs a little faster than opening.
        reveal =
          revealTarget > reveal
            ? Math.min(revealTarget, reveal + step)
            : Math.max(revealTarget, reveal - step * 1.6);
        applyReveal(reveal);
      }
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
          (type === 'efr' && s.id === 'roof') ||
          p.z > 1 ||
          p.z < -1;
        pin.style.display = hidden ? 'none' : 'flex';
        pin.style.left = `${(p.x * 0.5 + 0.5) * 100}%`;
        pin.style.top = `${(-p.y * 0.5 + 0.5) * 100}%`;
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
        aria-label="Floor scan legend"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="eyebrow">MFL floor scan · C-scan</span>
          {onCloseFloor && (
            <button className="tool-button !px-2 !py-1 text-[10px]" onClick={onCloseFloor} tabIndex={floorView ? 0 : -1}>
              Show full tank
            </button>
          )}
        </div>
        <div className="mt-3 h-2.5 rounded-sm" style={{ background: scanGradient }} />
        <div className="mt-1 flex justify-between font-mono text-[9px] text-muted-foreground">
          {[0, 20, 40, 60, SCALE_MAX].map((v) => (
            <span key={v}>{v === SCALE_MAX ? `${v}%+` : `${v}%`}</span>
          ))}
        </div>
        <div className="mt-1 text-[9px] text-muted-foreground">Wall loss, % of nominal plate thickness</div>
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px]">
          <span className="flex items-center gap-1.5">
            <span className="floor-key-dot" /> Topside (product side)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="floor-key-diamond" /> Underside (soil side)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="floor-key-hatch" /> Not scanned
          </span>
          <span className="flex items-center gap-1.5">
            <span className="floor-key-patch" /> Repair patch
          </span>
        </div>
        <div className="mt-3 border-t border-border pt-2 text-[9px] text-muted-foreground">
          Pins mark calls of 40% and over. Illustrative data.
        </div>
      </div>
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
