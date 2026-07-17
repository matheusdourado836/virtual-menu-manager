import { withSentryConfig } from "@sentry/nextjs";
import path from "node:path";
import type { NextConfig } from "next";

const firebaseStorageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  || "virtual-order-manager.firebasestorage.app";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.30", "192.168.1.35", "192.168.1.43"],
  devIndicators: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
        port: "",
        pathname: `/v0/b/${firebaseStorageBucket}/o/**`,
      },
    ],
    imageSizes: [32, 48, 64, 96, 128, 192, 256, 384],
    minimumCacheTTL: 2_678_400,
    qualities: [75],
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
};

const hasSentryBuildCredentials = Boolean(
  process.env.SENTRY_AUTH_TOKEN
  && process.env.SENTRY_ORG
  && process.env.SENTRY_PROJECT,
);

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: {
    disable: !hasSentryBuildCredentials,
    deleteSourcemapsAfterUpload: true,
  },
});
