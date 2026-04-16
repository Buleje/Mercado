import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettierConfig from "eslint-config-prettier";

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
  ]),
  // Downgrade strict rules to warnings so pre-existing issues don't block commits
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-asserted-optional-chain": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
      }],
      "react-hooks/set-state-in-effect": "warn",
      "@next/next/no-html-link-for-pages": "warn",
      // ─────────────────────────────────────────────────────────────────────
      // Empty .catch() — silently swallows promise rejections.
      //
      // CLAUDE.md regla #7 permite fire-and-forget con `.catch(() => {})`,
      // pero esos catches DEBEN tener al menos un comentario o un logger.
      // Esta regla detecta los 4 patrones nocivos:
      //
      //   .catch(() => {})            → arrow body vacio
      //   .catch(function () {})      → función clásica vacía
      //   .catch(e => {})             → arg ignorado, body vacio
      //   .catch(() => null)          → "null swallow" (oculta el error)
      //
      // STATUS: "warn" (no "error") porque el codebase tiene ~427 violaciones
      // existentes. Subir a "error" cuando se haga cleanup masivo — ver
      // ADR pendiente sobre logging discipline. Hasta entonces, cualquier
      // catch nuevo en PR aparecerá como warning visible en CI.
      "no-restricted-syntax": [
        "warn",
        {
          selector:
            "CallExpression[callee.property.name='catch'] > ArrowFunctionExpression[body.type='BlockStatement'][body.body.length=0]",
          message:
            "Empty .catch() suppresses errors silently. Use .catch((err) => logger.error('[ctx] failed', { error: String(err) })) or add a comment explaining why the rejection is intentional.",
        },
        {
          selector:
            "CallExpression[callee.property.name='catch'] > FunctionExpression[body.type='BlockStatement'][body.body.length=0]",
          message:
            "Empty .catch(function() {}) suppresses errors silently. Use a logger or add a comment explaining the intentional swallow.",
        },
        {
          selector:
            "CallExpression[callee.property.name='catch'] > ArrowFunctionExpression[body.type='Literal'][body.value=null]",
          message:
            "`.catch(() => null)` hides errors. If the null fallback is intentional, log first: .catch((err) => { logger.warn('[ctx]', err); return null; }).",
        },
      ],
    },
  },
  // Prettier compat — must be LAST to disable formatting rules that conflict with Prettier
  prettierConfig,
]);

export default eslintConfig;
