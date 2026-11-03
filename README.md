# Acuren TankScope

An interactive 3D guide to aboveground storage tank inspection, used to present
Acuren's tank integrity services to clients and at trade shows.

## What's in it

| Screen | Path | What it does |
| --- | --- | --- |
| 3D Explorer | `/` | Rotate a cutaway tank (internal floating roof, external floating roof or insulated), click a section and see which inspection technologies apply. |
| Presentation | `/present` | Pick technologies, set their order and the tank view for each, then present full screen. Arrow keys move between slides. |
| Library | `/manage` | Edit the technology write-ups, add new ones, and export or import the library as JSON. |

The technology library and the current presentation are saved in the browser
that's running the app (local storage). They are **not** shared between
computers. Use **Export JSON** on the Library screen to back up a library or
move it to another laptop.

## Project layout

```text
app/                     Routes: / (explorer), /present, /manage
components/tank/         All TankScope screens and the 3D viewer
  build-tank.ts          Builds the tank model in three.js (no model files needed)
  tank-viewer.tsx        3D viewer: camera, lighting, section picking
  explorer.tsx           3D Explorer screen
  presentation-*.tsx     Presentation builder and full-screen player
  library-manager.tsx    Library editor
lib/tank-data.ts         Tank types, sections and the default technology library
lib/tank-presentation.ts Saving and validating presentations
public/branding/         Acuren logo, tagline and icons
```

To change the default technology write-ups, edit the `defaults` list in
`lib/tank-data.ts`.

## Running it locally

Requires Node.js 20.9 or later. The lockfile is in Yarn 4 format, so use Yarn 4
rather than the older Yarn 1 (`corepack use` pins it for the project the first
time).

```bash
corepack enable
corepack use yarn@4
yarn install
yarn dev          # http://localhost:3000
```

Other commands:

```bash
yarn build && yarn start   # production build
yarn lint                  # ESLint
npx prettier --write .     # format code (settings in .prettierrc)
```

See `STYLE_GUIDE.md` for brand colors, shared CSS classes and accessibility
rules.
