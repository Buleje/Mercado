import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import {
  WoodEntriesDB,
  WOOD_ENTRY_SORT_FIELDS,
  type WoodEntryFiltrosCabecera,
} from "@/lib/db/wood-entries.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { ctpErrorResponse } from "@/lib/forestal/ctp-api-errors";
import { withApiHandler } from "@/lib/api-handler";
import { TIPOS_DOCUMENTO_LOCTP, UNIDADES_LOCTP } from "@/lib/forestal/loctp-campos";
import { gtfDatosSchema } from "@/lib/forestal/ctp-gtf-datos";
import { assertCsrf } from "@/lib/auth/csrf";
import { leerContratoId } from "@/lib/forestal/contrato-filtro";
import { fotosDelTenantSchema } from "@/lib/storage-url";
import { normalizarFotos } from "@/lib/forestal/fotos-carga";
import { FILTROS_PAGO } from "@/lib/forestal/ingresos-filtros-columna";

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

/**
 * Función y no `const`: `photos` necesita el `tenantId` de quien hace el
 * pedido para exigir que cada URL sea del storage de ESE tenant (ver
 * `lib/storage-url.ts` — el candado real no es "es una URL", es "es nuestra").
 */
const buildCreateSchema = (tenantId: string) => z.object({
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
  /** El contrato/permiso bajo el que entra la madera (ADR-421). */
  contratoId: z.string().trim().max(64).nullable().optional(),
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
  photos: fotosDelTenantSchema(tenantId, 10).nullable().optional(),
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
          "El módulo Libro de Operaciones CTP no está habilitado para este tenant. Solicita al superadmin habilitarlo.",
      },
      { status: 403 },
    );
  }
  return null;
}

/**
 * `photos` sale SIEMPRE como `FotoCarga[]` (2026-09-26): en la base conviven el
 * string viejo (URL pública) y el objeto nuevo (`priv:`). La pantalla recibe una
 * sola forma y arma el `src` con `srcDeFoto`. Cubre las dos respuestas del
 * listado: `entries[]` (por asiento) y `guias[].lineas[]` (por guía).
 */
function conFotosNormalizadas<T>(r: T): T {
  const fila = (x: unknown) =>
    x && typeof x === "object" && "photos" in x ? { ...x, photos: normalizarFotos((x as { photos: unknown }).photos) } : x;
  const o = r as { entries?: unknown; guias?: unknown };
  const out: Record<string, unknown> = { ...(r as object) };
  if (Array.isArray(o.entries)) out.entries = o.entries.map(fila);
  if (Array.isArray(o.guias)) {
    out.guias = o.guias.map((g: unknown) =>
      g && typeof g === "object" && Array.isArray((g as { lineas?: unknown }).lineas)
        ? { ...g, lineas: (g as { lineas: unknown[] }).lineas.map(fila) }
        : g,
    );
  }
  return out as T;
}

// ─── Autofiltro de la cabecera (Ingresos, 2026-09-26) ─────────────────────

const diaSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);
/* `z.coerce.number()` convierte "" en 0: un tope vacío tiene que ser «sin
   tope», así que el vacío se descarta antes de coercionar. */
const topeSchema = z.string().trim().min(1).transform(Number).pipe(z.number().finite().nonnegative());
const trozasSchema = z.enum(["con", "sin"]);
/**
 * `pago` (ADR-437 §10 y §7 — la tira «guías sin pagar» salta acá) es el ÚNICO
 * filtro de la cabecera que responde 400 con un valor inválido: los demás
 * degradan en silencio porque son texto libre de un buscador; éste viene de un
 * link con un valor fijo (`servicio | sin-pagar | pagada`) y un valor roto ahí
 * significa un bug propio, no un tipeo del usuario.
 */
const pagoSchema = z.enum(FILTROS_PAGO);

/**
 * Los filtros por columna de la tabla de Ingresos. Un valor inválido (fecha
 * mal escrita, número NaN) se IGNORA — no es un 400 ni un 500: una URL vieja o
 * un tipeo a medias no puede tumbar el libro.
 */
