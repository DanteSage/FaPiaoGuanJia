import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { fixupConfigRules } from "@eslint/compat";
import { FlatCompat } from "@eslint/eslintrc";
import legacyConfig from "./.eslintrc.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

const { ignorePatterns = [], ...sharedConfig } = legacyConfig;

export default [
  {
    ignores: ignorePatterns,
  },
  ...fixupConfigRules(compat.config(sharedConfig)),
];
