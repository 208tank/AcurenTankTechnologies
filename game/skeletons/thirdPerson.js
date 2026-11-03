// CHANGE THIS FILE IN PLACE: it already runs and passes every check. It is the entry -- start(), the
// state machine, getState(). What you add may live here or in its own files under game/scenes/
// (for example world.js, entities.js, rules.js, config.js) -- your call. If you add files, wire them
// in at the imports below and thread their state into getState() so the playtest can see it.
/**
 * THIRD-PERSON skeleton: a character you move while the mouse swings the camera round it. A lit
 * world with props to walk round and gems to collect, a timer, a win screen and a restart.
 *
 * What makes this shape different from `avatar`, and what the engine already owns for it:
 *   - `createOrbit(camera)` owns the camera's yaw and pitch. `orbit.step(input)` runs in step()
 *     BEFORE `walkDirection`, `orbit.follow(player.position, dt)` in render(), `orbit.set()` in
 *     reset(), or a restart keeps the angle the last run ended on.
 *   - `walkDirection(input, { move, look }, camera)` IS the movement: W is away from the camera and
 *     D is screen-right at every camera angle. Never write the direction from the yaw by hand --
 *     that is where left and right get swapped.
 *   - `facing` is the CHARACTER: it turns to where it walks, and swinging the camera leaves it be.
 *   - `occluders: scene` pulls the camera in front of a wall instead of letting the wall fill the
 *     screen; `ignore: player` keeps the character itself from counting as one.
 *   - `bindMouseLook('look')` requests pointer lock on a canvas click and falls back to
 *     drag-to-look when the browser refuses. The game never waits for the lock.
 *
 * Everything else -- collision, the world boundary, pickups, the HUD and screens, the state the
 * playtest reads -- is the same engine and the same contract as every other shape.
 */
import * as THREE from 'three';
import { createHost } from '../core/host.js';
import { createLoop } from '../core/loop.js';
import { createInput } from '../core/input.js';
import { attachLifecycle } from '../core/lifecycle.js';
import { attachDiagnostics } from '../core/diagnostics.js';
import { createSolids, createGround, createUnstick, createWalls } from '../core/collide.js';
import { createPicker } from '../core/pick.js';
import { createContacts } from '../core/contact.js';
import { faceYaw, createOrbit, walkDirection } from '../core/motion.js';
import { createShell } from '../core/shell.js';

// ---- tunables: change freely ---------------------------------------------------------------
const WORLD_RADIUS = 28;        // the player is confined inside this circle
const PLAYER_RADIUS = 0.6;
const SPEED = 9;                // units per second
const PICKUP_COUNT = 10;
const PROP_COUNT = 14;
const TOUCH_TURN_RATE = 2.4;    // radians per second at full drag, on a coarse pointer
const BEST_KEY = 'game3d.thirdPerson.bestTime';

const GROUND_TEX = 'aerial_grass_rock';   // public/textures/, fetched at install; see ASSETS.md

/** The starter ground: the CC0 PBR set fetched into `public/textures/` when the template was
 *  installed (Poly Haven, `aerial_grass_rock`), recorded in `public/textures/ASSETS.md`. THREE maps,
 *  not one -- a colour map on its own leaves every surface perfectly smooth under the light, which
 *  is what "it looks generated" means. Fetch the sets your own world needs the same way; a texture
 *  drawn on a canvas is a flat colour with a picture on it. `tint` darkens the floor so lit pickups
 *  and hazards still read against it -- one deliberate multiplier, never a second one on top. */
function groundMaterial(host, { repeat = 8, tint = 0x9aa39a } = {}) {
  const load = (suffix, srgb = false) => {
    const t = host.track(new THREE.TextureLoader().load(
      `/textures/${GROUND_TEX}_${suffix}_1k.jpg`, undefined, undefined, () => {}));
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);            // sized to the WORLD, not to the mesh
    t.anisotropy = Math.min(8, host.renderer.capabilities.getMaxAnisotropy());
    return t;
  };
  return host.track(new THREE.MeshStandardMaterial({
    color: tint, map: load('diff', true), normalMap: load('nor_gl'), roughnessMap: load('rough'), roughness: 1,
  }));
}

