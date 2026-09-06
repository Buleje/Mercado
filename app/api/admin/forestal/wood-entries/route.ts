import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { WoodEntriesDB, WOOD_ENTRY_SORT_FIELDS } from "@/lib/db/wood-entries.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { ctpErrorResponse } from "@/lib/forestal/ctp-api-errors";
import { withApiHandler } from "@/lib/api-handler";
import { TIPOS_DOCUMENTO_LOCTP, UNIDADES_LOCTP } from "@/lib/forestal/loctp-campos";
import { gtfDatosSchema } from "@/lib/forestal/ctp-gtf-datos";
import { assertCsrf } from "@/lib/auth/csrf";

/**
 * /api/admin/forestal/wood-entries
 *
 * GET  — lista ingresos de madera (LOE-CTP, ADR-124)
 * POST — crea nuevo ingreso (status pendiente)
 *
 * Guard:
 *   1. requireAdmin (cookie sesión)
 *   2. isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro")
 *      Si no está habilitado por superadmin → 403.
 *   3. rate limit GENEROUS bucket 'ctp' — igual que el endpoint hermano
 *      /api/admin/forestal/ctp (ADR-127).
 *
 * 2026-07-15 — Estaba en STRICT (=10 req/15min, no 60/min como decía este
 * comentario) y SIN bucket propio, así que compartía cupo con cualquier otro
 * endpoint STRICT del admin: listar + filtrar + buscar tiraba 429 a las ~10
 * interacciones y el tab parecía roto. La defensa real acá es requireAdmin +
 * el guard de especialización; el rate limit es secundario.
 */

// ─── Zod schemas ──────────────────────────────────────────────────────────

const documentTypeEnum = z.enum(["RUC", "DNI", "CE", "PASAPORTE"]);
const originTypeEnum = z.enum([
  "concesion",
  "predio_privado",
  "comunidad_nativa",
  "reforestacion",
  "retroaserradero",
  "otro",
]);
const productTypeEnum = z.enum([
  "rolliza",
  "aserrada",
  "tablones",
  "listones",
  "durmientes",
  "pulgada",
  "carbon",
  "lena",
  "otro",
]);
const statusEnum = z.enum([
  "pendiente",
  "validado",
  "rechazado",
  "procesado",
  "anulado",
]);

// Orden del listado — la whitelist vive en la DB class (single source: si se
// agrega una columna ordenable, el enum de acá se entera solo).
const sortFieldEnum = z.enum(WOOD_ENTRY_SORT_FIELDS);
const sortDirEnum = z.enum(["asc", "desc"]);

// Campos oficiales del formato LO-CTP (ADR-311): los catálogos son los que
// lista la guía práctica; los CÓDIGOS van como texto porque los emite la ARFFS
// y su formato varía por región — un patrón inventado rechazaría datos válidos.
const docTypeEnum = z.enum(TIPOS_DOCUMENTO_LOCTP.map((t) => t.valor) as [string, ...string[]]);
const unidadEnum = z.enum(UNIDADES_LOCTP.map((u) => u.valor) as [string, ...string[]]);

