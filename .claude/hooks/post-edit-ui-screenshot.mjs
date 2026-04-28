#!/usr/bin/env node
/**
 * post-edit-ui-screenshot — captura screenshot automático tras editar UI.
 *
 * Detecta ediciones en componentes UI visibles al cliente y al admin,
 * y dispara un screenshot via Playwright si está disponible.
 *
 * RUTAS QUE TRIGGEREAN (con su URL preview):
 *   components/marketplace/store-detail/**  → /marketplace/main
 *   components/marketplace/UnifiedProductCard.tsx → /marketplace
 *   components/marketplace/MarketplaceGrid*.tsx → /marketplace
 *   components/marketplace/explorar/** → /marketplace/explorar
 *   components/admin/unified/MarketplaceModule.tsx → /admin?tab=marketplace
 *   app/marketplace/[slug]/** → /marketplace/main
 *
 * Severity: INFO non-blocking. Si Playwright no arranca (ej. WSL sin
 * libnspr4), emite un mensaje sugiriendo el fix sin bloquear.
 *
 * Output: reports/visual-verify/<timestamp>/<route>.png + texto al stderr
 * que aparece en el siguiente turno como context para el agente.
 *
 * Activación: en .claude/settings.json bajo PostToolUse > Edit|Write.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROUTE_RULES = [
  // Storefront
  { match: /components\/marketplace\/store-detail\//, url: "/marketplace/main", label: "storefront" },
  { match: /components\/marketplace\/UnifiedProductCard\.tsx/, url: "/marketplace", label: "marketplace-grid" },
  { match: /components\/marketplace\/MarketplaceGrid/, url: "/marketplace", label: "marketplace-grid" },
  { match: /components\/marketplace\/MarketplaceNavbar\.tsx/, url: "/marketplace", label: "marketplace-navbar" },
  { match: /components\/marketplace\/explorar\//, url: "/marketplace/explorar", label: "marketplace-explorar" },
  { match: /components\/marketplace\/ofertas\//, url: "/marketplace/ofertas", label: "marketplace-ofertas" },
  { match: /components\/marketplace\/home\//, url: "/marketplace", label: "marketplace-home" },
  { match: /components\/marketplace\/como-pagar\//, url: "/marketplace/como-pagar", label: "marketplace-como-pagar" },
  { match: /components\/marketplace\/PromoBannerRenderer/, url: "/marketplace", label: "promo-banner" },
  { match: /app\/marketplace\/\[slug\]\//, url: "/marketplace/main", label: "storefront-page" },
  { match: /app\/marketplace\/ofertas\//, url: "/marketplace/ofertas", label: "ofertas-page" },
  { match: /app\/marketplace\/explorar\//, url: "/marketplace/explorar", label: "explorar-page" },
  // Admin (autenticado)
  { match: /components\/admin\/unified\/MarketplaceModule\.tsx/, url: "/t/main/admin?tab=marketplace", label: "admin-marketplace", needsAuth: true },
  { match: /components\/admin\/StoreAnalyticsModule\.tsx/, url: "/t/main/admin/store-analytics", label: "admin-store-analytics", needsAuth: true },
  { match: /components\/admin\/StoreReviewsAdminModule\.tsx/, url: "/t/main/admin/store-reviews", label: "admin-store-reviews", needsAuth: true },
  { match: /components\/admin\/ProductsAdminTab\.tsx/, url: "/t/main/admin?tab=productos", label: "admin-productos", needsAuth: true },
  { match: /components\/admin\/AdminTopHeader\.tsx/, url: "/t/main/admin", label: "admin-shell", needsAuth: true },
  { match: /components\/admin\/layout\//, url: "/t/main/admin", label: "admin-shell", needsAuth: true },
  { match: /components\/admin\/shared\/AdminModuleHeader\.tsx/, url: "/t/main/admin?tab=marketplace", label: "admin-module-header", needsAuth: true },
  // Superadmin
  { match: /components\/superadmin\/banners\//, url: "/superadmin/banners", label: "superadmin-banners", needsAuth: true, authType: "superadmin" },
  { match: /app\/superadmin\/banners\//, url: "/superadmin/banners", label: "superadmin-banners-page", needsAuth: true, authType: "superadmin" },
  // Globals (CSS afecta TODO)
  { match: /app\/globals\.css/, url: "/marketplace/main", label: "globals-storefront" },
];

const CHROMIUM = path.join(process.env.HOME ?? "", ".cache/ms-playwright/chromium-1208/chrome-linux64/chrome");
const REPORT_DIR = path.join(process.cwd(), "reports/visual-verify");

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  try {
    const payload = JSON.parse(raw);
    const toolName = payload?.tool_name ?? "";
    if (!["Edit", "Write", "MultiEdit"].includes(toolName)) return process.exit(0);

    const filePath = payload?.tool_input?.file_path ?? "";
    if (!filePath) return process.exit(0);

    const rel = path.relative(process.cwd(), filePath);
    const rule = ROUTE_RULES.find((r) => r.match.test(rel));
    if (!rule) return process.exit(0);

    // Skippable si BSM_HOOKS_DEBUG=skip-screenshot
    if (process.env.BSM_HOOKS_SKIP_SCREENSHOT === "1") return process.exit(0);

    // Si chromium binary no existe, sólo emitir hint
    if (!fs.existsSync(CHROMIUM)) {
      process.stderr.write(
        `[visual-screenshot] Skip — Chromium no encontrado en ${CHROMIUM}\n` +
        `Para activar capturas automáticas: \`npx playwright install chromium\`\n`,
      );
      return process.exit(0);
    }

    // Test rápido: si el browser no puede arrancar (libnspr4 missing en WSL),
    // saltamos sin bloquear.
    const probe = spawnSync(CHROMIUM, ["--version"], { timeout: 4000 });
    if (probe.status !== 0) {
      const err = (probe.stderr || Buffer.alloc(0)).toString();
      if (/libnspr4|libnss3|cannot open shared/i.test(err)) {
        process.stderr.write(
          `[visual-screenshot] Skip — Chromium no arranca (libs faltantes en WSL).\n` +
          `Fix: ejecutar UNA VEZ desde tu terminal: \`sudo npx playwright install-deps chromium\`\n`,
        );
      }
      return process.exit(0);
    }

    // Disparar screenshot via script async (no bloquea)
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const outDir = path.join(REPORT_DIR, ts);
    fs.mkdirSync(outDir, { recursive: true });

    const scriptPath = path.join(process.cwd(), "scripts/auto-screenshot.mjs");
    if (!fs.existsSync(scriptPath)) {
      process.stderr.write(`[visual-screenshot] Skip — falta scripts/auto-screenshot.mjs\n`);
      return process.exit(0);
    }

    // Async — devolvemos el control al agente, el screenshot se captura en BG.
    const env = { ...process.env, AUTO_SS_URL: rule.url, AUTO_SS_LABEL: rule.label, AUTO_SS_OUT: outDir, AUTO_SS_AUTH: rule.needsAuth ? "1" : "0" };
    spawnSync("node", [scriptPath], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 25000,
    });

    // ── Auto-baseline + diff ─────────────────────────────────────────────
    // Si NO existe baseline → este screenshot ES el baseline.
    // Si existe → diff contra baseline + alerta si pct > 5%.
    const baselineDir = path.join(process.cwd(), "reports/visual-baselines");
    fs.mkdirSync(baselineDir, { recursive: true });
    const diffScript = path.join(process.cwd(), "scripts/visual-diff.mjs");
    const summary = [];
    for (const theme of ["light", "dark"]) {
      const current = path.join(outDir, `${rule.label}-${theme}.png`);
      const baseline = path.join(baselineDir, `${rule.label}-${theme}.png`);
      if (!fs.existsSync(current)) continue;
      if (!fs.existsSync(baseline)) {
        // Crear baseline (copy)
        try {
          fs.copyFileSync(current, baseline);
          summary.push(`${theme}: 🆕 baseline creado`);
        } catch {}
      } else if (fs.existsSync(diffScript)) {
        const diffOut = path.join(outDir, `${rule.label}-${theme}-diff.png`);
        const r = spawnSync("node", [diffScript, baseline, current, diffOut], {
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 15000,
        });
        try {
          const json = JSON.parse((r.stdout || Buffer.alloc(0)).toString());
          const tag = json.verdict === "ok" ? "✅" : json.verdict === "minor-change" ? "🟡" : "🔴";
          summary.push(`${theme}: ${tag} ${json.pct}% (${json.verdict})`);
        } catch {
          summary.push(`${theme}: diff falló`);
        }
      }
    }

    process.stderr.write(`[visual-screenshot] ${rule.label} → ${path.relative(process.cwd(), outDir)}/  ${summary.join(" · ")}\n`);
  } catch (err) {
    // Silencioso — nunca bloquear
    process.stderr.write(`[visual-screenshot] Error suave: ${err.message}\n`);
  }
  process.exit(0);
});
