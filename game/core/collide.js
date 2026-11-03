import * as THREE from 'three';

// Deferred, because these helpers run inside the loop and the loop starts before
// attachDiagnostics in some scenes -- controls.js lost its first warning entirely that way.
// See motion.js: advice is marked so a checker does not read it as a crash.
const ADVICE = 'ENGINE ADVICE: ';

function report(msg) {
  setTimeout(() => {
    const g = globalThis.__GAME__;
    if (g && typeof g.reportError === 'function') g.reportError(ADVICE + msg);
    else console.error(ADVICE + msg);
  }, 0);
}

/**
 * SOLIDS, GROUND and BOUNDS -- the collision every genre needs, without a physics solver.
 *
 * Named `collide`, not `physics`, on purpose: cannon-es is vendored for real rigid-body work,
 * but almost every collision failure measured here needed none of it --
 *
 *   walking through trees        props were drawn and then forgotten
 *   a coin inside a tree trunk   once props became solid, the pickup was unreachable
 *   stuck at the track border    leaving the drivable surface with no recovery
 *   floating on water            nothing stopped the player at the shoreline
 *   maze walls                   the genre that bypassed the engine twice, because grid
 *                                collision had no support here at all
 *
 * -- and the one thing a solver WOULD have to own, terrain, must not use it: our own notes
 * record CANNON.Trimesh against a heightfield at roughly 80 ms per frame, i.e. 12 FPS. Ground
 * is sampled analytically from the same height function the mesh was built from.
 *
 * Every function takes a desired position and returns a corrected one, so a scene writes
 * `pos.copy(solids.resolve(pos, r))` and never computes a normal or a sign itself. That is the
 * same property that made motion.js work: the error-prone arithmetic lives in one place.
 */

const _box = new THREE.Box3();
// WHAT resolve(), confine(), place() and unstick.step() RETURN: the vector passed in, which each
// has already corrected in place -- or a new one for a plain {x, y, z}. They used to return one
// shared scratch, so a game holding two results at once -- the player's and a companion's, or a
// map over the rivals -- found both variables naming the same vector, and copying the first
// teleported that actor onto the last. `pos.copy(solids.resolve(pos, r))` stays correct: it is
// now a copy onto itself.
const _result = (pos, x, y, z) => (pos && pos.isVector3 ? pos : new THREE.Vector3(x, y, z));

/** Circle and box colliders in the XZ plane, with push-out resolution.
 *
 *  Resolution runs a few passes rather than one, because pushing an actor out of one collider
 *  can push it into its neighbour -- the corner case that leaves a player wedged between two
 *  trees, which is the failure the "never let the player get permanently stuck" rule exists for.
 *  Passes are capped so a genuinely impossible corner ends in the least-bad position instead of
 *  looping forever. */
/** Every solids instance ever created in this bundle. Diagnostics reads it so a scene cannot
 *  hide an abandoned one by simply not reporting it -- which is the same starvation the counter
 *  exists to catch, one level up. Creating the module is enough to be seen. */
export const _solidsCreated = [];
export const _bodiesCreated = [];

/**
 * ACTORS THAT MUST NOT OCCUPY THE SAME SPACE. createSolids handles the world -- walls, props,
 * anything that never moves. This handles the things that do: rival cars, enemies, NPCs, a
 * player and a pushable crate.
 *
 * It exists because nothing owned it, and four racing builds in a row therefore left it out ON
 * PURPOSE. Their own words: "AI cars won't use solids collision at all -- they only need to
 * follow waypoints, and steering toward those points naturally keeps them within track
 * boundaries." Every one of them shipped, and every one let the player drive straight through
 * the field. It is not a racing problem: any game with more than one actor has it.
 *
 * Static solids and moving bodies need different maths, which is why one module cannot do both.
 * A wall is resolved by pushing the actor out along the shortest axis. Two cars are resolved by
 * pushing BOTH apart along the line between them, in proportion to mass, or the heavier one
 * would teleport out of the lighter one's way.
 *
 *     const bodies = createBodies();
 *     const me = bodies.add(car, { radius: 1.4 });
 *     for (const ai of rivals) bodies.add(ai.group, { radius: 1.4 });
 *     // ...once per frame, after everything has moved:
 *     bodies.separate();
 *     // ...and in getState(): { ...bodies.report() }
 */
