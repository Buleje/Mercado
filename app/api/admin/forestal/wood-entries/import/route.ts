import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { WoodEntriesDB, type WoodOriginType, type WoodProductType } from "@/lib/db/wood-entries.db";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * POST /api/admin/forestal/wood-entries/import — importación del LO-CTP (ADR-138).
 *
 * Etapa 1: Ingresos. Recibe las filas ya parseadas en el cliente
 * (`lib/forestal/ctp-import.ts`) y, según `mode`:
 *   - "preview": valida cada fila (Zod) + marca crear/existe/error SIN escribir.
 *   - "commit":  crea sólo las `crear`, saltando las que ya existen por `gtfNumber`
 *                (idempotente). Cada alta pasa por WoodEntriesDB.create (audit incluido).
 *
 * El server NO confía en el cliente: re-valida y re-chequea existencia acá.
 */

const ORIGIN = ["concesion", "predio_privado", "comunidad_nativa", "reforestacion", "retroaserradero", "otro"] as const;
const PRODUCT = ["rolliza", "aserrada", "tablones", "listones", "durmientes", "pulgada", "carbon", "lena", "otro"] as const;

const ingresoSchema = z.object({
  gtfNumber: z.string().trim().min(1, "Sin N° de GTF (origen legal obligatorio)"),
  entryDate: z.string().trim().nullable().optional(),
  providerName: z.string().trim().min(1, "Sin titular / proveedor").max(200),
  originType: z.enum(ORIGIN).optional().default("otro"),
  originRegion: z.string().trim().max(80).nullable().optional(),
  speciesCommonName: z.string().trim().min(1, "Sin especie").max(120),
  speciesScientificName: z.string().trim().max(160).nullable().optional(),
  speciesCites: z.boolean().optional().default(false),
  productType: z.enum(PRODUCT).optional().default("rolliza"),
  volumeM3: z.number().positive("Cantidad/volumen inválido (≤ 0)"),
  notes: z.string().trim().max(2000).nullable().optional(),
  row: z.number().optional(),
});

const bodySchema = z.object({
  mode: z.enum(["preview", "commit"]),
  // Filas sueltas: las que fallan validación se REPORTAN (no rompen el request).
  ingresos: z.array(z.record(z.string(), z.unknown())).max(5000),
});

type ResultRow = { row?: number; gtf: string | null; action: "crear" | "creado" | "existe" | "error"; message: string };

export const POST = withApiHandler("forestal-wood-entries-import", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;

  const enabled = await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro");
  if (!enabled) {
    return NextResponse.json({ error: "specialization_disabled", message: "El módulo Libro de Operaciones CTP no está habilitado." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }
  const { mode, ingresos } = parsed.data;

  // Idempotencia: qué GTF ya existen para el tenant.
  const gtfs = ingresos.map((r) => String(r.gtfNumber ?? "").trim()).filter(Boolean);
  const existing = await WoodEntriesDB.existingGtfNumbers(auth.tenantId, gtfs);

  const detalle: ResultRow[] = [];
  let creables = 0, saltados = 0, errores = 0, creados = 0;

  for (const raw of ingresos) {
    const row = typeof raw.row === "number" ? raw.row : undefined;
    const v = ingresoSchema.safeParse(raw);
    if (!v.success) {
      errores++;
      detalle.push({ row, gtf: String(raw.gtfNumber ?? "").trim() || null, action: "error", message: v.error.issues.map((i) => i.message).join(" · ") });
      continue;
    }
    const d = v.data;
    if (existing.has(d.gtfNumber)) {
      saltados++;
      detalle.push({ row, gtf: d.gtfNumber, action: "existe", message: "Ya existe un ingreso con esta GTF — se salta" });
      continue;
    }
    if (mode === "preview") {
      creables++;
      detalle.push({ row, gtf: d.gtfNumber, action: "crear", message: `${d.speciesCommonName} · ${d.volumeM3} m³${d.speciesCites ? " · CITES" : ""}` });
      continue;
    }
    try {
      await WoodEntriesDB.create(auth.tenantId, {
        entryDate: d.entryDate ? new Date(d.entryDate) : undefined,
        gtfNumber: d.gtfNumber,
        providerName: d.providerName,
        originType: d.originType as WoodOriginType,
        originRegion: d.originRegion ?? null,
        speciesCommonName: d.speciesCommonName,
        speciesScientificName: d.speciesScientificName ?? null,
        speciesCites: d.speciesCites,
        productType: d.productType as WoodProductType,
        volumeM3: d.volumeM3,
        notes: d.notes ?? null,
        createdBy: auth.username ?? "import",
      });
      existing.add(d.gtfNumber); // no duplicar dentro del mismo batch
      creados++;
      detalle.push({ row, gtf: d.gtfNumber, action: "creado", message: "Importado (pendiente de validar)" });
    } catch (e) {
      errores++;
      logger.error("[wood-entries.import] row failed", { gtf: d.gtfNumber, error: String(e) });
      detalle.push({ row, gtf: d.gtfNumber, action: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({
    mode,
    resumen: { total: ingresos.length, crear: mode === "commit" ? creados : creables, creados, saltados, errores },
    detalle,
  });
});
