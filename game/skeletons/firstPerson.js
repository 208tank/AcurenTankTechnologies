// CHANGE THIS FILE IN PLACE: it already runs and passes every check. It is the entry -- start(), the
// state machine, getState(). What you add may live here or in its own files under game/scenes/
// (for example world.js, entities.js, rules.js, config.js) -- your call. If you add files, wire them
// in at the imports below and thread their state into getState() so the playtest can see it.
/**
 * FIRST-PERSON skeleton: you are the eyes. A walled courtyard at dusk with lit beacons in it;
 * find every one. Mouse turns the head, WASD walks relative to where you look, Space sprints.
 *
 * What makes this shape different from `avatar`, and what the engine already owns for it:
 *   - `createLook(camera)` owns yaw and pitch. `look.step(input)` runs in step() before
 *     `walkDirection`, or the camera never turns; `look.set()` in reset(), or a restart keeps the
 *     heading the last run ended on. Never derive the camera's yaw from where the player moved.
 *   - `walkDirection(input, { move, look }, camera)` turns WASD into a world-space direction
 *     relative to the camera. It needs the look region named, or it warns and cannot work.
 *   - The body is an invisible capsule under the camera. The playtest measures the ACTOR --
 *     ground clearance, penetration, position -- and a camera has no feet; the capsule does.
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
import { createLook, walkDirection } from '../core/motion.js';
import { createShell } from '../core/shell.js';

// ---- tunables: change freely ---------------------------------------------------------------
const WORLD_RADIUS = 24;        // the courtyard: the player is confined inside this circle
const PLAYER_RADIUS = 0.5;
const EYE_HEIGHT = 1.6;         // camera above the feet
const SPEED = 6;                // walking, units per second; Space sprints
const BEACON_COUNT = 8;
const WALL_COUNT = 12;
const TOUCH_TURN_RATE = 2.4;    // radians per second at full drag, on a coarse pointer
const BEST_KEY = 'game3d.firstPerson.bestTime';

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

  // ---- sky & floor. Dusk, not night: the host's light rig is in physical units and the frame
  // must stay legible; the beacons carry the light the sky does not.
  scene.background = new THREE.Color(0x6f9ac4);
  scene.fog = new THREE.Fog(0x6f9ac4, WORLD_RADIUS * 1.4, WORLD_RADIUS * 3);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(WORLD_RADIUS * 2.5, 64),
    // Dusk courtyard: the same set, tinted further down so the lit beacons carry the frame.
    groundMaterial(host, { repeat: WORLD_RADIUS / 3, tint: 0x6f7a80 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  // ---- the courtyard wall: a ring seen from inside. Visual only -- the engine's createGround
  // owns the boundary -- and BackSide is what a room looks like from within.
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(WORLD_RADIUS + 0.6, WORLD_RADIUS + 0.6, 4.5, 48, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x5a5f6b, roughness: 0.9, side: THREE.BackSide }));
  ring.position.y = 2.25; ring.receiveShadow = true; scene.add(ring);

  // ---- collision & contacts come from the engine; the scene only registers shapes
  const solids = createSolids();
  const world = createGround(() => 0, { radius: WORLD_RADIUS });        // flat floor, circular boundary
  const contacts = createContacts();
  const unstick = createUnstick({ input, regions: ['move', 'touchMove'] });

  // ---- inner walls: slabs you cannot walk through, so finding the beacons means walking round
  // things. Nothing solid in the corridor straight ahead of the spawn (camera yaw 0 looks down -z):
  // the three seeded beacons live there, and a wall across one turns "push forward" into a stall.
  const walls = createWalls({ scene, solids, host, color: 0x7a6f66 });   // mesh + collision, one call
  const rng = (a, b) => a + Math.random() * (b - a);
  const inSpawnCorridor = (x, z, w, d) => Math.abs(x) < 3.5 + w / 2 && z < 1 + d / 2 && z > -17 - d / 2;
  for (let i = 0; i < WALL_COUNT; i++) {
    const along = Math.random() < 0.5;                 // slabs run along x or along z
    const w = along ? rng(3, 6) : 0.6, d = along ? 0.6 : rng(3, 6), h = rng(2.2, 3.2);
    let x = 0, z = 0;
    for (let tries = 0; tries < 20; tries++) {
      const r = rng(5, WORLD_RADIUS - 4), t = Math.random() * Math.PI * 2;
      x = Math.cos(t) * r; z = Math.sin(t) * r;
      if (!inSpawnCorridor(x, z, w, d)) break;
    }
    walls.box(x, z, w, d, { height: h });              // XZ only, FULL sizes
  }

  // ---- the player: an invisible body the camera rides on. You never see yourself in first
  // person, but the playtest needs feet to measure -- clearance, penetration, a position.
  const player = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(PLAYER_RADIUS * 0.7, 0.9, 6, 12),
    new THREE.MeshStandardMaterial({ color: 0x4fd1ff }));
  body.position.y = 0.95; body.visible = false; player.add(body);
  scene.add(player);
  const look = createLook(camera);                     // owns yaw and pitch; nothing else touches them

  // ---- beacons: a lit post with a glowing cap, registered with contacts so finding one is
  // measured by the engine. Emissive of their own colour so they read from across the yard.
  const beacons = [];
  const postGeo = host.track(new THREE.CylinderGeometry(0.12, 0.2, 2.0, 10));
  const capGeo = host.track(new THREE.SphereGeometry(0.38, 16, 12));
  const PALETTE = [0xffd23f, 0x3ddc97, 0xff6b6b, 0x4cc9f0, 0xc77dff];
  const beaconMats = PALETTE.map((c) => host.track(new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.2, roughness: 0.35 })));
  for (let i = 0; i < BEACON_COUNT; i++) {
    const b = new THREE.Group();
    const post = new THREE.Mesh(postGeo, beaconMats[i % beaconMats.length]); post.position.y = 1.0; b.add(post);
    const cap = new THREE.Mesh(capGeo, beaconMats[i % beaconMats.length]); cap.position.y = 2.2; cap.castShadow = true; b.add(cap);
    scene.add(b); beacons.push(b);
  }
  // Placed OUTSIDE every wall's footprint (+ player radius + margin), with a capped retry, so each
  // one is reachable. The total the HUD shows is beacons.length -- what exists, not the constant.
  // The first three stand straight ahead of the spawn, so pushing forward is rewarded at once.
  function placeBeacons() {
    beacons.forEach((b, i) => {
      let x = 0, z = 0;
      if (i < 3) {
        x = 0; z = -(5 + i * 4);
      } else {
        for (let tries = 0; tries < 30; tries++) {
          const r = rng(4, WORLD_RADIUS - 2.5), t = Math.random() * Math.PI * 2;
          x = Math.cos(t) * r; z = Math.sin(t) * r;
          if (!solids.blocked(x, z, PLAYER_RADIUS + 1.0)) break;
        }
      }
      b.position.set(x, 0, z); b.visible = true;
      if (!b.parent) scene.add(b);         // contacts.step() removes a found beacon from the scene
    });
  }

  // ---- state
  // The shell owns the phase: `shell.screen` IS which screen is up, so the screen the player
  // sees and the phase the playtest reads can never disagree. null means playing.
  const phase = () => shell.screen || 'playing';
  let found = 0, elapsed = 0, paused = false;
  let best = Number(safeGet(BEST_KEY)) || 0;
  const wasAt = new THREE.Vector3();
  let sprintUntil = 0;           // the primary action: a short burst of speed

  const coarse = input.coarsePointer();         // decided once per run, not per frame
  input.bindKeys('move');                       // WASD + arrows -> region 'move'
  input.bindKey('action', ['Space']);           // the primary action -> a sprint
  input.bindMouseLook('look');                  // mouse -> region 'look'; click the canvas to lock
  // Touch: left half walks, right half turns. Both stay declared on desktop too (zero-cost), so
  // the region list the playtest sees does not change shape with the pointer type.
  input.addRegion('touchMove', { x: 0, y: 0, w: 0.5, h: 1 });
  input.addRegion('touchLook', { x: 0.5, y: 0, w: 0.5, h: 1 });

  // ---- the shell: HUD, start and win screens, restart. One field drawn and reported.
  const shell = createShell(input, {
    mount: canvas.parentElement,
    fields: {
      found: { label: 'BEACONS', start: 0, total: () => beacons.length },
      time: { label: 'TIME', start: '0.0s' },
    },
    screens: {
      ready: { title: 'Beacons', hint: 'Find every beacon in the courtyard. Click, then move the mouse to look. WASD to walk, Space to sprint.', action: 'Start' },
      won: { title: 'All Found', action: 'Play Again' },
    },
    onAction: (from) => { if (from === 'ready') begin(); else restart(); },
  });

  // Registered ONCE per run under a group; a reset re-registers the group, never piles up.
  function registerContacts() {
    contacts.removeGroup('beacons');
    contacts.reset();
    for (const b of beacons) {
      contacts.pickup(b, { radius: 1.1, group: 'beacons', onTake: () => {
        found++;
        shell.set('found', found);
        if (found >= beacons.length) win();
      } });
    }
  }

  function reset() {
    move.set(0, 0, 0);            // or atRest reports false for the whole end screen
    player.position.set(0, 0, 0); wasAt.copy(player.position);
    look.set(0, 0);               // face down -z, level -- or a restart keeps the last heading
    found = 0; elapsed = 0; paused = false;
    shell.set('found', 0); shell.set('time', '0.0s');
    placeBeacons(); registerContacts();
    placeCamera();
    emit();
  }
  function begin() { if (!shell.screen) return; shell.hide(); emit(); }
  function win() {
    const newBest = !best || elapsed < best;
    if (newBest) { best = elapsed; safeSet(BEST_KEY, String(best)); }
    const line = `Found every beacon in ${elapsed.toFixed(1)}s`
      + (newBest ? ' -- a new best' : ` -- best ${best.toFixed(1)}s`);
    shell.show('won', { hint: line });
    emit(line);
  }
  function restart() { reset(); shell.hide(); emit(); }

  function emit(message) {
    onState({
      phase: phase(), progress: found, best: Math.round(best * 10) / 10,
      hud: { found: `${found} / ${beacons.length}`, time: elapsed.toFixed(1) + 's' },
      message,
    });
  }

  // The camera rides the body at eye height. Position only: createLook owns its rotation.
  function placeCamera() {
    camera.position.set(player.position.x, player.position.y + EYE_HEIGHT, player.position.z);
  }

  // ---- simulation: fixed step from the engine's loop
  const move = new THREE.Vector3();
  function step(dt) {
    if (shell.screen) return;              // a screen is up: the world is frozen behind it
    if (input.wentDown('Escape')) paused = !paused;
    if (paused) return;                                           // sim, input AND timer all frozen
    elapsed += dt;

    // LOOK FIRST, then walk relative to it. On a coarse pointer the right-half drag is a turn
    // RATE (hold to keep turning), fed into the same look the mouse drives.
    look.step(input);
    if (coarse) {
      const t = input.sample('touchLook');
      if (t.x || t.y) look.set(look.yaw - t.x * TOUCH_TURN_RATE * dt, look.pitch + t.y * TOUCH_TURN_RATE * 0.5 * dt);
    }
    move.copy(walkDirection(input, { move: coarse ? 'touchMove' : 'move', look: 'look' }, camera));
    wasAt.copy(player.position);
    // `held`, not `pressed`: the edge is cleared once per RENDERED frame while step() may run
    // several times per frame, so on a 120 Hz display about half of all presses were dropped.
    if (input.region('action').held && loop.simTime > sprintUntil) { sprintUntil = loop.simTime + 0.6; }
    const speed = loop.simTime < sprintUntil ? SPEED * 1.8 : SPEED;
    if (move.lengthSq() > 0) player.position.addScaledVector(move, speed * dt);
    player.position.copy(unstick.step(player.position, move.lengthSq() > 0 ? move : null, dt));   // nudges free when wedged
    // resolve() RETURNS the corrected position (it also writes it back): keep the copy() so the
    // intent is unmistakable -- a discarded result was walk-through walls in a real build.
    player.position.copy(solids.resolve(player.position, PLAYER_RADIUS, wasAt));   // slide along walls
    player.position.copy(world.confine(player.position, wasAt));   // stay inside the courtyard
    contacts.step(wasAt, player.position, { radius: PLAYER_RADIUS });

    for (const b of beacons) { b.children[1].position.y = 2.2 + Math.sin(loop.simTime * 2.5 + b.position.x) * 0.12; }
  }
  const loop = createLoop({
    step,
    render() {
      placeCamera();
      host.present();
    },
  });

  // WHERE THE OBJECTIVES ARE, in screen pixels. The automatic playtest STEERS toward whatever
  // this publishes; with nothing here it can only shove the player in one arbitrary direction.
  // project() returns null for anything behind the camera, so filter those out.
  const picker = createPicker({ canvas, camera });
  const capPos = new THREE.Vector3();
  const screenTargets = () => {
    const out = {};
    beacons.forEach((b, i) => {
      if (!b.parent) return;                     // already found
      b.children[1].getWorldPosition(capPos);    // the glowing cap, at eye height, not the base
      const p = picker.project(capPos);
      if (p) out['beacon' + i] = p;
    });
    return out;
  };

  const lifecycle = attachLifecycle({ canvas, loop, host });
  const facing = new THREE.Vector3();
  attachDiagnostics({
    host, loop, input, actor: player,
    // The checker's reset: back to a fresh world AND playing, so a run that just won is not
    // frozen at the end screen for every later measurement.
    reset: () => { reset(); if (shell.screen !== 'ready') { shell.hide(); emit(); } },
    getState: () => {
      look.forward(facing);
      return {
        view: 'firstPerson', started: !shell.screen, paused,
        progress: found, pos: [player.position.x, player.position.y, player.position.z],
        facing: [facing.x, facing.y, facing.z], yaw: look.yaw, groundY: 0, elapsed,
        atRest: move.lengthSq() === 0,            // nothing else in this world moves on its own
        screen: screenTargets(),                  // what the playtest walks toward
        ...contacts.report(),
        // LAST, so the phase and the HUD numbers come from the shell that drew them.
        ...shell.report(),
      };
    },
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
