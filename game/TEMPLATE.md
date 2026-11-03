# 3D game — what is already here and how to work with it

`game/scenes/main.js` is a **complete, working game**. **Change it into the game that was asked for; do not rewrite it from nothing.** `game/core/` is a built and debugged engine — use it rather than reinventing it. You may change a core module if you have a reason, but keep its contract.

## Which call do I need?

Find the row for what you are trying to do, then grep the API reference at the bottom of this
file for the name. Writing the behaviour by hand instead is how games ship colliders nothing
registered, cameras that cut the player out, and bodies that pass through each other.

| you need | call |
| --- | --- |
| the actor to stop passing through a wall or prop | `solids.addBox` / `solids.addDisc`, then `solids.resolve` EVERY frame |
| a platform to stand ON rather than walk into | `solids.addBox(..., {top})` + `solids.surfaceAt` combined with the ground for `jump.step` |
| ground that rises and falls | `createGround(heightAt)` → `world.at`, `world.place`, `world.confine`, `world.usable` |
| to check a collider against the VISIBLE mesh | `picker.groundAt` |
| jumping, and gaps sized to what it can clear | `createJump` → `jump.step`, `jump.apex` |
| something to come to rest without flickering | `createRest` → `rest.update` |
| objects that shove each other apart | `createBodies` → `bodies.add`, `separate`, `remove`, `count` |
| pickups, hazards, and what happens on contact | `createContacts` → `contacts.pickup`, `hazard`, `step`, `remove` |
| a wall, a curve, a ring, or a gate that opens | `createWalls` → `walls.box`, `arc`, `ring`, `gate` |
| a maze, a dungeon or a floor plan | `walls.grid(rows)` |
| a camera behind the actor | `followCam` |
| a camera that keeps two things in frame at any distance | `host.fitBounds` |
| metal, glass or paint that reads as black or flat | `host.environment()` — lights alone never fill a reflective material |
| the character to walk where the SCREEN says, not along fixed world axes | `walkDirection(input, {move, look}, camera)` — required the moment the camera can turn |
| mouse look | `input.bindMouseLook` + `createLook`, `look.step` in the step |
| the mouse swings the camera round the character | `input.bindMouseLook` + `createOrbit` + `walkDirection` |
| turning from two BUTTONS | `steer` |
| throttle-and-turn driving | `tankDrive` |
| lane switching | `laneDelta` |
| a key held with no region of its own | `input.isDown` |
| a key held inside a region | `input.region(name).held` |
| keys other than WASD and the arrows | `input.bindKeys(region, {up, down, left, right})` |
| a HUD, start and end screens, a restart | `createShell` → `shell.set`, `show`, `hide`, `get`, `report` |
| to ease a value over time | `loop.schedule` |
| to pause and resume | `loop.pause`, `loop.resume` |
| a per-frame hook outside the fixed step | `loop.onFrame` |
| where an objective is on screen | `picker.project` |
| to click an object in the world | `picker.pick` |
| to drive the game from the browser console | `attachDiagnostics` → `window.__GAME__` |

## Files

- `game/scenes/main.js` — the game's entry: `start()`, the state machine, `getState()`. It arrives as the `avatar` skeleton. Change it in place. What you add may live in `main.js` or in its own files under `game/scenes/` (for example `world.js`, `entities.js`, `rules.js`, `config.js`) — your call; if you add files, wire them into `main.js` and thread their state into `getState()`. One fact to plan around: a very large single write can be cut off by the model and lost. `file_write` REPLACES the whole file, so "writing the rest" with it erases what landed — if a write comes back truncated, append the remainder from the shell instead (`cat >> game/scenes/main.js <<'EOF' … EOF`), or put the remainder in a new file and import it.
- `game/skeletons/` — one complete, working game per SHAPE. **Decide the shape first, before reading anything else**, from how the game is driven and seen — never from its subject: you are the eyes and the mouse turns the head → `firstPerson`; a character you move while the mouse swings the camera round it → `thirdPerson`; throttle and steer, camera following the heading → `vehicle`; the world carried past a lane-switching player → `onRails`; otherwise `avatar`. `python3 game/use_skeleton.py <view>` swaps `main.js` and keeps the old one as `main.js.bak`; `--list` shows what is installed. Never import from `skeletons/` — copy, then edit the copy.
- `game/check.py` — plays the game headlessly and screenshots it; the platform runs it for you once per turn. Not yours to run or edit.
- `game/core/` — the engine. Not yours to rewrite:
  - `host.js` renderer, lights and framing · `loop.js` the fixed step · `input.js` keys, mouse and touch as one region model
  - `collide.js` collision, ground, jumping, settling · `contact.js` pickups and hazards · `motion.js` movement and cameras
  - `shell.js` HUD and screens · `pick.js` screen ↔ world · `diagnostics.js` the `window.__GAME__` contract
  - Signatures are in the API reference at the bottom of this file. Read that rather than the modules: the engine is 3,000 lines and its factories do not start at the top of their files.
