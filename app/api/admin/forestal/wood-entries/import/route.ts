import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { WoodEntriesDB, type WoodOriginType, type WoodProductType } from "@/lib/db/wood-entries.db";
import { ForestCtpDB, produccionKey, produccionKeyBase, despachoKey } from "@/lib/db/forest-ctp.db";
import { ActivityLogDB } from "@/lib/db/activity-log.db";
import { auditCtp } from "@/lib/forestal/ctp-audit";
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

// Techos de rango = límites de la columna Decimal en el schema (12,4 / 14,4 /
// 5,2). Sin esto, un volumen absurdo (typo «200000000») pasa Zod y REVIENTA en
// el insert con un error crudo de Prisma; con esto es una fila «error» limpia.
const MAX_VOL_12_4 = 99_999_999.9999; // Decimal(12,4) — volumen/consumo m³
const MAX_QTY_14_4 = 9_999_999_999.9999; // Decimal(14,4) — cantidad producida/despachada

/** Tope por guía: el mismo que aplica `WoodEntriesDB.agregarTrozas`. */
const TOPE_TROZAS = 500;

/** Una pieza de la lista de la guía (ADR-312). */
const trozaSchema = z.object({
  orden: z.number().int().min(1).optional(),
  codificacion: z.string().trim().max(120).nullable().optional(),
  /** El código que ESTE centro le marca a la pieza (col. «Código Planta»). */
  codigoPlanta: z.string().trim().max(120).nullable().optional(),
  /** Parcela de corta del POA, cuando el documento la trae. */
  parcela: z.string().trim().max(120).nullable().optional(),
  especieComun: z.string().trim().max(120).nullable().optional(),
  especieCientifica: z.string().trim().max(160).nullable().optional(),
  dimensiones: z.string().trim().max(120).nullable().optional(),
  largoM: z.number().nonnegative().max(MAX_VOL_12_4).nullable().optional(),
  diametroCm: z.number().nonnegative().max(MAX_VOL_12_4).nullable().optional(),
  d1Cm: z.number().nonnegative().max(MAX_VOL_12_4).nullable().optional(),
  d2Cm: z.number().nonnegative().max(MAX_VOL_12_4).nullable().optional(),
  cantidad: z.number().int().positive().max(9999).optional().default(1),
  volumenM3: z.number().nonnegative().max(MAX_VOL_12_4).nullable().optional(),
});

const ingresoSchema = z.object({
  gtfNumber: z.string().trim().min(1, "Sin N° de GTF (origen legal obligatorio)"),
  entryDate: z.string().trim().nullable().optional(),
  providerName: z.string().trim().min(1, "Sin titular / proveedor").max(200),
  originType: z.enum(ORIGIN).optional().default("otro"),
  originRegion: z.string().trim().max(80).nullable().optional(),
  /** (9) "Código de origen/procedencia" del formato LO-CTP — el contrato/título
   *  habilitante con el que salió la madera de la fuente. */
  originCode: z.string().trim().max(120).nullable().optional(),
  /** (5) "N° de fuente de origen o procedencia" — la resolución que emite la
   *  ARFFS. Texto libre a propósito: el formato varía por región. */
  originSourceNumber: z.string().trim().max(120).nullable().optional(),
  speciesCommonName: z.string().trim().min(1, "Sin especie").max(120),
  speciesScientificName: z.string().trim().max(160).nullable().optional(),
  speciesCites: z.boolean().optional().default(false),
  productType: z.enum(PRODUCT).optional().default("rolliza"),
  volumeM3: z.number().positive("Cantidad/volumen inválido (≤ 0)").max(MAX_VOL_12_4, "Volumen fuera de rango"),
  notes: z.string().trim().max(2000).nullable().optional(),
  /**
   * El «Código de CTP» del formato: el identificador de la PIEZA dentro del
   * centro (`3012264`), no de la guía.
   *
   * Con él se crea la troza en la misma transacción, y eso es lo que permite que
   * el Consumo y el Retrozado del mismo libro la encuentren: los dos buscan por
   * `buscarTrozaPorCodigo`. Sin la troza, un libro completo importaba los
   * ingresos y después declaraba que ninguno de sus propios consumos existía.
   */
  codigoCtp: z.string().trim().max(120).nullable().optional(),
  /**
   * La lista de PIEZAS de la guía — troza por troza.
   *
   * El inventario de rolliza en patio trae una fila por troza y varias comparten
   * su GTF: el ingreso ES la guía y las trozas son su detalle. Sin este campo el
   * cuerpo llegaba con las piezas y Zod las descartaba en silencio (un
   * `z.object` borra lo que no declara), así que el patio quedaba con la guía
   * cargada y CERO trozas — justo el detalle que el fiscalizador pide.
   */
  trozas: z.array(trozaSchema).max(TOPE_TROZAS).optional().default([]),
  row: z.number().optional(),
});

