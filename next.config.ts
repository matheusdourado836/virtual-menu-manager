import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.30", "192.168.1.35", "192.168.1.43"],
  devIndicators: false,
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