- `public/textures/` — a CC0 PBR set (albedo + normal + roughness, Poly Haven `aerial_grass_rock`) fetched into the project when the template was installed, with its licence in `public/textures/ASSETS.md`. The starter ground uses it, and it is the worked example: fetch the sets and models YOUR game needs the same way and add them to that record. A texture drawn on a canvas is a flat colour with a picture on it — it can carry no normal map, so every surface made from one shades perfectly smooth.
- `components/game/GameCanvas.tsx` — the only React that touches the game: mounts the canvas and shows an error banner, nothing else. The HUD and the screens are the engine's (`createShell`), so changing what the game shows is a change to `main.js` alone. `app/page.tsx` loads it with `ssr: false`.

## Workflow

1. Change `main.js` **in place, with targeted edits** — the world (walls through `createWalls`, so the mesh and the collision are one object), the objective (`progress`, `win()`), the mechanic (what `action` does). Keep `start()`, `reset()`, `getState()`, `dispose()`. **Never rewrite the whole file from the top**: a 500-line rewrite is where a truncated write ships half a game, and it throws away wiring that already passes every check.
2. Run `test_nextjs_project` — it type-checks, builds, leaves the dev server running, and then **plays your game with `game/check.py` once per turn**, returning the verdict plus the paths of a frame and a filmstrip under `game/dist/`. **Open the pictures and look at them.** Do not rebuild the checker: a hand-rolled driver costs the whole turn and proves less. Two runs without this spent 24 and 53 minutes writing one, and saved nothing.
3. Fix every FAIL that is a real defect, then call `build_and_save_nextjs_project_checkpoint` ONCE. The playtest does not re-run this turn, and the checkpoint you save is the build the user gets.
4. Tell the user which checks still fail and why — a turn that never reaches step 3 gives them nothing at all. Never launch, poll, read or edit `check.py`.

## Rules the engine cannot enforce

