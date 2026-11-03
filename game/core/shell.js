/**
 * The game SHELL: the score readout, the start / win / game-over screens, and the restart.
 *
 * Every genre needs these, and a generated game that writes them from scratch writes them
 * wrong in the same few ways each time. Ported from the mobile engine's `core/shell.js`,
 * where each of these rules was paid for by a shipped defect:
 *
 *  1. The HUD lived in a different variable from the one the game incremented, so coins were
 *     collected while the counter stayed at 0/15. Here the number drawn and the number in
 *     `report()` ARE the same field. They cannot diverge.
 *
 *  2. A full-screen start overlay had no `pointer-events: none`, so it swallowed every click
 *     and the game sat on its start screen forever. Overlays here are inert by default; only
 *     the action button is interactive -- and that button is registered as an INPUT REGION, so
 *     the playtest presses the same pixels a player does and a dead start screen FAILS instead
 *     of shipping.
 *
 *  3. A win condition compared against a hard-coded total while placement had quietly produced
 *     one fewer pickup, so the game could not be finished. `total` is a FUNCTION, evaluated
 *     live, so the HUD reports what exists rather than what was intended.
 *
 * This is DOM drawn by the game, not by React. That is deliberate: it is the same DOM in a
 * Next.js page, in a static harness and under `check.py`, and a scene that changes what it
 * draws does not also have to edit a component to keep the screen truthful.
 */

// Names the diagnostics contract owns. A HUD field sharing one of these silently overwrites it
// in report(), and the failure lands somewhere else entirely -- a field called `pos` replaces
// the actor's [x, y, z] and the playtest reports a game that publishes no position.
const RESERVED = ['pos', 'facing', 'view', 'progress', 'screen', 'yaw', 'groundY',
                  'phase', 'scene', 'atRest', 'started', 'paused', 'elapsed'];

