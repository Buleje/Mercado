#!/usr/bin/env node
/**
 * audit-product-images.mjs
 *
 * Itera todos los productos de la DB y reporta cuales NO cumplen los requisitos
 * de imagen: JPG/JPEG, sin imagen, formato desconocido, etc.
 *
 * Output: reports/image-audit/YYYY-MM-DD.json + resumen en consola.
 *
 * Uso:
 *   node scripts/audit-product-images.mjs            # solo reporte
 *   node scripts/audit-product-images.mjs --fix      # tambien limpia las URLs malas
 *
 * Requiere: DATABASE_URL en env (o DIRECT_URL).
 */

import { PrismaClient } from "@prisma/client";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const prisma = new PrismaClient();

function isJpeg(input) {
  if (!input) return false;
  const lower = input.toLowerCase();
  return (
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.includes(".jpg?") ||
    lower.includes(".jpeg?") ||
    lower.startsWith("data:image/jpeg") ||
    lower.startsWith("data:image/jpg")
  );
}

function isPngOrWebpOrSvg(input) {
  if (!input) return false;
  const lower = input.toLowerCase();
  return (
    lower.endsWith(".png") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".svg") ||
    lower.includes(".png?") ||
    lower.includes(".webp?") ||
    lower.includes(".svg?") ||
    lower.startsWith("data:image/png") ||
    lower.startsWith("data:image/webp") ||
    lower.startsWith("data:image/svg")
  );
}

function classify(image) {
  if (!image || image.trim() === "") return { code: "no-image", severity: "error" };
  if (isJpeg(image)) return { code: "format-jpg", severity: "error" };
  if (isPngOrWebpOrSvg(image)) return { code: "ok", severity: "ok" };
  return { code: "needs-check", severity: "warning" };
}

async function main() {
  const fix = process.argv.includes("--fix");
  console.log(`[audit] iniciando auditoría de imagenes ${fix ? "(modo --fix)" : "(solo reporte)"}`);

  const products = await prisma.product.findMany({
    select: { id: true, tenantId: true, name: true, image: true, active: true },
    orderBy: { id: "asc" },
  });

  const buckets = { ok: [], "no-image": [], "format-jpg": [], "needs-check": [] };
  for (const p of products) {
    const { code } = classify(p.image);
    buckets[code].push({
      id: p.id,
      tenantId: p.tenantId,
      name: p.name,
      image: p.image?.slice(0, 80),
      active: p.active,
    });
  }

  const total = products.length;
  const summary = {
    total,
    ok: buckets.ok.length,
    "no-image": buckets["no-image"].length,
    "format-jpg": buckets["format-jpg"].length,
    "needs-check": buckets["needs-check"].length,
    failPercent:
      total > 0
        ? Number(
            (
              ((total - buckets.ok.length) / total) *
              100
            ).toFixed(1),
          )
        : 0,
  };

  console.log("\n[audit] resumen:");
  console.table(summary);

  if (fix && buckets["format-jpg"].length > 0) {
    const ids = buckets["format-jpg"].map((p) => p.id);
    console.log(`\n[audit] --fix: limpiando image="" en ${ids.length} productos JPG...`);
    const result = await prisma.product.updateMany({
      where: { id: { in: ids } },
      data: { image: "" },
    });
    console.log(`[audit] ${result.count} productos actualizados.`);
  }

  // Persistir reporte
  const today = new Date().toISOString().slice(0, 10);
  const reportDir = join(ROOT, "reports", "image-audit");
  await mkdir(reportDir, { recursive: true });
  const reportPath = join(reportDir, `${today}.json`);
  await writeFile(
    reportPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), summary, buckets }, null, 2),
  );
  console.log(`\n[audit] reporte guardado en ${reportPath}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("[audit] error:", e);
  process.exit(1);
});
