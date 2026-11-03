'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Mounts the game. This is the ONLY React that touches three.js: it hands the engine a
 * <canvas> and tears the game down on unmount.
 *
 * It deliberately draws NO game UI. The HUD, the start screen and the win screen come from
 * `createShell()` inside the engine, which draws them as DOM into this component's box. That is
 * what keeps the number on screen and the number reported to the automatic playtest the same
 * field -- a HUD rendered here from a second copy of the state can disagree with the game, and
 * that has shipped: coins collected while the counter stayed at zero. It also means changing
 * what the game shows is a change to the scene alone, never to this file.
 *
 * Why a client component with a dynamic import: three.js needs a browser (WebGL, window,
 * requestAnimationFrame). Next.js renders pages on the server first, and importing the game
 * there crashes the build with "window is not defined". The import below runs only after mount.
 */
export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<{ dispose: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // A fresh mount starts clean. Without this, an error from a previous build survives Fast
    // Refresh and keeps its overlay up over a game that now works -- which reads as "still broken"
    // to anyone looking at the screen, including whoever is iterating on the code.
    setError(null);
    let cancelled = false;

    import('@/game/scenes/main.js')
      .then((mod) => {
        if (cancelled) return;
        gameRef.current = mod.start(canvas, { onError: (e: string) => setError(e) });
      })
      .catch((e) => setError(String(e?.stack || e)));

    return () => {
      cancelled = true;
      try { gameRef.current?.dispose(); } catch { /* disposing twice is harmless */ }
      gameRef.current = null;
    };
  }, []);

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-black select-none" style={{ touchAction: 'none' }}>
      {/* id="c" is the engine's canvas contract: tooling looks the WebGL context up by it.
          The shell's HUD and screens are appended here, beside the canvas, by the engine. */}
      <canvas id="c" ref={canvasRef} className="block h-full w-full" tabIndex={0} />

      {/* Never a blank screen: an error is shown in large text, not swallowed */}
      {error && (
        <div data-game-overlay="error" className="absolute inset-x-0 top-0 z-10 max-h-1/2 overflow-auto bg-red-950/95 p-4 text-red-100">
          <div className="flex items-start justify-between gap-4">
            {/* A BANNER, not a full-screen wall: createHost forwards every page error here, including
                ones from outside the game, and an opaque overlay with no dismiss swallowed every
                touch on a game that was still playable underneath it. */}
            <pre className="overflow-auto font-mono text-sm whitespace-pre-wrap">{error}</pre>
            <button onClick={() => setError(null)} className="shrink-0 rounded bg-red-800 px-3 py-1 text-xs">dismiss</button>
          </div>
        </div>
      )}
    </div>
  );
}