const createSchema = z.object({
  entryDate: z.coerce.date().optional(),
  docType: docTypeEnum.optional(),
  // La ficha de SERFOR viaja tal cual: es un documento de ellos, no se re-valida
  // campo por campo (sólo su tamaño, para no aceptar cualquier cosa).
  serforNumeroRegistro: z.string().trim().max(30).nullable().optional(),
  serforGtf: z.record(z.string(), z.unknown()).nullable().optional(),
  gtfNumber: z.string().trim().min(1).max(50),
  gtfDate: z.coerce.date().nullable().optional(),
  gtfSeries: z.string().trim().max(20).nullable().optional(),

  providerName: z.string().trim().min(1).max(200),
  providerDocument: z.string().trim().max(20).nullable().optional(),
  providerDocumentType: documentTypeEnum.nullable().optional(),

  originType: originTypeEnum.optional(),
  originCode: z.string().trim().max(100).nullable().optional(),
  originSourceNumber: z.string().trim().max(100).nullable().optional(),
  ctpProductCode: z.string().trim().max(60).nullable().optional(),
  originRegion: z.string().trim().max(80).nullable().optional(),
  originDistrict: z.string().trim().max(80).nullable().optional(),

  speciesCommonName: z.string().trim().min(1).max(120),
  speciesScientificName: z.string().trim().max(150).nullable().optional(),
  speciesCites: z.boolean().optional(),

  productType: productTypeEnum.optional(),
  unit: unidadEnum.optional(),
  /** "Forma de presentación" (ADR-314). Texto libre: el catálogo sugiere, no encierra. */
  presentacion: z.string().trim().max(40).nullable().optional(),
  volumeM3: z.coerce.number().positive().max(99999),
  pieces: z.coerce.number().int().nonnegative().optional(),
  avgLengthM: z.coerce.number().positive().nullable().optional(),
  avgDiameterCm: z.coerce.number().positive().nullable().optional(),
  humidityPct: z.coerce.number().min(0).max(100).nullable().optional(),
  defectsNotes: z.string().trim().max(500).nullable().optional(),

  /** Cuándo llegó FÍSICAMENTE a la planta (ADR-335). */
  fechaRecepcion: z.coerce.date().nullable().optional(),
  /**
   * El cuerpo del documento que ampara el ingreso: propietario del producto
   * (13-21), destinatario (22-28), transportista y vehículo (29-34) — ADR-336.
   * MISMO esquema que la guía de salida: un solo formato oficial, un solo Zod.
   */
  gtfDatos: gtfDatosSchema.nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  /**
   * Lo que se pagó por esta madera. Opcional a propósito: la factura del
   * proveedor casi nunca viaja con el camión, y exigirla acá haría que el
   * operario invente un número para poder cerrar el formulario. Cuando llega
   * se carga con `action: "set_costo"` (PATCH), que sí funciona con el ingreso
   * ya validado. Ausente ⇒ `null`, nunca 0: un 0 fingiría madera regalada.
   */
  costoTotal: z.coerce.number().min(0).max(99_999_999.99).nullable().optional(),
  moneda: z.enum(["PEN", "USD"]).optional(),
  photos: z.array(z.string().url()).max(10).nullable().optional(),
  /** Lista de trozas cargada a mano o desde un Excel (ADR-320). Tope 500: una
   *  guía real no trae más y sin tope un pegado accidental tumba la request. */
  trozas: z
    .array(
      z.object({
        orden: z.number().int().min(1),
        codificacion: z.string().trim().max(60).nullable(),
        especieComun: z.string().trim().max(120).nullable(),
        especieCientifica: z.string().trim().max(160).nullable(),
        dimensiones: z.string().trim().max(80).nullable(),
        largoM: z.number().nonnegative().max(200).nullable(),
        diametroCm: z.number().nonnegative().max(999).nullable(),
        d1Cm: z.number().nonnegative().max(999).nullable(),
        d2Cm: z.number().nonnegative().max(999).nullable(),
        cantidad: z.number().int().min(0).max(9999).nullable(),
        volumenM3: z.number().positive().max(9999).nullable(),
        /** El código que ESTE centro le marca a la pieza al recibirla (ADR-335). */
        codigoPlanta: z.string().trim().max(120).nullable().optional(),
        /** Parcela de corta del POA, si el documento la trae. */
        parcela: z.string().trim().max(120).nullable().optional(),
        /** Cuándo bajó ESTA pieza del camión (ADR-336). Vacío = la del ingreso. */
        fechaRecepcion: z.coerce.date().nullable().optional(),
        /**
         * La guía la declara pero NO llegó al patio (ADR-325).
         *
         * Se marca en el alta y no después: el que descarga el camión sabe en
         * ese momento cuál falta, y obligarlo a entrar de nuevo a "recepción"
         * garantiza que nadie lo haga.
         */
        noRecepcionada: z.boolean().optional(),
      }),
    )
    .max(500)
    .optional(),
});

