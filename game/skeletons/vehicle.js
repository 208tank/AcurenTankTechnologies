// CHANGE THIS FILE IN PLACE: it already runs and passes every check. It is the entry -- start(), the
// state machine, getState(). What you add may live here or in its own files under game/scenes/
// (for example world.js, entities.js, rules.js, config.js) -- your call. If you add files, wire them
// in at the imports below and thread their state into getState() so the playtest can see it.
/**
 * VEHICLE skeleton: you drive it. Three laps of a closed circuit with barriers both sides and two
 * rivals on the racing line. Throttle and steer, camera behind the car and turning WITH it.
 *
 * What makes this shape different from `avatar`, and what the engine already owns for it:
 *   - `tankDrive(input, 'drive', yaw, { dt, camera })` -- x TURNS, y DRIVES. It returns the new yaw
 *     and a velocity along the heading; you must USE both. The heading is its own state, changed
 *     only by the steer input. Never derive it from where the car happened to move: that feedback
 *     loop shipped in three consecutive generated racers with the rule in front of them.
 *   - `followCam(camera, car.position, yaw, { back, height })` -- THE camera that rotates. It sits
 *     behind the car along the same yaw the car drives on, so the two can never disagree.
 *   - `createBodies()` -- ACTORS THAT MUST NOT OVERLAP. Rivals are bodies, `bodies.separate()`
 *     runs once a frame after everything has moved, and `...bodies.report()` goes in getState().
 *     Four generated racers in a row left this out on purpose ("AI cars only follow waypoints")
 *     and every one shipped a game you drive straight through.
 *   - Waypoints published in `screen:` are what let the playtest drive a LAP instead of holding
 *     the throttle into the first barrier.
 *
 * Everything else -- barriers as solids, the world boundary, the HUD and screens, the state the
 * playtest reads -- is the same engine and the same contract as every other shape.
 */
import * as THREE from 'three';
import { createHost } from '../core/host.js';
import { createLoop } from '../core/loop.js';
import { createInput } from '../core/input.js';
import { attachLifecycle } from '../core/lifecycle.js';
import { attachDiagnostics } from '../core/diagnostics.js';
import { createSolids, createGround, createUnstick, createBodies, createWalls } from '../core/collide.js';
import { createPicker } from '../core/pick.js';
import { createContacts } from '../core/contact.js';
import { tankDrive, faceYaw, followCam } from '../core/motion.js';
import { createShell } from '../core/shell.js';

// ---- tunables: change freely ---------------------------------------------------------------
const RX = 26, RZ = 18, HALF = 7;   // oval radii and half the track width
const WAYPOINTS = 24;               // the racing line, and what the playtest steers toward
const SPEED = 11;                   // units per second at full throttle
const TURN_RATE = 1.9;              // radians per second at full steer; turn radius SPEED/TURN_RATE ~ 6
const LAPS = 3;
const RIVAL_COUNT = 2;
const CAR_RADIUS = 1.4;
const BEST_KEY = 'game3d.vehicle.bestTime';

