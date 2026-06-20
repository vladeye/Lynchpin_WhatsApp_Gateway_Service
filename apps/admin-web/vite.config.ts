import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
  },
  server: {
    port: 5173,
    // During `vite dev`, proxy API + health to the local gateway-api.
    proxy: {
      "/api": "http://127.0.0.1:3010",
      "/health": "http://127.0.0.1:3010",
      "/ready": "http://127.0.0.1:3010",
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.tsx"],
  },
});