export function createBodies({ push = 1 } = {}) {
  const items = [];
  let separations = 0, overlaps = 0, worstOverlap = 0;

  function add(obj, { radius = 1, mass = 1, still = false } = {}) {
    if (!obj || !obj.position) throw new Error(
      'createBodies: add() needs an object with .position -- the mesh or group you move each '
      + 'frame. bodies.add(car, { radius: 1.4 }).');
    const rec = { obj, radius, mass: still ? Infinity : Math.max(0.001, mass), still };
    items.push(rec);
    return rec;
  }

  const remove = (objOrRec) => {
    const i = items.findIndex((r) => r === objOrRec || r.obj === objOrRec);
    if (i >= 0) items.splice(i, 1);
    return i >= 0;
  };

  /** Call ONCE per frame, after every actor has moved. Resolves every overlapping pair. */
  function separate() {
    separations += 1;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        if (a.mass === Infinity && b.mass === Infinity) continue;
        const ax = a.obj.position.x, az = a.obj.position.z;
        const bx = b.obj.position.x, bz = b.obj.position.z;
        let dx = bx - ax, dz = bz - az;
        let d = Math.hypot(dx, dz);
        const want = a.radius + b.radius;
        if (d >= want) continue;
        overlaps += 1;
        if (want - d > worstOverlap) worstOverlap = want - d;
        // Exactly concentric: pick an axis rather than dividing by zero. Two cars spawned on
        // the same grid slot is a real case, and NaN there stops the whole scene.
        if (d < 1e-6) { dx = 1; dz = 0; d = 1; }
        const nx = dx / d, nz = dz / d;
        const gap = (want - d) * push;
        const total = (a.mass === Infinity ? 0 : 1 / a.mass) + (b.mass === Infinity ? 0 : 1 / b.mass);
        if (total <= 0) continue;
        const sa = (a.mass === Infinity ? 0 : (1 / a.mass) / total) * gap;
        const sb = (b.mass === Infinity ? 0 : (1 / b.mass) / total) * gap;
        a.obj.position.x -= nx * sa; a.obj.position.z -= nz * sa;
        b.obj.position.x += nx * sb; b.obj.position.z += nz * sb;
      }
    }
    return overlaps;
  }

  /** Merge into getState(): `separations` is what tells a wired module from an abandoned one. */
  const report = () => ({ bodies: items.length, separations, bodyOverlaps: overlaps,
                          worstOverlap: +worstOverlap.toFixed(3) });

  const api = { add, remove, separate, report, get count() { return items.length; },
                get separations() { return separations; },
                /** Live overlap test, for the checker: which pairs are inside each other NOW. */
                overlapping() {
                  const out = [];
                  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
                    const a = items[i], b = items[j];
                    const d = Math.hypot(b.obj.position.x - a.obj.position.x,
                                         b.obj.position.z - a.obj.position.z);
                    const want = a.radius + b.radius;
                    if (d < want - 0.02) out.push(+(want - d).toFixed(2));
                  }
                  return out;
                } };
  _bodiesCreated.push(api);
  return api;
}

