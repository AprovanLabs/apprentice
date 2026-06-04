import { FlatCompat } from "@eslint/eslintrc";
import tsdocPlugin from "eslint-plugin-tsdoc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDir: __dirname,
  recommendedConfig: true,
});

const eslintConfig = [
  ...compat.extends("@aprovan/eslint-config/base"),
  {
    plugins: {
      tsdoc: tsdocPlugin,
    },
    rules: {
      "tsdoc/syntax": "warn",
    },
  },
];

export default eslintConfig;