- **`reset()` must leave the game PLAYABLE.** The playtest calls `__GAME__.reset()` several times a run and drives straight after. If you add your own gating flag (`racing`, `countdown`, `started`…), `reset()` must re-arm it — a reset that leaves the flag off with no start screen up is a dead game, and every later check fails against it. A racing build did exactly that and failed six checks twice.
- `getState()` must report `view` (`'avatar'`, `'firstPerson'`, `'thirdPerson'`, `'vehicle'`, `'onRails'`, or `'placement'`), `pos`, `facing`, and spread `contacts.report()`; pass `actor` and `reset` to `attachDiagnostics`. Anything omitted turns off the checks that need it.
- `getState()` should also publish **where the objectives are**, in screen pixels: `screen: { exit: picker.project(exit.position) }` — one entry per live target, from `createPicker({canvas, camera})`, dropping the `null`s (a point behind the camera is not on screen). It is how you confirm from the console that an objective is on screen and reachable rather than walled off.
- Count what exists: every "x of N" derives N from the objects actually created.
- Every objective must be reachable: place pickups outside `solids.blocked(x, z, playerRadius + margin)`, compare ledges against `createJump().apex`.
- A module you create and never feed does nothing: `player.position.copy(solids.resolve(player.position, r, wasAt))` and `contacts.step(wasAt, pos)` run every frame, after the player has moved, with where it was. Register every wall and prop the player must not pass with `solids.addBox/addDisc`; if you rebuild the level, rebuild the solids with it.
- Never pause the simulation or ignore movement because the pointer is not locked. A browser refuses the lock outside a user gesture and drops it whenever the player presses Escape, so a lock-gated game freezes for reasons the player cannot see. Show a hint instead; the engine falls back to drag-to-look.
- Camera: keep what `main.js` does unless the spec asks otherwise — a constant-offset `followCam` (fixed `camYaw`) with world-axis WASD, so W is always away from the camera, A always left on screen, and the world never rotates. **Never derive the camera yaw from velocity or heading.** Only a steering spec (vehicle, "turn", "drive") uses `tankDrive` + `followCam` easing toward the player's own yaw; only a mouse-look spec uses `bindMouseLook('look')` + `walkDirection`.
- **The camera's yaw and the movement axes are one decision.** `followCam`'s forward is `(sin(camYaw), 0, cos(camYaw))`, which at the skeleton's `camYaw = Math.PI` is `-z` — so world-axis WASD reads correctly ONLY at that yaw. **Never turn the camera without turning the input**: the moment a drag, an orbit or any other yaw change reaches `followCam`, hand-written world-axis movement is backwards for the player, and the fix is `walkDirection` with a look region, not a sign flipped somewhere. A scene that keeps a fixed camera keeps world-axis WASD and must not offer a camera control at all — an orbit that moves the camera while the keys stay world-locked is the single most reported "the controls are reversed". The symptom to recognise: W curves, A and D orbit, and only S seems to work.
- One texture tiled over everything reads as a test level: vary the material between areas, and size the tiling to real dimensions rather than to the mesh.
- Look: the floor stays darker than mid-grey and every pickup and hazard is brighter than the floor — saturated `emissive` of its own colour at 1.5-3, distinct colours per type. The engine's lights are already in r185 physical units; never add lights to fix a washed-out frame, darken the floor instead.
- three r185: `outputColorSpace`/`SRGBColorSpace`, `PCFShadowMap`, no `THREE.Clock` — the engine sets these; do not re-set them in the scene.
- Enclosed levels pass `lights: 'interior'` to `createHost`; never light a room by hand. **At most two real-time lights beyond the host rig in the whole scene** — torches, gems and props glow with emissive materials, never with a `PointLight` each; a dozen point lights cost more than everything else in the frame put together.
- Keyboard and mouse first; touch must still be fully playable (drag or hold-zones), detected with `input.coarsePointer()`.

## API reference — one call per line

*(the API cheat-sheet; every signature below is exact)*

Every signature below is the real one. Grep this section for a name rather than reading the
module: the engine is 3,000 lines and its factories do not start at the top of their files.

### collide.js — collision, ground, jumping, settling
`createSolids({passes = 3})` → the collision set
`solids.addBox(x, z, width, depth, {top})` → record. FULL sizes and XZ position. No `top` = a wall at every height
`solids.addDisc(x, z, radius, {top})` → record
`solids.addBox(x, z, w, d, {top: 1.2})` → a LEDGE: blocks feet below 1.2, stood on above it
`solids.resolve(pos, r, from, feetY)` → corrected pos. Runs EVERY frame after the actor moves. Also writes in place
`solids.blocked(x, z, r, feetY)` → boolean. Use it to place pickups where they are reachable
`solids.surfaceAt(x, z, feetY, r)` → the ledge height under the actor, or `null` where there is none -- so it is not `jump.step`'s ground on its own: pass `Math.max(ground, solids.surfaceAt(...) ?? -Infinity)`
`solids.remove(record)` → drops a shape. How a gate opens
`createWalls({scene, solids, host, height, thickness, material, color, castShadow})` → mesh AND collision from one call
`walls.box(x, z, width, depth, {height})` → any proportions: `walls.box(0, -8, 12, 0.4)` is a 12 m wall 0.4 m thick
`walls.grid(rows, {cell, x, z, height})` → walls from rows of text, `#` solid: corridors are exactly one `cell` wide. Returns `{open, at(row, col)}`, every open cell's centre, for the spawn, pickups and the exit
`walls.arc(cx, cz, r, fromDeg, toDeg)` → a curved segment
`walls.ring(cx, cz, r, {gaps: [[a, b], …], gates: [deg, …], gateWidth})` → arcs, with `.gates` handles
`walls.gate(cx, cz, r, deg, {width})` → `{mesh, open(), close(), isOpen}`
`createGround(heightAt, {radius, waterLevel, margin})` → the world's surface and bounds
`world.at(x, z)` → surface height
`world.confine(pos, from)` → corrects x and z only, sliding along a shoreline back toward `from`, the position before this step (no `from`, no shoreline)
`world.place(pos, eye = 0, from)` → confine() plus y ONTO the surface. Never call it in a scene that jumps; it erases the jump
`world.usable(x, z)` → boolean. Dry land inside the world, for spawns and pickups
`createJump({gravity = -22, jumpSpeed = 9})` → vertical motion
`jump.step(y, vy, groundY, dt, wantJump)` → `{y, vy, grounded}`. It OWNS the actor's y; nothing else writes position.y that frame
`jump.apex` → how high THIS configuration reaches. Size every ledge and gap against it
`createRest({enter = 0.05, exit = 0.4})` → settling with hysteresis
`rest.update(speedSq)` → boolean. Separate enter and exit thresholds are what stop it flickering
`createBodies({push = 1})` → actors that must not overlap
`bodies.add(obj, {radius, mass, still})` → record. Add the PLAYER too, or it passes through everything else
`bodies.remove(objOrRecord)`
`bodies.separate()` → resolves every overlapping pair. Run it every frame
`bodies.report()` → spread into `getState()`
`bodies.count` → how many remain. Derive counts from this, not from a number you decrement
`createUnstick({after, nudge, moved, input, regions})` → frees a wedged actor
`unstick.step(pos, moveDir|null, dt)`

