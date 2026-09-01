import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@schema": path.resolve(__dirname, "../../packages/schema/typescript"),
    },
  },
});