export function start(canvas, { onState = () => {}, onError = () => {} } = {}) {
  const host = createHost({ canvas, captureFrames: true, onError });
  const { scene, camera } = host;
  const input = createInput(canvas);

  // ---- sky & ground. The engine already placed a hemisphere fill and a shadow-casting sun.
  scene.background = new THREE.Color(0x87c4e8);
  scene.fog = new THREE.Fog(0x87c4e8, WORLD_RADIUS * 1.6, WORLD_RADIUS * 3.2);   // hides the world's edge
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(WORLD_RADIUS * 2.5, 64),
    groundMaterial(host, { repeat: WORLD_RADIUS / 3 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  // ---- collision & contacts come from the engine; the scene only registers shapes
  const solids = createSolids();
  const world = createGround(() => 0, { radius: WORLD_RADIUS });        // flat world, circular boundary
  const contacts = createContacts();
  // BOTH regions: step() samples 'touchMove' on a coarse pointer, and unstick only nudges while
  // the player is commanding -- so listing 'move' alone left the recovery dead on every phone.
  const unstick = createUnstick({ input, regions: ['move', 'touchMove'] });

  // ---- props the player cannot walk through: ONE call draws the block and registers its
  // collision, so what you see is exactly what blocks you.
  const walls = createWalls({ scene, solids, host, color: 0x8a6a4a });
  const rng = (a, b) => a + Math.random() * (b - a);
  // Nothing solid in the corridor straight ahead of the spawn (|x| < 3.5, -17 < z < 1): the three
  // seeded pickups live there, and a box on top of one turns "push forward" into a stall.
  const inSpawnCorridor = (x, z, s) => Math.abs(x) < 3.5 + s / 2 && z < 1 + s / 2 && z > -17 - s / 2;
  for (let i = 0; i < PROP_COUNT; i++) {
    const s = rng(1.2, 2.6), h = rng(1, 3);
    let x = 0, z = 0;
    for (let tries = 0; tries < 20; tries++) {
      const r = rng(6, WORLD_RADIUS - 3), t = Math.random() * Math.PI * 2;
      x = Math.cos(t) * r; z = Math.sin(t) * r;
      if (!inSpawnCorridor(x, z, s)) break;
    }
    walls.box(x, z, s, s, { height: h });
  }

  // ---- the player: composed primitives, faces its movement direction
  const player = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(PLAYER_RADIUS * 0.7, 0.9, 6, 12),
    new THREE.MeshStandardMaterial({ color: 0x4fd1ff, emissive: 0x1a4a66, emissiveIntensity: 0.4, roughness: 0.4 }));
  body.position.y = 0.95; body.castShadow = true; player.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 12),
    new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0x663300, emissiveIntensity: 0.5 }));
  nose.rotation.x = Math.PI / 2; nose.position.set(0, 1.1, 0.55); player.add(nose);   // points along +z = "forward"
  scene.add(player);

  // ---- pickups: registered with contacts so collecting is measured by the engine
  const pickups = [];
  const pickupGeo = host.track(new THREE.OctahedronGeometry(0.45, 0));
  // Saturated and self-lit (emissive of its own colour, intensity 2) so each pickup reads against
  // the dark floor from across the arena; a palette, so pickup types can be told apart.
  const PALETTE = [0xffd23f, 0x3ddc97, 0xff6b6b, 0x4cc9f0, 0xc77dff];
  const pickupMats = PALETTE.map((c) => host.track(new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.0, metalness: 0.2, roughness: 0.35 })));
  for (let i = 0; i < PICKUP_COUNT; i++) {
    const m = new THREE.Mesh(pickupGeo, pickupMats[i % pickupMats.length]); m.castShadow = true; scene.add(m); pickups.push(m);
  }
  // Placed OUTSIDE every solid's radius (+ player radius + margin), with a capped retry, so each
  // one is reachable. The total the HUD shows is pickups.length -- what exists, not the constant.
  // The first three sit straight ahead of the spawn, so the very first thing a player (or the
  // checker) does -- push forward -- is rewarded, and progress is visible within seconds.
  function placePickups() {
    pickups.forEach((m, i) => {
      let x = 0, z = 0;
      if (i < 3) {
        x = 0; z = -(5 + i * 4);
      } else {
        for (let tries = 0; tries < 30; tries++) {
          const r = rng(4, WORLD_RADIUS - 2), t = Math.random() * Math.PI * 2;
          x = Math.cos(t) * r; z = Math.sin(t) * r;
          if (!solids.blocked(x, z, PLAYER_RADIUS + 0.9)) break;
        }
      }
      m.position.set(x, 1, z); m.visible = true;
      if (!m.parent) scene.add(m);        // contacts.step() removes a taken pickup from the scene
    });
  }

  // ---- state
  // The shell owns the phase: `shell.screen` IS which screen is up, so the screen the player
  // sees and the phase the playtest reads can never disagree. null means playing.
  const phase = () => shell.screen || 'playing';
  let collected = 0, elapsed = 0, paused = false;
  let best = Number(safeGet(BEST_KEY)) || 0;
  const facing = new THREE.Vector3(0, 0, 1);
  const wasAt = new THREE.Vector3();
  // The camera the mouse swings round the character. It owns the yaw; the scene never keeps one.
  const orbit = createOrbit(camera, { occluders: scene, ignore: player, groundAt: world.at });
  let dashUntil = 0;             // the primary action: a short burst of speed

  const coarse = input.coarsePointer();         // decided once per run, not per frame
  input.bindKeys('move');                       // WASD + arrows -> region 'move'
  input.bindKey('action', ['Space']);           // the primary action -> a dash
  input.bindMouseLook('look');                  // mouse -> region 'look'; click the canvas to lock
  // Touch: left half walks, right half swings the camera. Both stay declared on desktop too
  // (zero-cost), so the region list the playtest sees does not change shape with the pointer type.
  input.addRegion('touchMove', { x: 0, y: 0, w: 0.5, h: 1 });
  input.addRegion('touchLook', { x: 0.5, y: 0, w: 0.5, h: 1 });

  // ---- the shell: HUD, start and win screens, restart.
  // The numbers drawn here are the numbers reported to the playtest -- one field, not two -- and
  // the button is registered as an input region, so a start screen that cannot be clicked FAILS
  // instead of shipping. `total` is a function so the HUD counts the pickups that EXIST.
  const shell = createShell(input, {
    mount: canvas.parentElement,
    fields: {
      collected: { label: 'GEMS', start: 0, total: () => pickups.length },
      time: { label: 'TIME', start: '0.0s' },
    },
    screens: {
      ready: { title: 'Ready', hint: 'Collect every gem. Click, then move the mouse to swing the camera. WASD to move, Space to dash.', action: 'Start' },
      won: { title: 'You Win', action: 'Play Again' },
    },
    onAction: (from) => { if (from === 'ready') begin(); else restart(); },
  });

  // Registered ONCE per run under a group. The engine removes a taken pickup from the scene
  // and from its list, so a reset re-adds the meshes and re-registers the group -- never
  // pile up registrations across resets (an earlier draft reached 122 entries for 10 meshes).
  function registerContacts() {
    contacts.removeGroup('pickups');
    contacts.reset();
    for (const m of pickups) {
      contacts.pickup(m, { radius: 0.9, group: 'pickups', onTake: () => {
        collected++;
        shell.set('collected', collected);
        if (collected >= pickups.length) win();
      } });
    }
  }

  function reset() {
    move.set(0, 0, 0);            // or atRest reports false for the whole end screen
    player.position.set(0, 0, 0); wasAt.copy(player.position);
    facing.set(0, 0, 1); faceYaw(player, 0);
    collected = 0; elapsed = 0; paused = false;
    shell.set('collected', 0); shell.set('time', '0.0s');
    placePickups(); registerContacts();
    orbit.set(Math.PI);           // behind the character, looking down -z at the first gems
    emit();
  }
  function begin() { if (!shell.screen) return; shell.hide(); emit(); }
  function win() {
    const newBest = !best || elapsed < best;
    if (newBest) { best = elapsed; safeSet(BEST_KEY, String(best)); }
    const line = `Collected everything in ${elapsed.toFixed(1)}s`
      + (newBest ? ' -- a new best' : ` -- best ${best.toFixed(1)}s`);
    shell.show('won', { hint: line });      // the run's own numbers, on the screen that ends it
    emit(line);
  }
  function restart() { reset(); shell.hide(); emit(); }

  function emit(message) {
    onState({
      phase: phase(), progress: collected, best: Math.round(best * 10) / 10,
      hud: { collected: `${collected} / ${pickups.length}`, time: elapsed.toFixed(1) + 's' },
      message,
    });
  }

  // ---- simulation: fixed step from the engine's loop
  const move = new THREE.Vector3();
  function step(dt) {
    if (shell.screen) return;              // a screen is up: the world is frozen behind it
    if (input.wentDown('Escape')) paused = !paused;
    if (paused) return;                                           // sim, input AND timer all frozen
    elapsed += dt;

    // LOOK FIRST, then walk relative to it: the orbit aims the camera, walkDirection reads it. On a
    // coarse pointer the right-half drag is a turn RATE (hold to keep turning).
    orbit.step(input);
    if (coarse) {
      const t = input.sample('touchLook');
      if (t.x || t.y) orbit.set(orbit.yaw - t.x * TOUCH_TURN_RATE * dt, orbit.pitch - t.y * TOUCH_TURN_RATE * 0.5 * dt);
    }
    move.copy(walkDirection(input, { move: coarse ? 'touchMove' : 'move', look: 'look' }, camera));
    wasAt.copy(player.position);
    // `held` with a cooldown, so holding the key keeps dashing: one burst every 0.35 s. The
    // cooldown is what stops a held key from re-triggering on every step.
    if (input.region('action').held && loop.simTime > dashUntil) { dashUntil = loop.simTime + 0.35; }
    const speed = loop.simTime < dashUntil ? SPEED * 2.2 : SPEED;
    if (move.lengthSq() > 0) {
      move.normalize();
      facing.copy(move); faceYaw(player, Math.atan2(move.x, move.z));
      player.position.addScaledVector(move, speed * dt);
    }
    player.position.copy(unstick.step(player.position, move.lengthSq() > 0 ? move : null, dt));   // nudges free when wedged
    // resolve() RETURNS the corrected position (it also writes it back): keep the copy() so the
    // intent is unmistakable -- a discarded result was walk-through walls in a real build.
    player.position.copy(solids.resolve(player.position, PLAYER_RADIUS, wasAt));   // slide along props
    player.position.copy(world.confine(player.position, wasAt));   // stay inside the world
    contacts.step(wasAt, player.position, { radius: PLAYER_RADIUS });

    for (const m of pickups) { m.rotation.y += dt * 2; m.position.y = 1 + Math.sin(loop.simTime * 3 + m.position.x) * 0.15; }
  }
  let lastFrame = 0;
  const loop = createLoop({
    step,
    render() {
      const now = performance.now();
      const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 1 / 60;
      lastFrame = now;
      orbit.follow(player.position, dt);
      host.present();
    },
  });

  // WHERE THE OBJECTIVES ARE, in screen pixels. The automatic playtest STEERS toward whatever
  // this publishes; with nothing here it can only shove the player in one arbitrary direction,
  // and a level with a wall in that direction measures as a game that cannot move at all.
  // project() returns null for anything behind the camera, so filter those out.
  const picker = createPicker({ canvas, camera });
  const screenTargets = () => {
    const out = {};
    pickups.forEach((m, i) => {
      if (!m.parent) return;                     // already taken
      const p = picker.project(m.position);
      if (p) out['pickup' + i] = p;
    });
    return out;
  };

  const lifecycle = attachLifecycle({ canvas, loop, host });
  attachDiagnostics({
    host, loop, input, actor: player,
    // The checker's reset: back to a fresh world AND playing, so a run that just won is not
    // frozen at the end screen for every later measurement.
    reset: () => { reset(); if (shell.screen !== 'ready') { shell.hide(); emit(); } },
    getState: () => ({
      view: 'thirdPerson', started: !shell.screen, paused,
      progress: collected, pos: [player.position.x, player.position.y, player.position.z],
      facing: [facing.x, facing.y, facing.z], groundY: 0, elapsed,
      atRest: move.lengthSq() === 0,            // nothing else in this world moves on its own
      screen: screenTargets(),                  // what the playtest walks toward
      ...contacts.report(),
      // LAST, so the phase and the HUD numbers come from the shell that drew them.
      ...shell.report(),
    }),
  });

  shell.show('ready');
  reset();
  loop.start();
  // Report the HUD at a steady 10 Hz; React must never be asked to re-render every frame.
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