### contact.js — pickups and hazards
`createContacts()`
`contacts.pickup(obj, {radius, group, onTake})` → record. A taken pickup disappears on its own
`contacts.hazard(obj, {radius, group, onHit})` → record. The consequence stays yours
`contacts.step(wasAt, pos, {radius, vertical})` → every frame after moving. Judged in the ground plane; `vertical` defaults to 1.6
`contacts.remove(objOrRecord)` → retires ONE item
`contacts.removeGroup(group)` → before re-registering on a restart. **`removeGroup` is the only thing that unregisters**; `reset()` merely unlatches hazards and zeroes the counters, so give every registration a `group` or a restart doubles them
`contacts.reset()`
`contacts.report()` → `{pickupsLeft, hazards, collected, hitsTaken, contactSteps}`. Spread into `getState()`; the checker reads these names

### motion.js — movement and cameras
`walkDirection(input, regions, camera, {radius, deadzone})` → Vector3. Camera-relative: needs a look region, or the actor spins
`tankDrive(input, region, yaw, {dt, turnRate, radius, deadzone, turnAtRest, camera})` → `{yaw, throttle, turn, velocity}`
`steer(input, {left, right}, yaw, {dt, rate, camera, scale})` → `{yaw, turning}`. Takes the sign from the camera, so right turns screen-right
`laneDelta(camera, "left"|"right")` → −1 or 1
`faceYaw(obj, yaw)` → points a mesh
`followCam(camera, target, yaw, {back, height, lookHeight, lookAhead, lerp, dt, minY})`. `back` is positive; the direction is applied inside. **`lerp` is a RATE multiplied by `dt`, not a 0-1 blend** — pass `dt` with it and use values like 8; `lerp: 0.1` takes ten seconds to catch up, `lerp: 0` is rigid
`createLook(camera, {region = 'look', maxPitch, sensitivity})` → first-person camera
`createOrbit(camera, {region = 'look', distance, lookHeight, pitch, minPitch, maxPitch, sensitivity, occluders, ignore, groundAt})` → third-person camera the look region swings round the character. `orbit.step(input)` in the step BEFORE `walkDirection`, `orbit.follow(target, dt)` in render, `orbit.set(yaw)` in reset. `occluders` (the scene) pulls it in front of a wall; `ignore` is the character
`look.step(input)` → in the step, before `walkDirection`
`look.set(yaw, pitch)` · `look.forward(out)` · `look.yaw` · `look.pitch`
`steer`, `tankDrive` and `laneDelta` RETURN a value you must use. Dropping it is a control that does nothing