// ─── Guard ────────────────────────────────────────────────────────────────

async function ensureSpecializationOrDeny(tenantId: string) {
  const enabled = await isSpecializationEnabled(
    tenantId,
    "spec:forestal:ctp-libro",
  );
  if (!enabled) {
    return NextResponse.json(
      {
        error: "specialization_disabled",
        message:
          "El módulo Libro de Operaciones CTP no está habilitado para este tenant. Solicitá al superadmin habilitarlo.",
      },
      { status: 403 },
    );
  }
  return null;
}

// ─── GET — list ──────────────────────────────────────────────────────────

export const GET = withApiHandler("forestal-wood-entries-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;

  const guard = await ensureSpecializationOrDeny(auth.tenantId);
  if (guard) return guard;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const search = url.searchParams.get("search");
  const speciesCommonName = url.searchParams.get("species");
  const gtfNumber = url.searchParams.get("gtf");
  const fromDate = url.searchParams.get("from");
  const toDate = url.searchParams.get("to");
  const limit = Number(url.searchParams.get("limit") ?? "50");
  const offset = Number(url.searchParams.get("offset") ?? "0");
  const providerName = url.searchParams.get("provider");
  const product = url.searchParams.get("product");
  const cites = url.searchParams.get("cites");
  const late = url.searchParams.get("late") === "1";
  const sinOrigen = url.searchParams.get("sin_origen") === "1";
  /* `?recepcion=pendiente` es la bandeja del patio y `cerrada` el archivo de
     GTF ingresadas (ADR-339). Un valor raro no filtra en vez de romper. */
  const recepcionRaw = url.searchParams.get("recepcion");
  const recepcion: "pendiente" | "cerrada" | undefined =
    recepcionRaw === "pendiente" || recepcionRaw === "cerrada" ? recepcionRaw : undefined;
  // Orden: whitelist en la DB class. Un valor desconocido NO es un 400 —
  // degrada al default (una URL vieja o un typo no debe romper el listado).
  const sortParsed = sortFieldEnum.safeParse(url.searchParams.get("sort"));
  const dirParsed = sortDirEnum.safeParse(url.searchParams.get("dir"));
  const productParsed = product ? productTypeEnum.safeParse(product) : null;

  // Validate status if provided
  const statusParsed = status ? statusEnum.safeParse(status) : null;
  if (statusParsed && !statusParsed.success) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  // Fechas inválidas → sin límite (no reventar el listado por un query param).
  const parseDate = (raw: string | null) => {
    if (!raw) return undefined;
    const parsed = z.coerce.date().safeParse(raw);
    return parsed.success ? parsed.data : undefined;
  };

  const filters = {
    status: statusParsed?.success ? statusParsed.data : undefined,
    speciesCommonName: speciesCommonName ?? undefined,
    gtfNumber: gtfNumber ?? undefined,
    fromDate: parseDate(fromDate),
    toDate: parseDate(toDate),
    search: search ?? undefined,
    providerName: providerName ?? undefined,
    productType: productParsed?.success ? productParsed.data : undefined,
    cites: cites === "1" ? true : cites === "0" ? false : undefined,
    late: late || undefined,
    sinOrigenCode: sinOrigen || undefined,
    recepcion,
    sortBy: sortParsed.success ? sortParsed.data : undefined,
    sortDir: dirParsed.success ? dirParsed.data : undefined,
    limit,
    offset,
  };

  /* ?agrupar=guia → la unidad de la respuesta es el DOCUMENTO y no el asiento
     (ADR-346): una GTF con dos especies es una fila con sus dos líneas adentro.
     El libro sigue guardando una línea por especie. */
  const porGuia = url.searchParams.get("agrupar") === "guia";

  try {
    if (porGuia) {
      if (url.searchParams.get("stats") === "1") {
        const [result, stats] = await Promise.all([
          WoodEntriesDB.listPorGuia(auth.tenantId, filters),
          WoodEntriesDB.stats(auth.tenantId, filters),
        ]);
        return NextResponse.json({ ...result, stats });
      }
      return NextResponse.json(await WoodEntriesDB.listPorGuia(auth.tenantId, filters));
    }
    // ?stats=1 → adjunta los agregados del período (calculados en DB) a la misma
    // respuesta. Van juntos, no en dos requests: así KPIs y tabla describen
    // exactamente el mismo instante (y es la mitad de tráfico por interacción).
    if (url.searchParams.get("stats") === "1") {
      const [result, stats] = await Promise.all([
        WoodEntriesDB.list(auth.tenantId, filters),
        WoodEntriesDB.stats(auth.tenantId, filters),
      ]);
      return NextResponse.json({ ...result, stats });
    }
    const result = await WoodEntriesDB.list(auth.tenantId, filters);
    return NextResponse.json(result);
  } catch (err) {
    logger.error("[wood-entries.GET] failed", { error: String(err) });
    // Dev-mode: expone mensaje + stack truncado para debug rápido.
    // Production: solo error_code genérico (no leak).
    const isDev = process.env.NODE_ENV !== "production";
    return NextResponse.json(
      isDev
        ? {
            error: "internal_error",
            message: String(err),
            stack: err instanceof Error
              ? err.stack?.split("\n").slice(0, 5).join("\n")
              : undefined,
          }
        : { error: "internal_error" },
      { status: 500 },
    );
  }
});

