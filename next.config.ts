import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root: a stray lockfile in a parent folder would
  // otherwise make Next.js guess the wrong root.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