export function createSolids({ passes = 3 } = {}) {
  const discs = [];   // { x, z, r }
  const boxes = [];   // { x, z, hw, hd }
  // Counted so the checker can tell a scene that WIRED collision from one that merely created
  // it. A racing build called createSolids, registered its buildings, and never called
  // resolve() once -- so the player drove through every wall and every car, and passed 32 of 32
  // checks, because nothing distinguishes "collision exists" from "collision runs".
  let resolves = 0;
  // Ledge bookkeeping: a `top` that nothing ever reads is a platform the player falls through.
  let ledges = 0, feetSeen = false, warnedFeet = false;

  /** `top` is the height of the shape's upper surface. It defaults to Infinity, which is a wall at
   *  every height -- exactly what every scene written before this got, and still gets. Give it a
   *  number and the shape becomes a LEDGE: it blocks an actor whose feet are below `top`, and is
   *  something to stand on for an actor whose feet are at or above it.
   *
   *  Written because a platform was otherwise inexpressible. Solids are XZ-only, so a box could be
   *  a full-height wall or nothing at all, and a scene that wanted stepped platforms had to leave
   *  them out of collision and hand-roll a surface function -- which is how a build shipped centre
   *  blocks you walk straight into instead of onto. `top` plus `surfaceAt()` is the missing half. */
  function addDisc(x, z, radius, { top = Infinity } = {}) {
    if (Number.isFinite(top)) ledges += 1;
    discs.push({ x, z, r: radius, top }); return discs[discs.length - 1];
  }
  function addBox(x, z, width, depth, { top = Infinity } = {}) {
    if (Number.isFinite(top)) ledges += 1;
    boxes.push({ x, z, hw: width / 2, hd: depth / 2, top }); return boxes[boxes.length - 1];
  }

  /** An actor whose feet are at or above a shape's top is ON it, not inside it: the shape stops
   *  blocking and starts being ground. The epsilon lets the landing frame register rather than
   *  falling through by a fraction of a millimetre. `Infinity` tops are never cleared. */
  const STAND_EPS = 0.05;
  function clears(shape, feetY) { return feetY >= shape.top - STAND_EPS; }

  /** True when a point is inside any solid, allowing for the actor's own radius.
   *
   *  This is the query that makes "every objective must be reachable" checkable instead of
   *  advisory: place pickups and spawn points where `blocked()` is false and a coin can never
   *  end up inside a tree. */
  function blocked(x, z, radius = 0, feetY = -Infinity) {
    for (const d of discs) {
      if (clears(d, feetY)) continue;
      if (Math.hypot(x - d.x, z - d.z) < d.r + radius) return true;
    }
    for (const b of boxes) {
      if (clears(b, feetY)) continue;
      if (Math.abs(x - b.x) < b.hw + radius && Math.abs(z - b.z) < b.hd + radius) return true;
    }
    return false;
  }

  /** The height of the highest LEDGE under (x, z) that this actor is standing on or above, or
   *  `null` where there is none. Feed it into the ground height your scene already computes:
   *
   *      const surf = Math.max(terrainHeight(x, z), solids.surfaceAt(x, z, feetY) ?? -Infinity);
   *      const j = jump.step(actor.position.y, vy, surf + EYE, dt, wantJump);
   *
   *  Shapes with no `top` (the default) are never surfaces, so this returns `null` for a scene
   *  that registered ordinary walls. */
  function surfaceAt(x, z, feetY, radius = 0) {
    let best = null;
    for (const d of discs) {
      if (!Number.isFinite(d.top) || !clears(d, feetY)) continue;
      if (Math.hypot(x - d.x, z - d.z) <= d.r + radius && (best === null || d.top > best)) best = d.top;
    }
    for (const b of boxes) {
      if (!Number.isFinite(b.top) || !clears(b, feetY)) continue;
      if (Math.abs(x - b.x) <= b.hw + radius && Math.abs(z - b.z) <= b.hd + radius
          && (best === null || b.top > best)) best = b.top;
    }
    return best;
  }

  /** Push `pos` out of anything it overlaps, SLIDING along the surface rather than stopping.
   *
   *  Pass `from` (the position before this step) and the attempted movement is projected onto
   *  the collider's tangent, so walking into a tree at an angle carries you around it. Without
   *  that projection the push-out is purely radial, which cancels motion whenever the stick
   *  points into the obstacle -- the checker measured a 4-second stall on the reference scene
   *  doing exactly that, and this project's own rule says a player commanding movement must
   *  never be held still: "a vehicle wedged against scenery and only a manual reverse freed it".
   */
  function resolve(pos, radius = 0.5, from = null, feetY = -Infinity) {
    resolves += 1;
    if (Number.isFinite(feetY)) feetSeen = true;
    else if (ledges && !warnedFeet) {
      warnedFeet = true;
      report('createSolids: a shape was registered with a `top` (a ledge), but resolve() is being '
             + 'called without `feetY`, so it still blocks at every height and nothing can stand on '
             + 'it. Pass the actor\u2019s FEET height: solids.resolve(pos, r, from, pos.y - EYE).');
    }
    let x = pos.x, z = pos.z;
    // Slide first: remove the component of this step that points INTO whatever it hit, then let
    // the push-out below clean up any residual overlap.
    if (from) {
      const mx = x - from.x, mz = z - from.z;
      if (mx || mz) {
        for (const d of discs) {
          if (clears(d, feetY)) continue;
          if (Math.hypot(x - d.x, z - d.z) >= d.r + radius) continue;
          const nx0 = from.x - d.x, nz0 = from.z - d.z, nl = Math.hypot(nx0, nz0) || 1;
          const nx = nx0 / nl, nz = nz0 / nl;              // outward normal at the approach
          const into = mx * nx + mz * nz;                   // negative when moving inward
          if (into < 0) { x = from.x + (mx - into * nx); z = from.z + (mz - into * nz); }
        }
      }
    }
    for (let pass = 0; pass < passes; pass++) {
      let moved = false;
      for (const d of discs) {
        if (clears(d, feetY)) continue;
        const dx = x - d.x, dz = z - d.z;
        const dist = Math.hypot(dx, dz), min = d.r + radius;
        if (dist < min) {
          // Degenerate case: dead centre. Any direction is correct; pick one deterministically
          // rather than dividing by zero and producing NaN, which silently freezes a scene.
          const inv = dist > 1e-6 ? 1 / dist : 0;
          x = d.x + (inv ? dx * inv : 1) * min;
          z = d.z + (inv ? dz * inv : 0) * min;
          moved = true;
        }
      }
      for (const b of boxes) {
        if (clears(b, feetY)) continue;
        const dx = x - b.x, dz = z - b.z;
        const ox = b.hw + radius - Math.abs(dx), oz = b.hd + radius - Math.abs(dz);
        if (ox > 0 && oz > 0) {
          // Leave by the SHALLOWER axis: exiting a wall through its long side teleports the
          // player across it.
          if (ox < oz) x = b.x + Math.sign(dx || 1) * (b.hw + radius);
          else z = b.z + Math.sign(dz || 1) * (b.hd + radius);
          moved = true;
        }
      }
      if (!moved) break;
    }
    // Write back as well as return. Every scene that called this as a bare statement --
    // `solids.resolve(pos, r, from);` -- had walls the player walked straight through, and the
    // 'collision running' check could not see it because resolve() was being called. In place
    // costs nothing and makes the discarded-result mistake harmless.
    if (pos && typeof pos.x === 'number') { pos.x = x; pos.z = z; }
    return _result(pos, x, pos.y, z);
  }

  /** Take a shape out again. `addDisc`/`addBox` return the record they stored; pass it back. This is
   *  how a gate opens: the wall it was is simply no longer there. Games without this parked the
   *  record at (9999, 9999) by hand, which works until someone reads `discs` and finds a ghost. */
  function remove(record) {
    let i = discs.indexOf(record); if (i >= 0) { discs.splice(i, 1); return true; }
    i = boxes.indexOf(record); if (i >= 0) { boxes.splice(i, 1); return true; }
    return false;
  }
  const api = { addDisc, addBox, remove, blocked, resolve, surfaceAt, discs, boxes,
           get resolves() { return resolves; },
           get count() { return discs.length + boxes.length; } };
  _solidsCreated.push(api);
  return api;
}