function leerFiltrosCabecera(sp: URLSearchParams): WoodEntryFiltrosCabecera | undefined {
  const texto = (k: string) => {
    const v = (sp.get(k) ?? "").trim().slice(0, 120);
    return v || undefined;
  };
  const dia = (k: string) => {
    const r = diaSchema.safeParse(sp.get(k) ?? "");
    return r.success ? r.data : undefined;
  };
  const tope = (k: string) => {
    const r = topeSchema.safeParse(sp.get(k) ?? "");
    return r.success ? r.data : undefined;
  };
  const trozas = trozasSchema.safeParse(sp.get("trozas"));
  const c: WoodEntryFiltrosCabecera = {
    doc: texto("doc"),
    sniffs: texto("sniffs"),
    tipo: texto("tipo"),
    origen: texto("origen"),
    unidad: texto("unidad"),
    registro: texto("registro"),
    fechaDesde: dia("fecha_desde"),
    fechaHasta: dia("fecha_hasta"),
    gtfDesde: dia("gtf_desde"),
    gtfHasta: dia("gtf_hasta"),
    trozas: trozas.success ? trozas.data : undefined,
    conCosto: sp.get("con_costo") === "1" || undefined,
    volMin: tope("vol_min"),
    volMax: tope("vol_max"),
    pzMin: tope("pz_min"),
    pzMax: tope("pz_max"),
  };
  return Object.values(c).some((v) => v !== undefined) ? c : undefined;
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
  /* Repetible (`?status=pendiente&status=validado`) desde el autofiltro de la
     cabecera (2026-09-26): OR adentro. Uno solo sigue valiendo. */
  const statusRaw = url.searchParams.getAll("status").filter((v) => v.trim() !== "");
  const search = url.searchParams.get("search");
  /**
   * Especie, proveedor, producto y permiso admiten VARIOS valores
   * (Brandon, 2026-09-10). Viajan REPETIDOS —`?species=A&species=B`— y no
   * separados por coma: un proveedor se llama «Maderera X, S.A.C.» y una coma
   * como separador partiría el nombre en dos filtros que no existen.
   */
  const speciesCommonName = url.searchParams.getAll("species");
  const gtfNumber = url.searchParams.get("gtf");
  const fromDate = url.searchParams.get("from");
  const toDate = url.searchParams.get("to");
  const limit = Number(url.searchParams.get("limit") ?? "50");
  const offset = Number(url.searchParams.get("offset") ?? "0");
  const providerName = url.searchParams.getAll("provider");
  /* El título habilitante que ampara la madera (ADR-400): el filtro que faltaba
     para poder preguntarle al libro «cuánto entró por este permiso». */
  const permiso = url.searchParams.getAll("permiso");
  const product = url.searchParams.getAll("product");
  const cites = url.searchParams.get("cites");
  const late = url.searchParams.get("late") === "1";
  const sinOrigen = url.searchParams.get("sin_origen") === "1";
  /* La pastilla «sin costo»: la madera que deja al margen sin base (ADR-135). */
  const sinCosto = url.searchParams.get("sin_costo") === "1";
  /* `?recepcion=pendiente` es la bandeja del patio y `cerrada` el archivo de
     GTF ingresadas (ADR-339). Un valor raro no filtra en vez de romper. */
  const recepcionRaw = url.searchParams.get("recepcion");
  const recepcion: "pendiente" | "cerrada" | undefined =
    recepcionRaw === "pendiente" || recepcionRaw === "cerrada" ? recepcionRaw : undefined;
  // Orden: whitelist en la DB class. Un valor desconocido NO es un 400 —
  // degrada al default (una URL vieja o un typo no debe romper el listado).
  const sortParsed = sortFieldEnum.safeParse(url.searchParams.get("sort"));
  const dirParsed = sortDirEnum.safeParse(url.searchParams.get("dir"));
  /* Un valor desconocido no rompe el listado: se descarta y filtran los que
     sí son productos válidos. */
  const productos = product.map((p) => productTypeEnum.safeParse(p)).flatMap((r) => (r.success ? [r.data] : []));

  /* «Solo este permiso» (ADR-421): el contrato activo de la banda. */
  const contrato = leerContratoId(url.searchParams);
  if (!contrato.ok) return NextResponse.json({ error: contrato.error }, { status: 400 });

  // Validate status if provided — cada valor contra el enum; uno raro es un 400
  // (el contrato de siempre: un estado inventado no se degrada a «todos»).
  const statusParsed = z.array(statusEnum).safeParse(statusRaw);
  if (!statusParsed.success) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }
  const estados = [...new Set(statusParsed.data)];

  /* `?pago=` salta desde la tira «guías sin pagar»/«de servicio» — un valor
     roto es un bug propio, no un tipeo (ver `pagoSchema`). */
  const pagoRaw = url.searchParams.get("pago");
  const pagoParsed = pagoRaw != null ? pagoSchema.safeParse(pagoRaw) : undefined;
  if (pagoParsed && !pagoParsed.success) {
    return NextResponse.json({ error: "invalid_pago" }, { status: 400 });
  }
  const pago = pagoParsed?.success ? pagoParsed.data : undefined;

  // Fechas inválidas → sin límite (no reventar el listado por un query param).
  const parseDate = (raw: string | null) => {
    if (!raw) return undefined;
    const parsed = z.coerce.date().safeParse(raw);
    return parsed.success ? parsed.data : undefined;
  };

  const filters = {
    status: estados.length > 0 ? estados : undefined,
    speciesCommonName: speciesCommonName.length > 0 ? speciesCommonName : undefined,
    gtfNumber: gtfNumber ?? undefined,
    fromDate: parseDate(fromDate),
    toDate: parseDate(toDate),
    search: search ?? undefined,
    providerName: providerName.length > 0 ? providerName : undefined,
    originCode: permiso.length > 0 ? permiso : undefined,
    contratoId: contrato.contratoId,
    productType: productos.length > 0 ? productos : undefined,
    cites: cites === "1" ? true : cites === "0" ? false : undefined,
    late: late || undefined,
    sinOrigenCode: sinOrigen || undefined,
    sinCosto: sinCosto || undefined,
    recepcion,
    /* `pago` no sale de `leerFiltrosCabecera` (esa función degrada valores
       rotos en silencio; acá ya se validó y devolvió 400 si hacía falta). */
    cabecera: pago ? { ...(leerFiltrosCabecera(url.searchParams) ?? {}), pago } : leerFiltrosCabecera(url.searchParams),
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
    /* ?sinFoto=1 → las guías RECIBIDAS sin foto de la carga, para la tira de
       pendientes (período + permiso, como el resto). Sólo el agregado. */
    if (url.searchParams.get("sinFoto") === "1") {
      const sinFoto = await WoodEntriesDB.guiasRecibidasSinFoto(auth.tenantId, {
        fromDate: filters.fromDate,
        toDate: filters.toDate,
        contratoId: filters.contratoId,
      });
      return NextResponse.json({ sinFoto });
    }
    if (porGuia) {
      if (url.searchParams.get("stats") === "1") {
        const [result, stats] = await Promise.all([
          WoodEntriesDB.listPorGuia(auth.tenantId, filters),
          WoodEntriesDB.stats(auth.tenantId, filters),
        ]);
        return NextResponse.json({ ...conFotosNormalizadas(result), stats });
      }
      return NextResponse.json(conFotosNormalizadas(await WoodEntriesDB.listPorGuia(auth.tenantId, filters)));
    }
    // ?stats=1 → adjunta los agregados del período (calculados en DB) a la misma
    // respuesta. Van juntos, no en dos requests: así KPIs y tabla describen
    // exactamente el mismo instante (y es la mitad de tráfico por interacción).
    if (url.searchParams.get("stats") === "1") {
      const [result, stats] = await Promise.all([
        WoodEntriesDB.list(auth.tenantId, filters),
        WoodEntriesDB.stats(auth.tenantId, filters),
      ]);
      return NextResponse.json({ ...conFotosNormalizadas(result), stats });
    }
    const result = await WoodEntriesDB.list(auth.tenantId, filters);
    return NextResponse.json(conFotosNormalizadas(result));
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
  fecha: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD").optional(),
  /**
   * Qué se vio al recibir cuando lo que bajó no es lo que declara el papel
   * (2026-09-15). Va al rastro de auditoría de cada asiento; no hay columna
   * propia y no se inventa una — el libro es un formato oficial.
   */
  observacion: z.string().trim().max(300).optional(),
  /**
   * La llegada cae después del vencimiento de la guía y quien recibe confirma
   * que fue así, con motivo (ADR-434 §Vencimiento). Sin esto, esa fecha se
   * rechaza con 422 `GUIA_VENCIDA`; el motivo lo exige la regla pura.
   */
  aceptaVencida: z.boolean().optional(),
  motivoVencida: z.string().trim().max(300).optional(),
});

