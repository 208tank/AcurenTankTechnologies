// CHANGE THIS FILE IN PLACE: it already runs and passes every check. It is the entry -- start(), the
// state machine, getState(). What you add may live here or in its own files under game/scenes/
// (for example world.js, entities.js, rules.js, config.js) -- your call. If you add files, wire them
// in at the imports below and thread their state into getState() so the playtest can see it.
/**
 * ON-RAILS skeleton: the world is carried past you. An endless three-lane road; you switch lanes
 * to take the coins and miss the blocks. Three lives, and the score is how many coins you took.
 *
 * What makes this shape different from `avatar`, and what the engine already owns for it:
 *   - The player does not move forward; THE WORLD DOES. Every chunk's meshes advance toward the
 *     camera each frame and are recycled behind it. The recycle keys on an ACCUMULATED chunk
 *     offset, never on a spawn counter times a fixed length -- a shipped runner did the latter,
 *     and the road opened into growing holes after ten seconds of play because the two drifted.
 *   - `contacts.step(wasAt, pos)` sweeps the RELATIVE motion of player and item, so a coin is still
 *     taken when the world passes a stationary player at 30 m/s -- a hand-written `dist < 1` steps
 *     straight over it at that speed. Recycled chunks call `contacts.removeGroup(chunk)`, or the
 *     props that left the screen stay touchable.
 *   - `laneDelta(camera, 'right')` answers "which WORLD direction is screen-right", so a lane
 *     change goes the way the finger or key went whatever the camera is doing.
 *   - The camera is FIXED. Nothing here turns; facing is the rail's direction.
 *
 * Everything else -- the HUD and screens, the state the playtest reads -- is the same engine and
 * the same contract as every other shape.
 */
import * as THREE from 'three';
import { createHost } from '../core/host.js';
import { createLoop } from '../core/loop.js';
import { createInput } from '../core/input.js';
import { attachLifecycle } from '../core/lifecycle.js';
import { attachDiagnostics } from '../core/diagnostics.js';
import { createPicker } from '../core/pick.js';
import { createContacts } from '../core/contact.js';
import { laneDelta } from '../core/motion.js';
import { createShell } from '../core/shell.js';

// ---- tunables: change freely ---------------------------------------------------------------
const LANES = [-2.4, 0, 2.4];        // world x of each lane
const CHUNK = 20, ACTIVE = 7;        // road piece length, and how many exist at once
const START_SPEED = 12, MAX_SPEED = 30, ACCEL = 0.5;   // units per second, per second
const LIVES = 3;
const BEST_KEY = 'game3d.onRails.bestCoins';