/** Ground following and world bounds from ONE height function.
 *
 *  `heightAt` must be the same function the visible mesh was built from -- a second, slightly
 *  different function is how a vehicle comes to sink and resurface forever.
 *
 *  `waterLevel` is the fix for two reports from a device: "able to float in water", and being
 *  unable to move at the shoreline. Water is a BOUNDARY, not decoration: below the waterline
 *  the actor is pushed back toward where it came from, so it stops at the edge instead of
 *  walking onto the sea or wedging in it. */
export function createGround(heightAt, { radius = null, waterLevel = null, margin = 0.6 } = {}) {
  function at(x, z) { return heightAt(x, z); }

  /** WHERE you may stand: inside the world and out of the water. Corrects x and z, and passes y
   *  through UNTOUCHED.
   *
   *  Separated from place(), which answers a different question -- how HIGH you are -- because a
   *  scene that jumps, climbs, falls or swims owns that answer itself. Calling place() every
   *  frame erases a jump; createJump's docs below carry that incident.
   *
   *  A scene with any vertical motion should use confine() for x/z, at() for the surface, and let
   *  its own integrator own y. Then nothing in the call chain can overwrite it. */
  let warnedNoFrom = false;
  function confine(pos, from = null) {
    let x = pos.x, z = pos.z;
    if (radius !== null) {
      const d = Math.hypot(x, z);
      if (d > radius - margin) { const k = (radius - margin) / (d || 1); x *= k; z *= k; }
    }
    const wet = waterLevel !== null && heightAt(x, z) < waterLevel;
    // The shoreline pushes back TOWARD `from`, so without it there is no shoreline at all: the
    // actor walks on into the sea, and place() sets it onto the seabed, where nothing looks wrong.
    if (wet && !from && !warnedNoFrom) {
      warnedNoFrom = true;
      report('createGround: the actor is in the water, but confine()/place() was called without '
        + '`from` (the position before this step), so there is no shoreline to push it back to '
        + 'and it walks on into the sea. Pass it: world.confine(pos, from) or '
        + 'world.place(pos, eye, from).');
    }
    if (wet && from) {
      // SLIDE along the shoreline, do not refuse the step. My first version cancelled the whole
      // move when the target was wet, and the checker caught it immediately: holding the stick
      // toward the sea froze the player for 4 seconds -- which is precisely the device report
      // this was meant to fix ("where it is flickering, we are not able to move there").
      // Cancelling both axes stops all motion; cancelling only the axis that entered the water
      // lets a player walking diagonally into the shore keep moving along it.
      if (heightAt(x, from.z) >= waterLevel) z = from.z;          // keep the dry x
      else if (heightAt(from.x, z) >= waterLevel) x = from.x;     // keep the dry z
      else { x = from.x; z = from.z; }                            // a cove: genuinely nowhere
    }
    // Write back, exactly as resolve() does. Without this, `world.confine(pos, was)` -- which is
    // how the reference scene called it, one line below a comment celebrating the resolve() fix --
    // is a no-op, and the world has no boundary at all. Same trap, same fix.
    if (pos && typeof pos.x === 'number') { pos.x = x; pos.z = z; }
    return _result(pos, x, pos.y, z);
  }

  /** confine() PLUS the surface: the whole corrected position, y included. Use it when the scene
   *  has no vertical motion of its own -- then owning y is exactly what you want.
   *
   *  `eye` is the distance from the actor's ORIGIN to its lowest point, so the model sits on the
   *  surface rather than through it. Pass the Object3D instead of a number and it is measured
   *  from the geometry -- the only way to get it right without knowing the modelling convention.
   *  A generated island explorer passed 0 with a group whose mesh extends below its origin, so
   *  the character was buried to its ankles in every frame; the default of 0 is what invited
   *  that, and it is kept only because a vehicle whose origin genuinely sits on the ground is
   *  also legitimate.
   *
   *  If the actor jumps, falls, climbs or swims, do NOT call this -- use confine() + at(). */
  function place(pos, eye = 0, from = null) {
    if (eye && typeof eye === 'object') {
      _box.setFromObject(eye);
      eye = _box.isEmpty() ? 0 : Math.max(0, (eye.position?.y ?? 0) - _box.min.y);
    }
    const p = confine(pos, from);
    const _y = heightAt(p.x, p.z) + eye;
    if (pos && typeof pos.x === 'number') { pos.x = p.x; pos.y = _y; pos.z = p.z; }
    return _result(pos, p.x, _y, p.z);
  }

  /** Is this spot dry land inside the world? For placing pickups and spawn points. */
  function usable(x, z) {
    if (radius !== null && Math.hypot(x, z) > radius - margin) return false;
    if (waterLevel !== null && heightAt(x, z) < waterLevel) return false;
    return true;
  }

  return { at, place, confine, usable };
}

/** Gravity and a jump arc, so a platformer's reachability is arithmetic rather than a guess.
 *
 *  A generated parkour level put its first platform 6.1 m above a 2.88 m jump: every control
 *  worked and the game could not be played. `apex` reports how high THIS configuration can
 *  actually reach, so a scene can place platforms inside it instead of hoping. */