// ─── PATCH — recepcionar una GUÍA entera ────────────────────────────────

/**
 * Un solo pedido para toda la guía (ADR-351).
 *
 * La pantalla mandaba un PATCH por asiento, en paralelo: si uno fallaba, la guía
 * quedaba **partida** entre la bandeja y el archivo, y el operador la buscaba en
 * «GTF ingresadas» sin encontrarla entera. Acá va la guía completa y la
 * respuesta dice cuántos entraron y cuál falló.
 */
const recepcionGuiaSchema = z.object({
  action: z.literal("recepcionar_guia"),
  /** Los asientos de la guía. Tope alto: una GTF no tiene 50 especies. */
  ids: z.array(z.string().trim().min(1).max(60)).min(1).max(50),
  fecha: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Usá el formato AAAA-MM-DD").optional(),
});

export const PATCH = withApiHandler("forestal-wood-entries-patch", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;

  const guard = await ensureSpecializationOrDeny(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = recepcionGuiaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const r = await WoodEntriesDB.recepcionarGuia(
      auth.tenantId,
      parsed.data.ids,
      parsed.data.fecha,
      auth.username ?? "unknown",
    );
    /* Un fallo parcial NO es un 200 silencioso: la guía quedó a medias y la
       pantalla tiene que poder decir cuál falta. */
    if (r.fallo) {
      return NextResponse.json(
        { ...r, error: "recepcion_parcial", message: r.fallo.motivo },
        { status: 409 },
      );
    }
    return NextResponse.json(r);
  } catch (err) {
    logger.error("[wood-entries.PATCH] recepcionar_guia failed", { error: String(err) });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

// ─── POST — create ───────────────────────────────────────────────────────

export const POST = withApiHandler("forestal-wood-entries-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;

  const guard = await ensureSpecializationOrDeny(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const entry = await WoodEntriesDB.create(auth.tenantId, {
      ...parsed.data,
      createdBy: auth.username ?? "unknown",
    });
    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    // Los invariantes del libro (período cerrado, GTF duplicada) llegan como
    // CtpInvariantError: con un 500 el operario veía "error interno" al cargar
    // un ingreso con fecha de un mes ya cerrado.
    return ctpErrorResponse(err, "wood-entries.POST", auth.tenantId);
  }
});
