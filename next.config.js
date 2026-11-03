/** @type {import('next').NextConfig} */
const nextConfig = {
  // Build a plain static site (the `out/` folder) that GitHub Pages can host.
  // The whole app runs in the browser, so no server is needed.
  output: 'export',
  // GitHub Pages serves the site from /<repo-name>/; the workflow sets this.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  // Emit /present/index.html rather than /present.html so every route loads
  // directly on GitHub Pages.
  trailingSlash: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  // Static hosting has no image optimizer.
  images: { unoptimized: true },
};

module.exports = nextConfig;