export function start(canvas, { onState = () => {}, onError = () => {} } = {}) {
  const host = createHost({ canvas, captureFrames: true, onError });
  const { scene, camera } = host;
  const input = createInput(canvas);

  // ---- sky. No ground plane: the road IS the ground, and it streams.
  scene.background = new THREE.Color(0x2b3352);
  scene.fog = new THREE.Fog(0x2b3352, 60, 150);

  const roadGeo = host.track(new THREE.BoxGeometry(LANES[2] - LANES[0] + 3.2, 0.3, CHUNK));
  const roadMat = host.track(new THREE.MeshStandardMaterial({ color: 0x3c4361, roughness: 0.95 }));   // darker than mid-grey
  const kerbGeo = host.track(new THREE.BoxGeometry(0.4, 0.5, CHUNK));
  const kerbMat = host.track(new THREE.MeshStandardMaterial({ color: 0x8a93b8 }));
  const blockGeo = host.track(new THREE.BoxGeometry(1.5, 1.5, 1.5));
  const blockMat = host.track(new THREE.MeshStandardMaterial({ color: 0xe2665c, emissive: 0x661a14, emissiveIntensity: 0.6 }));
  const coinGeo = host.track(new THREE.IcosahedronGeometry(0.38, 0));
  const coinMat = host.track(new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffd23f, emissiveIntensity: 1.8, roughness: 0.3 }));

  const contacts = createContacts();
  // createSolids and solids are deliberately not used: lanes are discrete, the road has no walls
  // to slide along, and a block is a HAZARD you hit (contacts), not geometry you push against.

  // ---- the player: a box that only ever moves sideways. The camera sits behind it, fixed.
  const player = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x4fd1ff, emissive: 0x1a4a66, emissiveIntensity: 0.4 }));
  player.position.set(0, 0.65, 0); player.castShadow = true; scene.add(player);
  camera.position.set(0, 4.6, 8); camera.lookAt(0, 1, -10);

  // ---- streaming road. Each chunk owns its meshes AND its contact group, so recycling a chunk
  // removes both together and nothing that has gone past stays touchable.
  const chunks = [];
  let chunkSerial = 0;
  function spawnChunk() {
    const startZ = chunks.length ? chunks[chunks.length - 1].startZ - CHUNK : 0;
    const group = 'chunk' + (chunkSerial++);
    const meshes = [];
    const road = new THREE.Mesh(roadGeo, roadMat); road.position.set(0, -0.15, startZ - CHUNK / 2); road.receiveShadow = true; scene.add(road); meshes.push(road);
    for (const sx of [-1, 1]) { const k = new THREE.Mesh(kerbGeo, kerbMat); k.position.set(sx * (LANES[2] + 1.4), 0.1, startZ - CHUNK / 2); scene.add(k); meshes.push(k); }
    const chunk = { startZ, group, meshes, coins: [], blocks: [] };
    if (startZ < -CHUNK) {                      // the first two pieces are clear, so the run opens on an open road
      const blockLane = Math.floor(Math.random() * 3);
      const b = new THREE.Mesh(blockGeo, blockMat);
      b.position.set(LANES[blockLane], 0.75, startZ - 4 - Math.random() * (CHUNK - 8)); b.castShadow = true; scene.add(b); meshes.push(b); chunk.blocks.push(b);
      contacts.hazard(b, { radius: 0.95, group, onHit: () => hit(b) });
      for (let i = 0; i < 3; i++) {
        const lane = (blockLane + 1 + Math.floor(Math.random() * 2)) % 3;   // never in the block's lane
        const c = new THREE.Mesh(coinGeo, coinMat);
        c.position.set(LANES[lane], 1.0, startZ - 2 - i * (CHUNK / 3.2)); c.castShadow = true; scene.add(c); meshes.push(c); chunk.coins.push(c);
        contacts.pickup(c, { radius: 0.8, group, onTake: () => { coins++; shell.set('coins', coins); } });
      }
    }
    chunks.push(chunk);
  }
  function clearChunks() {
    for (const ch of chunks) { for (const m of ch.meshes) scene.remove(m); contacts.removeGroup(ch.group); }
    chunks.length = 0;
  }

  // ---- state
  const phase = () => shell.screen || 'playing';
  let lane = 1, speed = START_SPEED, distance = 0, coins = 0, lives = LIVES, elapsed = 0, paused = false;
  let hurtUntil = 0;                      // a moment of grace after a hit, so one block costs one life
  let best = Number(safeGet(BEST_KEY)) || 0;
  const wasAt = new THREE.Vector3();

  input.bindKeys('move');                                   // A/D and arrows -> lane changes
  input.addRegion('track', { x: 0, y: 0, w: 1, h: 1 });    // swipe anywhere on a touch device
  let armed = true;                                          // one lane per press or swipe, not one per frame

  // ---- the shell: HUD, start and game-over screens, restart. One field drawn and reported.
  const shell = createShell(input, {
    mount: canvas.parentElement,
    fields: {
      coins: { label: 'COINS', start: 0 },
      lives: { label: 'LIVES', start: LIVES },
    },
    screens: {
      ready: { title: 'Rails', hint: 'The road comes to you. A and D (or the arrows) change lane; take the coins, miss the blocks.', action: 'Start' },
      lost: { title: 'Game Over', action: 'Play Again' },
    },
    onAction: (from) => { if (from === 'ready') begin(); else restart(); },
  });

  function hit(block) {
    if (loopRef.simTime < hurtUntil) return;
    hurtUntil = loopRef.simTime + 1.0;
    lives--; shell.set('lives', lives);
    block.visible = false;                                   // the block you hit is gone, not hit again
    if (lives <= 0) lose();
  }
  function reset() {
    clearChunks();
    lane = 1; speed = START_SPEED; distance = 0; coins = 0; lives = LIVES; elapsed = 0; paused = false; hurtUntil = 0; armed = true;
    player.position.set(LANES[lane], 0.65, 0); wasAt.copy(player.position);
    shell.set('coins', 0); shell.set('lives', LIVES);
    for (let i = 0; i < ACTIVE; i++) spawnChunk();
    emit();
  }
  function begin() { if (!shell.screen) return; shell.hide(); emit(); }
  function lose() {
    const newBest = coins > best;
    if (newBest) { best = coins; safeSet(BEST_KEY, String(best)); }
    const line = `${coins} coins over ${Math.round(distance)} m` + (newBest ? ' -- a new best' : ` -- best ${best}`);
    shell.show('lost', { hint: line });
    emit(line);
  }
  function restart() { reset(); shell.hide(); emit(); }

  function emit(message) {
    onState({
      phase: phase(), progress: coins, best,
      hud: { coins, lives, distance: Math.round(distance) + 'm' },
      message,
    });
  }

  // ---- simulation: fixed step from the engine's loop
  let loopRef = null;
  function step(dt) {
    if (shell.screen) return;              // a screen is up: the road is frozen behind it
    if (input.wentDown('Escape')) paused = !paused;
    if (paused) return;
    elapsed += dt;
    speed = Math.min(MAX_SPEED, speed + ACCEL * dt);
    distance += speed * dt;

    // ONE lane per press or swipe: read the edge, then wait for the control to return to centre.
    const v = input.sample('move');
    const sw = (input.region('track') || {}).swipe;
    const want = sw ? sw.dir : (Math.abs(v.x) > 0.5 ? (v.x > 0 ? 'right' : 'left') : null);
    if (want && armed) {
      lane = Math.max(0, Math.min(LANES.length - 1, lane + laneDelta(camera, want)));
      armed = false;
    }
    if (!want) armed = true;
    wasAt.copy(player.position);
    player.position.x += (LANES[lane] - player.position.x) * Math.min(1, dt * 12);

    // The world comes to the player. The recycle keys on the chunk's own accumulated offset.
    for (const ch of chunks) {
      ch.startZ += speed * dt;
      for (const m of ch.meshes) m.position.z += speed * dt;
      for (const c of ch.coins) c.rotation.y += dt * 3;
    }
    while (chunks.length && chunks[0].startZ - CHUNK > 6) {   // fully behind the camera
      const gone = chunks.shift();
      for (const m of gone.meshes) scene.remove(m);
      contacts.removeGroup(gone.group);                        // recycled props must stop being touchable
    }
    while (chunks.length < ACTIVE) spawnChunk();

    contacts.step(wasAt, player.position, { radius: 0.55 });
  }
  const loop = loopRef = createLoop({
    step,
    render() { host.present(); },
  });

  // WHERE THE COINS ARE, in screen pixels: the playtest steers into the lane they are in.
  const picker = createPicker({ canvas, camera });
  const screenTargets = () => {
    const out = {};
    let n = 0;
    for (const ch of chunks) {
      for (const c of ch.coins) {
        if (!c.parent || c.position.z > 0) continue;           // taken, or already behind the player
        const p = picker.project(c.position);
        if (p) out['coin' + (n++)] = p;
        if (n >= 6) return out;
      }
    }
    return out;
  };

  const lifecycle = attachLifecycle({ canvas, loop, host });
  attachDiagnostics({
    host, loop, input, actor: player,
    reset: () => { reset(); if (shell.screen !== 'ready') { shell.hide(); emit(); } },
    getState: () => ({
      view: 'onRails', started: !shell.screen, paused,
      progress: coins, pos: [player.position.x, player.position.y, player.position.z],
      facing: [0, 0, -1], groundY: 0, elapsed,
      lane, speed: +speed.toFixed(1), distance: Math.round(distance), lives,
      // atRest is deliberately not reported: the rail never stops, so "the world settles" is not
      // a property this shape has. The check skips by design, as it does for mobile's runner.
      screen: screenTargets(),
      ...contacts.report(),
      // LAST, so the phase and the HUD numbers come from the shell that drew them.
      ...shell.report(),
    }),
  });

  shell.show('ready');
  reset();
  loop.start();
  const hudTimer = setInterval(() => { if (!shell.screen) emit(); }, 100);

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
