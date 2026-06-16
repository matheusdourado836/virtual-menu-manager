import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.35"],
  devIndicators: false,
};

module.exports = {
  allowedDevOrigins: ['192.168.1.30'],
}

export default nextConfig;
