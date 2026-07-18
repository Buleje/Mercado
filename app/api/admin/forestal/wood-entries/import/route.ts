import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { WoodEntriesDB, type WoodOriginType, type WoodProductType } from "@/lib/db/wood-entries.db";
import { ForestCtpDB, produccionKey, despachoKey } from "@/lib/db/forest-ctp.db";
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

const consumoSchema = z.object({ gtfIngreso: z.string().trim().min(1), volumeM3: z.number().positive() });
const produccionSchema = z.object({
  entryDate: z.string().trim().nullable().optional(),
  productType: z.string().trim().min(1, "Sin tipo de producto").max(120),
  speciesCommon: z.string().trim().min(1, "Sin especie").max(120),
  gtfIngreso: z.string().trim().max(120).nullable().optional(),
  unit: z.string().trim().max(20).optional().default("m3"),
  quantity: z.number().positive("Cantidad producida inválida (≤ 0)"),
  rendimientoPct: z.number().nullable().optional(),
  consumos: z.array(consumoSchema).optional().default([]),
  row: z.number().optional(),
});

const salidaSchema = z.object({
  entryDate: z.string().trim().nullable().optional(),
  gtfNumber: z.string().trim().max(120).nullable().optional(),
  productType: z.string().trim().min(1, "Sin tipo de producto").max(120),
  speciesCommon: z.string().trim().max(120).optional().default("—"),
  unit: z.string().trim().max(20).optional().default("m3"),
  quantity: z.number().positive("Cantidad despachada inválida (≤ 0)"),
  destino: z.string().trim().max(200).nullable().optional(),
  row: z.number().optional(),
});

const bodySchema = z.object({
  mode: z.enum(["preview", "commit"]),
  registro: z.enum(["ingresos", "produccion", "salida"]).optional().default("ingresos"),
  // Filas sueltas: las que fallan validación se REPORTAN (no rompen el request).
  ingresos: z.array(z.record(z.string(), z.unknown())).max(5000).optional().default([]),
  produccion: z.array(z.record(z.string(), z.unknown())).max(5000).optional().default([]),
  salida: z.array(z.record(z.string(), z.unknown())).max(5000).optional().default([]),
});

type ResultRow = { row?: number; gtf: string | null; action: "crear" | "creado" | "existe" | "difiere" | "error"; message: string };

// ── Reconciliación (ADR-138): el importador es insert-only. Una fila cuya clave
// ya existe pero con valores distintos se marca «difiere» (NO se sobrescribe —
// sobrescribir un acta del libro es un cambio de compliance, no una importación).
const normCmp = (s: unknown): string => String(s ?? "").trim().toLowerCase();

function diffIngreso(
  db: { volumeM3: number; speciesCommonName: string; productType: string },
  file: { volumeM3: number; speciesCommonName: string; productType: string },
): string | null {
  const parts: string[] = [];
  if (Math.abs(db.volumeM3 - file.volumeM3) > 0.0001) parts.push(`volumen ${db.volumeM3}→${file.volumeM3} m³`);
  if (normCmp(db.speciesCommonName) !== normCmp(file.speciesCommonName)) parts.push(`especie ${db.speciesCommonName}→${file.speciesCommonName}`);
  if (normCmp(db.productType) !== normCmp(file.productType)) parts.push(`producto ${db.productType}→${file.productType}`);
  return parts.length ? parts.join(" · ") : null;
}

