import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/tests/unit/**/*.test.{ts,tsx}"],
    exclude: ["src/tests/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: [
        "src/hooks/**/*.ts",
        "src/utils/**/*.ts",
        "src/cache/**/*.ts",
        "src/api/**/*.ts",
      ],
      exclude: [
        "src/types/**",
        "src/tests/**",
        "src/main.tsx",
        "src/App.tsx",
        "src/**/*.d.ts",
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        statements: 60,
        branches: 50,
      },
    },
  },
});
