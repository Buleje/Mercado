import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettierConfig from "eslint-config-prettier";
import { PRISMA_DIRECT_LEGACY } from "./eslint.legacy-allowlist.mjs";

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
      // A11y strict — eslint-plugin-jsx-a11y (viene con next/core-web-vitals).
      // Level "warn" para no bloquear mientras limpiamos backlog; subir a
      // "error" cuando el repo esté al día. Meta: WCAG 2.1 AA.
      "jsx-a11y/alt-text": "warn",
      "jsx-a11y/anchor-has-content": "warn",
      "jsx-a11y/anchor-is-valid": "warn",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-proptypes": "error",
      "jsx-a11y/aria-role": "error",
      "jsx-a11y/aria-unsupported-elements": "error",
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/heading-has-content": "warn",
      "jsx-a11y/iframe-has-title": "error",
      "jsx-a11y/img-redundant-alt": "warn",
      "jsx-a11y/interactive-supports-focus": "warn",
      "jsx-a11y/label-has-associated-control": "warn",
      "jsx-a11y/no-autofocus": "warn",
      "jsx-a11y/no-redundant-roles": "warn",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/role-supports-aria-props": "error",
      "jsx-a11y/tabindex-no-positive": "warn",
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
        // ─────────────────────────────────────────────────────────────────────
        // .toFixed() sobre identifiers que vienen de localStorage/props sin
        // normalización previa: atrapa el patrón exacto del bug real visto en
        // RecentlyViewed.tsx:111 — `item.price.toFixed(2)` crasheaba cuando
        // entries legacy tenían price como string.
        //
        // Regla: cuando el callee de .toFixed() es MemberExpression (algo.x)
        // debería estar envuelto en Number() o ser claramente numérico.
        // El selector exige `Number(...).toFixed(...)` como forma canónica.
        {
          selector:
            "CallExpression[callee.property.name='toFixed'][callee.object.type='MemberExpression'][callee.object.computed=false]",
          message:
            "`.toFixed()` directo sobre una propiedad de objeto es frágil si la fuente es localStorage/props externos. Usa `Number(obj.price).toFixed(n)` o valida con Zod/schema antes. Regresión vista en /marketplace/explorar.",
        },
      ],
    },
  },
  // Stricter rules for critical paths — empty catches are ERROR here
  {
    files: ["app/api/**/*.ts", "lib/db/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='catch'] > ArrowFunctionExpression[body.type='BlockStatement'][body.body.length=0]",
          message:
            "CRITICAL PATH: Empty .catch() forbidden in API routes and DB layer. Use logger.error().",
        },
        {
          selector:
            "CallExpression[callee.property.name='catch'] > FunctionExpression[body.type='BlockStatement'][body.body.length=0]",
          message:
            "CRITICAL PATH: Empty .catch(function(){}) is forbidden. Use logger.error().",
        },
        {
          selector:
            "CallExpression[callee.property.name='catch'] > ArrowFunctionExpression[body.type='Literal'][body.value=null]",
          message:
            "CRITICAL PATH: .catch(() => null) is forbidden. Log first, then return null.",
        },
      ],
    },
  },
  // ────────────────────────────────────────────────────────────────────────────
  // SECURITY (HOTFIX-A4 + lock-and-progress, 2026-04-29): no `prisma.<modelo>`
  // directo fuera de `lib/db/`. Auditoria detecto 318 archivos legacy.
  //
  // ESTRATEGIA: lock-and-progress.
  //   - Rule en "error" — bloquea PRs nuevos con prisma.* directo.
  //   - Allowlist en `eslint.legacy-allowlist.mjs` exime los 318 archivos
  //     existentes que ya violan la rule. Cuando se migra uno a lib/db/*,
  //     removerlo del array. Cuando lleguemos a 0 → eliminar el allowlist.
  //   - Asi: nadie agrega nuevos prisma.* directo, y el legacy se recorta
  //     progresivamente sin romper build.
  //
  // Excepciones permanentes (no allowlist — siempre legitimo): webhooks
  // externos (Stripe/MP) y superadmin platform-level que requieren queries
  // cross-tenant por diseno.
  // ────────────────────────────────────────────────────────────────────────────
  {
    files: ["app/**/*.ts", "app/**/*.tsx", "components/**/*.ts", "components/**/*.tsx", "contexts/**/*.ts"],
    ignores: [
      "lib/db/**",
      "app/api/billing/webhook/**",
      "app/api/marketplace/payment/**",
      "app/api/superadmin/**",
      "app/api/cron/**",
      "app/api/compliance/**",
      "scripts/**",
      "**/__tests__/**",
      "prisma/**",
      // Allowlist legacy — 318 archivos snapshot 2026-04-29.
      ...PRISMA_DIRECT_LEGACY,
    ],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "prisma",
          message:
            "MULTI-TENANT: usar lib/db/*.db.ts en vez de prisma.<modelo>.<metodo>() directo. El wrapper enforces tenantId + cache + audit log. Si esta es una query legitimamente cross-tenant (webhook externo, superadmin platform), añadir su PATH a `ignores` en eslint.config.mjs (no a la allowlist legacy — esa es solo para deuda existente).",
        },
      ],
    },
  },
  // ────────────────────────────────────────────────────────────────────────────
  // SECURITY (audit 2026-05-11 P2-2): no deleteMany/updateMany sin tenantId
  // literal en el WHERE.
  //
  // CRIT-1 del audit (demo-products wipe global) explotó este gap: el
  // handler hacía `prisma.X.deleteMany({ where: { productId: { in: IDS } } })`
  // sin tenantId, borrando rows en TODOS los tenants.
  //
  // Regla: cualquier deleteMany/updateMany debe tener una Property con
  // key.name === "tenantId" en el ObjectExpression del where. Si la query
  // es legítimamente cross-tenant (cron global, superadmin platform), el
  // path debe estar en `ignores`.
  // ────────────────────────────────────────────────────────────────────────────
  {
    files: ["app/**/*.ts", "app/**/*.tsx", "lib/**/*.ts", "components/**/*.ts"],
    ignores: [
      "app/api/superadmin/**",
      "app/api/cron/**",
      "app/api/webhooks/**",
      "app/api/billing/webhook/**",
      "app/api/marketplace/payment/**",
      "lib/cron/**",
      "lib/db/marketplace-public.db.ts", // cross-tenant cleanups documentados
      "lib/audit/**",
      "lib/queue/**",
      "scripts/**",
      "**/__tests__/**",
      "**/*.test.ts",
      "**/*.spec.ts",
      "prisma/**",
    ],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          // Match: prisma.X.deleteMany({ where: { ... } }) donde el where no tiene tenantId
          selector:
            "CallExpression[callee.object.object.name='prisma'][callee.property.name=/^(deleteMany|updateMany)$/] > ObjectExpression > Property[key.name='where'] > ObjectExpression:not(:has(> Property[key.name='tenantId']))",
          message:
            "MULTI-TENANT (CRIT-1 zone): deleteMany/updateMany debe incluir `tenantId` literal en el WHERE. Sin ese guard, una sola query puede borrar rows de TODOS los tenants. Si la query ES legítimamente cross-tenant (cron platform, webhook), añadir el archivo a `ignores` en eslint.config.mjs con justificación.",
        },
      ],
    },
  },
  // Prettier compat — must be LAST to disable formatting rules that conflict with Prettier
  prettierConfig,
]);

export default eslintConfig;
