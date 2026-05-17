import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");

const TARGET_DIRS = [
  path.join(ROOT, "app", "api"),
  path.join(ROOT, "lib", "db"),
];

// Allowlist: hardcoded tenantId:"main" is allowed ONLY in platform-level
// contexts (marketplace admin notifications, platform-wide crons, fallbacks).
// Each entry documents the reason via code comments in the referenced file.
const ALLOWED_BASELINE: Record<string, number> = {
  "app/api/admin/seed-peru-products/route.ts": 3,
  "app/api/contact/route.ts": 1,
  "app/api/cron/auto-backup/route.ts": 1,
  "app/api/cron/isolation-monitor/route.ts": 1,
  "app/api/cron/marketplace-sla-watchdog/route.ts": 1, // Platform-wide SLA watchdog cron — same pattern as marketplace-weekly-report
  "app/api/cron/marketplace-weekly-report/route.ts": 1,
  "app/api/daily-digest/route.ts": 1,                  // WhatsApp fallback when no tenant resolved
  "app/api/marketplace/drivers/apply/route.ts": 4,     // Driver es cross-tenant (plataforma marketplace): findFirst, create x2 + WhatsApp admin notif
  "app/api/price-comparison/route.ts": 1,
  "lib/db/inventory.db.ts": 1,
};

function walkFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(abs, out);
      continue;
    }
    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      out.push(abs);
    }
  }

  return out;
}

function countHardcodedMain(content: string): number {
  return (content.match(/tenantId\s*:\s*["']main["']/g) || []).length;
}

describe("Tenant guard - hardcoded tenantId main", () => {
  it("should block new hardcoded tenantId main usages", () => {
    const allFiles = TARGET_DIRS.flatMap((dir) => walkFiles(dir));
    const found: Record<string, number> = {};

    for (const file of allFiles) {
      const content = fs.readFileSync(file, "utf-8");
      const count = countHardcodedMain(content);
      if (count > 0) {
        const rel = path.relative(ROOT, file).replace(/\\/g, "/");
        found[rel] = count;
      }
    }

    const unexpected: string[] = [];
    for (const [file, count] of Object.entries(found)) {
      const allowed = ALLOWED_BASELINE[file] ?? 0;
      if (allowed === 0) {
        unexpected.push(`${file} -> ${count} hardcoded usage(s)`);
        continue;
      }
      if (count > allowed) {
        unexpected.push(`${file} -> ${count} usage(s), allowed ${allowed}`);
      }
    }

    expect(
      unexpected,
      `New hardcoded tenantId:\"main\" detected. Move to tenant context or update allowlist with justification:\n${unexpected.join("\n")}`,
    ).toEqual([]);
  });
});
