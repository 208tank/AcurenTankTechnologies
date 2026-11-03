/**
 * Multi-region, multi-pointer touch input. Regions are named rectangles in
 * normalised screen space; each tracks its own pointers with press/held/release
 * edges. This is the primitive: a joystick, a look-area and a pinch-zoom are all
 * adapters over it.
 *
 * Convention, stated once so nobody inverts it twice: `y` is UP-POSITIVE.
 * Screen Y grows downward, so it is negated exactly HERE and nowhere else.
 */
export function createInput(el, { onActivity } = {}) {
  const wake = () => { try { onActivity && onActivity(); } catch (_) {} };
  const regions = new Map();
  // Regions belonging to a control something actually DREW. They are hit-tested first, whatever
  // order they were declared in.
  //
  // onDown() below takes the FIRST region whose area contains the touch and breaks. That made
  // declaration order silently decide which control a finger reaches, and a generated island
  // explorer lost three of its four D-pad buttons to it: it declared one broad invisible region
  // for tank drive BEFORE the buttons, so every touch inside that area went to the invisible one
  // and only the button poking out past its edge worked. A racing build declared an even larger
  // overlapping region and was fine purely because it declared it LAST. Nothing warned either
  // way, and no check could see it -- the QA seam injects by region NAME and bypasses hit
  // testing entirely. A drawn control outranking an undrawn one removes the ordering question.
  const drawn = new Set();
  function prioritise(name) {
    if (!regions.has(name)) return false;
    drawn.add(name);
    const all = [...regions];
    regions.clear();
    for (const [k, v] of all) if (drawn.has(k)) regions.set(k, v);   // drawn first, in bind order
    for (const [k, v] of all) if (!drawn.has(k)) regions.set(k, v);
    return true;
  }
  const active = new Map();  // pointerId -> region name

  // AN EDGE IS READ BY ONE STEP. A press, a click, a region's pressed/released, a tap or a swipe is
  // stamped with the loop's step count when it arrives, and a step sees it only if it is the FIRST
  // step to begin after it. The loop renders once per display refresh but steps at a fixed 60 Hz, so
  // judging edges by rendered frames went wrong both ways: at 120-144 Hz a press landing in a frame
  // with no step was cleared unseen, and at 30 fps -- or under the playtest's software renderer --
  // every step in a two-step frame saw it, so ten clicks fired nineteen times and Escape toggled
  // pause twice. Outside a step (render, the per-frame tail) an edge is visible once its step has
  // begun and until that frame ends. With no loop wired (see syncToSteps) it lives one rendered
  // frame, as before.
  let stepClock = null, stepFlag = null, framesEnded = 0, lastEndStep = null, lookReadInStep = false;
  const stepNow = () => { const n = stepClock ? stepClock() : null; return typeof n === 'number' ? n : null; };
  const inStep = () => !!(stepFlag && stepFlag());
  const stamp = () => ({ step: stepNow(), frame: framesEnded });
  function visible(st) {
    if (!st) return false;
    const n = stepNow();
    if (n === null || st.step === null) return st.frame === framesEnded;
    return inStep() ? n === st.step + 1 : n >= st.step + 1;
  }
  /** Has this edge had its step (with no loop: its frame)? Then endFrame lets it go. */
  function spent(st) {
    const n = stepNow();
    return !st || n === null || st.step === null || n >= st.step + 1;
  }

  function addRegion(name, bounds = { x: 0, y: 0, w: 1, h: 1 }) {
    const reg = {
      name, bounds,
      node: null, pad: 0,           // set by bindRegionToElement: the element this region IS
      pointers: new Map(),          // pointerId -> {startX,startY,x,y,dx,dy}
      held: false,
      vec: { x: 0, y: 0 },          // normalised drag from origin, y UP-positive
      _pressedAt: null, _releasedAt: null, _tap: null, _tapAt: null, _swipe: null, _swipeAt: null,
    };
    // ONE-SHOT edges and gestures, all on the step clock above. Getting their lifetime right took
    // three attempts, each with a measured failure mode:
    //   cleared in endFrame()  -> a finger lifting between step() and render() had its gesture
    //                             cleared before any step could read it. 1 real swipe in 4 was
    //                             silently dropped -- on a device, "sometimes it doesn't register".
    //   kept one extra frame   -> a gesture arriving BEFORE step() was then read by two
    //                             consecutive steps: one flick, two lane changes.
    //   read-consumes          -> intended one read, but handed the gesture to every read until
    //                             endFrame, so a two-step frame still saw it twice.
    Object.defineProperty(reg, 'pressed', {
      enumerable: true,
      get() { return visible(reg._pressedAt); },
      set(v) { reg._pressedAt = v ? stamp() : null; },
    });
    Object.defineProperty(reg, 'released', {
      enumerable: true,
      get() { return visible(reg._releasedAt); },
      set(v) { reg._releasedAt = v ? stamp() : null; },
    });
    Object.defineProperty(reg, 'tap', {
      enumerable: true,
      get() { return visible(reg._tapAt) ? reg._tap : null; },
      set(v) { reg._tap = v; reg._tapAt = v ? stamp() : null; },
    });
    Object.defineProperty(reg, 'swipe', {
      enumerable: true,
      get() { return visible(reg._swipeAt) ? reg._swipe : null; },
      set(v) { reg._swipe = v; reg._swipeAt = v ? stamp() : null; },
    });
    regions.set(name, reg);
    return reg;
  }

  const rect = () => el.getBoundingClientRect();
  /** A region bound to an element IS that element: invisible means untouchable, and moved
   *  means moved. Both used to be wrong, because bindRegionToElement() snapshotted the rect
   *  once and nothing ever revisited it.
   *
   *  A tower defence shipped a turret shop that binds its cards inside show() and only sets
   *  display:none in hide() -- never unbinding, 0 unbind calls in the whole build. So every
   *  card kept the rect it had while visible AND its `drawn` status, forever. The checker
   *  found them "fully on screen" and "pressable"; the player saw nothing. Same shape as an
   *  island game's undrawn joystick and a runner whose start overlay was hidden by
   *  overwriting cssText: the harness path and the finger path diverge, and the harness wins.
   *
   *  Reading the element live fixes staleness and visibility together. A zero-size rect covers
   *  display:none and detachment; visibility:hidden is checked separately because it keeps its
   *  box. Opacity is deliberately NOT checked -- controls legitimately fade mid-animation, and
   *  failing those would swap one false negative for another. */
  function visibleBounds(reg) {
    if (!reg.node) return reg.bounds;
    if (!reg.node.isConnected) return null;
    const b = reg.node.getBoundingClientRect();
    if (b.width <= 0 || b.height <= 0) return null;
    const cs = (reg.node.ownerDocument.defaultView || window).getComputedStyle(reg.node);
    if (cs.visibility === 'hidden' || cs.display === 'none') return null;
    const r = rect(), pad = reg.pad || 0;
    return {
      x: (b.left - r.left - pad) / r.width,
      y: (b.top - r.top - pad) / r.height,
      w: (b.width + pad * 2) / r.width,
      h: (b.height + pad * 2) / r.height,
    };
  }

  function hit(name, cx, cy) {
    const reg = regions.get(name);
    const b = visibleBounds(reg);
    if (!b) return false;
    reg.bounds = b;                 // keep the snapshot current for injection and reporting
    const r = rect();
    const nx = (cx - r.left) / r.width, ny = (cy - r.top) / r.height;
    return nx >= b.x && nx <= b.x + b.w && ny >= b.y && ny <= b.y + b.h;
  }

  /** Classify a release delta into a directional flick, in sample()'s UP-positive y.
   *  `dir` is the dominant axis so a game can switch on it without doing trigonometry, and
   *  x/y are normalised so a game that wants the raw direction still has it. */
  function swipeFrom(dx, dyUp, from = null, at = null) {
    const d = Math.hypot(dx, dyUp) || 1;
    const dir = Math.abs(dx) >= Math.abs(dyUp) ? (dx > 0 ? 'right' : 'left') : (dyUp > 0 ? 'up' : 'down');
    // `from` and `at` are the press and release points in CSS px. Direction alone is enough
    // for a lane change, but DRAG-AND-DROP needs to know where the finger let go -- dragging a
    // turret onto a cell, or a piece onto a square. `tap` only fires when the finger barely
    // moved, so before this a drag release produced no position at all and those genres had
    // nothing in the engine to read. Same shape of gap as the missing swipe.
    return { x: dx / d, y: dyUp / d, dir, dist: d, from, at };
  }

  function onDown(e) {
    // A LOCKED MOUSE IS THE LOOK, NOT A FINGER ON A REGION. setPointerCapture() throws
    // InvalidStateError while the document holds a pointer lock (Pointer Events L3), and the
    // first- and third-person shapes lock on the first click -- so every click after it threw from
    // here, and the dev overlay covered the game with the error. While locked, mouse buttons reach
    // the game as key codes ('MouseLeft' ...); a click has nothing to do with the regions.
    if (e.pointerType === 'mouse' && document.pointerLockElement === el) return;
    // Take the SMALLEST matching region, not the first one in iteration order.
    //
    // Regions are ordered drawn-first in BIND order, and this loop used to stop at the first hit.
    // So a large control bound early swallowed a small one bound later: circuit binds `stick` over
    // the bottom-left 60% of the screen, and an action button was then bound INSIDE that
    // rectangle -- leaving the start button unreachable through the region path. It works today
    // only because the button ALSO had a DOM click listener, which is why nothing caught it:
    // the harness drives that button by injection and never hit-tests it, so anything relying on
    // the region path alone was broken and invisible.
    //
    // A smaller region is the more specific target, which is what a player aiming at it means.
    // Drawn regions still outrank undrawn ones; size only decides between equals.
    let best = null, bestKey = Infinity;
    for (const [name, reg] of regions) {
      if (!hit(name, e.clientX, e.clientY)) continue;
      const b = reg.bounds || { w: 1, h: 1 };
      const key = (drawn.has(name) ? 0 : 1) + Math.max(0, Math.min(1, (b.w || 1) * (b.h || 1)));
      if (key < bestKey) { bestKey = key; best = name; }
    }
    for (const [name, reg] of regions) {
      if (name !== best) continue;
      reg.pointers.set(e.pointerId, { startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, dx: 0, dy: 0 });
      reg.pressed = true; reg.held = true;
      active.set(e.pointerId, name);
      // Capture so a drag that leaves the canvas still ends here. It can refuse -- a pointer that
      // has already lifted, a synthesised one -- and a refusal must not stop the press registering.
      try { el.setPointerCapture && el.setPointerCapture(e.pointerId); } catch (_) { /* uncapturable pointer */ }
      wake();
      break;
    }
  }
  function onMove(e) {
    const name = active.get(e.pointerId); if (!name) return;
    const reg = regions.get(name); const p = reg.pointers.get(e.pointerId); if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    p.dx = p.x - p.startX; p.dy = p.y - p.startY;
    wake();
  }
  function endPointer(e) {
    const name = active.get(e.pointerId); if (!name) return;
    const reg = regions.get(name); const p = reg.pointers.get(e.pointerId);
    // A release is either a TAP (barely moved) or a SWIPE (a directional flick). Both are
    // discrete gestures, and until now only the tap existed -- so a lane runner, whose whole
    // control scheme is "flick left/right/up", had nothing in the engine to read. It wrote raw
    // canvas listeners because it had to, then added a SECOND reader of input.sample purely to
    // satisfy a checker, and a real finger fired both: one swipe, two lane changes. The engine
    // covering the genre's actual control is what removes the reason to go around it.
    if (p && Math.hypot(p.dx, p.dy) < 8) {
      reg.tap = { x: p.x, y: p.y };
    } else if (p) {
      reg.swipe = swipeFrom(p.dx, -p.dy, { x: p.startX, y: p.startY }, { x: p.x, y: p.y });
    }
    reg.pointers.delete(e.pointerId);
    active.delete(e.pointerId);
    if (reg.pointers.size === 0) {
      // Release EVERYTHING: a stuck vector is why a vehicle keeps driving with
      // no finger on the screen.
      reg.held = false; reg.released = true; reg.vec.x = 0; reg.vec.y = 0;
    }
    wake();
  }

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', endPointer);
  el.addEventListener('pointercancel', endPointer);
  el.addEventListener('pointerleave', endPointer);

  function sample(name, { radius = 60, deadzone = 0.15 } = {}) {
    const reg = regions.get(name); if (!reg) return { x: 0, y: 0 };
    const p = reg.pointers.values().next().value;
    if (!p) {
      // No pointer on this region: a keyboard binding or mouse-look supplies the vector instead.
      // Pointers win when present so the QA seam (inject) and a real drag both override keys.
      if (reg.keyVec) { reg.vec.x = reg.keyVec.x; reg.vec.y = reg.keyVec.y; return reg.vec; }
      if (reg.lookVec) { const d = lookDelta(reg); reg.vec.x = d.x; reg.vec.y = d.y; return reg.vec; }
      reg.vec.x = 0; reg.vec.y = 0; return reg.vec;
    }
    let dx = p.dx, dy = p.dy;
    const d = Math.hypot(dx, dy);
    if (d > radius) { dx = (dx / d) * radius; dy = (dy / d) * radius; }
    let nx = dx / radius, ny = -dy / radius;         // <-- the single Y inversion
    const m = Math.hypot(nx, ny);
    if (m < deadzone) { nx = 0; ny = 0; }
    else { const s = (m - deadzone) / (1 - deadzone) / m; nx *= s; ny *= s; }
    reg.vec.x = nx; reg.vec.y = ny;
    return reg.vec;
  }

  function pinch(name) {
    const reg = regions.get(name); if (!reg || reg.pointers.size < 2) return null;
    const [a, b] = [...reg.pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  /** Discrete gestures must survive ONE FULL FRAME, not "until the end of this frame".
   *
   *  endFrame() runs in render(), after step(). A finger lifting between those two calls set
   *  `tap`/`swipe` and had it cleared before any step could read it -- the gesture was silently
   *  dropped. Measured with real pointer events: 1 of 4 identical swipes vanished, which on a
   *  device reads as "sometimes the swipe just doesn't register". The step clock at the top of
   *  createInput makes a gesture readable by exactly one step, whenever in the frame it arrived. */
  // Anything subscribed here runs once per frame, because the LOOP calls endFrame() now.
  // That is what makes on-screen knob and button feedback automatic: before this, no
  // scene in the suite called controls.update(), so in every game built from this template the
  // joystick knob never followed the thumb and a held button never lit up. Subscribers run
  // BEFORE the clearing below, so they still see this frame's pressed/tap/swipe.
  const _tailSubs = [];
  function onEndFrame(fn) {
    if (typeof fn !== 'function') {
      throw new Error('input.onEndFrame(fn) takes a function; got ' + typeof fn);
    }
    if (!_tailSubs.includes(fn)) _tailSubs.push(fn);
    return () => { const i = _tailSubs.indexOf(fn); if (i >= 0) _tailSubs.splice(i, 1); };
  }

  /** Wired by attachDiagnostics: `clock` returns how many fixed steps have begun, `stepping`
   *  whether one is running now. */
  function syncToSteps(clock, stepping = null) {
    stepClock = typeof clock === 'function' ? clock : null;
    stepFlag = typeof stepping === 'function' ? stepping : null;
  }

  /** MOUSE LOOK, read once per step. The first step to sample a look region takes everything the
   *  mouse moved since and zeroes it, so a second step in the same frame gets nothing and a frame
   *  with no step keeps it for the next -- the camera turned twice as far at 30 fps and half as far
   *  at 120 Hz when the delta was zeroed per rendered frame and read per step. Outside a step (a
   *  scene that turns its camera in render) the delta is this frame's, as before. */
  function lookDelta(reg) {
    const n = stepNow();
    if (n === null || !inStep()) return reg.lookVec;
    lookReadInStep = true;
    if (reg._lookStep !== n) {
      reg._lookStep = n;
      reg._stepLook = { x: reg.lookVec.x, y: reg.lookVec.y };
      reg.lookVec.x = 0; reg.lookVec.y = 0;
    }
    return reg._stepLook;
  }

  function endFrame() {
    for (let i = 0; i < _tailSubs.length; i++) {
      try { _tailSubs[i](); } catch (e) { /* a broken overlay must never stop the game */ }
    }
    for (const edges of [keyEdges.down, keyEdges.up]) {
      for (const [code, st] of edges) if (spent(st)) edges.delete(code);
    }
    const n = stepNow();
    // Look movement a step reader has not had the chance to read -- a frame that ran no step -- is
    // kept for the next step. Everything else is this frame's and goes: a step that ran and did not
    // read it (paused, a start screen up) chose not to, and a scene that turns in render reads it
    // every frame.
    const keepLook = lookReadInStep && n !== null && n === lastEndStep;
    for (const reg of regions.values()) {
      if (spent(reg._pressedAt)) reg._pressedAt = null;
      if (spent(reg._releasedAt)) reg._releasedAt = null;
      if (reg._tap && spent(reg._tapAt)) { reg._tap = null; reg._tapAt = null; }
      if (reg._swipe && spent(reg._swipeAt)) { reg._swipe = null; reg._swipeAt = null; }
      if (reg.lookVec && !keepLook) { reg.lookVec.x = 0; reg.lookVec.y = 0; }
    }
    lastEndStep = n;
    framesEnded++;
  }
  function region(name) { return regions.get(name); }
  function dispose() {
    el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', endPointer); el.removeEventListener('pointercancel', endPointer);
    el.removeEventListener('pointerleave', endPointer);
    removeEventListener('keydown', onKeyDown); removeEventListener('keyup', onKeyUp);
    removeEventListener('blur', releaseAllKeys);
    el.removeEventListener('pointerdown', onTouchDown); el.removeEventListener('mousedown', onMouseDown);
    removeEventListener('mouseup', onMouseUp); el.removeEventListener('contextmenu', onContextMenu);
    document.removeEventListener('pointerlockchange', onLockChange);
    document.removeEventListener('mousemove', onLookMove);
    // The canvas outlives the game: a rebuilt scene starts on the same element, so a click left
    // bound here grabbed pointer lock for a game that no longer exists -- and a lock left held
    // kept hiding the cursor in one that has no mouse look.
    el.removeEventListener('click', requestLock);
    exitLock();
  }

  // ------------------------------------------------------------------ keyboard & mouse
  // Desktop is how these games are mostly played, so keys and the mouse are first-class here
  // rather than an afterthought. Both feed the SAME region model as touch: a key-bound region
  // has pressed/held/released edges and a vec exactly like a pointer-driven one, so a game
  // reads one API whatever the player is holding, and the QA seam (inject) drives it unchanged.
  //
  // Keys are tracked by `e.code` (physical key, layout-independent), and EVERY key is released
  // on window blur: alt-tabbing with W held otherwise leaves the player running forever --
  // the keyboard's version of the stuck-vector bug.
  const keysDown = new Set();
  const keyEdges = { down: new Map(), up: new Map() };   // code -> stamp()
  const keyBindings = new Map();   // region name -> { up, down, left, right, codes }

  function refreshKeyVec(reg, b) {
    const held = (codes) => codes.some((c) => keysDown.has(c));
    if (b.codes) {                                       // a button: any of these codes
      const now = held(b.codes);
      if (now && !reg.held) reg.pressed = true;
      if (!now && reg.held) reg.released = true;
      reg.held = now;
      reg.keyVec.y = now ? 1 : 0;
      return;
    }
    const x = (held(b.right) ? 1 : 0) - (held(b.left) ? 1 : 0);
    const y = (held(b.up) ? 1 : 0) - (held(b.down) ? 1 : 0);   // y UP-positive, same as sample()
    const m = Math.hypot(x, y) || 1;
    reg.keyVec.x = x / m; reg.keyVec.y = y / m;
    const now = x !== 0 || y !== 0;
    if (now && !reg.held) reg.pressed = true;
    if (!now && reg.held) reg.released = true;
    reg.held = now;
  }
  function refreshAllKeys() {
    for (const [name, b] of keyBindings) { const reg = regions.get(name); if (reg && reg.pointers.size === 0) refreshKeyVec(reg, b); }
  }
  function onKeyDown(e) {
    if (e.repeat) return;
    if (!keysDown.has(e.code)) { keysDown.add(e.code); keyEdges.down.set(e.code, stamp()); }
    // Only swallow keys a binding claims, so the browser keeps its own shortcuts.
    for (const b of keyBindings.values()) {
      const all = b.codes || [...b.up, ...b.down, ...b.left, ...b.right];
      if (all.includes(e.code)) { e.preventDefault(); break; }
    }
    refreshAllKeys(); wake();
  }
  function onKeyUp(e) {
    if (keysDown.delete(e.code)) keyEdges.up.set(e.code, stamp());
    refreshAllKeys(); wake();
  }
  function releaseAllKeys() { keysDown.clear(); refreshAllKeys(); }
  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);
  addEventListener('blur', releaseAllKeys);

  // MOUSE BUTTONS ARE KEYS: 'MouseLeft', 'MouseMiddle' and 'MouseRight' go through keysDown and the
  // key edges, so wentDown('MouseLeft'), isDown('MouseRight') and bindKey('fire', ['MouseLeft',
  // 'Space']) all work. There was no way to ask, so a first-person build wrote
  // wentDown('mouseLeft') -- valid JavaScript, false forever -- and spent twelve turns finding out.
  // mousedown rather than pointerdown: a second button pressed while one is held fires no second
  // pointerdown. The mouse events a browser synthesises after a touch are ignored.
  const MOUSE_CODES = ['MouseLeft', 'MouseMiddle', 'MouseRight'];
  let lastTouch = -Infinity;
  const onTouchDown = (e) => { if (e.pointerType === 'touch') lastTouch = performance.now(); };
  function onMouseDown(e) {
    const code = MOUSE_CODES[e.button];
    if (!code || performance.now() - lastTouch < 800) return;
    if (!keysDown.has(code)) { keysDown.add(code); keyEdges.down.set(code, stamp()); }
    refreshAllKeys(); wake();
  }
  function onMouseUp(e) {
    const code = MOUSE_CODES[e.button];
    if (code && keysDown.delete(code)) keyEdges.up.set(code, stamp());
    refreshAllKeys(); wake();
  }
  // A bound right button must not open the browser's menu over the game.
  const onContextMenu = (e) => {
    for (const b of keyBindings.values()) if ((b.codes || []).includes('MouseRight')) { e.preventDefault(); return; }
  };
  el.addEventListener('pointerdown', onTouchDown);
  el.addEventListener('mousedown', onMouseDown);
  addEventListener('mouseup', onMouseUp);           // released outside the canvas still releases
  el.addEventListener('contextmenu', onContextMenu);

  // A CODE THAT IS NO KEY can never be pressed, and nothing said so. Each unknown one is named
  // once, with the code it most likely meant.
  const KNOWN_CODE = new RegExp('^(Key[A-Z]|Digit[0-9]|Numpad\\w+|F[0-9]{1,2}|Arrow(Up|Down|Left|Right)|'
    + '(Shift|Control|Alt|Meta)(Left|Right)|Mouse(Left|Middle|Right)|Space|Enter|Escape|Tab|Backspace|'
    + 'Delete|Insert|Home|End|PageUp|PageDown|CapsLock|Minus|Equal|BracketLeft|BracketRight|Backslash|'
    + 'Semicolon|Quote|Backquote|Comma|Period|Slash|IntlBackslash)$');
  const checkedCodes = new Set();
  function checkCode(code, where) {
    if (checkedCodes.has(code)) return;
    checkedCodes.add(code);
    if (typeof code === 'string' && KNOWN_CODE.test(code)) return;
    const c = String(code);
    const meant = /^mouse(left|middle|right)$/i.test(c) ? 'Mouse' + c[5].toUpperCase() + c.slice(6).toLowerCase()
      : /^[a-z]$/i.test(c) ? 'Key' + c.toUpperCase()
        : /^[0-9]$/.test(c) ? 'Digit' + c
          : { ' ': 'Space', space: 'Space', esc: 'Escape', escape: 'Escape', enter: 'Enter', shift: 'ShiftLeft',
              ctrl: 'ControlLeft', control: 'ControlLeft', alt: 'AltLeft', up: 'ArrowUp', down: 'ArrowDown',
              left: 'ArrowLeft', right: 'ArrowRight' }[c.toLowerCase()];
    const msg = `input.${where}(${JSON.stringify(code)}): not a key code, so it can never be pressed`
      + (meant ? ` -- did you mean '${meant}'?` : '.') + ' Codes are KeyboardEvent.code names -- \'KeyW\', '
      + "'Space', 'ArrowUp', 'ShiftLeft', 'Digit1' -- or 'MouseLeft', 'MouseRight', 'MouseMiddle'.";
    setTimeout(() => {
      const g = globalThis.__GAME__;
      if (g && typeof g.reportError === 'function') g.reportError('ENGINE ADVICE: ' + msg);
      else console.error('ENGINE ADVICE: ' + msg);
    }, 0);
  }

  /** A movement region driven by keys. Defaults to WASD + arrows; y is UP-positive
   *  (W / ArrowUp = +1), the same convention every other vector in this module uses. */
  function bindKeys(name, { up = ['KeyW', 'ArrowUp'], down = ['KeyS', 'ArrowDown'],
                             left = ['KeyA', 'ArrowLeft'], right = ['KeyD', 'ArrowRight'] } = {}) {
    const reg = regions.get(name) || addRegion(name, { x: 0, y: 0, w: 0, h: 0 });
    reg.keyVec = { x: 0, y: 0 };
    for (const c of [...up, ...down, ...left, ...right]) checkCode(c, 'bindKeys');
    keyBindings.set(name, { up, down, left, right });
    return reg;
  }
  /** A button region driven by one or more keys: `pressed` from the moment it goes down until
   *  the next step has run, `held` while down, `released` likewise when it comes up. */
  function bindKey(name, codes = ['Space']) {
    const reg = regions.get(name) || addRegion(name, { x: 0, y: 0, w: 0, h: 0 });
    reg.keyVec = { x: 0, y: 0 };
    const list = Array.isArray(codes) ? codes : [codes];
    for (const c of list) checkCode(c, 'bindKey');
    keyBindings.set(name, { codes: list });
    return reg;
  }
  /** Is this key down right now? For one-off reads (Escape to pause) that need no region. */
  function isDown(code) { checkCode(code, 'isDown'); return keysDown.has(code); }
  /** Went down since the last step? Seen by the first step after the key went down, not by a second. */
  function wentDown(code) { checkCode(code, 'wentDown'); return visible(keyEdges.down.get(code)); }

  // Mouse look: pointer lock when the game asks for it, drag-to-look as the fallback when
  // lock is refused, exits, or the device has no fine pointer. Either way the region's vec is
  // this frame's look delta (x right-positive, y UP-positive), consumed by endFrame().
  let lookRegion = null, lookSensitivity = 0.0025, lockWanted = false;
  function onLookMove(e) {
    if (!lookRegion) return;
    const locked = document.pointerLockElement === el;
    if (!locked && !(e.buttons & 1)) return;             // drag-to-look needs the button held
    lookRegion.lookVec.x += e.movementX * lookSensitivity;
    lookRegion.lookVec.y -= e.movementY * lookSensitivity;  // <-- the single Y inversion, mouse edition
    wake();
  }
  function onLockChange() { wake(); }
  /** Bind a look region to mouse movement. `sensitivity` is RADIANS PER PIXEL of mouse travel;
   *  createLook's and createOrbit's own `sensitivity` multiplies it. `lock: true` requests pointer
   *  lock on the first click of the canvas (must be a user gesture); the game reads
   *  `input.pointerLocked` to show a "click to look around" hint -- and keeps running while
   *  unlocked, because drag-to-look still works and a browser drops the lock on every Escape. */
  function bindMouseLook(name, { sensitivity = 0.0025, lock = true } = {}) {
    if (sensitivity > 0.05) {
      setTimeout(() => {
        const msg = `input.bindMouseLook('${name}', { sensitivity: ${sensitivity} }): this sensitivity is RADIANS PER `
          + `PIXEL, so ${sensitivity} turns the camera ${Math.round(sensitivity / 0.0025)}x faster than the default `
          + '0.0025. A multiplier belongs in createLook / createOrbit { sensitivity }, where 1 is normal speed.';
        const g = globalThis.__GAME__;
        if (g && typeof g.reportError === 'function') g.reportError('ENGINE ADVICE: ' + msg);
        else console.error('ENGINE ADVICE: ' + msg);
      }, 0);
    }
    const reg = regions.get(name) || addRegion(name, { x: 0, y: 0, w: 0, h: 0 });
    reg.lookVec = { x: 0, y: 0 };
    lookRegion = reg; lookSensitivity = sensitivity; lockWanted = lock;
    document.addEventListener('mousemove', onLookMove);
    document.addEventListener('pointerlockchange', onLockChange);
    if (lock) el.addEventListener('click', requestLock);
    return reg;
  }
  function requestLock() {
    if (!lockWanted || document.pointerLockElement === el) return;
    try { const p = el.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* refused: drag-to-look still works */ }
  }
  function exitLock() { try { if (document.pointerLockElement === el) document.exitPointerLock(); } catch (_) {} }
  /** True when a touch-first device is driving: coarse pointer and no hover. Games use it to
   *  draw hold-zones or a directional pad; it is a hint, never a gate -- keys and mouse keep
   *  working regardless. */
  const coarsePointer = () => { try { return matchMedia('(pointer: coarse)').matches; } catch (_) { return false; } };

  // Test/QA seam: inject synthetic pointer state without a real finger.
  // Returns false for a region the scene never registered, instead of quietly
  // creating one: a mistyped region name used to look exactly like a broken scene,
  // because the injected input went to a region nothing samples.
  function inject(name, { x = 0, y = 0, down = true, at = null, atPx = null } = {}) {
    const reg = regions.get(name);
    if (!reg) return false;
    // A tap aimed at an exact pixel, for a checker that knows where the game's objects are
    // because the game projected them. Refused when the pixel is outside the region, so a
    // target that does not actually lie in the declared hit area is a visible failure
    // rather than an input that silently works from nowhere.
    if (atPx && !hit(name, atPx.x, atPx.y)) return false;
    if (!down) {
      // Lifting without having dragged IS a tap -- exactly what endPointer() does for a
      // real finger. Without this the QA seam could not drive a tap-based game at all:
      // injection only ever set a drag vector, so a board game reading `tap` looked
      // like a game whose controls do nothing, and every check that needed to play it
      // was skipped. The seam has to behave like the thing it stands in for.
      const p = reg.pointers.get(-1);
      if (p && Math.hypot(p.dx, p.dy) < 8) {
        // Where in the region. Defaults to the centre, but a checker driving a game that
        // picks 3D objects has to be able to aim: a full-screen board whose pieces are
        // anywhere but the middle responds to a centre tap by doing nothing, which is
        // indistinguishable from a region the game never reads.
        const px = atPx || p.atPx;
        if (px) {
          reg.tap = { x: px.x, y: px.y };
        } else {
          const a = at || p.at || { u: 0.5, v: 0.5 };
          const r = rect(), b = reg.bounds;
          reg.tap = { x: r.left + (b.x + b.w * a.u) * r.width, y: r.top + (b.y + b.h * a.v) * r.height };
        }
      } else if (p) {
        // Dragged, then lifted: the injected equivalent of a flick. Mirrors endPointer()
        // exactly, so a checker producing a swipe drives the SAME field a real finger sets.
        // That is the point -- when the seam and the finger land on one code path, a game has
        // no reason to write a second reader just for the checker, which is how one swipe
        // ended up moving two lanes.
        reg.swipe = swipeFrom(p.dx, -p.dy, p.atPx || null, p.atPx || null);
      }
      reg.pointers.clear(); reg.held = false; reg.released = true; reg.vec.x = 0; reg.vec.y = 0;
      return true;
    }
    // A LOOK region is fed by pointer DELTAS that endFrame() clears, not by a held vector:
    // sample() returns lookVec and never looks at reg.vec. So the drag below set a vector no
    // scene ever reads, and the QA seam could not turn a camera AT ALL. The cost was not
    // theoretical -- a first-person game whose mouse look was completely dead scored exactly the
    // same as the identical game with it working, because nothing could tell them apart. 200 px
    // is a firm drag; multiplying by the region's own sensitivity keeps an injected turn the same
    // size as the one a hand would produce.
    // `pressed` as well as `held`. A real finger sets both (see startPointer) and so does a key,
    // but injection set only `held` -- so `if (input.region('fire').pressed)`, the shape every
    // fire/jump/place/dash mechanic uses, was dead under the playtest and the checker reported the
    // control as doing nothing. The reference scene's own dash reads .pressed.
    if (reg.lookVec) {
      reg.lookVec.x += x * 200 * lookSensitivity;
      reg.lookVec.y += y * 200 * lookSensitivity;   // y is UP-positive here, as it is out of sample()
      if (!reg.held) reg.pressed = true;
      reg.held = true;
      return true;
    }
    reg.pointers.set(-1, { startX: 0, startY: 0, x: x * 60, y: -y * 60, dx: x * 60, dy: -y * 60, at, atPx });
    if (!reg.held) reg.pressed = true;
    reg.held = true;
    return true;
  }

  /** Point a region's hit area at the element that DRAWS it.
   *
   *  Exists because hand-writing a normalised rectangle to match a button drawn in CSS
   *  pixels is two sources of truth, and they drifted: on a real phone the boost and
   *  brake buttons had to be tapped well above where they appeared. Deriving the area
   *  from the element makes disagreement impossible. `pad` grows the area slightly,
   *  because a fingertip is bigger and less precise than a mouse cursor.
   */
  /** `managed` means the ENGINE drew this control and guarantees it is on screen whenever it is
   *  live -- a start screen's button, anything the React layer drew. Those hide legitimately
   *  (a start screen is dismissed; a pause menu closes) and reporting them as unreachable was
   *  a false positive on two template scenes. A binding a SCENE made by hand is the suspect
   *  population: that is where the hidden turret shop and the hidden start overlay came from. */
  function bindRegionToElement(name, node, { pad = 10, managed = false } = {}) {
    const r = rect(), b = node.getBoundingClientRect();
    const bounds = {
      x: (b.left - r.left - pad) / r.width,
      y: (b.top - r.top - pad) / r.height,
      w: (b.width + pad * 2) / r.width,
      h: (b.height + pad * 2) / r.height,
    };
    let reg = regions.get(name);
    if (reg) reg.bounds = bounds;          // keep live pointer state across a resize
    else { addRegion(name, bounds); reg = regions.get(name); }
    // Remember the element, so hit() can ask it where it is and whether it is visible instead
    // of trusting this snapshot for the rest of the run.
    reg.node = node; reg.pad = pad; reg.managed = !!managed;
    prioritise(name);                      // it is drawn, so it outranks any invisible region
    return bounds;
  }

  const names = () => [...regions.keys()];

  /** Which regions are bound to an element, and can a FINGER reach that element right now?
   *
   *  inject() writes straight into the region and deliberately does not hit-test, because the
   *  QA seam has to work on a game whose controls are mid-animation. So visibility gating in
   *  hit() stops a person from touching a hidden control and does nothing to stop the harness
   *  from driving it -- which is the divergence that let a tower defence pass "every drawn
   *  control can be pressed" with a shop the player never saw. Reporting it is what turns that
   *  from invisible into a failed check. */
  function boundVisibility() {
    const out = {};
    for (const [name, reg] of regions) {
      if (!reg.node) continue;                 // a bare hit area has nothing to be visible
      if (reg.managed) continue;               // the engine drew it and vouches for it
      out[name] = !!visibleBounds(reg);
    }
    return out;
  }

  return { addRegion, bindRegionToElement, prioritise, region, names, sample, pinch, endFrame, onEndFrame, syncToSteps,
           dispose, inject, boundVisibility,
           // keyboard & mouse
           bindKeys, bindKey, isDown, wentDown, bindMouseLook, requestLock, exitLock, coarsePointer,
           get pointerLocked() { return document.pointerLockElement === el; } };
}