### input.js — keys, mouse and touch as one model
`createInput(el, {onActivity})`
`input.bindKeys(region, {up, down, left, right})` → each an array of KeyboardEvent codes; defaults are WASD plus the arrows
`input.bindKey(region, [codes])` → KeyboardEvent codes, plus `'MouseLeft'`, `'MouseRight'`, `'MouseMiddle'` for mouse buttons: `bindKey('fire', ['MouseLeft', 'Space'])`
`input.bindMouseLook(region, {sensitivity, lock})` → collects the delta only; `createLook` is what turns the camera. This `sensitivity` is RADIANS PER PIXEL (0.0025); `createLook`'s and `createOrbit`'s multiplies it (1 is normal speed)
`input.addRegion(name, {x, y, w, h})` → a region a FINGER can hit. `bindKeys` alone makes a zero-size region: keyboard only
`input.region(name)` → `{pressed, held, released, tap, swipe, vec}`, read in the fixed step (`pressed`/`released` last until one has run)
`input.sample(region, {radius, deadzone})` → `{x, y}`, y UP the screen
`input.wentDown(code)` · `input.isDown(code)` → a bare key with no region
`input.coarsePointer()` → touch device
`input.endFrame()` → called by the loop after every frame. Do not call it from a scene
`input.dispose()`

### host.js — renderer, lights, framing
`createHost({canvas, onError, manageColour, antialias, captureFrames, lights})`. `lights: 'interior'` for enclosed levels
`host.scene` · `host.camera` · `host.renderer` · `host.pixelRatio`
`host.environment({intensity, override})` → the reflections a PBR material needs. Call it once, at setup, on any
scene with metal, glass, gloss or a vehicle. The light rig lights surfaces; only this fills what they reflect
`host.sun` · `host.fill` · `host.lamp` → the light rig. Tune these; do not add lights to fix a washed-out frame
`host.present()` → draw. This is the loop's `render`
`host.track(obj)` → hands a geometry, material or texture to the host to dispose
`host.fitBounds(min, max, {dir, padding})` → frames two CORNERS, not a Box3. A fixed camera cannot follow two things
`host.captureFrame()` → a PNG data URL
`host.report(err)` → report your own error into the engine's channel
`host.errors` → what has been reported
`host.dispose()`
`host.resize()` and `host.endFrame()` belong to `attachLifecycle` and the loop. Do not call them from a scene

### loop.js — the fixed step
`createLoop({mode = 'continuous', hz = 60, maxCatchUp = 5, step, render})`
`loop.start()` · `loop.stop()` · `loop.pause()` · `loop.resume()`
`loop.onFrame(fn)` → a per-frame tail outside the fixed step
`loop.invalidate()` → mark a redraw needed
`loop.schedule(target, props, ms, ease)` → a TWEEN. Eases the named props of `target` over `ms`, returns a handle with `.cancel()`
`loop.simTime` · `loop.frame` · `loop.running`
There is no "call this in N seconds" timer. Schedule a tween, or count down in your own `step()`

### shell.js — HUD and screens
`createShell(input, {mount, fields, screens, onAction, actionRegion = 'shellAction'})`
`shell.set(field, value)` · `shell.get(field)` → read a HUD value back rather than keeping a second copy
`shell.show(screen, {title, hint, action})` · `shell.hide()`
`shell.screen` → the phase, `null` while playing
`shell.report()` → spread LAST into `getState()`

### pick.js — screen ↔ world
`createPicker({canvas, camera})`
`picker.project(worldVec3)` → `{x, y, z}` in pixels, or `null` behind the camera
`picker.pick(px, py, objects)` → `{ray, hits}`
`picker.groundAt(x, z, mesh, from = 500)` → the height of the first surface below (x, z). Checks a collider against the VISIBLE mesh

**Sound is not in the engine.** There is no audio module and the skeletons are silent — the Web Audio
work is yours, including the `AudioContext` (create it on the Start click) and its teardown.

### diagnostics.js and lifecycle.js — required wiring
`attachDiagnostics({host, loop, input, getState, actor, reset})` → installs `window.__GAME__`
`mesh.userData.notGround = true` → the playtest's ground probe skips it (a water surface, a trigger volume). A sky dome, hidden meshes, points and lines are skipped already
`__GAME__.getState()` · `applyInput(region, {x, y})` · `releaseInput(region)` · `reset()` · `screenOf(worldPos)` · `engineUse()` · `penetrations()` · `captureFrame()`
`attachLifecycle({canvas, loop, host, onResize, onContextLost, onContextRestored})` → resize and context loss
`lifecycle.dispose()`
