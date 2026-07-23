import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  reporter: "list",
  timeout: 120_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    // Edge (system install) ships h264, which the demo mp4 needs;
    // Playwright's bundled Chromium does not.
    channel: "msedge",
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
  },
});
