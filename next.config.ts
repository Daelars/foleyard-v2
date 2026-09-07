import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/waveform": ["./node_modules/ffmpeg-static/**/*"],
  },
  skipTrailingSlashRedirect: true,
  allowedDevOrigins: [
    "cognitehedron.tail0710d7.ts.net",
    "*.tail0710d7.ts.net",
    "100.66.101.44",
  ],
  turbopack: {
    // Keep Turbopack scoped to this repo even if parent folders contain lockfiles.
    root: __dirname,
    ignoreIssue: [
      {
        path: "**/next.config.ts",
        title: "Encountered unexpected file in NFT list",
      },
    ],
  },
};

export default nextConfig;