const consumoSchema = z.object({ gtfIngreso: z.string().trim().min(1), volumeM3: z.number().positive().max(MAX_VOL_12_4) });
const produccionSchema = z.object({
  entryDate: z.string().trim().nullable().optional(),
  productType: z.string().trim().min(1, "Sin tipo de producto").max(120),
  speciesCommon: z.string().trim().min(1, "Sin especie").max(120),
  gtfIngreso: z.string().trim().max(120).nullable().optional(),
  unit: z.string().trim().max(20).optional().default("m3"),
  quantity: z.number().positive("Cantidad producida inválida (≤ 0)").max(MAX_QTY_14_4, "Cantidad fuera de rango"),
  rendimientoPct: z.number().max(999.99, "Rendimiento fuera de rango").nullable().optional(),
  consumos: z.array(consumoSchema).optional().default([]),
  /**
   * Los códigos de troza que esta corrida se comió (Sección 2 · Consumos).
   *
   * El consumo del libro vive en DOS caras y son el mismo hecho: los m³ por guía
   * (`consumos`, arriba) y las piezas (`WoodEntryTroza.consumidaEnId`). Escribir
   * sólo una deja el patio mostrando trozas libres que ya se aserraron.
   *
   * Van con la corrida y no en la Sección 2 a propósito: la pieza se marca
   * consumida EN una corrida, y hasta que la corrida no existe no hay dónde
   * apuntar. El formato del SNIFFS da la relación por el Lote.
   */
  trozasConsumidas: z.array(z.string().trim().min(1)).max(500).optional().default([]),
  /**
   * Lo que IDENTIFICA la corrida cuando viene de un inventario: el código del
   * paquete y su lote. Además de guardarse, entran en la clave de deduplicación:
   * sin ellos, dos paquetes iguales de la misma especie —lo normal en un
   * depósito— se importaban como uno solo.
   */
  codigoProducto: z.string().trim().max(120).nullable().optional(),
  materiaPrimaRef: z.string().trim().max(200).nullable().optional(),
  /** Dimensiones, presentación, «inventario de apertura»… el detalle del papel. */
  notes: z.string().trim().max(2000).nullable().optional(),
  /** Piezas del paquete, cuando el formato las declara. */
  pieces: z.number().int().nonnegative().max(999_999).nullable().optional(),
  /**
   * La ficha del BULTO. Con esto la corrida importada no es sólo un volumen:
   * pasa a tener su paquete en la pila, con presentación y medidas, que es lo
   * que se busca cuando hay que encontrarlo en el depósito.
   */
  presentacion: z.string().trim().max(60).nullable().optional(),
  medidas: z
    .object({
      espesorCm: z.number().positive().max(999).nullable().optional(),
      anchoCm: z.number().positive().max(999).nullable().optional(),
      largoM: z.number().positive().max(999).nullable().optional(),
    })
    .nullable()
    .optional(),
  row: z.number().optional(),
});

