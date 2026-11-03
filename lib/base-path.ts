/**
 * The site is served from a sub-folder on GitHub Pages
 * (e.g. https://208tank.github.io/AcurenTankTechnologies/), so files in
 * `public/` must be referenced with that prefix. Next.js adds it to `Link`
 * automatically, but not to `<Image src>`, metadata or manifest URLs.
 *
 * Set by the GitHub workflow; empty when running locally.
 */
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** Prefix a path in `public/` with the site's base path. */
export function asset(path: string) {
  return `${basePath}${path}`;
}
