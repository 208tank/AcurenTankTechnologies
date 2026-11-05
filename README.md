# Acuren TankScope

An interactive 3D guide to aboveground storage tank inspection, used to present
Acuren's tank integrity services to clients and at trade shows.

## What's in it

| Screen           | Path                | What it does                                                                                                                                                                                      |
| ---------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3D Explorer      | `/`                 | Rotate a cutaway tank (internal floating roof, external floating roof or insulated), click a section and see which inspection technologies apply.                                                 |
| Presentation     | `/present`          | Pick technology and equipment slides, put them in any order, set the tank view for each technology, then present full screen. Arrow keys move between slides.                                     |
| Booth mode       | `/booth`            | Loops the saved presentation (or every technology) full screen on a TV at a trade show, with a turning tank model and a contact card with a QR code. Works offline once the site has been opened. |
| Library          | `/manage`           | Edit the technology write-ups, add new ones, and export or import the library as JSON.                                                                                                            |
| Equipment slides | `/manage/equipment` | Create and edit equipment slides (photo, headline specs, features, example outputs). Images are uploaded in the browser; Export/Import moves slides and images between computers.                 |

The technology library, equipment slides (with their images, in IndexedDB) and
the current presentation are saved in the browser that's running the app. They are **not** shared between
computers. Use **Export** on the Library and Equipment slides screens to back
them up or move them to another laptop.

## Project layout

```text
app/                     Routes: / (explorer), /present, /booth, /manage
components/tank/         All TankScope screens and the 3D viewer
  build-tank.ts          Builds the tank model in three.js (no model files needed)
  tank-viewer.tsx        3D viewer: camera, lighting, section picking
  floor-scan.ts          Floor C-scan view: MFL-style plate scan image and indication pins
  explorer.tsx           3D Explorer screen
  presentation-*.tsx     Presentation builder and full-screen player
  booth-mode.tsx         Booth mode setup screen and TV loop
  library-manager.tsx    Library editor
  equipment-library.tsx  Equipment slide editor; equipment-slide.tsx draws the slide
lib/tank-data.ts         Tank types, sections and the default technology library
lib/tank-presentation.ts Saving and validating presentations
lib/booth.ts             Booth mode settings and slide sequence
lib/equipment.ts         Equipment slide fields and the default slides
lib/image-store.ts       Uploaded images: resizing and browser storage (IndexedDB)
lib/offline.ts           Registers the offline service worker (public/sw.js)
public/branding/         Acuren logo, tagline and icons
```

To change the default technology write-ups, edit the `defaults` list in
`lib/tank-data.ts`.

## Running it locally

Requires Node.js 20.9 or later. The project uses Yarn 4, pinned in
`package.json`; Corepack (bundled with Node) fetches the right version.

```bash
corepack enable
yarn install
yarn dev          # http://localhost:3000
```

Other commands:

```bash
yarn build                 # static site into out/ (preview: npx serve out)
yarn lint                  # ESLint
npx prettier --write .     # format code (settings in .prettierrc)
```

## Running booth mode at a trade show

1. On the computer driving the TV, open the site while online, build the
   presentation you want (or choose **All technologies**), then open
   **Booth mode** from the presentation screen. Wait for **Ready to run
   offline**.
2. Turn off sleep and the screen saver on that computer.
3. Click **Start booth mode**, and press **F11** so the browser itself stays
   full screen.
4. While it runs: **Space** pauses, **←/→** step, **Esc** returns to setup.

To start straight into the loop (for example from a kiosk-mode shortcut), open
`/booth/?autostart=1`. Settings and the presentation are saved in that browser.

If you change `public/sw.js`, bump its `VERSION` so browsers drop old copies.

## Hosting

The site is published free on GitHub Pages at
<https://208tank.github.io/AcurenTankTechnologies/>.

`.github/workflows/deploy.yml` builds the site as plain static files and
publishes it every time `main` changes. Pull requests are built as a check but
not published. Pushes to any other branch also build a preview of the site into
the `site-preview` branch (`.github/workflows/preview.yml`) for testing before
merging. You can follow each run on the repo's **Actions** tab.

One-time setup: in the repo's **Settings → Pages**, set **Source** to
**GitHub Actions**.

See `STYLE_GUIDE.md` for brand colors, shared CSS classes and accessibility
rules.
