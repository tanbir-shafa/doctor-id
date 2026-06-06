import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // PM2 deploy descriptor (CommonJS, not app source).
    "ecosystem.config.cjs",
  ]),
  // A leading underscore marks an intentionally-unused binding (the common TS
  // convention for "I know — it's deliberately unused").
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Tests + one-off scripts are non-production tooling; `any` is pragmatic there
  // (mongoose/mock internals, ad-hoc data munging) and not worth the ceremony.
  {
    files: ["tests/**", "scripts/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);

export default eslintConfig;