export function createJump({ gravity = -22, jumpSpeed = 9 } = {}) {
  const apex = (jumpSpeed * jumpSpeed) / (2 * -gravity);
  let launches = 0;
  let launchWindow = 0;
  let reported = false;
  let warnedGround = false;
  let peakSinceLaunch = 0;
  return {
    gravity, jumpSpeed, apex,
    /** Advance vertical motion. Returns { y, vy, grounded }.
     *
     *  THIS owns the actor's Y. Anything else that writes position.y in the same frame -- most
     *  easily `createGround().place()`, which returns `ground + eye` -- erases the ascent before
     *  the next frame reads it, and the jump silently becomes a 0.15 m twitch (`jumpSpeed * dt`).
     *  A generated island explorer shipped exactly that: a labelled JUMP button that did nothing,
     *  because `place()` ran first and reset y to the ground every frame. Nothing detected it --
     *  the control was declared, drawn and read, and the scene passed 26 of 26 checks.
     *
     *  So this detects the collision itself: a real jump launches ONCE and is then airborne for
     *  most of a second. Repeated launches on consecutive frames mean something is putting the
     *  actor back on the ground, and that is reported rather than left to a device. */
    step(y, vy, groundY, dt, wantJump) {
      // A GROUND THAT IS NOT A NUMBER IS NO GROUND. solids.surfaceAt() returns null where there is
      // no ledge, and null does arithmetic as 0: `y <= null + 1e-3` asked "is the actor at zero",
      // and `ny = groundY` then wrote null itself as the height. An actor that walked off a ledge
      // landed on an invisible floor at y = 0 and stayed there, grounded, however far below the
      // real ground was. Nothing under it now means it falls -- which the playtest can see.
      if (typeof groundY !== 'number' || Number.isNaN(groundY)) {
        if (!warnedGround) {
          warnedGround = true;
          report(`createJump: jump.step() was given groundY = ${groundY}, so the actor has nothing under `
                 + 'it and falls. solids.surfaceAt() is null wherever there is no ledge -- see '
                 + 'solids.surfaceAt in TEMPLATE.md for what to pass instead.');
        }
        groundY = -Infinity;
      }
      let nvy = vy;
      let grounded = y <= groundY + 1e-3;
      // A real jump takes ~2*jumpSpeed/-gravity seconds round trip, so it cannot launch more than
      // twice in 1.5 s. More than that means the actor is back on the ground immediately, every
      // time -- its y is being overwritten. Counted over a WINDOW rather than consecutively,
      // because the launches alternate: the frame after a launch has grounded=false, so
      // `held && grounded` is false, and a consecutive counter resets on every other frame.
      // Track how high the actor gets BETWEEN launches, and judge on that rather than on the
      // launch count alone. Counting launches alone would also condemn a game that bounces on
      // purpose -- a pogo, a trampoline, an auto-hop -- because those relaunch the moment they
      // land, which is the same rhythm as an erased jump. The difference is altitude: a real
      // bounce reaches its apex, an erased one never leaves the floor. Compared against a
      // quarter of the apex so a deliberately small hop is not condemned either.
      if (y - groundY > peakSinceLaunch) peakSinceLaunch = y - groundY;
      launchWindow += dt;
      if (launchWindow > 1.5) { launchWindow = 0; launches = 0; reported = false; }
      if (grounded && wantJump) {
        nvy = jumpSpeed;
        grounded = false;
        const roseProperly = peakSinceLaunch > apex * 0.25;
        peakSinceLaunch = 0;
        if (roseProperly) launches = 0;              // it really is bouncing; not our problem
        else if (++launches >= 5 && !reported) {
          reported = true;
          report('createJump: the actor has launched 5 times in under 1.5 s, so it is never '
            + 'leaving the ground -- something else is writing position.y after this runs. The '
            + 'usual cause is createGround().place(), which returns ground + eye: apply it only '
            + 'while grounded, or take only its x/z, and let jump.step() own y. As written the '
            + `JUMP control lifts the actor ${(jumpSpeed * dt).toFixed(2)} m and no further, `
            + 'which on a device reads as a button that does nothing.');
        }
      } else if (!grounded || nvy > 0) {
        nvy += gravity * dt;
      }
      let ny = y + nvy * dt;
      if (ny <= groundY) { ny = groundY; nvy = 0; grounded = true; }
      return { y: ny, vy: nvy, grounded };
    },
  };
}

/** Automatic recovery from being wedged -- the rule every game is told to implement and none
 *  reliably does.
 *
 *  From this project's own guidance: "Reported from a real device: a vehicle wedged against
 *  scenery and only a manual reverse freed it. If the player is commanding movement and nothing
 *  has happened for about a second, recover automatically." Leaving that to each scene meant it
 *  was written inconsistently or not at all, and a long stall while input is held
 *  -- the reference island stalled 3.5 to 5 seconds against a 4 second limit purely from being
 *  pressed against trees and the shoreline while the stick was held.
 *
 *  The nudge is PERPENDICULAR to the direction being commanded, because pushing back along it
 *  just re-collides on the next frame. Collision resolution runs afterwards and cleans up
 *  whatever the nudge overlapped.
 */
/**
 * A STABLE at-rest flag, for the `atRest` field the checks read.
 *
 * `body.velocity.lengthSquared() < eps` flickers. A body resting on a surface never reaches zero
 * velocity -- contact resolution micro-jitters it -- so a single reading lands on either side of
 * the threshold at random. The explorer scene did exactly that and made the settle check fail on
 * one run and pass on the next with identical code.
 *
 * Hysteresis is the fix: it takes a low speed to fall asleep and a clearly higher one to wake up,
 * so the flag describes the world's state instead of this frame's noise.
 *
 *     const rest = createRest();
 *     // inside getState():
 *     atRest: rest.update(chassisBody.velocity.lengthSquared())
 */