/**
 * Completar los campos VACÍOS de una guía (ADR-401 §1.2). Va por `gtfNumber` y
 * no por id porque **el permiso es de la guía**: una GTF con tres especies son
 * tres asientos que comparten origen.
 */
const completarGuiaSchema = z.object({
  action: z.literal("completar_guia"),
  gtfNumber: z.string().trim().min(1).max(60),
  campos: z
    .object({
      originCode: z.string().trim().max(120).optional(),
      speciesScientificName: z.string().trim().max(160).optional(),
    })
    .refine((c) => Object.values(c).some((v) => (v ?? "").trim() !== ""), {
      message: "Manda al menos un campo con contenido.",
    }),
});

/**
 * Corregir campos de origen de una guía ya cargados (ADR-401 §1). Mismo cuerpo
 * que completar; lo que cambia es que SOBRESCRIBE, y por eso su rastro narra el
 * antes y el después.
 */
const corregirGuiaSchema = z.object({
  action: z.literal("corregir_guia"),
  gtfNumber: z.string().trim().min(1).max(60),
  campos: z
    .object({
      originCode: z.string().trim().max(120).optional(),
      speciesScientificName: z.string().trim().max(160).optional(),
    })
    .refine((c) => Object.values(c).some((v) => (v ?? "").trim() !== ""), {
      message: "Manda al menos un campo con contenido.",
    }),
});

