/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  // Images are local branding assets or user-supplied URLs, so skip the optimizer.
  images: { unoptimized: true },
  // TODO: inherited from the original template. Remove once `npx tsc --noEmit`
  // passes cleanly so type errors fail the build instead of shipping silently.
  typescript: { ignoreBuildErrors: true },
};

module.exports = nextConfig;
