// Type surface for the engine's JavaScript modules, so `tsc --noEmit` (run by the project's
// test step) accepts imports from TypeScript without `allowJs`. The engine stays plain JS on
// purpose: it is shared with other hosts and must run untranspiled in any browser.

declare module '@/game/scenes/main.js' {
  export type GameState = {
    phase: 'loading' | 'ready' | 'playing' | 'won' | 'lost';
    progress: number;
    best: number;
    hud: Record<string, string | number>;
    message?: string;
  };
  export function start(
    canvas: HTMLCanvasElement,
    opts?: { onState?: (s: GameState) => void; onError?: (message: string) => void },
  ): { dispose: () => void; start: () => void; restart: () => void };
}

// Shorthand ambient declaration: every named import from a core module is typed `any`. (An
// `export =` of a plain object here would reject named imports under TypeScript.)
declare module '@/game/core/*';

// Your own scene modules need nothing here. main.js importing './world.js' or './rules.js' is plain
// JavaScript that tsc does not type-check, so a game can be split into as many files under
// game/scenes/ as it needs; a build that kept everything in one 900-line file to spare tsc was
// guarding against nothing. This line covers a TypeScript file that imports one directly.
declare module '@/game/scenes/*';
