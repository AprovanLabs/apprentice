import { defineConfig } from "vitest/config";
import sharedConfig from "@aprovan/vitest-config";

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ["packages/*/src/**/*.test.ts"],
  },
});