export function createRest({ enter = 0.05, exit = 0.4 } = {}) {
  let resting = false;
  return {
    update(speedSq) {
      if (resting ? speedSq > exit : speedSq < enter) resting = !resting;
      return resting;
    },
    get resting() { return resting; },
  };
}

/** Pass `input` and the regions that DRIVE, and this reads whether a finger is actually on one
 *  of them instead of trusting the caller. `commandDir` alone was not enough: two racing builds
 *  computed a forward vector every frame whether or not anything was pressed, so `commanding`
 *  was permanently true, the nudge fired while the car sat idle, and each spent two rounds on
 *  the same loop -- add unstick, fail "the actor holds still when nothing is pressed" with 1.8 m
 *  of oscillation, then gate the call by hand. A guard the caller can defeat by passing a
 *  plausible value is not a guard.
 *
 *  input.region(name).held is the same state the QA seam writes into, so injection still drives
 *  it -- which is right: when the harness is holding the throttle, a player would be too. */
export function createUnstick({ after = 0.8, nudge = 0.9, moved = 0.04, input = null, regions = [] } = {}) {
  const driveRegions = Array.isArray(regions) ? regions : [regions];
  let stalled = 0, lastX = null, lastZ = null, flip = 1, nudgedSinceMoving = false;
  return {
    /** `commandDir` is the direction the player is asking to go (may be null when idle). */
    step(pos, commandDir, dt) {
      // Held beats told. Fall back to the caller's word only when no input was wired in.
      const pressed = input && driveRegions.length
        ? driveRegions.some((n) => { const r = input.region(n); return !!(r && (r.held || r.pressed)); })
        : null;
      const dirNonZero = !!commandDir && (Math.abs(commandDir.x) > 1e-3 || Math.abs(commandDir.z) > 1e-3);
      const commanding = pressed === null ? dirNonZero : (pressed && dirNonZero);
      if (!commanding) { stalled = 0; lastX = pos.x; lastZ = pos.z; return _result(pos, pos.x, pos.y, pos.z); }
      const d = lastX === null ? Infinity : Math.hypot(pos.x - lastX, pos.z - lastZ);
      lastX = pos.x; lastZ = pos.z;
      stalled = d < moved ? stalled + dt : 0;
      if (d >= moved) nudgedSinceMoving = false;          // free movement: the next nudge starts fresh
      if (stalled < after) return _result(pos, pos.x, pos.y, pos.z);   // unchanged: nothing to write back
      stalled = 0;
      // Keep the same side while a nudge is making headway; switch only when the previous nudge
      // freed nothing. Alternating on every nudge wedged the player between two positions in
      // front of any box wider than one nudge.
      if (nudgedSinceMoving) flip = -flip;
      nudgedSinceMoving = true;
      const l = Math.hypot(commandDir.x, commandDir.z) || 1;
      const px = -commandDir.z / l * nudge * flip, pz = commandDir.x / l * nudge * flip;
      // Write back like resolve() and confine(): step() takes the position and is named for its
      // effect, so a bare `unstick.step(pos, dir, dt)` reads as a mutation. Dropped, the nudge
      // never happens and the only symptom is a stall the checker blames on the game.
      if (pos && typeof pos.x === 'number') { pos.x = pos.x + px; pos.z = pos.z + pz; }
      return _result(pos, pos.x, pos.y, pos.z);
    },
  };
}

/**
 * WALLS: the visible mesh and the collision shape of the same wall, from ONE call.
 *
 * Every generated game that built walls built them twice -- a mesh for the eye and shapes for
 * `createSolids` -- and the two disagreed. Measured in a shipped garden: three hedge rings drawn
 * as open, single-sided cylinders (invisible from inside, backface-culled) with collision discs
 * laid along a separately computed arc; a wrap-around gap made the closing arc 465 degrees long,
 * so the second ring was sealed and the round inside it could never be finished -- and every
 * check passed, because the first ring's gems were reachable. What you see and what blocks you
 * must be the same object. So:
 *
 *   const walls = createWalls({ scene, solids, host, height: 2 });
 *   walls.box(x, z, width, depth);                       // axis-aligned block, any proportions
 *   walls.box(0, -8, 12, 0.4);                            // a 12 m wall 0.4 m thick
 *   walls.grid(['#####', '#...#', '#.#.#', '#...#', '#####'], { cell: 3 });   // a maze, from text
 *   walls.arc(cx, cz, radius, fromDeg, toDeg);            // a curved segment, closed on all sides
 *   walls.ring(cx, cz, radius, { gaps: [[80, 100], [350, 5]] });   // a circle MINUS its gaps
 *
 * Angles are degrees, counter-clockwise from +x looking down: x = cos(a) * r, z = sin(a) * r.
 * Meshes are closed solids (top, sides, ends) with a double-sided material, so they read the same
 * from inside a ring as from outside. Every shape is registered with `solids` here, which is why
 * the engine-use check still counts it.
 */
const WALL_PIECE = 1.0;     // metres: the longest wall or gate piece whose bounding box stays clear of the player (see arc())