function diffDespacho(
  db: { quantity: number; productType: string; speciesCommon: string; destino: string },
  file: { quantity: number; productType: string; speciesCommon: string; destino?: string | null },
): string | null {
  const parts: string[] = [];
  if (Math.abs(db.quantity - file.quantity) > 0.0001) parts.push(`cantidad ${db.quantity}→${file.quantity}`);
  if (normCmp(db.productType) !== normCmp(file.productType)) parts.push(`producto ${db.productType}→${file.productType}`);
  if (normCmp(db.speciesCommon) !== normCmp(file.speciesCommon)) parts.push(`especie ${db.speciesCommon}→${file.speciesCommon}`);
  if (normCmp(db.destino) !== normCmp(file.destino)) parts.push(`destino ${db.destino || "—"}→${file.destino || "—"}`);
  return parts.length ? parts.join(" · ") : null;
}

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
  const { mode, registro, ingresos, produccion, salida } = parsed.data;

  // ── Registro: PRODUCCIÓN (etapa 2) ──────────────────────────────────────
  if (registro === "produccion") {
    // Resolver GTF de ingreso → woodEntryId (los ingresos deben existir ya).
    const allGtfs = produccion.flatMap((r) => (Array.isArray(r.consumos) ? (r.consumos as { gtfIngreso?: unknown }[]).map((c) => String(c.gtfIngreso ?? "").trim()) : []));
    const idByGtf = await WoodEntriesDB.idByGtf(auth.tenantId, allGtfs);
    const existingKeys = await ForestCtpDB.existingProduccionKeys(auth.tenantId);

    const detalle: ResultRow[] = [];
    let creables = 0, saltados = 0, errores = 0, creados = 0;
    for (const raw of produccion) {
      const row = typeof raw.row === "number" ? raw.row : undefined;
      const v = produccionSchema.safeParse(raw);
      if (!v.success) {
        errores++;
        detalle.push({ row, gtf: null, action: "error", message: v.error.issues.map((i) => i.message).join(" · ") });
        continue;
      }
      const d = v.data;
      const label = `${d.productType} · ${d.speciesCommon}`;
      const key = produccionKey(d.entryDate ?? "", d.productType, d.speciesCommon, d.quantity);
      if (existingKeys.has(key)) {
        saltados++;
        detalle.push({ row, gtf: label, action: "existe", message: "Ya existe una corrida igual — se salta" });
        continue;
      }
      // Resolver consumos; si un GTF de ingreso falta, es error (importá ingresos primero).
      const resolved: { woodEntryId: string; volumeM3: number }[] = [];
      const missing: string[] = [];
      for (const c of d.consumos) {
        const id = idByGtf.get(c.gtfIngreso);
        if (id) resolved.push({ woodEntryId: id, volumeM3: c.volumeM3 });
        else missing.push(c.gtfIngreso);
      }
      if (missing.length) {
        errores++;
        detalle.push({ row, gtf: label, action: "error", message: `GTF de ingreso no encontrado: ${[...new Set(missing)].join(", ")} — importá los ingresos primero` });
        continue;
      }
      if (mode === "preview") {
        creables++;
        detalle.push({ row, gtf: label, action: "crear", message: `${d.quantity} ${d.unit} · ${resolved.length} consumo${resolved.length === 1 ? "" : "s"}` });
        continue;
      }
      try {
        const volumeInputM3 = resolved.reduce((a, c) => a + c.volumeM3, 0);
        await ForestCtpDB.create(auth.tenantId, {
          section: "produccion",
          entryDate: d.entryDate ? new Date(d.entryDate) : undefined,
          productType: d.productType,
          speciesCommon: d.speciesCommon,
          gtfIngreso: d.gtfIngreso ?? null,
          unit: d.unit,
          quantity: d.quantity,
          volumeInputM3: volumeInputM3 > 0 ? volumeInputM3 : null,
          rendimientoPct: d.rendimientoPct ?? null,
          consumos: resolved,
          createdBy: auth.username ?? "import",
        });
        existingKeys.add(key);
        creados++;
        detalle.push({ row, gtf: label, action: "creado", message: `Corrida importada (${resolved.length} consumo${resolved.length === 1 ? "" : "s"})` });
      } catch (e) {
        errores++;
        logger.error("[wood-entries.import] produccion row failed", { label, error: String(e) });
        detalle.push({ row, gtf: label, action: "error", message: e instanceof Error ? e.message : String(e) });
      }
    }
    return NextResponse.json({ mode, registro, resumen: { total: produccion.length, crear: mode === "commit" ? creados : creables, creados, saltados, difieren: 0, errores }, detalle });
  }

  // ── Registro: SALIDA / despachos (etapa 2b) ─────────────────────────────
  if (registro === "salida") {
    const existingKeys = await ForestCtpDB.existingDespachoKeys(auth.tenantId);
    const existingByGtf = await ForestCtpDB.despachoComparableByGtf(auth.tenantId);
    const detalle: ResultRow[] = [];
    let creables = 0, saltados = 0, difieren = 0, errores = 0, creados = 0;
    for (const raw of salida) {
      const row = typeof raw.row === "number" ? raw.row : undefined;
      const v = salidaSchema.safeParse(raw);
      if (!v.success) {
        errores++;
        detalle.push({ row, gtf: String(raw.gtfNumber ?? "").trim() || null, action: "error", message: v.error.issues.map((i) => i.message).join(" · ") });
        continue;
      }
      const d = v.data;
      const gtfLabel = d.gtfNumber || `${d.productType} · ${d.speciesCommon}`;
      const key = despachoKey(d.gtfNumber ?? null, d.entryDate ?? "", d.productType, d.speciesCommon, d.quantity, d.destino ?? null);
      if (existingKeys.has(key)) {
        // Reconciliación: si el despacho tiene GTF, comparar valores contra el guardado.
        const prev = d.gtfNumber ? existingByGtf.get(d.gtfNumber.trim()) : undefined;
        const diff = prev ? diffDespacho(prev, d) : null;
        if (diff) {
          difieren++;
          detalle.push({ row, gtf: gtfLabel, action: "difiere", message: `Ya existe con datos distintos (no se sobrescribe): ${diff}` });
        } else {
          saltados++;
          detalle.push({ row, gtf: gtfLabel, action: "existe", message: "Ya existe un despacho igual — se salta" });
        }
        continue;
      }
      if (mode === "preview") {
        creables++;
        detalle.push({ row, gtf: gtfLabel, action: "crear", message: `${d.quantity} ${d.unit}${d.destino ? ` → ${d.destino}` : ""} · sin atribuir (atribuí luego)` });
        continue;
      }
      try {
        // Sin origenes: el formato oficial de Salida no lleva la corrida. Se crea
        // "sin atribuir" (el operador la completa con «Editar atribución»). El
        // create valida I3 (no despachar más de lo producido de ese producto).
        await ForestCtpDB.create(auth.tenantId, {
          section: "despacho",
          entryDate: d.entryDate ? new Date(d.entryDate) : undefined,
          productType: d.productType,
          speciesCommon: d.speciesCommon,
          unit: d.unit,
          quantity: d.quantity,
          gtfNumber: d.gtfNumber ?? null,
          destino: d.destino ?? null,
          createdBy: auth.username ?? "import",
        });
        existingKeys.add(key);
        creados++;
        detalle.push({ row, gtf: gtfLabel, action: "creado", message: "Despacho importado (sin atribuir)" });
      } catch (e) {
        errores++;
        logger.error("[wood-entries.import] salida row failed", { gtf: gtfLabel, error: String(e) });
        detalle.push({ row, gtf: gtfLabel, action: "error", message: e instanceof Error ? e.message : String(e) });
      }
    }
    return NextResponse.json({ mode, registro, resumen: { total: salida.length, crear: mode === "commit" ? creados : creables, creados, saltados, difieren, errores }, detalle });
  }

  // ── Registro: INGRESOS (etapa 1, default) ───────────────────────────────
  // Idempotencia + reconciliación: valores actuales de los GTF que ya existen.
  const gtfs = ingresos.map((r) => String(r.gtfNumber ?? "").trim()).filter(Boolean);
  const existing = await WoodEntriesDB.comparableByGtf(auth.tenantId, gtfs);

  const detalle: ResultRow[] = [];
  let creables = 0, saltados = 0, difieren = 0, errores = 0, creados = 0;

  for (const raw of ingresos) {
    const row = typeof raw.row === "number" ? raw.row : undefined;
    const v = ingresoSchema.safeParse(raw);
    if (!v.success) {
      errores++;
      detalle.push({ row, gtf: String(raw.gtfNumber ?? "").trim() || null, action: "error", message: v.error.issues.map((i) => i.message).join(" · ") });
      continue;
    }
    const d = v.data;
    const prev = existing.get(d.gtfNumber);
    if (prev) {
      // Insert-only: existe → NO se sobrescribe. «difiere» si el libro trae otros valores.
      const diff = diffIngreso(prev, d);
      if (diff) {
        difieren++;
        detalle.push({ row, gtf: d.gtfNumber, action: "difiere", message: `Ya existe con datos distintos (no se sobrescribe): ${diff}` });
      } else {
        saltados++;
        detalle.push({ row, gtf: d.gtfNumber, action: "existe", message: "Ya existe, idéntico — se salta" });
      }
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
      existing.set(d.gtfNumber, { volumeM3: d.volumeM3, speciesCommonName: d.speciesCommonName, productType: d.productType, providerName: d.providerName }); // no duplicar en el batch
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
    resumen: { total: ingresos.length, crear: mode === "commit" ? creados : creables, creados, saltados, difieren, errores },
    detalle,
  });
});
