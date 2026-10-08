import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.ENVIRONMENT_ID === "LOCAL_REVIEW" ? ".next-account-review" : process.env.NEXT_BUILD_CHECK === "1" ? ".next-release-check" : ".next",
  serverExternalPackages: ["jsdom", "pdf-parse", "@napi-rs/canvas", "bullmq"],
  turbopack: {},
  experimental: {
    cpus: 2,
    staticGenerationMaxConcurrency: 2,
  },
  transpilePackages: [
    "@content-center/core",
    "@content-center/db",
    "@content-center/providers",
    "@content-center/ui",
    "@content-center/worker",
  ],
  webpack(config, { isServer }) {
    if (isServer) {
      const externals = Array.isArray(config.externals) ? config.externals : [];
      config.externals = [...externals, { jsdom: "commonjs jsdom" }];
    }
    return config;
  },
};

export default nextConfig;
