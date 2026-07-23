import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@platform/core", "@platform/timeline", "@platform/media", "@platform/chat", "@platform/room-ui"],
};

export default config;
