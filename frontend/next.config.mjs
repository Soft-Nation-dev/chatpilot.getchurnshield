/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep Turbopack scoped to this app even when an unrelated lockfile exists
  // elsewhere in the Windows user profile.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
