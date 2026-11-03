# Style guide

How TankScope looks and how to keep new screens consistent with it.

## Brand

| Item              | Value                                                                               |
| ----------------- | ----------------------------------------------------------------------------------- |
| Navy (primary)    | `#002B5C` (`--brand-navy`, also `--primary`)                                        |
| Cyan (accent)     | `#44C5E4` (`--brand-cyan`) — active nav underline, slide heading rule, 3D highlight |
| Logo              | `public/branding/acuren-logo.svg`                                                   |
| Tagline           | `public/branding/acuren-tagline.png` ("A Higher Level of Reliability®")             |
| Contact in footer | www.acuren.com · 1-800-218-7450                                                     |

The app is light-mode only (`forcedTheme="light"` in `app/layout.tsx`).

## Typography

Text uses Aptos where it's installed, falling back to Arial. The fonts are set as
`--font-sans`, `--font-display` and `--font-mono` in `app/globals.css` and
exposed through Tailwind as `font-sans`, `font-display` and `font-mono`.

Use `tracking-tight` on headings of `text-2xl` and larger.

## Color tokens

All colors come from CSS variables in `app/globals.css`, mapped into Tailwind
(`bg-primary`, `text-muted-foreground`, `border-border` and so on). Don't
hard-code colors in components; add a token instead. The 3D model's material
colors live in `palette` in `components/tank/build-tank.ts`.

| Token                            | Use                                    |
| -------------------------------- | -------------------------------------- |
| `background` / `foreground`      | Page background and body text          |
| `card` / `card-foreground`       | Panels and cards                       |
| `primary` / `primary-foreground` | Primary buttons, links, brand text     |
| `secondary`, `accent`            | Subtle highlights and hover states     |
| `muted` / `muted-foreground`     | Helper text and quiet backgrounds      |
| `destructive`                    | Errors and destructive actions         |
| `border`, `input`, `ring`        | Dividers, form borders, focus outlines |

## Shared classes

Defined in `app/globals.css`. Reuse these before inventing new styles.

| Class                                           | Use                                                               |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| `tool-button`                                   | Standard button; add `primary-button` for the main action         |
| `eyebrow`                                       | Small uppercase label above a heading                             |
| `brand-header`, `brand-footer`                  | Site header and footer (see `AppHeader`, `BrandFooter`)           |
| `explorer-grid`, `viewer-stage`, `inspector`    | 3D Explorer layout                                                |
| `tech-card`                                     | Technology card in lists                                          |
| `slide-player`, `slide-layout`, `slide-content` | Full-screen presentation player                                   |
| `booth`, `booth-*`                              | Booth mode TV loop; sized with `--u` so it scales with the screen |

Breakpoints used in the custom CSS: 600px, 767px, 1099/1100px and 1600px.

## Accessibility

- Every icon-only button needs an `aria-label`.
- Keep the visible focus outline (`:focus-visible` in `globals.css`).
- The presentation player is keyboard driven: arrow keys, Page Up/Down, Home,
  End and Escape. Keep those working when changing it.
- The 3D viewer must always have a non-3D fallback, because some kiosk and
  locked-down corporate machines have WebGL disabled.
