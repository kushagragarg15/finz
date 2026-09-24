import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A package-lock.json in the user's home directory otherwise confuses root detection.
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
