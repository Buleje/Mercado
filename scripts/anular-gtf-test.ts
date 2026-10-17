/**
 * Anula la GTF de prueba «001-0000122» (Maderera El Aguajal SAC), que quedaba
 * en la bandeja «guías del monte sin ingresar al CTP» sin corresponder a una
 * operación real (Brandon, 2026-09-08).
 *
 * ANULAR y no borrar: el libro conserva el registro con su motivo, que es lo
 * que un libro hace con un documento que no va. Sale de la bandeja porque
 * `sinIngresarAlCtp()` sólo mira las `emitida`.
 *
 * Prisma directo y no `ForestGtfDB`: las DB classes arrastran `server-only` y
 * no corren fuera de Next (misma razón que `create-comprafacil.ts`). El asiento
 * de auditoría se escribe acá con los MISMOS campos que pondría `auditLoth`.
 *
 * Uso: npx tsx -r dotenv/config scripts/anular-gtf-test.ts dotenv_config_path=.env.local
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const GTF = process.env.GTF_NUMBER ?? "001-0000122";
const MOTIVO =
  process.env.GTF_MOTIVO ??
  "Guía de prueba: no corresponde a una operación real (limpieza pedida por el titular)";

/* Prisma 7 exige adaptador explícito (igual que `lib/prisma.ts`). El pooler de
   Supabase pide SSL sin verificar la cadena. */
const url = process.env.DATABASE_URL;
if (!url) throw new Error("falta DATABASE_URL");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 2 }),
});

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { slug: "main" }, select: { id: true, slug: true } });
  if (!tenant) throw new Error("no encontré el tenant main");

  const gtf = await prisma.forestGtf.findFirst({
    where: { tenantId: tenant.id, gtfNumber: GTF, deletedAt: null },
    select: { id: true, gtfNumber: true, status: true, titularName: true, tituloHabilitante: true },
  });
  if (!gtf) throw new Error(`no encontré la GTF ${GTF} en el tenant ${tenant.slug}`);
  console.log("antes:", JSON.stringify(gtf));

  if (gtf.status === "anulada") {
    console.log("ya estaba anulada: no hago nada");
    return;
  }

  await prisma.forestGtf.update({
    where: { id: gtf.id },
    data: { status: "anulada", annulledReason: MOTIVO },
  });
  await prisma.activityLog.create({
    data: {
      action: "loth_gtf_annul",
      entity: "ForestGtf",
      entityId: gtf.id,
      detail: `Anuló la GTF ${gtf.gtfNumber}. Motivo: ${MOTIVO}`,
      user: "qaadmin",
      tenantId: tenant.id,
    },
  });

  const despues = await prisma.forestGtf.findFirst({
    where: { id: gtf.id },
    select: { gtfNumber: true, status: true, annulledReason: true },
  });
  console.log("después:", JSON.stringify(despues));

  /* La bandeja, con el mismo predicado que `sinIngresarAlCtp()`. */
  const [gtfs, entries] = await Promise.all([
    prisma.forestGtf.findMany({
      where: { tenantId: tenant.id, deletedAt: null, status: "emitida", tipo: "trozas" },
      select: { gtfNumber: true },
    }),
    prisma.woodEntry.findMany({
      where: { tenantId: tenant.id, deletedAt: null, status: { notIn: ["rechazado", "anulado"] } },
      select: { gtfNumber: true },
    }),
  ]);
  const ingresadas = new Set(entries.map((e) => e.gtfNumber.trim()));
  const bandeja = gtfs.filter((g) => !ingresadas.has(g.gtfNumber.trim()));
  console.log(`bandeja: ${bandeja.length} guía(s) sin ingresar${bandeja.length ? ` → ${bandeja.map((g) => g.gtfNumber).join(", ")}` : ""}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