const salidaSchema = z.object({
  entryDate: z.string().trim().nullable().optional(),
  gtfNumber: z.string().trim().max(120).nullable().optional(),
  productType: z.string().trim().min(1, "Sin tipo de producto").max(120),
  speciesCommon: z.string().trim().max(120).optional().default("—"),
  unit: z.string().trim().max(20).optional().default("m3"),
  quantity: z.number().positive("Cantidad despachada inválida (≤ 0)").max(MAX_QTY_14_4, "Cantidad fuera de rango"),
  destino: z.string().trim().max(200).nullable().optional(),
  /**
   * De qué corridas salió este despacho (invariantes I3/I4/I5).
   *
   * El formato oficial de Salida no nombra la corrida, pero SÍ trae el Lote, y
   * el cliente lo resuelve contra las corridas que acaba de importar con ese
   * mismo lote. Es atribución declarada por el libro, no inventada: sin ella el
   * despacho queda huérfano y el certificado de trazabilidad no se puede emitir.
   */
  origenes: z
    .array(z.object({ produccionEntryId: z.string().trim().min(1), quantity: z.number().positive() }))
    .optional()
    .default([]),
  row: z.number().optional(),
});

const bodySchema = z.object({
  mode: z.enum(["preview", "commit"]),
  registro: z.enum(["ingresos", "produccion", "salida"]).optional().default("ingresos"),
  // Nombre del archivo del cliente — solo para el historial de importaciones (audit).
  fileName: z.string().trim().max(200).optional(),
  /**
   * De dónde salió el archivo.
   *
   * `libro-oficial` = el Libro de Operaciones que devuelve el SNIFFS, que ya fue
   * presentado ante SERFOR. Sus ingresos entran VALIDADOS: no son una carga de
   * campo esperando revisión, son el registro oficial. Dejarlos pendientes hacía
   * que el consumo del mismo libro descontara contra un ingreso que el saldo no
   * contaba, y el aserradero quedaba en negativo apenas se importaba.
   *
   * Cualquier otro origen mantiene el comportamiento de siempre: pendiente hasta
   * que alguien lo valide a mano.
   */
  origen: z.enum(["libro-oficial", "manual"]).optional().default("manual"),
  // Filas sueltas: las que fallan validación se REPORTAN (no rompen el request).
  ingresos: z.array(z.record(z.string(), z.unknown())).max(5000).optional().default([]),
  produccion: z.array(z.record(z.string(), z.unknown())).max(5000).optional().default([]),
  salida: z.array(z.record(z.string(), z.unknown())).max(5000).optional().default([]),
});

type ResultRow = {
  row?: number;
  gtf: string | null;
  action: "crear" | "creado" | "existe" | "difiere" | "error";
  message: string;
  /** Sólo en producción creada: el id de la corrida, para atribuirle despachos. */
  id?: string;
  /** Cuánto produjo esa corrida, para repartir el despacho entre varias. */
  cantidad?: number;
};
const REGISTRO_NOUN: Record<"ingresos" | "produccion" | "salida", string> = { ingresos: "ingresos", produccion: "corridas", salida: "despachos" };

/**
 * Registra el import como evento de lote en el ActivityLog (ADR-138): un
 * fiscalizador quiere saber CÓMO entraron los datos al libro. Solo en commit y
 * si hubo algo que reportar. Fire-and-forget vía auditCtp.
 */
function auditImport(
  tenantId: string,
  user: string,
  registro: "ingresos" | "produccion" | "salida",
  fileName: string | undefined,
  r: { creados: number; saltados: number; difieren: number; errores: number },
): void {
  const noun = REGISTRO_NOUN[registro];
  const partes = [
    `${r.creados} creados`,
    r.saltados > 0 ? `${r.saltados} ya existían` : "",
    r.difieren > 0 ? `${r.difieren} difieren` : "",
    r.errores > 0 ? `${r.errores} con error` : "",
  ].filter(Boolean);
  auditCtp({
    tenantId,
    action: "ctp_import",
    entity: "ForestCtpImport",
    entityId: fileName || registro,
    detail: `Importó ${noun}${fileName ? ` desde «${fileName}»` : ""}: ${partes.join(", ")}`,
    user,
  });
}

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


/**
 * Las piezas que hay que crear con la guía.
 *
 * Prioriza la lista explícita (inventario de patio: una fila por troza) y cae al
 * «Código de CTP» de la Sección 1, donde la fila del libro ES la pieza.
 */