/**
 * Fotos de una GUÍA completa: la pila que bajó del camión, no un asiento (ADR-434).
 *
 * Reemplaza la lista entera (lo que ya sube `CtpFotosDelIngreso` a `/api/upload`),
 * no un PATCH por URL — subir/quitar es raro y la lista completa entra sin
 * problema en el body. `fotosDelTenantSchema` es el mismo candado que
 * `buildCreateSchema.photos`: sólo fotos DE ESTE TENANT, no cualquier URL.
 */
const buildFotosGuiaSchema = (tenantId: string) =>
  z.object({
    action: z.literal("fotos_guia"),
    gtfNumber: z.string().trim().min(1).max(60),
    fotos: fotosDelTenantSchema(tenantId, 10),
  });

const buildPatchBodySchema = (tenantId: string) =>
  z.union([recepcionGuiaSchema, completarGuiaSchema, corregirGuiaSchema, buildFotosGuiaSchema(tenantId)]);

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
  const parsed = buildPatchBodySchema(auth.tenantId).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    if (parsed.data.action === "corregir_guia") {
      const r = await WoodEntriesDB.corregirGuia(
        auth.tenantId,
        parsed.data.gtfNumber,
        parsed.data.campos,
        auth.username ?? "unknown",
      );
      return NextResponse.json(r);
    }
    if (parsed.data.action === "completar_guia") {
      const r = await WoodEntriesDB.completarGuia(
        auth.tenantId,
        parsed.data.gtfNumber,
        parsed.data.campos,
        auth.username ?? "unknown",
      );
      return NextResponse.json(r);
    }
    if (parsed.data.action === "fotos_guia") {
      const r = await WoodEntriesDB.fotosGuia(
        auth.tenantId,
        parsed.data.gtfNumber,
        parsed.data.fotos,
        auth.username ?? "unknown",
        auth.role,
      );
      return NextResponse.json(r);
    }
    const r = await WoodEntriesDB.recepcionarGuia(
      auth.tenantId,
      parsed.data.ids,
      parsed.data.fecha,
      auth.username ?? "unknown",
      parsed.data.observacion,
      { aceptaVencida: parsed.data.aceptaVencida, motivoVencida: parsed.data.motivoVencida },
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
    /* Las invariantes del libro (período cerrado, estado del asiento) llegan al
       operario con su motivo. `ctpErrorResponse` es el mismo helper que usa el
       POST: un segundo manejo de errores acá divergiría del de al lado. */
    return ctpErrorResponse(err, "wood-entries.PATCH", auth.tenantId);
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

  const parsed = buildCreateSchema(auth.tenantId).safeParse(body);
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