export function start(canvas, { onState = () => {}, onError = () => {} } = {}) {
  const host = createHost({ canvas, captureFrames: true, onError });
  const { scene, camera } = host;
  const input = createInput(canvas);

  // ---- sky & ground: infield and outfield are the same dark grass, the track is a lighter band
  scene.background = new THREE.Color(0x8ea9c4);
  scene.fog = new THREE.Fog(0x8ea9c4, 70, 160);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140),
    new THREE.MeshStandardMaterial({ color: 0x3f4d35, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const track = new THREE.Mesh(new THREE.RingGeometry(1 - HALF / Math.hypot(RX, RZ), 1 + HALF / Math.hypot(RX, RZ), 96),
    new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.9 }));
  track.scale.set(RX, RZ, 1); track.rotation.x = -Math.PI / 2; track.position.y = 0.02;
  track.receiveShadow = true; scene.add(track);

  // ---- collision & contacts come from the engine; the scene only registers shapes
  const solids = createSolids();
  const world = createGround(() => 0, { radius: Math.max(RX, RZ) + HALF + 6 });
  const contacts = createContacts();
  const bodies = createBodies();
  const unstick = createUnstick({ input, regions: ['drive', 'touchDrive'] });

  // ---- the racing line, and barriers along both edges of it
  const waypoints = [];
  const walls = createWalls({ scene, solids, host, color: 0xc94a4a, height: 1.2 });   // barrier + its collision, one call
  for (let i = 0; i < WAYPOINTS; i++) {
    const a = (i / WAYPOINTS) * Math.PI * 2;
    waypoints.push(new THREE.Vector3(Math.cos(a) * RX, 1, Math.sin(a) * RZ));
    for (const k of [1 - HALF / Math.hypot(RX, RZ), 1 + HALF / Math.hypot(RX, RZ)]) {
      const bx = Math.cos(a) * RX * k, bz = Math.sin(a) * RZ * k;
      walls.box(bx, bz, 2.4, 2.4);                     // XZ only, FULL sizes
    }
  }
  // The start/finish gate is a PICKUP: crossing it is measured by the engine, and it is re-armed
  // every lap by putting it back -- the same way a collected coin comes back on a restart.
  const gate = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 - 1, 0.3, 0.6),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.2 }));
  gate.position.set(RX, 0.15, 0); scene.add(gate);

  // ---- the car, and rivals that must not overlap it
  const carGeo = new THREE.BoxGeometry(1.8, 0.8, 3.4);
  const car = new THREE.Mesh(carGeo, new THREE.MeshStandardMaterial({ color: 0x3a7ae8, roughness: 0.5 }));
  car.castShadow = true; scene.add(car);
  bodies.add(car, { radius: CAR_RADIUS, mass: 1 });
  const rivals = [];
  const RIVAL_COLOURS = [0xe8a13a, 0x8ad06a, 0xd06a9e];
  for (let i = 0; i < RIVAL_COUNT; i++) {
    const m = new THREE.Mesh(carGeo, new THREE.MeshStandardMaterial({ color: RIVAL_COLOURS[i % 3], roughness: 0.5 }));
    m.castShadow = true; scene.add(m);
    rivals.push({ mesh: m, next: 1, speed: SPEED * (0.8 + i * 0.08) });   // a touch slower than a clean lap
    bodies.add(m, { radius: CAR_RADIUS, mass: 1 });
  }

  // ---- state
  // The shell owns the phase: `shell.screen` IS which screen is up. null means racing.
  const phase = () => shell.screen || 'playing';
  let yaw = 0, odo = 0, next = 1, lap = 0, elapsed = 0, paused = false, throttle = 0;
  let best = Number(safeGet(BEST_KEY)) || 0;
  const wasAt = new THREE.Vector3();

  const coarse = input.coarsePointer();
  input.bindKeys('drive');                      // W/S throttle, A/D steer -> region 'drive'
  input.bindKey('brake', ['Space', 'ShiftLeft', 'ShiftRight']);
  input.addRegion('touchDrive', { x: 0, y: 0, w: 1, h: 1 });   // drag anywhere on a touch device

  // ---- the shell: HUD, start and finish screens, restart. One field drawn and reported.
  const shell = createShell(input, {
    mount: canvas.parentElement,
    fields: {
      lap: { label: 'LAP', start: 0, total: () => LAPS },
      time: { label: 'TIME', start: '0.0s' },
    },
    screens: {
      ready: { title: 'Circuit', hint: `${LAPS} laps against the clock. W and S for throttle, A and D to steer, Space to brake.`, action: 'Race' },
      won: { title: 'Finished', action: 'Race Again' },
    },
    onAction: (from) => { if (from === 'ready') begin(); else restart(); },
  });

  // The car SPAWNS on the line, so the gate is not live until the car has reached the far side
  // of the oval -- otherwise the first sweep counts three laps before the wheels have turned.
  // It re-arms the same way after every crossing, so a lap is always a whole lap.
  let gateArmed = false;
  function armGate() {
    gateArmed = true;
    contacts.removeGroup('gate');
    gate.position.set(RX, 0.15, 0); gate.visible = true; if (!gate.parent) scene.add(gate);
    contacts.pickup(gate, { radius: HALF, group: 'gate', onTake: () => {
      gateArmed = false;
      lap++; shell.set('lap', lap);
      if (lap >= LAPS) win();
    } });
  }
  function disarmGate() {
    gateArmed = false;
    contacts.removeGroup('gate'); contacts.reset();
    gate.position.set(RX, 0.15, 0); gate.visible = true; if (!gate.parent) scene.add(gate);   // the line stays visible
  }

  function placeCars() {
    car.position.set(RX, 0.4, 0); yaw = 0; faceYaw(car, yaw);   // tangent to the oval, not into the wall
    rivals.forEach((rv, i) => {
      const a = -((i + 1) * 0.2);                 // staggered back along the racing line
      rv.mesh.position.set(Math.cos(a) * RX, 0.4, Math.sin(a) * RZ); rv.next = 1;
    });
  }
  function reset() {
    odo = 0; next = 1; lap = 0; elapsed = 0; paused = false; throttle = 0;
    shell.set('lap', 0); shell.set('time', '0.0s');
    placeCars(); wasAt.copy(car.position);
    disarmGate();
    followCam(camera, car.position, yaw, { back: 11, height: 6, lookHeight: 1, lerp: 0 });
    emit();
  }
  function begin() { if (!shell.screen) return; shell.hide(); emit(); }
  function win() {
    const newBest = !best || elapsed < best;
    if (newBest) { best = elapsed; safeSet(BEST_KEY, String(best)); }
    const line = `${LAPS} laps in ${elapsed.toFixed(1)}s` + (newBest ? ' -- a new best' : ` -- best ${best.toFixed(1)}s`);
    shell.show('won', { hint: line });
    emit(line);
  }
  function restart() { reset(); shell.hide(); emit(); }

  function emit(message) {
    onState({
      phase: phase(), progress: lap, best: Math.round(best * 10) / 10,
      hud: { lap: `${lap} / ${LAPS}`, time: elapsed.toFixed(1) + 's' },
      message,
    });
  }

  // ---- simulation: fixed step from the engine's loop
  function step(dt) {
    if (shell.screen) return;              // a screen is up: the race is frozen behind it
    if (input.wentDown('Escape')) paused = !paused;
    if (paused) return;
    elapsed += dt;

    wasAt.copy(car.position);
    // x turns, y drives; the heading is state that only the steer input changes.
    const m = tankDrive(input, coarse ? 'touchDrive' : 'drive', yaw, { dt, camera, turnRate: TURN_RATE });
    yaw = m.yaw; faceYaw(car, yaw);
    const braking = input.region('brake').held;
    throttle = m.throttle;
    car.position.addScaledVector(m.velocity, (braking ? SPEED * 0.3 : SPEED) * dt);
    car.position.copy(unstick.step(car.position, m.velocity.lengthSq() > 0 ? m.velocity : null, dt));
    // resolve() RETURNS the corrected position (it also writes it back): slide along the barriers.
    car.position.copy(solids.resolve(car.position, CAR_RADIUS * 0.85, wasAt));
    car.position.copy(world.confine(car.position, wasAt));
    odo += Math.hypot(car.position.x - wasAt.x, car.position.z - wasAt.z);
    if (car.position.distanceTo(waypoints[next]) < HALF) next = (next + 1) % waypoints.length;
    if (!gateArmed && next >= WAYPOINTS / 2) armGate();          // far side reached: the line is live

    for (const rv of rivals) {
      const wp = waypoints[rv.next];
      const dx = wp.x - rv.mesh.position.x, dz = wp.z - rv.mesh.position.z;
      const d = Math.hypot(dx, dz) || 1;
      rv.mesh.position.x += (dx / d) * rv.speed * dt;
      rv.mesh.position.z += (dz / d) * rv.speed * dt;
      rv.mesh.rotation.y = Math.atan2(dx, dz);
      if (d < HALF * 0.8) rv.next = (rv.next + 1) % waypoints.length;
    }
    bodies.separate();                       // rivals and the car push apart instead of overlapping
    car.position.y = 0.4; for (const rv of rivals) rv.mesh.position.y = 0.4;
    contacts.step(wasAt, car.position, { radius: CAR_RADIUS });
  }
  const loop = createLoop({
    step,
    render() {
      // Behind the car along ITS yaw: the camera turns because the car did, never the reverse.
      followCam(camera, car.position, yaw, { back: 11, height: 6, lookHeight: 1, lerp: 0 });
      host.present();
    },
  });

  // WHERE TO GO NEXT, in screen pixels: the next three waypoints. The automatic playtest steers
  // toward these; without them it can only hold the throttle into the first barrier.
  const picker = createPicker({ canvas, camera });
  const screenTargets = () => {
    const out = {};
    for (let k = 0; k < 3; k++) {
      const p = picker.project(waypoints[(next + k) % waypoints.length]);
      if (p) out['wp' + k] = p;
    }
    return out;
  };

  const lifecycle = attachLifecycle({ canvas, loop, host });
  attachDiagnostics({
    host, loop, input, actor: car,
    reset: () => { reset(); if (shell.screen !== 'ready') { shell.hide(); emit(); } },
    getState: () => ({
      view: 'vehicle', started: !shell.screen, paused,
      progress: +odo.toFixed(1), pos: [car.position.x, car.position.y, car.position.z],
      facing: [Math.sin(yaw), 0, Math.cos(yaw)], yaw, groundY: 0, elapsed,
      speed: +(Math.abs(throttle) * SPEED).toFixed(2), lap,
      // atRest is deliberately not reported: the rivals keep racing while the player sits still,
      // so "the world settles" is not a property this shape has. The check skips by design.
      screen: screenTargets(),
      ...contacts.report(),
      ...bodies.report(),
      // LAST, so the phase and the HUD numbers come from the shell that drew them.
      ...shell.report(),
    }),
  });

  shell.show('ready');
  reset();
  loop.start();
  const hudTimer = setInterval(() => {
    if (shell.screen) return;
    shell.set('time', elapsed.toFixed(1) + 's');
    emit();
  }, 100);

  return {
    start: begin,
    restart,
    dispose() {
      clearInterval(hudTimer);
      loop.stop(); shell.dispose(); lifecycle.dispose(); input.dispose(); host.dispose();
    },
  };
}

function safeGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