function piezasDelIngreso(d: {
  trozas: z.infer<typeof trozaSchema>[];
  codigoCtp?: string | null;
  speciesCommonName: string;
  speciesScientificName?: string | null;
  volumeM3: number;
}) {
  if (d.trozas.length > 0) {
    return d.trozas.map((t, i) => ({
      orden: t.orden ?? i + 1,
      codificacion: t.codificacion ?? null,
      codigoPlanta: t.codigoPlanta ?? null,
      parcela: t.parcela ?? null,
      especieComun: t.especieComun ?? d.speciesCommonName,
      especieCientifica: t.especieCientifica ?? d.speciesScientificName ?? null,
      dimensiones: t.dimensiones ?? null,
      largoM: t.largoM ?? null,
      diametroCm: t.diametroCm ?? null,
      d1Cm: t.d1Cm ?? null,
      d2Cm: t.d2Cm ?? null,
      cantidad: t.cantidad,
      volumenM3: t.volumenM3 ?? null,
    }));
  }
  if (!d.codigoCtp) return undefined;
  return [
    {
      orden: 1,
      codificacion: d.codigoCtp,
      especieComun: d.speciesCommonName,
      especieCientifica: d.speciesScientificName ?? null,
      dimensiones: null,
      largoM: null,
      diametroCm: null,
      d1Cm: null,
      d2Cm: null,
      cantidad: 1,
      volumenM3: d.volumeM3,
    },
  ];
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
  const { mode, registro, fileName, origen, ingresos, produccion, salida } = parsed.data;

  // ── Registro: PRODUCCIÓN (etapa 2) ──────────────────────────────────────
  if (registro === "produccion") {
    // Resolver GTF de ingreso → woodEntryId (los ingresos deben existir ya).
    const allGtfs = produccion.flatMap((r) => (Array.isArray(r.consumos) ? (r.consumos as { gtfIngreso?: unknown }[]).map((c) => String(c.gtfIngreso ?? "").trim()) : []));
    const idByGtf = await WoodEntriesDB.idByGtf(auth.tenantId, allGtfs);
    const existingKeys = await ForestCtpDB.existingProduccionKeys(auth.tenantId);
    /* Los códigos de paquete YA usados en la planta. El índice es único por
       tenant, así que un inventario que repite el código ("d1" en ocho filas,
       que para el aserradero es la pila y no el bulto) haría fallar la corrida
       entera. Se crea el paquete cuando el código está libre y, cuando no, la
       corrida entra igual y el reporte lo dice — antes que perder la línea. */
    const codigosUsados = await ForestCtpDB.codigosDePaqueteEnUso(auth.tenantId);

    const detalle: ResultRow[] = [];
    /* Cuántas veces apareció cada clave EN ESTE archivo. No es un `Set` porque
       ocho paquetes idénticos en un inventario son ocho bultos reales, no una
       fila repetida por error: con un set se declaraba uno y se perdían siete. */
    const vistasEnArchivo = new Map<string, number>();
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
      const key = produccionKey(d.entryDate ?? "", d.productType, d.speciesCommon, d.quantity, d.codigoProducto, d.materiaPrimaRef);
      /* Contra la BASE se mira también la clave vieja: si esta corrida ya se
         importó cuando el paquete no formaba parte de la clave, volver a
         crearla duplicaría la producción declarada. Dentro del ARCHIVO, en
         cambio, manda la clave nueva: dos paquetes distintos son dos registros. */
      const keyBase = produccionKeyBase(d.entryDate ?? "", d.productType, d.speciesCommon, d.quantity);
      /* Se compara POR CANTIDAD, no por presencia: la enésima fila igual del
         archivo sólo se saltea si la base ya tiene esa enésima corrida. Así
         reimportar el mismo inventario no duplica nada, y ocho paquetes
         iguales entran los ocho. */
      const ocurrencia = (vistasEnArchivo.get(key) ?? 0) + 1;
      vistasEnArchivo.set(key, ocurrencia);
      const yaEnLaBase = Math.max(existingKeys.get(key) ?? 0, existingKeys.get(keyBase) ?? 0);
      if (ocurrencia <= yaEnLaBase) {
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
        /* El BULTO, no sólo el volumen. Un paquete necesita código y piezas
           (`cantidad` es NOT NULL: un paquete sin piezas no es un paquete). Si
           el archivo no trae ninguno de los dos, la corrida entra igual —el
           volumen es el dato que no se puede perder— y el detalle explica por
           qué quedó sin paquete.

           El código es único POR PLANTA (@@unique), pero un inventario de
           apertura junta lotes de fechas distintas que reutilizan etiquetas
           cortas («S1», «DRW»): antes, esa colisión hacía que la corrida
           entrara con su volumen y perdiera EN SILENCIO el código, las piezas
           y las medidas del paquete — justo lo que "Productos disponibles"
           necesita para mostrarlo. Ahora se DESAMBIGUA con el lote, y si el
           lote tampoco alcanza, con un número: nada de lo que trae el archivo
           se pierde, y el reporte dice cuándo se renombró. */
        const base = d.codigoProducto?.trim() ?? "";
        const lote = d.materiaPrimaRef?.trim() || "";
        let codigo = base;
        if (base !== "") {
          if (codigosUsados.has(codigo.toLowerCase()) && lote) codigo = `${base}-${lote}`;
          for (let n = 2; codigosUsados.has(codigo.toLowerCase()); n++) codigo = `${base}-${n}`;
        }
        const renombrado = codigo !== base;
        const piezasDelPaquete = d.pieces ?? 0;
        const puedeEmpaquetar = base !== "" && piezasDelPaquete > 0 && d.quantity > 0;
        const sinPaquetePorque = base === "" ? null
          : piezasDelPaquete <= 0 ? `el paquete "${base}" no declara piezas`
          : null;
        if (puedeEmpaquetar) codigosUsados.add(codigo.toLowerCase());

        const corrida = await ForestCtpDB.create(auth.tenantId, {
          section: "produccion",
          ...(puedeEmpaquetar
            ? {
                paquetes: [{
                  codigo,
                  cantidad: piezasDelPaquete,
                  volumenM3: d.quantity,
                  productType: d.productType,
                  presentacion: d.presentacion ?? null,
                  espesorCm: d.medidas?.espesorCm ?? null,
                  anchoCm: d.medidas?.anchoCm ?? null,
                  largoM: d.medidas?.largoM ?? null,
                  observations: renombrado ? `Código del archivo: "${base}" (ya estaba en uso en la planta)` : null,
                }],
              }
            : {}),
          entryDate: d.entryDate ? new Date(d.entryDate) : undefined,
          productType: d.productType,
          speciesCommon: d.speciesCommon,
          gtfIngreso: d.gtfIngreso ?? null,
          unit: d.unit,
          quantity: d.quantity,
          volumeInputM3: volumeInputM3 > 0 ? volumeInputM3 : null,
          rendimientoPct: d.rendimientoPct ?? null,
          consumos: resolved,
          /* El papel completo: paquete, lote y observaciones. Sin esto la corrida
             importada perdía sus dimensiones y su número de paquete, que es con
             lo que se la ubica en el depósito. */
          /* El código de la LÍNEA sigue al del paquete cuando hubo que
             desambiguar. Antes se guardaba el del archivo tal cual: el paquete
             quedaba como "S1-15-2026" en el depósito y la línea del libro decía
             "S1" —que es el código de OTRO paquete de la planta—. El export
             oficial imprime el de la línea, así que un fiscalizador que cruza
             la hoja contra la pila encontraba dos códigos para lo mismo y uno
             de ellos apuntando a madera ajena. Sin paquete no hay nada que
             seguir: queda el del archivo, que es sólo una etiqueta. */
          codigoProducto: puedeEmpaquetar ? codigo : (d.codigoProducto?.trim() || null),
          materiaPrimaRef: d.materiaPrimaRef ?? null,
          observations: d.notes ?? null,
          pieces: d.pieces ?? null,
          createdBy: auth.username ?? "import",
        });
        // La cuenta de este archivo (`vistasEnArchivo`) ya lleva el control: no
        // hay que tocar el conteo de la base, que es la foto del ANTES.
        creados++;
        /* La otra cara del consumo: las piezas. Se resuelven por su código —el
           mismo «Código de CTP» con el que entraron— y se marcan consumidas en
           esta corrida. Si falla (una troza ya consumida, un período cerrado) la
           corrida NO se pierde: queda con sus m³ y el operador marca las piezas
           después. Romper acá dejaría media importación escrita. */
        let piezas = 0;
        if (corrida?.id && d.trozasConsumidas.length > 0) {
          try {
            const ids: string[] = [];
            for (const codigo of d.trozasConsumidas) {
              const t = await WoodEntriesDB.buscarTrozaPorCodigo(auth.tenantId, codigo);
              if (t?.id) ids.push(t.id);
            }
            if (ids.length > 0) {
              await WoodEntriesDB.marcarTrozasConsumidas(auth.tenantId, corrida.id, ids, {
                fecha: d.entryDate ? new Date(d.entryDate) : undefined,
                usuario: auth.username ?? "import",
              });
              piezas = ids.length;
            }
          } catch (e) {
            logger.error("[wood-entries.import] no se pudieron marcar las trozas consumidas", {
              corrida: corrida.id,
              error: String(e),
            });
          }
        }

        /* El id viaja de vuelta: es lo que le permite a la sección Salidas
           atribuir su despacho a esta corrida sin tener que adivinarla por el
           texto del lote (I3/I5). */
        detalle.push({
          row,
          gtf: label,
          action: "creado",
          id: corrida?.id,
          cantidad: d.quantity,
          message:
            `Corrida importada (${resolved.length} consumo${resolved.length === 1 ? "" : "s"}` +
            `${piezas > 0 ? `, ${piezas} troza${piezas === 1 ? "" : "s"}` : ""}` +
            `${puedeEmpaquetar ? `, paquete ${codigo}` : ""})` +
            /* El marcador " · AVISO: " es lo que el reporte del cliente busca
               para sacar esto de la cuenta agregada y mostrarlo fila por fila:
               antes quedaba adentro de un mensaje que sólo se contaba, nunca
               se mostraba, y un código renombrado o un bulto sin paquete
               pasaban inadvertidos. */
            (renombrado ? ` · AVISO: el código "${base}" ya estaba en uso — este paquete quedó como "${codigo}"` : "") +
            (sinPaquetePorque ? ` · AVISO: sin paquete — ${sinPaquetePorque}` : ""),
        });
      } catch (e) {
        errores++;
        logger.error("[wood-entries.import] produccion row failed", { label, error: String(e) });
        detalle.push({ row, gtf: label, action: "error", message: e instanceof Error ? e.message : String(e) });
      }
    }
    if (mode === "commit") auditImport(auth.tenantId, auth.username ?? "unknown", "produccion", fileName, { creados, saltados, difieren: 0, errores });
    return NextResponse.json({ mode, registro, resumen: { total: produccion.length, crear: mode === "commit" ? creados : creables, creados, saltados, difieren: 0, errores }, detalle });
  }

  // ── Registro: SALIDA / despachos (etapa 2b) ─────────────────────────────
  if (registro === "salida") {
    const existingKeys = await ForestCtpDB.existingDespachoKeys(auth.tenantId);
    const existingByGtf = await ForestCtpDB.despachoComparableByGtf(auth.tenantId);
    const detalle: ResultRow[] = [];
    const seenInBatch = new Set<string>(); // despachos iguales EN ESTE archivo → una sola vez
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
      if (seenInBatch.has(key)) {
        saltados++;
        detalle.push({ row, gtf: gtfLabel, action: "existe", message: "Duplicado en el archivo — se importa una sola vez" });
        continue;
      }
      seenInBatch.add(key);
      if (mode === "preview") {
        creables++;
        detalle.push({ row, gtf: gtfLabel, action: "crear", message: `${d.quantity} ${d.unit}${d.destino ? ` → ${d.destino}` : ""} · sin atribuir (atribuí luego)` });
        continue;
      }
      try {
        /* Los orígenes vienen resueltos por lote desde el cliente. Si el libro
           no permitió resolverlos, el despacho se crea sin atribuir y el
           operador lo completa: el libro admite el hueco, el certificado no.
           El create valida I3 (no despachar más de lo producido). */
        await ForestCtpDB.create(auth.tenantId, {
          section: "despacho",
          origenes: d.origenes.length > 0 ? d.origenes : undefined,
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
        detalle.push({
          row,
          gtf: gtfLabel,
          action: "creado",
          message:
            d.origenes.length > 0
              ? `Despacho atribuido a ${d.origenes.length} corrida${d.origenes.length === 1 ? "" : "s"} del lote`
              : "Despacho importado (sin atribuir: completá el origen)",
        });
      } catch (e) {
        errores++;
        logger.error("[wood-entries.import] salida row failed", { gtf: gtfLabel, error: String(e) });
        detalle.push({ row, gtf: gtfLabel, action: "error", message: e instanceof Error ? e.message : String(e) });
      }
    }
    if (mode === "commit") auditImport(auth.tenantId, auth.username ?? "unknown", "salida", fileName, { creados, saltados, difieren, errores });
    return NextResponse.json({ mode, registro, resumen: { total: salida.length, crear: mode === "commit" ? creados : creables, creados, saltados, difieren, errores }, detalle });
  }

  // ── Registro: INGRESOS (etapa 1, default) ───────────────────────────────
  // Idempotencia + reconciliación: valores actuales de los GTF que ya existen.
  const gtfs = ingresos.map((r) => String(r.gtfNumber ?? "").trim()).filter(Boolean);
  const existing = await WoodEntriesDB.comparableByGtf(auth.tenantId, gtfs);
  /* Los ids de las guías que ya están: es lo que permite COMPLETAR sus piezas
     cuando el archivo trae el detalle que al ingreso le falta. */
  const idPorGtf = await WoodEntriesDB.idByGtf(auth.tenantId, gtfs);

  const detalle: ResultRow[] = [];
  const seenInBatch = new Set<string>(); // GTF ya vistas EN ESTE archivo → se importa una sola vez
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
      /* La guía ya está, pero puede faltarle el DETALLE. El inventario de patio
         trae una fila por troza: si el ingreso entró sin piezas, se completan
         (agrega, nunca reemplaza — `agregarTrozas` saltea las repetidas). Lo
         declarado no se toca: insert-only sigue valiendo para la guía. */
      let completado = "";
      const piezas = piezasDelIngreso(d);
      if (mode === "commit" && piezas && piezas.length > 0) {
        const id = idPorGtf.get(d.gtfNumber);
        if (id) {
          try {
            const r = await WoodEntriesDB.agregarTrozas(auth.tenantId, id, piezas, auth.username ?? "import", { desdeImportacion: true });
            if (r.agregadas > 0) completado = ` · se completaron ${r.agregadas} troza${r.agregadas === 1 ? "" : "s"} que faltaban`;
            else if (r.bloqueado === "ya-tiene-lista") completado = " · ya tiene su lista de piezas";
            else if (r.repetidas.length > 0) completado = " · sus piezas ya estaban";
          } catch (e) {
            /* No romper la importación por esto: la guía existe igual y el
               operador tiene que saber por qué no entró el detalle. */
            completado = ` · no se pudieron agregar sus ${piezas.length} piezas: ${e instanceof Error ? e.message : String(e)}`;
          }
        }
      } else if (mode === "preview" && piezas && piezas.length > 0) {
        completado = ` · trae ${piezas.length} troza${piezas.length === 1 ? "" : "s"} para completar`;
      }

      // Insert-only: existe → NO se sobrescribe. «difiere» si el libro trae otros valores.
      const diff = diffIngreso(prev, d);
      if (diff) {
        difieren++;
        detalle.push({ row, gtf: d.gtfNumber, action: "difiere", message: `Ya existe con datos distintos (no se sobrescribe): ${diff}${completado}` });
      } else {
        saltados++;
        detalle.push({ row, gtf: d.gtfNumber, action: "existe", message: `Ya existe, idéntico — se salta${completado}` });
      }
      continue;
    }
    if (seenInBatch.has(d.gtfNumber)) {
      saltados++;
      detalle.push({ row, gtf: d.gtfNumber, action: "existe", message: "Duplicada en el archivo — se importa una sola vez" });
      continue;
    }
    seenInBatch.add(d.gtfNumber);
    if (mode === "preview") {
      creables++;
      detalle.push({ row, gtf: d.gtfNumber, action: "crear", message: `${d.speciesCommonName} · ${d.volumeM3} m³${d.speciesCites ? " · CITES" : ""}` });
      continue;
    }
    try {
      const creado = await WoodEntriesDB.create(auth.tenantId, {
        entryDate: d.entryDate ? new Date(d.entryDate) : undefined,
        gtfNumber: d.gtfNumber,
        providerName: d.providerName,
        originType: d.originType as WoodOriginType,
        originRegion: d.originRegion ?? null,
        originCode: d.originCode ?? null,
        originSourceNumber: d.originSourceNumber ?? null,
        speciesCommonName: d.speciesCommonName,
        speciesScientificName: d.speciesScientificName ?? null,
        speciesCites: d.speciesCites,
        productType: d.productType as WoodProductType,
        volumeM3: d.volumeM3,
        notes: d.notes ?? null,
        /* Las piezas van en la MISMA tx que la guía (ADR-312/320): si falla, no
           queda un ingreso al que después haya que pegarle las trozas a mano.
           Dos fuentes, una sola lista:
            · el inventario de patio manda `trozas[]` —una fila por troza, y
              varias comparten guía—;
            · la Sección 1 del libro declara una fila por pieza, así que su
              «Código de CTP» ES la troza. */
        trozas: piezasDelIngreso(d),
        createdBy: auth.username ?? "import",
      });
      existing.set(d.gtfNumber, { volumeM3: d.volumeM3, speciesCommonName: d.speciesCommonName, productType: d.productType, providerName: d.providerName }); // no duplicar en el batch

      /* El libro oficial entra validado: ya fue presentado ante SERFOR. Se pasa
         por `validate()` y no por el status en el create para que quede el
         asiento de auditoría (`ctp_ingreso_validate`) — un ingreso que entra al
         balance sin dejar rastro de quién lo habilitó no es fiscalizable. */
      let validado = false;
      if (origen === "libro-oficial" && creado?.id) {
        try {
          await WoodEntriesDB.validate(auth.tenantId, creado.id, auth.username ?? "import");
          validado = true;
        } catch (e) {
          /* Que no se pueda validar (período cerrado, por ejemplo) NO invalida
             la importación: el ingreso ya está y se puede validar después. */
          logger.error("[wood-entries.import] no se pudo validar el ingreso importado", {
            gtf: d.gtfNumber,
            error: String(e),
          });
        }
      }
      creados++;
      const piezas = piezasDelIngreso(d)?.length ?? 0;
      detalle.push({
        row,
        gtf: d.gtfNumber,
        action: "creado",
        message:
          (validado ? "Importado y validado (libro oficial)" : "Importado (pendiente de validar)") +
          (piezas > 0 ? ` · ${piezas} troza${piezas === 1 ? "" : "s"}` : ""),
      });
    } catch (e) {
      errores++;
      logger.error("[wood-entries.import] row failed", { gtf: d.gtfNumber, error: String(e) });
      detalle.push({ row, gtf: d.gtfNumber, action: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  if (mode === "commit") auditImport(auth.tenantId, auth.username ?? "unknown", "ingresos", fileName, { creados, saltados, difieren, errores });
  return NextResponse.json({
    mode,
    resumen: { total: ingresos.length, crear: mode === "commit" ? creados : creables, creados, saltados, difieren, errores },
    detalle,
  });
});

/**
 * GET — historial de importaciones (ADR-138). Lee del ActivityLog los eventos de
 * lote `ctp_import` del tenant. La fuente autoritativa es el ActivityLog (también
 * visible en Auditoría); esto es la vista de conveniencia del modal de import.
 */
export const GET = withApiHandler("forestal-wood-entries-import-log", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const enabled = await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro");
  if (!enabled) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }

  // Los eventos de import tienen entity="ForestCtpImport" → filtro por entity
  // (ActivityLogDB.list soporta entity/entityId, no action).
  const rows = await ActivityLogDB.list(auth.tenantId, { entity: "ForestCtpImport", limit: 30 });
  const imports = rows.map((r) => ({ detail: r.detail, user: r.user, createdAt: r.createdAt, archivo: r.entityId }));
  return NextResponse.json({ imports });
});