export function createWalls({ scene, solids, host = null, height = 2, thickness = 1, material = null,
                              color = 0x7a6f66, castShadow = true } = {}) {
  if (!scene || !solids) throw new Error('createWalls: pass { scene, solids } -- the scene to draw into and the createSolids() to register with.');
  const track = (o) => (host && typeof host.track === 'function' ? host.track(o) : o);
  const mat = material || track(new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide }));
  const DEG = Math.PI / 180;
  const meshes = [];

  function place(mesh, h) {
    mesh.position.y = h / 2;
    mesh.castShadow = castShadow; mesh.receiveShadow = true;
    scene.add(mesh); meshes.push(mesh);
    return mesh;
  }

  /** An axis-aligned block, FULL sizes, centred at (x, z). */
  function box(x, z, width, depth, { height: h = height, material: m = mat } = {}) {
    const mesh = new THREE.Mesh(track(new THREE.BoxGeometry(width, h, depth)), m);
    mesh.position.set(x, 0, z);
    solids.addBox(x, z, width, depth);
    return place(mesh, h);
  }

  /** A GRID of walls from rows of text: `#` is a solid cell, anything else is open floor. The way to
   *  build a maze, a dungeon or a floor plan -- corridors are exactly one `cell` wide, because the
   *  walls ARE cells. A maze built wall by wall as 2.4 m cubes on the lines BETWEEN its cells filled
   *  half of both corridors either side of every wall and shipped unplayable while every check
   *  passed. Row 0 is the far edge (-z) and column 0 the left (-x), so the text reads like the map
   *  seen from a camera at +z; the grid is centred on (x, z). Runs of `#` along a row are ONE box,
   *  so a 21 x 21 maze is a few dozen meshes. Returns `{ open, at(row, col), meshes }`: `open` is
   *  every open cell's centre `{x, z, row, col}`, for the spawn, pickups and the exit. */
  function grid(rows, { cell = 3, x: ox = 0, z: oz = 0, height: h = height, material: m = mat } = {}) {
    if (!Array.isArray(rows) || !rows.every((r) => typeof r === 'string')) {
      throw new Error("walls.grid(rows): pass an array of strings, one per row, '#' for a wall -- e.g. ['#####', '#...#', '#####'].");
    }
    const cols = Math.max(...rows.map((r) => r.length));
    const at = (row, col) => ({ x: ox + (col - (cols - 1) / 2) * cell, z: oz + (row - (rows.length - 1) / 2) * cell });
    const open = [], made = [];
    rows.forEach((line, row) => {
      for (let col = 0; col < cols; col++) {
        if (line[col] !== '#') { open.push({ ...at(row, col), row, col }); continue; }
        let end = col;
        while (line[end + 1] === '#') end++;
        const a = at(row, col), b = at(row, end);
        made.push(box((a.x + b.x) / 2, a.z, (end - col + 1) * cell, cell, { height: h, material: m }));
        col = end;
      }
    });
    return { open, at, meshes: made };
  }

  /** A curved segment of a ring between two angles (degrees), `thickness` wide, closed all round.
   *  Built as a run of SHORT PIECES (chord <= WALL_PIECE) that share one geometry and differ only
   *  by rotation, never as one long sector. The playtest's penetration check asks whether a static
   *  mesh's world bounding box contains the actor's origin, and a long curved sector's box is a
   *  square the size of the whole ring -- a player standing inside the ring read as "inside the
   *  hedge", and the build that hit it threw createWalls away and rebuilt its walls by hand.
   *  Measured over three rings at every degree, both faces: pieces of chord 1.0 leave 0 of 2,160
   *  hugging positions inside any box; 1.3 leaves 22; 2.0 leaves 322. Collision is unchanged: a
   *  run of overlapping discs along the same centreline. */
  function arc(cx, cz, radius, fromDeg, toDeg, { thickness: t = thickness, height: h = height, material: m = mat } = {}) {
    let span = toDeg - fromDeg;
    while (span <= 0) span += 360;
    if (span > 360) span = 360;
    const pieces = Math.max(1, Math.ceil((span * DEG * radius) / WALL_PIECE));
    const pieceDeg = span / pieces;
    const geo = pieceGeometry(radius, pieceDeg, t, h);
    const group = new THREE.Group();
    group.position.set(cx, 0, cz);
    for (let i = 0; i < pieces; i++) {
      const piece = new THREE.Mesh(geo, m);
      // The shared geometry is the piece for [0, pieceDeg]; rotate it into place. Our angle runs
      // counter-clockwise in x/z (x = cos a, z = sin a), which is a NEGATIVE rotation about +y.
      piece.rotation.y = -(fromDeg + pieceDeg * i) * DEG;
      piece.castShadow = castShadow; piece.receiveShadow = true;
      group.add(piece);
    }
    scene.add(group); meshes.push(group);
    // Discs a little closer than their diameter so the run has no seams a player can slip through.
    const count = Math.max(1, Math.ceil((span * DEG * radius) / (t * 0.8)));
    for (let i = 0; i < count; i++) {
      const a = (fromDeg + span * (i + 0.5) / count) * DEG;
      solids.addDisc(cx + Math.cos(a) * radius, cz + Math.sin(a) * radius, t / 2);
    }
    return group;
  }

  /** One extruded sector for angles [0, spanDeg] at `radius`, cached per (radius, span, t, h). */
  const _pieceCache = new Map();
  function pieceGeometry(radius, spanDeg, t, h) {
    const key = [radius.toFixed(3), spanDeg.toFixed(4), t, h].join('|');
    if (_pieceCache.has(key)) return _pieceCache.get(key);
    const n = Math.max(2, Math.ceil(spanDeg / 3));
    const inner = radius - t / 2, outer = radius + t / 2;
    const shape = new THREE.Shape();
    for (let i = 0; i <= n; i++) {
      const a = (spanDeg * i / n) * DEG;
      i === 0 ? shape.moveTo(Math.cos(a) * outer, -Math.sin(a) * outer) : shape.lineTo(Math.cos(a) * outer, -Math.sin(a) * outer);
    }
    for (let i = n; i >= 0; i--) {
      const a = (spanDeg * i / n) * DEG;
      shape.lineTo(Math.cos(a) * inner, -Math.sin(a) * inner);
    }
    shape.closePath();
    const geo = track(new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false }));
    geo.rotateX(-Math.PI / 2);                   // extrude along +y instead of +z
    _pieceCache.set(key, geo);
    return geo;
  }

  /** A GATE: a panel that fills a gap in a wall and can open. Built tangent to the ring at `deg`,
   *  `width` wide, with its own collision (a run of discs along the panel). `open()` removes the
   *  collision and hides the panel; `close()` puts both back. The two cannot disagree, which is the
   *  whole point: a shipped game sized its panel in degrees-as-units over a radius-10 disc, wedging
   *  the player, and parked the disc by hand to open it. */
  function gate(cx, cz, radius, deg, { width = 3, height: h = height, thickness: t = thickness, material: m = mat } = {}) {
    const a = deg * DEG;
    const x = cx + Math.cos(a) * radius, z = cz + Math.sin(a) * radius;
    const tx = -Math.sin(a), tz = Math.cos(a);           // unit tangent
    // Short pieces along the tangent, like the walls, so no piece's bounding box can reach the
    // player's origin when it stands against a gate set at an angle.
    const mesh = new THREE.Group();
    const pieceCount = Math.max(1, Math.ceil(width / WALL_PIECE)), pw = width / pieceCount;
    const pieceGeo = track(new THREE.BoxGeometry(pw, h, t));
    for (let i = 0; i < pieceCount; i++) {
      const s = -width / 2 + pw * (i + 0.5);
      const piece = new THREE.Mesh(pieceGeo, m);
      piece.position.set(x + tx * s, h / 2, z + tz * s);
      piece.rotation.y = a + Math.PI / 2;                // local x along the ring's tangent
      piece.castShadow = castShadow; piece.receiveShadow = true;
      mesh.add(piece);
    }
    scene.add(mesh); meshes.push(mesh);
    let records = [];
    const solidify = () => {
      const n = Math.max(1, Math.ceil(width / (t * 0.8)));
      records = [];
      for (let i = 0; i < n; i++) {
        const s = -width / 2 + width * (i + 0.5) / n;
        records.push(solids.addDisc(x + tx * s, z + tz * s, t / 2));
      }
    };
    solidify();
    const handle = {
      mesh, deg, width,
      get isOpen() { return records.length === 0; },
      open() { for (const r of records) solids.remove(r); records = []; mesh.visible = false; return handle; },
      close() { if (!records.length) solidify(); mesh.visible = true; return handle; },
    };
    return handle;
  }

  /** A full circle of wall with openings cut out of it. `gaps` are [fromDeg, toDeg] pairs and MAY
   *  wrap past 360 (a gap [350, 5] is fine). The walls are exactly the complement of the gaps.
   *  `gates: [deg, ...]` cuts a `gateWidth`-wide gap at each angle AND fills it with a gate; the
   *  returned array carries them as `.gates`, so `ring.gates[0].open()` is the whole mechanic. */
  function ring(cx, cz, radius, { gaps = [], gates = [], gateWidth = 3, ...opts } = {}) {
    const gateHandles = [];
    if (gates.length) {
      const halfDeg = Math.atan((gateWidth / 2) / radius) / DEG + 0.4;   // the opening plus a hair of clearance
      gaps = gaps.concat(gates.map((g) => [g - halfDeg, g + halfDeg]));
      for (const g of gates) gateHandles.push(gate(cx, cz, radius, g, { width: gateWidth, ...opts }));
    }
    const finish = (arcs) => { arcs.gates = gateHandles; return arcs; };
    if (!gaps.length) return finish([arc(cx, cz, radius, 0, 360, opts)]);
    // Normalise every gap to a start in [0, 360) and a positive span, then sort by start.
    const norm = gaps.map(([a, b]) => {
      const start = ((a % 360) + 360) % 360;
      let span = ((b - a) % 360 + 360) % 360;
      if (span === 0) span = 360;
      return { start, end: start + span };
    }).sort((p, q) => p.start - q.start);
    const out = [];
    for (let i = 0; i < norm.length; i++) {
      const from = norm[i].end;
      const to = i + 1 < norm.length ? norm[i + 1].start : norm[0].start + 360;
      if (to - from > 0.5) out.push(arc(cx, cz, radius, from, to, opts));
    }
    return finish(out);
  }

  return { box, grid, arc, ring, gate, meshes, get count() { return meshes.length; } };
}
