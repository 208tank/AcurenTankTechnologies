#!/usr/bin/env python3
"""Start this game over from a different SHAPE.

    python3 game/use_skeleton.py firstPerson
    python3 game/use_skeleton.py --list

`game/scenes/main.js` arrived as a complete, working game already -- whichever skeleton matched
the brief. If it is the wrong shape for what you are building, this swaps it for the right one,
so you are still editing a game that runs rather than writing one from nothing.

The shape is about how the game is DRIVEN AND SEEN, not about its subject:

    avatar       a body you move around a world, chase camera behind it
    firstPerson  you are the eyes: mouse look, WASD relative to where you face
    thirdPerson  a character you move while the mouse swings the camera round it
    vehicle      you drive it: throttle and steer, camera behind
    onRails      the world is carried past you; you change lanes
    placement    a hand above a board: point and click to act

Chess and tower defence are the same shape. Racing and off-road are the same shape. Pick by how
the player controls it; the subject is yours to build on top. Only the shapes `--list` prints are
installed in this project.
"""
import shutil
import sys
from pathlib import Path


HERE = Path(__file__).resolve().parent
SKELETONS = HERE / 'skeletons'
SCENE = HERE / 'scenes' / 'main.js'


def installed() -> list:
    return sorted(p.stem for p in SKELETONS.glob('*.js'))


def main() -> int:
    views = installed()
    if len(sys.argv) != 2 or sys.argv[1] in ('-h', '--help'):
        print(__doc__)
        print(f'  installed shapes: {", ".join(views)}')
        return 2
    if sys.argv[1] == '--list':
        print('\n'.join(views))
        return 0
    view = sys.argv[1]
    if view not in views:
        print(f'no skeleton named {view!r}. Installed shapes: {", ".join(views)}')
        return 2
    src = SKELETONS / f'{view}.js'
    SCENE.parent.mkdir(parents=True, exist_ok=True)   # scenes/ is empty in the template, so not in git
    # Keep what was there as a .bak, not a .js: nothing under scenes/ may import it by accident,
    # and the type-check never sees it.
    if SCENE.exists():
        backup = SCENE.with_suffix('.js.bak')
        shutil.copyfile(SCENE, backup)
        print(f'previous scene kept at {backup.relative_to(HERE.parent)}')
    shutil.copyfile(src, SCENE)
    print(f'{SCENE.relative_to(HERE.parent)} is now the {view} skeleton. The dev server picks it up on the next '
          'request; no build step is needed. Change it into the game you were asked for.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