export function createShell(input, {
  mount = null, fields = {}, screens = {}, onAction = null, actionRegion = 'shellAction',
} = {}) {
  const values = {};
  const els = {};
  let screen = null;
  let lastTap = null;

  for (const name of Object.keys(fields)) {
    if (RESERVED.includes(name)) {
      throw new Error(
        `createShell: a HUD field cannot be called '${name}' -- attachDiagnostics uses that name for `
        + 'the game state it reads, and shell.report() would overwrite it. Rename the field '
        + `(e.g. '${name === 'pos' ? 'place' : name + 'Hud'}') and set it with shell.set().`);
    }
  }

  /** Where the screen furniture goes.
   *
   *  The mobile shell pins everything to the viewport, because a phone game IS the viewport.
   *  A Next.js page is not: the canvas usually sits in a container, sometimes beside other
   *  chrome, and viewport-fixed overlays then float over the whole site. So mount into the
   *  canvas's own box by default and position against it. Passing `document.body` restores the
   *  fixed, full-viewport behaviour for a game that really does own the screen. */
  const host = mount || document.body;
  const fixed = host === document.body;
  if (!fixed && getComputedStyle(host).position === 'static') host.style.position = 'relative';
  const POS = fixed ? 'position:fixed;' : 'position:absolute;';

  const HUD_CSS = POS + 'left:0;right:0;top:0;z-index:6;pointer-events:none;'
    + 'display:flex;gap:14px;justify-content:space-between;align-items:center;'
    + 'padding:calc(10px + env(safe-area-inset-top,0px)) 18px 10px 18px;'
    + 'font:700 17px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:#fff;'
    + 'font-variant-numeric:tabular-nums;text-shadow:0 2px 6px rgba(0,0,0,0.55)';

  const OVERLAY_CSS = POS + 'inset:0;z-index:8;'
    // INERT by default. This one declaration is the fix for a shipped game that never started.
    + 'pointer-events:none;'
    + 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;'
    + 'background:rgba(6,10,18,0.62);backdrop-filter:blur(2px);'
    + 'font:600 16px/1.35 system-ui,-apple-system,sans-serif;color:#fff;text-align:center;padding:24px';

  const BTN_CSS = 'pointer-events:auto;margin-top:6px;padding:14px 34px;border:0;border-radius:12px;'
    + 'background:#34d399;color:#04241a;font:800 17px/1 system-ui,sans-serif;letter-spacing:0.4px;'
    + 'cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,0.35)';

  const hud = document.createElement('div');
  hud.style.cssText = HUD_CSS;
  host.appendChild(hud);

  for (const [name, cfg] of Object.entries(fields)) {
    values[name] = cfg.start ?? 0;
    const el = document.createElement('div');
    el.dataset.hud = name;
    hud.appendChild(el);
    els[name] = el;
  }

  const overlay = document.createElement('div');
  overlay.style.cssText = OVERLAY_CSS;
  overlay.style.display = 'none';
  const title = document.createElement('div');
  title.style.cssText = 'font:800 28px/1.2 system-ui,sans-serif';
  const hint = document.createElement('div');
  hint.style.cssText = 'opacity:0.82;max-width:24em';
  const button = document.createElement('button');
  button.style.cssText = BTN_CSS;
  overlay.append(title, hint, button);
  host.appendChild(overlay);

  /** The action button is a REGION, not just a DOM node, so the playtest presses the same
   *  pixels a player does instead of injecting into a region by name and bypassing everything
   *  a real click has to obey. */
  input.addRegion(actionRegion, { x: 0.5, y: 0.5, w: 0.001, h: 0.001 });
  const syncActionRegion = () => {
    if (screen && screens[screen] && screens[screen].action !== false) {
      button.dataset.region = actionRegion;
      // Mark it as the SHELL's action so the dead-control check leaves it alone: it only does
      // anything while a screen is up, and it is verified far more strongly elsewhere, by a
      // real pointer event -- 'the start screen can be clicked'.
      button.dataset.shellAction = '1';
      input.bindRegionToElement(actionRegion, button, { managed: true, pad: 12 });
    } else {
      // Collapsed rather than removed: `names()` stays stable, so the playtest's report does not
      // change shape depending on which screen the game happens to be on.
      const r = input.region(actionRegion);
      if (r) r.bounds = { x: 0.5, y: 0.5, w: 0.001, h: 0.001 };
    }
  };

  function render() {
    for (const [name, cfg] of Object.entries(fields)) {
      // `total` is a FUNCTION, evaluated now. A hard-coded total is how a game came to promise
      // 20 pickups when placement had produced 19, making it impossible to finish.
      const total = typeof cfg.total === 'function' ? cfg.total() : cfg.total;
      const label = cfg.label ? cfg.label + ' ' : '';
      // A field's value may be free TEXT, not only a number over a total -- a race position
      // ("P4"), a countdown ("1:07"), a wave label. Without this every build draws a second
      // HUD of its own, and one drew both, leaving two readouts printed over each other.
      els[name].textContent = typeof values[name] === 'string'
        ? `${label}${values[name]}`
        : total === undefined || total === null
          ? `${label}${values[name]}`
          : `${label}${values[name]} / ${total}`;
    }
  }

  function set(name, value) {
    if (!(name in values)) return;
    values[name] = value;
    render();
  }

  /** `show('won', { hint: `10 gems in 24.3s` })` -- the second argument overrides this screen's
   *  text for this showing only, so anything that depends on how the run WENT can appear on the
   *  screen that ends it without the scene reaching past the shell to append its own DOM. */
  function show(name, over) {
    const s = over ? { ...screens[name], ...over } : screens[name];
    if (!s) return;
    screen = name;
    title.textContent = s.title || '';
    hint.textContent = s.hint || '';
    button.textContent = s.action === false ? '' : (s.action || 'Play');
    button.style.display = s.action === false ? 'none' : '';
    // Re-establish the overlay's OWN css before revealing it: a scene that overwrote cssText to
    // restyle a screen wiped both the inertness that stops it swallowing every click and the
    // display state show()/hide() depend on. Reapplying repairs a clobbered overlay instead of
    // leaving it broken for the rest of the run.
    overlay.style.cssText = OVERLAY_CSS;
    overlay.style.display = 'flex';
    syncActionRegion();
  }

  function hide() {
    screen = null;
    overlay.style.display = 'none';
    syncActionRegion();
  }

  const fire = () => { const from = screen; hide(); if (onAction) onAction(from); };
  button.addEventListener('click', fire);

  /** Keyboard, which the mobile shell has no use for and a desktop game cannot do without.
   *  Enter or Space presses the action while a screen is up -- a player who has both hands on
   *  WASD should not have to reach for the mouse to restart. Only while a screen is showing, so
   *  it never steals the Space the game itself binds. */
  const onKey = (e) => {
    if (!screen || !screens[screen] || screens[screen].action === false) return;
    if (e.key !== 'Enter' && e.key !== ' ' && e.code !== 'Space') return;
    e.preventDefault();
    fire();
  };
  addEventListener('keydown', onKey);

  /** Called every frame by the engine. Presses of the action button arrive as a region tap,
   *  which is what makes the button drivable by the playtest as well as by a mouse. */
  let repaired = false;
  function update() {
    if (!screen) return;
    // A SCREEN THAT IS SET BUT NOT VISIBLE IS A FROZEN GAME. A scene's step() begins
    // `if (shell.screen) return;`, so an overlay hidden from outside while `screen` is still set
    // stops the game forever with nothing on screen to explain it. The shell owns this element,
    // so there is no legitimate reason for it to be hidden here: repair it rather than warn.
    const cs = getComputedStyle(overlay);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) {
      overlay.style.cssText = OVERLAY_CSS;
      overlay.style.display = 'flex';
      if (!repaired) {
        repaired = true;
        try {
          console.warn('createShell: the screen overlay was hidden from outside while a screen '
            + `('${screen}') was still showing, which freezes the game behind an invisible start `
            + 'screen. It has been restored. Use shell.hide() to dismiss a screen; do not set '
            + 'display or overwrite cssText on shell.overlay.');
        } catch (e) {}
      }
      syncActionRegion();
    }
    // ONE-SHOT LATCH on the tap object itself. input.endFrame() nulls `tap` and hands out a
    // fresh object for the next one, so identity is an exact "have I already acted on this tap".
    // Without it, update() running twice in a frame fires onAction twice.
    const r = input.region(actionRegion);
    if (r && r.tap && r.tap !== lastTap) { lastTap = r.tap; fire(); }
  }

  /** Merge into getState() so the HUD and the reported progress are the same numbers. The
   *  current phase is reported too, so a playtest that finds a game stuck behind an overlay can
   *  say so instead of reporting that its controls do nothing. */
  function report() {
    // `phase`, NOT `screen`: the diagnostics contract already uses `screen` for the projected
    // pixel positions of objects worth walking toward, and a string there silently overwrites
    // them.
    const out = { phase: screen || 'playing' };
    for (const [name, cfg] of Object.entries(fields)) {
      out[name] = values[name];
      const total = typeof cfg.total === 'function' ? cfg.total() : cfg.total;
      if (total !== undefined && total !== null) out[name + 'Total'] = total;
    }
    return out;
  }

  // A SCENE MAY ONLY HAVE ONE HUD. `fields` draws a row across the top; a scene that wants more
  // than that builds its own bar and pins it to the same edge -- and then BOTH draw, in the same
  // band, as overstruck glyphs. Nothing catches it, because every check reads getState() and the
  // numbers are correct in both places. Scanned from the per-frame tail, not once at boot: a HUD
  // built display:none and revealed when the game starts is invisible to a single check at boot.
  let hudScans = 0, hudSettled = false;
  function checkOneHud() {
    if (hudSettled || !Object.keys(fields).length) return;
    if (++hudScans % 30 !== 1) return;              // ~twice a second, not every frame
    if (hudScans > 1800) { hudSettled = true; return; }
    try {
      const mine = hud.getBoundingClientRect();
      if (!(mine.width > 0 && mine.height > 0)) return;
      // The siblings of our HUD inside the game's own box -- which is where a scene's or a
      // component's competing readout lands.
      for (const el of host.children) {
        if (el === hud || el === overlay || hud.contains(el) || el.contains(hud)) continue;
        // Anything that declares itself chrome rather than a readout. The template's error
        // banner is top-anchored full-width text, which is exactly the shape of a competing
        // HUD -- without this, showing an error would permanently hide the real HUD.
        if (el.dataset && el.dataset.gameOverlay !== undefined) continue;
        const cs = getComputedStyle(el);
        if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
        if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
        if (!(el.textContent || '').trim()) continue;        // a backdrop, not a readout
        const b = el.getBoundingClientRect();
        if (b.width <= 0 || b.height <= 0) continue;
        // A full-height element is a screen or a result card, not a competing HUD.
        if (b.height >= mine.height * 6) continue;
        if (Math.min(mine.bottom, b.bottom) - Math.max(mine.top, b.top) <= 2) continue;
        if (Math.min(mine.right, b.right) - Math.max(mine.left, b.left) <= 2) continue;
        hudSettled = true;
        hud.style.display = 'none';                  // the scene's own HUD is the designed one
        try {
          console.warn('createShell: this scene draws its own HUD over the one `fields` makes, so '
            + 'both were rendering in the same band and the text overstruck. Ours has been hidden '
            + 'and the scene\'s kept. Use ONE: either declare `fields` and let the shell draw '
            + 'them, or drop `fields` and keep your own bar -- either way still merge '
            + 'shell.report() into getState() so the playtest can read the phase.');
        } catch (e) {}
        return;
      }
    } catch (e) { hudSettled = true; }
  }

  let stopTail = null;
  function dispose() {
    // Off the per-frame tail too. Left subscribed, a disposed shell kept running update() on the
    // same input: it read its removed overlay as hidden, "repaired" it every frame and bound the
    // shared action region back to its removed button -- so a shell rebuilt on that input had a
    // Play button the playtest could not press, and a tap there ran the OLD shell's onAction.
    if (stopTail) stopTail();
    screen = null;
    removeEventListener('keydown', onKey);
    hud.remove(); overlay.remove();
  }

  render();

  /** The engine drives update(), so nothing breaks by forgetting a per-frame call. A required
   *  call that nothing enforces is a defect generator: the shipped games that froze behind a
   *  start screen were all scenes that simply never called it. `update` stays exported and is
   *  idempotent. */
  if (input && typeof input.onEndFrame === 'function') {
    stopTail = input.onEndFrame(() => { update(); checkOneHud(); });
  }

  return { set, get: (n) => values[n], show, hide, update, report, dispose,
           get screen() { return screen; }, hud, overlay, button };
}
