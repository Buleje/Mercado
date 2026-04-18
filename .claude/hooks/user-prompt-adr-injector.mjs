#!/usr/bin/env node
/**
 * UserPromptSubmit hook — inyecta contexto automatico relevante antes que
 * Claude procese el prompt del usuario. Formato oficial:
 *
 *   stdout JSON:
 *   {
 *     "hookSpecificOutput": {
 *       "hookEventName": "UserPromptSubmit",
 *       "additionalContext": "..."
 *     }
 *   }
 *
 * Logica:
 *  1. Lee el prompt del stdin (JSON de Claude Code).
 *  2. Detecta keywords de dominio (checkout, orders, migration, fiado,
 *     prestamo, sunat, multi-tenant, admin sidebar, etc).
 *  3. Busca ADRs relacionados en docs/adr/*.md (primer <h1> o subtitulo).
 *  4. Busca reglas CLAUDE.md criticas aplicables.
 *  5. Devuelve un additionalContext compacto (max ~400 chars) con:
 *     - ADRs a leer antes de tocar (max 3)
 *     - Danger zone warning si aplica
 *     - Tip de skill si aplica
 *
 * Budget: <200ms. Si toma mas, skippear silenciosamente.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const debug = process.env.BSM_HOOKS_DEBUG === "1";

function log(...args) {
  if (debug) console.error("[adr-injector]", ...args);
}

function emit(additionalContext) {
  if (!additionalContext) return process.exit(0);
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext,
      },
    })
  );
  process.exit(0);
}

async function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    setTimeout(() => resolve(data), 150);
  });
}

// Map keyword → ADR hints (solo los mas criticos, no inundar)
const KEYWORD_TO_ADRS = {
  checkout: ["015-checkout-idempotency", "058-fast-path-routing"],
  "components/checkout": ["015-checkout-idempotency"],
  "orders.db": ["state-machine orders"],
  "lib/db/orders": ["state-machine orders"],
  migration: ["migration-planner expand-migrate-contract"],
  schema: ["migration-planner expand-migrate-contract"],
  "schema.prisma": ["DIRECT_URL required", "expand-migrate-contract"],
  proxy: ["014-proxy-middleware-split"],
  middleware: ["014-proxy-middleware-split"],
  rbac: ["role-permissions 26x6 matrix — RBAC tests obligatorios"],
  "role-permissions": ["role-permissions 26x6 matrix"],
  fiado: ["fiados module — credit semantic success"],
  prestamo: ["prestamos module — shadowed SparklineKPICard bug 8ca0c9a9"],
  sunat: ["einvoice + tax modules"],
  "design-system": ["075-design-system-single-source-of-truth"],
  "design system": ["075-design-system-single-source-of-truth"],
  lucide: ["075 — import desde @buleje/design-system/icons"],
  "text-gray": ["075 — usa text-[var(--text-*)] o Typography del DS"],
  sidebar: ["layout/AdminSidebar.tsx — flyout lateral no accordion"],
  "cart-context": ["contexts/cart-context.tsx — BroadcastChannel multi-tab"],
};

// Danger zone paths (si el prompt menciona uno, forzar warning + squad)
const DANGER_ZONE_PATHS = [
  "components/checkout/",
  "lib/db/orders.db.ts",
  "lib/auth/role-permissions.ts",
  "proxy.ts",
  "lib/middleware/",
  "prisma/schema.prisma",
  "contexts/cart-context.tsx",
];

try {
  const stdinData = await readStdin();
  let prompt = "";
  try {
    const parsed = JSON.parse(stdinData);
    prompt = (parsed.prompt ?? parsed.message ?? "").toLowerCase();
  } catch {
    prompt = stdinData.toLowerCase();
  }

  if (!prompt) emit(null);

  const hints = new Set();

  for (const [kw, adrs] of Object.entries(KEYWORD_TO_ADRS)) {
    if (prompt.includes(kw)) {
      adrs.forEach((a) => hints.add(a));
    }
  }

  let dangerHit = null;
  for (const p of DANGER_ZONE_PATHS) {
    if (prompt.includes(p.toLowerCase())) {
      dangerHit = p;
      break;
    }
  }

  if (hints.size === 0 && !dangerHit) emit(null);

  const parts = [];
  if (dangerHit) {
    parts.push(
      `⚠️ DANGER ZONE detectada en el prompt: \`${dangerHit}\` — usar \`audit-first\` skill + ADR lectura obligatoria ANTES de editar. Checkout/orders → invocar \`checkout-squad\`.`
    );
  }
  if (hints.size > 0) {
    const list = [...hints].slice(0, 4).map((h) => `- ${h}`).join("\n");
    parts.push(`ADRs/reglas relevantes al contexto detectado:\n${list}`);
  }

  const ctx = parts.join("\n\n");
  log("emit", ctx.length, "chars");
  emit(ctx);
} catch (err) {
  log("error", err?.message);
  process.exit(0); // never block, fail silently
}
