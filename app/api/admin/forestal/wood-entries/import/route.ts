import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { WoodEntriesDB, type IngresoParaImportar, type WoodOriginType, type WoodProductType } from "@/lib/db/wood-entries.db";
import { ForestCtpDB, produccionKey, produccionKeyBase, despachoKey } from "@/lib/db/forest-ctp.db";
import { ActivityLogDB } from "@/lib/db/activity-log.db";
import { ForestContratoDB } from "@/lib/db/forest-contrato.db";
import { TituloGuiaDB } from "@/lib/db/forest-titulo-guia.db";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import {
  asignacionSchema,
  decidirPermisoFila,
  esProveedorDeRelleno,
  fuenteDelRelleno,
  permisoDeGuiaExistente,
  permisoDeLaDecision,
  permisoParaImport,
  proveedorDelPermiso,
  rescatarFuenteDelRelleno,
  resumirPermiso,
  type PermisoDeFila,
  type PermisoParaImport,
} from "@/lib/forestal/asignar-permiso-import";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import {
  claveDeGuiaRef,
  decidirGuiaAlImportar,
  mensajeGuiaAmbigua,
  type DecisionGuiaAlImportar,
  type ResolucionDeGuia,
} from "@/lib/forestal/identidad-guia";
import { fraseDeColocacion } from "@/lib/forestal/acomodar-trozas";
import { logger } from "@/lib/logger";
import type { IngresoParaTitulo, PlanTitulo } from "@/lib/forestal/titulo-de-guia";
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
  /** ADR-504: el permiso de ESTA fila (pisa al del archivo). La guía es N° + permiso. */
  contratoId: z.string().trim().max(40).nullish(),
  row: z.number().optional(),
});

const consumoSchema = z.object({
  gtfIngreso: z.string().trim().min(1),
  volumeM3: z.number().positive().max(MAX_VOL_12_4),
  /** ADR-504: el permiso de la guía consumida (si no, el del archivo). */
  contratoId: z.string().trim().max(40).nullish(),
});
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
  /**
   * El permiso que el operador eligió para TODO el archivo (ADR-503). Se llena
   * sólo lo vacío: la fila que trae otro permiso lo conserva (`conflicto`) y la
   * corrida que consumió guías lo hereda de ellas.
   */
  asignacion: asignacionSchema,
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
  /** Con `asignacion`: qué pasó con el permiso del archivo en esta fila (ADR-503). */
  permiso?: PermisoDeFila;
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

/**
 * Un asiento por archivo contra el PERMISO (ADR-503): quién lo eligió, para qué
 * archivo y cuántas filas lo recibieron. El detalle por ingreso ya lo dejan el
 * alta y `TituloGuiaDB.declarar`; esto responde «¿de dónde sacó este permiso
 * medio libro?» desde la ficha del permiso.
 */
function auditPermiso(
  tenantId: string,
  user: string,
  registro: "ingresos" | "produccion" | "salida",
  fileName: string | undefined,
  permiso: PermisoParaImport,
  filas: readonly PermisoDeFila[],
): void {
  if (filas.length === 0) return;
  const r = resumirPermiso(permiso.codigo, filas);
  const partes = [
    `${r.asignadas} lo recibieron`,
    r.yaTenian > 0 ? `${r.yaTenian} ya lo tenían` : "",
    r.conflictos > 0 ? `${r.conflictos} traían otro o no se podían tocar (no se pisó)` : "",
    r.heredan > 0 ? `${r.heredan} heredan de lo que consumieron` : "",
  ].filter(Boolean);
  auditCtp({
    tenantId,
    action: "ctp_import_permiso",
    entity: "ForestContrato",
    entityId: permiso.contratoId,
    detail: `Asignó el permiso ${permiso.codigo} al importar ${REGISTRO_NOUN[registro]}${fileName ? ` de «${fileName}»` : ""}: ${partes.join(", ")}`,
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

type IngresoValido = z.infer<typeof ingresoSchema>;
type PiezaDelIngreso = NonNullable<ReturnType<typeof piezasDelIngreso>>[number];

/** Una fila del archivo que pasó la validación, con su lugar en el detalle. */
interface FilaIngreso {
  pos: number;
  row: number | undefined;
  d: IngresoValido;
  /** ADR-504: el permiso de la guía de esta fila (fila › archivo › código de origen). */
  contratoId: string | null;
}

/** UN ingreso: la guía + especie + producto, con todas las filas del archivo que lo forman. */
interface GrupoIngreso {
  /** La cabecera: la de la 1.ª fila, con el volumen de todas y lo que la 1.ª no traía. */
  d: IngresoValido;
  /** El permiso de la guía (ADR-504): parte de la clave del grupo. */
  contratoId: string | null;
  /** Las piezas de TODAS sus filas, también las repetidas (ADR-504: todo entra). */
  piezas: PiezaDelIngreso[] | undefined;
  /** La fila del archivo de cada pieza, en el mismo orden (para «filas N y M idénticas»). */
  filasDePiezas: (number | null)[];
  filas: { pos: number; row: number | undefined }[];
}

/** Decimal(12,4): se suma en diezmilésimas enteras, nunca en float acumulado. */
const DIEZMILESIMAS = 10_000;
/** Las notas juntas de varias filas no crecen sin fin (la fila valida ≤ 2000). */
const TOPE_NOTAS_JUNTAS = 1_900;

/**
 * Junta las filas que son el MISMO ingreso (reviewer 19-10, bug de 01b26cec7).
 *
 * La Sección 1 del libro trae una fila por PIEZA: dos trozas de 0,8 m³ de la
 * guía 001 son dos filas. Antes la 1.ª creaba el ingreso y la 2.ª caía en «ya
 * existe» sin su troza ni sus m³ (QA: 0,8 m³ y 1 troza donde el archivo decía
 * 1,6 y 2). La clave es GUÍA (N° + permiso, ADR-504) + especie + producto: la
 * 2.ª especie de la guía es otro ingreso (ADR-312/435) y el mismo N° en otro
 * permiso es otra guía.
 *
 * Una fila repetida YA NO se descarta (ADR-504, Brandon 19-10: «que se importe
 * todo»): entra con su troza y sus m³, y el alta avisa «filas N y M idénticas».
 * Lo único que no entra es lo que ya estaba en la base.
 */
function agruparIngresos(filas: readonly FilaIngreso[]): GrupoIngreso[] {
  type Acc = { g: GrupoIngreso; diezmilesimas: number; notas: string[]; piezas: PiezaDelIngreso[]; filasDePiezas: (number | null)[] };
  const porClave = new Map<string, Acc>();
  const primerValor = <T,>(a: T | null | undefined, b: T | null | undefined): T | null =>
    a != null && String(a).trim() !== "" ? a : (b ?? null);
  for (const f of filas) {
    const d = f.d;
    const clave = `${claveDeGuiaRef({ gtfNumber: d.gtfNumber, contratoId: f.contratoId })}|${normCmp(d.speciesCommonName)}|${normCmp(d.productType)}`;
    let acc = porClave.get(clave);
    if (!acc) {
      acc = {
        g: { d: { ...d }, contratoId: f.contratoId, piezas: undefined, filasDePiezas: [], filas: [] },
        diezmilesimas: 0,
        notas: [],
        piezas: [],
        filasDePiezas: [],
      };
      porClave.set(clave, acc);
    }
    for (const p of piezasDelIngreso(d) ?? []) {
      acc.piezas.push(p);
      acc.filasDePiezas.push(f.row ?? null);
    }
    acc.g.filas.push({ pos: f.pos, row: f.row });
    acc.diezmilesimas += Math.round(d.volumeM3 * DIEZMILESIMAS);
    if (d.notes) acc.notas.push(d.notes);
    const h = acc.g.d;
    h.entryDate = primerValor(h.entryDate, d.entryDate);
    h.originCode = primerValor(h.originCode, d.originCode);
    h.originSourceNumber = primerValor(h.originSourceNumber, d.originSourceNumber);
    h.originRegion = primerValor(h.originRegion, d.originRegion);
    h.speciesScientificName = primerValor(h.speciesScientificName, d.speciesScientificName);
    h.speciesCites = h.speciesCites || d.speciesCites;
  }
  return [...porClave.values()].map((acc) => {
    const d = acc.g.d;
    d.volumeM3 = acc.diezmilesimas / DIEZMILESIMAS;
    const varias = acc.g.filas.length > 1;
    if (varias) {
      /* Las notas de cada pieza («Código CTP X · Origen Y») sin repetir lo común. */
      const partes = [...new Set(acc.notas.flatMap((n) => n.split(" · ").map((s) => s.trim()).filter(Boolean)))];
      const juntas = partes.join(" · ");
      d.notes = juntas.length > TOPE_NOTAS_JUNTAS ? `${juntas.slice(0, TOPE_NOTAS_JUNTAS - 1)}…` : juntas || null;
    }
    acc.g.piezas = acc.piezas.length === 0 ? undefined : varias ? acc.piezas.map((p, i) => ({ ...p, orden: i + 1 })) : acc.piezas;
    acc.g.filasDePiezas = acc.piezas.length === 0 ? [] : acc.filasDePiezas;
    return acc.g;
  });
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
  const { mode, registro, fileName, origen, ingresos, produccion, salida, asignacion } = parsed.data;

  /* El permiso del archivo (ADR-503). Asignar el origen legal es lo mismo que
     declarar el título de una guía: sólo admin/dueño (`requireAdmin` deja pasar
     al encargado por el bypass de gestión). Sin asignación, el almacenero
     importa como siempre. */
  let permiso: PermisoParaImport | null = null;
  if (asignacion) {
    const rol = soloAdminODueno(auth.role, "asignar un permiso al importar el libro");
    if (rol) return rol;
    const c = await ForestContratoDB.get(auth.tenantId, asignacion.contratoId);
    if (!c || !c.isActive) {
      return NextResponse.json(
        { error: "permiso_invalido", message: "Ese permiso no está en tu lista de permisos (o se dio de baja). Elígelo de nuevo." },
        { status: 422 },
      );
    }
    permiso = permisoParaImport(c);
  }
  /* Lo que pasó con el permiso, fila por fila, para el resumen y la auditoría. */
  const permisos: PermisoDeFila[] = [];

  // ── Registro: PRODUCCIÓN (etapa 2) ──────────────────────────────────────
  if (registro === "produccion") {
    // Resolver GTF de ingreso → woodEntryId (los ingresos deben existir ya).
    /* ADR-504: la guía es N° + PERMISO. El consumo busca su guía con el permiso
       de su fila o el del archivo; con el N° en dos permisos y sin permiso NO
       elige una (antes ganaba la más reciente): la fila lo dice. */
    const permisoDeConsumo = (c: { contratoId?: unknown }): string | null =>
      (typeof c.contratoId === "string" && c.contratoId.trim()) || permiso?.contratoId || null;
    const gtfsPorPermiso = new Map<string, string[]>();
    for (const r of produccion) {
      for (const c of Array.isArray(r.consumos) ? (r.consumos as { gtfIngreso?: unknown; contratoId?: unknown }[]) : []) {
        const k = permisoDeConsumo(c) ?? "";
        gtfsPorPermiso.set(k, [...(gtfsPorPermiso.get(k) ?? []), String(c.gtfIngreso ?? "").trim()]);
      }
    }
    const guiaDeConsumo = new Map<string, ResolucionDeGuia>();
    for (const [k, gtfs] of gtfsPorPermiso) {
      for (const [gtf, r] of await WoodEntriesDB.guiasDeConsumos(auth.tenantId, gtfs, k || null)) guiaDeConsumo.set(`${k}|${gtf}`, r);
    }
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
    try {
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
        const ambiguas: string[] = [];
        const permisosDeLaCorrida = new Set<string | null>();
        for (const c of d.consumos) {
          const r = guiaDeConsumo.get(`${permisoDeConsumo(c) ?? ""}|${c.gtfIngreso}`);
          if (r?.estado === "una") {
            /* La guía de varias especies son varios ingresos: el consumo va al
               último del libro, como antes. */
            resolved.push({ woodEntryId: r.guia.ingresoIds[r.guia.ingresoIds.length - 1], volumeM3: c.volumeM3 });
            permisosDeLaCorrida.add(r.guia.contratoId ?? null);
          } else if (r?.estado === "ambigua") ambiguas.push(mensajeGuiaAmbigua(c.gtfIngreso, r.candidatas));
          else missing.push(c.gtfIngreso);
        }
        if (ambiguas.length) {
          errores++;
          detalle.push({ row, gtf: label, action: "error", message: `${[...new Set(ambiguas)].join(" ")} Esta corrida no se cargó.` });
          continue;
        }
        /* Las trozas de la corrida se buscan en el permiso de sus guías (si es
           uno solo) o en el del archivo: el código solo no identifica la pieza. */
        const unPermiso = permisosDeLaCorrida.size === 1 ? [...permisosDeLaCorrida][0] : null;
        const permisoDeLaCorrida = unPermiso ?? permiso?.contratoId ?? null;
        if (missing.length) {
          errores++;
          detalle.push({ row, gtf: label, action: "error", message: `GTF de ingreso no encontrado: ${[...new Set(missing)].join(", ")} — importa los ingresos primero` });
          continue;
        }
        /* Sólo la corrida SIN consumo recibe el permiso del archivo: la que
           consumió guías o trozas lo hereda de ellas (ADR-402). */
        const decision = permiso
          ? decidirPermisoFila({ consume: d.consumos.length > 0 || d.trozasConsumidas.length > 0 }, permiso)
          : null;
        const permisoFila: PermisoDeFila | undefined = decision ? permisoDeLaDecision(decision) : undefined;
        if (mode === "preview") {
          creables++;
          if (permisoFila) permisos.push(permisoFila);
          detalle.push({ row, gtf: label, action: "crear", message: `${d.quantity} ${d.unit} · ${resolved.length} consumo${resolved.length === 1 ? "" : "s"}`, permiso: permisoFila });
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
            /* El permiso del archivo, sólo en la corrida sin consumo (ADR-503). */
            ...(decision?.escribir ? { originCode: decision.escribir.originCode, contratoId: decision.escribir.contratoId } : {}),
            createdBy: auth.username ?? "import",
          });
          // La cuenta de este archivo (`vistasEnArchivo`) ya lleva el control: no
          // hay que tocar el conteo de la base, que es la foto del ANTES.
          creados++;
          if (permisoFila) permisos.push(permisoFila);
          /* La otra cara del consumo: las piezas. Se resuelven por su código —el
             mismo «Código de CTP» con el que entraron— y se marcan consumidas en
             esta corrida. Si falla (una troza ya consumida, un período cerrado) la
             corrida NO se pierde: queda con sus m³ y el operador marca las piezas
             después. Romper acá dejaría media importación escrita. */
          let piezas = 0;
          /* Si las piezas no se pudieron marcar, la fila lo DICE: antes el error
             iba sólo al log y el reporte decía «Corrida importada» con todas las
             trozas libres en el patio (ADR-433: una T3, un mes cerrado o una ya
             consumida frenan el marcado entero). */
          let avisoPiezas = "";
          if (corrida?.id && d.trozasConsumidas.length > 0) {
            try {
              const ids: string[] = [];
              const noEncontradas: string[] = [];
              const repetidas: string[] = [];
              for (const codigo of d.trozasConsumidas) {
                /* ADR-504: el código solo no identifica la troza: se busca en el
                   permiso de la corrida. Con varias piezas igual NO se marca la
                   primera: se avisa. */
                const r = await WoodEntriesDB.buscarTrozaPorCodigo(
                  auth.tenantId,
                  codigo,
                  permisoDeLaCorrida ? { contratoId: permisoDeLaCorrida } : {},
                );
                if (r.estado === "una") ids.push(r.troza.id);
                else if (r.estado === "varias") repetidas.push(codigo);
                else noEncontradas.push(codigo);
              }
              /* El código que no está en el patio se DICE (reviewer 19-10): antes
                 se saltaba en silencio y la corrida decía «N trozas» de menos sin
                 que nadie supiera cuál faltó. */
              if (noEncontradas.length > 0) {
                avisoPiezas = ` · AVISO: ${noEncontradas.length} troza${noEncontradas.length === 1 ? "" : "s"} no se encontr${noEncontradas.length === 1 ? "ó" : "aron"} en el patio: ${noEncontradas.join(", ")} (no se marcaron consumidas)`;
              }
              if (repetidas.length > 0) {
                avisoPiezas += ` · AVISO: ${repetidas.length === 1 ? "el código" : "los códigos"} ${repetidas.join(", ")} ${repetidas.length === 1 ? "está" : "están"} en más de una troza del patio (otra guía o permiso): no se marcaron consumidas, elígelas a mano`;
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
              avisoPiezas += ` · AVISO: las ${d.trozasConsumidas.length} troza${d.trozasConsumidas.length === 1 ? "" : "s"} no se marcaron consumidas (siguen libres en el patio) — ${e instanceof Error ? e.message : String(e)}`;
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
            permiso: permisoFila,
            message:
              `Corrida importada (${resolved.length} consumo${resolved.length === 1 ? "" : "s"}` +
              `${piezas > 0 ? `, ${piezas} troza${piezas === 1 ? "" : "s"}` : ""}` +
              `${puedeEmpaquetar ? `, paquete ${codigo}` : ""})` +
              /* El marcador " · AVISO: " es lo que el reporte del cliente busca
                 para sacar esto de la cuenta agregada y mostrarlo fila por fila:
                 antes quedaba adentro de un mensaje que sólo se contaba, nunca
                 se mostraba, y un código renombrado o un bulto sin paquete
                 pasaban inadvertidos. */
              avisoPiezas +
              (renombrado ? ` · AVISO: el código "${base}" ya estaba en uso — este paquete quedó como "${codigo}"` : "") +
              (sinPaquetePorque ? ` · AVISO: sin paquete — ${sinPaquetePorque}` : ""),
          });
        } catch (e) {
          errores++;
          logger.error("[wood-entries.import] produccion row failed", { label, error: String(e) });
          detalle.push({ row, gtf: label, action: "error", message: e instanceof Error ? e.message : String(e) });
        }
      }
    } finally {
      /* El rastro queda aunque algo corte a la mitad, con lo que SÍ se hizo. */
      if (mode === "commit") {
        auditImport(auth.tenantId, auth.username ?? "unknown", "produccion", fileName, { creados, saltados, difieren: 0, errores });
        if (permiso) auditPermiso(auth.tenantId, auth.username ?? "unknown", "produccion", fileName, permiso, permisos);
      }
    }
    return NextResponse.json({
      mode,
      registro,
      resumen: {
        total: produccion.length,
        crear: mode === "commit" ? creados : creables,
        creados,
        saltados,
        difieren: 0,
        errores,
        ...(permiso ? { permiso: resumirPermiso(permiso.codigo, permisos) } : {}),
      },
      detalle,
    });
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
        detalle.push({ row, gtf: gtfLabel, action: "crear", message: `${d.quantity} ${d.unit}${d.destino ? ` → ${d.destino}` : ""} · sin atribuir (atribuye luego)` });
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
              : "Despacho importado (sin atribuir: completa el origen)",
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
  /* El detalle sale en el orden del archivo aunque las filas se procesen por
     guía: cada fila tiene su lugar. */
  const porPosicion: (ResultRow | undefined)[] = new Array(ingresos.length);
  let creables = 0, saltados = 0, difieren = 0, errores = 0, creados = 0, agrupadas = 0;

  const validas: FilaIngreso[] = [];
  ingresos.forEach((raw, pos) => {
    const row = typeof raw.row === "number" ? raw.row : undefined;
    const v = ingresoSchema.safeParse(raw);
    if (!v.success) {
      errores++;
      porPosicion[pos] = { row, gtf: String(raw.gtfNumber ?? "").trim() || null, action: "error", message: v.error.issues.map((i) => i.message).join(" · ") };
      return;
    }
    validas.push({ pos, row, d: v.data, contratoId: null });
  });

  /* ── El permiso de cada fila (ADR-504: la guía es N° + PERMISO) ──
     El que trae la fila (sólo admin/dueño, como el del archivo, y validado
     contra los permisos del negocio), el del archivo si la fila no lo
     contradice, o el contrato de su código de origen: el mismo que `create` le
     escribiría. */
  const pedidosPorFila = [...new Set(validas.map((f) => f.d.contratoId).filter((c): c is string => !!c))];
  if (pedidosPorFila.length > 0) {
    const rol = soloAdminODueno(auth.role, "elegir el permiso de una fila al importar el libro");
    if (rol) return rol;
  }
  const contratoValido = new Map<string, boolean>();
  for (const id of pedidosPorFila) {
    const c = await ForestContratoDB.get(auth.tenantId, id);
    contratoValido.set(id, !!c && c.isActive);
  }
  const contratoPorCodigo = new Map<string, Promise<string | null>>();
  const contratoDeCodigo = (codigo: string | null | undefined): Promise<string | null> => {
    const k = (codigo ?? "").trim().toUpperCase();
    if (!k) return Promise.resolve(null);
    let p = contratoPorCodigo.get(k);
    if (!p) {
      p = ForestContratoDB.idPorCodigo(auth.tenantId, codigo);
      contratoPorCodigo.set(k, p);
    }
    return p;
  };
  const conPermiso: FilaIngreso[] = [];
  for (const f of validas) {
    if (f.d.contratoId && !contratoValido.get(f.d.contratoId)) {
      errores++;
      porPosicion[f.pos] = {
        row: f.row,
        gtf: f.d.gtfNumber,
        action: "error",
        message: "El permiso de esta fila no está en tu lista de permisos (o se dio de baja). Elígelo de nuevo.",
      };
      continue;
    }
    const delArchivo =
      permiso && decidirPermisoFila({ codigo: f.d.originCode, resolucion: f.d.originSourceNumber }, permiso).estado !== "conflicto"
        ? permiso.contratoId
        : null;
    conPermiso.push({ ...f, contratoId: f.d.contratoId || delArchivo || (await contratoDeCodigo(f.d.originCode)) });
  }

  /* UN ingreso por guía + especie + producto (reviewer 19-10, bug de 01b26cec7).
     La Sección 1 manda una fila por PIEZA: antes la 2.ª fila de una guía que
     creaba el propio archivo caía en «ya existe» y su troza y sus m³ se perdían
     (QA: 0,8 m³ y 1 troza donde el archivo decía 1,6 y 2). Se juntan ANTES del
     alta; la 2.ª especie de la guía es otro ingreso (ADR-312/435). */
  const grupos = agruparIngresos(conPermiso);

  /* Idempotencia + reconciliación: los ingresos vivos de esas guías, con su id.
     Es la foto de ANTES del import: lo que crea este archivo no entra, porque
     cada grupo ya es un ingreso distinto (otra especie u otro producto). */
  const existentes = await WoodEntriesDB.comparablesPorGuia(auth.tenantId, grupos.map((g) => g.d.gtfNumber));
  /* ── Qué guía del libro es cada guía del archivo (ADR-504) ──
     Una decisión por GUÍA (N° + permiso), la misma para todas sus especies:
     `misma`/`asignar-permiso` → sus ingresos; `otra`/`crear-con-aviso` → se
     crea aunque el N° exista en otro permiso; `ambigua` → no se escribe. */
  const refDe = (g: GrupoIngreso) => ({ gtfNumber: g.d.gtfNumber, contratoId: g.contratoId });
  const especiesDelArchivo = new Map<string, Set<string>>();
  const especiesCrudas = new Map<string, string[]>();
  for (const g of grupos) {
    const clave = claveDeGuiaRef(refDe(g));
    const s = especiesDelArchivo.get(clave) ?? new Set<string>();
    s.add(normCmp(g.d.speciesCommonName));
    especiesDelArchivo.set(clave, s);
    especiesCrudas.set(clave, [...(especiesCrudas.get(clave) ?? []), g.d.speciesCommonName]);
  }
  const decisiones = new Map<string, DecisionGuiaAlImportar>();
  for (const g of grupos) {
    const clave = claveDeGuiaRef(refDe(g));
    if (decisiones.has(clave)) continue;
    const d = g.d;
    const delArchivo = permiso != null && g.contratoId === permiso.contratoId ? permiso : null;
    decisiones.set(
      clave,
      decidirGuiaAlImportar(
        {
          gtfNumber: d.gtfNumber,
          contratoId: g.contratoId,
          permiso: d.originCode ?? delArchivo?.codigo ?? null,
          titular: delArchivo?.titular ?? (esProveedorDeRelleno(d.providerName, d.gtfNumber) ? null : d.providerName),
          especies: especiesCrudas.get(clave) ?? [],
        },
        existentes.get(d.gtfNumber) ?? [],
      ),
    );
  }
  /** Los ingresos que YA tiene la guía de este grupo (vacío si es una guía nueva). */
  const ingresosDeLaGuia = (g: GrupoIngreso): IngresoParaImportar[] => {
    const dec = decisiones.get(claveDeGuiaRef(refDe(g)));
    if (!dec || (dec.estado !== "misma" && dec.estado !== "asignar-permiso")) return [];
    const ids = new Set(dec.ids);
    return (existentes.get(g.d.gtfNumber) ?? []).filter((e) => ids.has(e.id));
  };
  /* Una especie nueva de una guía guardada se carga sólo si el archivo trae
     también todas las que ya estaban. Si no, lo más probable es el MISMO
     ingreso con otro nombre de especie, y crearlo duplicaría su madera. */
  const archivoCubreLaBase = (g: GrupoIngreso) => {
    const delArchivo = especiesDelArchivo.get(claveDeGuiaRef(refDe(g)));
    return ingresosDeLaGuia(g).every((e) => delArchivo?.has(normCmp(e.speciesCommonName)));
  };

  /* ── Permiso del archivo (ADR-503) ──
     La guía nueva lo recibe en el alta. La que YA estaba se completa con
     `TituloGuiaDB.declarar` (sólo lo vacío, el mes cerrado manda, audita por
     ingreso) y su proveedor de relleno pasa a ser el titular, una vez por
     guía aunque el archivo traiga varias especies. */
  type ProveedorCambiado = { id: string; especie: string | null; fuente: string | null };
  type GuiaLeida =
    | { ingresos: IngresoParaTitulo[]; planes: PlanTitulo[]; escritos?: Set<string>; proveedor: ProveedorCambiado[] }
    | { error: string };
  /* El proveedor reemplazado se cuenta una vez por guía, aunque traiga varias especies. */
  const guiasConProveedorDicho = new Set<string>();
  const guiasLeidas = new Map<string, Promise<GuiaLeida>>();
  const permisoDeGuiaGuardada = async (
    p: PermisoParaImport,
    d: IngresoValido,
    resolucionFila: string | null,
    /** La guía (ADR-504): su clave N° + permiso y sus ingresos. Nunca el N° pelado. */
    guia: { clave: string; ids: readonly string[] },
  ): Promise<PermisoDeFila & { proveedor?: ProveedorCambiado[] }> => {
    /* La fila del archivo que declara OTRO permiso (u otra resolución) manda
       sobre el del archivo: no se le escribe a la guía lo que el libro contradice. */
    const propia = decidirPermisoFila({ codigo: d.originCode, resolucion: resolucionFila }, p);
    if (propia.estado === "conflicto") return permisoDeLaDecision(propia);
    let leida = guiasLeidas.get(guia.clave);
    if (!leida) {
      leida = (async (): Promise<GuiaLeida> => {
        try {
          const plan = await TituloGuiaDB.planear(auth.tenantId, {
            gtfNumber: d.gtfNumber,
            contratoId: p.contratoId,
            originSourceNumber: resolucionFila,
            ingresoIds: guia.ids,
          });
          if (mode !== "commit") {
            /* La vista previa dice lo mismo que hará el commit, sin escribir:
               los ingresos que quedarían con ESTE permiso y tienen relleno. */
            const quedarian = new Set(plan.planes.filter((x) => x.razon === "igual" || x.escribir).map((x) => x.id));
            const proveedor = p.titular
              ? (existentes.get(d.gtfNumber) ?? [])
                  .filter((e) => quedarian.has(e.id) && esProveedorDeRelleno(e.providerName, d.gtfNumber))
                  .map((e) => ({ id: e.id, especie: e.speciesCommonName, fuente: fuenteDelRelleno(e.providerName) }))
              : [];
            return { ingresos: plan.ingresos, planes: plan.planes, proveedor };
          }
          let escritos: Set<string> | undefined;
          if (plan.planes.some((x) => x.escribir)) {
            /* El plan ya leído viaja: `declarar` no relee la guía (eran ~8 idas por guía). */
            const r = await TituloGuiaDB.declarar(
              auth.tenantId,
              {
                gtfNumber: d.gtfNumber,
                contratoId: p.contratoId,
                originSourceNumber: resolucionFila,
                ingresoIds: guia.ids,
                origen: fileName ? `la importación del libro («${fileName}»)` : "la importación del libro",
              },
              auth.username ?? "import",
              plan,
            );
            escritos = new Set(r.actualizados.map((a) => a.id));
          }
          /* El proveedor de relleno → el titular, en los ingresos que quedaron
             con ESTE permiso (la misma regla que el alta). */
          let proveedor: ProveedorCambiado[] = [];
          if (p.titular) {
            const conElPermiso = plan.planes.filter((x) => x.razon === "igual" || escritos?.has(x.id)).map((x) => x.id);
            proveedor = await TituloGuiaDB.completarProveedorDeRelleno(
              auth.tenantId,
              d.gtfNumber,
              conElPermiso,
              { nombre: p.titular, ruc: p.ruc, codigo: p.codigo },
              auth.username ?? "import",
            );
          }
          return { ingresos: plan.ingresos, planes: plan.planes, escritos, proveedor };
        } catch (e) {
          logger.error("[wood-entries.import] no se pudo declarar el permiso de la guía", { gtf: d.gtfNumber, error: String(e) });
          return { error: e instanceof Error ? e.message : String(e) };
        }
      })();
      guiasLeidas.set(guia.clave, leida);
    }
    const g = await leida;
    if ("error" in g) return { estado: "conflicto", delArchivo: null, motivo: `no se pudo declarar: ${g.error}` };
    return {
      ...permisoDeGuiaExistente(g.ingresos, g.planes, { especie: d.speciesCommonName, escritos: g.escritos }),
      proveedor: g.proveedor,
    };
  };

  /** Las filas que van con la primera de su grupo: el mismo resultado, dicho una vez. */
  const anotarGrupo = (g: GrupoIngreso, lider: ResultRow, permisoFila: PermisoDeFila | undefined) => {
    const primera = g.filas[0];
    porPosicion[primera.pos] = lider;
    if (permisoFila) permisos.push(permisoFila);
    for (const f of g.filas.slice(1)) {
      if (permisoFila) permisos.push(permisoFila);
      agrupadas++;
      porPosicion[f.pos] = {
        row: f.row,
        gtf: g.d.gtfNumber,
        action: lider.action,
        message: `Va en el mismo ingreso que la fila ${primera.row ?? "anterior"} (misma guía y especie)`,
        permiso: permisoFila,
      };
    }
  };

  try {
    for (const g of grupos) {
      const d = g.d;
      const clave = claveDeGuiaRef(refDe(g));
      const dec: DecisionGuiaAlImportar = decisiones.get(clave) ?? { estado: "otra" };
      const juntas = g.filas.length;
      const deVarias = juntas > 1 ? ` · ${juntas} filas del archivo juntas (${d.volumeM3} m³)` : "";
      if (dec.estado === "ambigua") {
        /* El N° está en dos o más permisos y la fila no dice cuál: no se adivina
           ni se escribe nada de esta guía; el resto del archivo sigue. */
        errores++;
        anotarGrupo(
          g,
          {
            row: g.filas[0].row,
            gtf: d.gtfNumber,
            action: "error",
            message: `${mensajeGuiaAmbigua(d.gtfNumber, dec.candidatas)} Esta guía no se cargó.`,
          },
          undefined,
        );
        continue;
      }
      const ponePermiso = permiso != null && g.contratoId === permiso.contratoId;
      const guiaDelLibro = dec.estado === "misma" || dec.estado === "asignar-permiso" ? { clave, ids: dec.ids } : { clave, ids: [] };
      /* Lo que la fila tiene que saber de la identidad de su guía. */
      const avisoGuia =
        dec.estado === "crear-con-aviso"
          ? ` · AVISO: ${dec.aviso}`
          : dec.estado === "asignar-permiso" && !ponePermiso
            ? ` · AVISO: la guía ${d.gtfNumber} ya estaba sin permiso: elige su permiso como permiso del archivo para ponérselo`
            : "";
      const enBase = ingresosDeLaGuia(g);
      const prev =
        enBase.find((e) => normCmp(e.speciesCommonName) === normCmp(d.speciesCommonName) && normCmp(e.productType) === normCmp(d.productType)) ??
        enBase.find((e) => normCmp(e.speciesCommonName) === normCmp(d.speciesCommonName)) ??
        (enBase.length > 0 && !archivoCubreLaBase(g) ? enBase[enBase.length - 1] : undefined);
      if (prev) {
        /* La guía ya está, pero puede faltarle el DETALLE. El inventario de patio
           trae una fila por troza: si el ingreso entró sin piezas, se completan
           (agrega, nunca reemplaza — `agregarTrozas` saltea las repetidas). Lo
           declarado no se toca: insert-only sigue valiendo para la guía. */
        let completado = "";
        const piezas = g.piezas;
        if (mode === "commit" && piezas && piezas.length > 0) {
          try {
            const r = await WoodEntriesDB.agregarTrozas(auth.tenantId, prev.id, piezas, auth.username ?? "import", {
              desdeImportacion: true,
              filas: g.filasDePiezas,
            });
            if (r.agregadas > 0) {
              /* La guía de varias especies son varias filas: cada troza fue a
                 la de su especie (ADR-435), y lo que no tenía fila se dice. */
              completado =
                ` · se completaron ${r.agregadas} troza${r.agregadas === 1 ? "" : "s"} que faltaban` +
                fraseDeColocacion(
                  r.porFila ?? [],
                  r.fueraDeSuFila ?? [],
                  r.porFila?.find((f) => f.woodEntryId === prev.id)?.especie ?? d.speciesCommonName,
                ) +
                /* La deduplicación es de la GUÍA entera: lo que ya estaba en
                   cualquiera de sus filas no se vuelve a cargar. */
                (r.repetidas.length > 0
                  ? ` · ${r.repetidas.length} ya estaba${r.repetidas.length === 1 ? "" : "n"} en la guía: no se duplicaron`
                  : "");
            }
            else if (r.bloqueado === "ya-tiene-lista") completado = " · ya tiene su lista de piezas";
            else if (r.repetidas.length > 0) completado = " · sus piezas ya estaban";
            /* ADR-504: filas idénticas que entraron igual, códigos que chocan con
               otro permiso mientras viva el índice viejo. */
            if (r.avisos && r.avisos.length > 0) completado += ` · AVISO: ${r.avisos.join(" · ")}`;
          } catch (e) {
            /* No romper la importación por esto: la guía existe igual y el
               operador tiene que saber por qué no entró el detalle. */
            completado = ` · no se pudieron agregar sus ${piezas.length} piezas: ${e instanceof Error ? e.message : String(e)}`;
          }
        } else if (mode === "preview" && piezas && piezas.length > 0) {
          completado = ` · trae ${piezas.length} troza${piezas.length === 1 ? "" : "s"} para completar`;
        }

        /* El permiso: la guía ya estaba en la base → se completa sólo lo vacío. */
        let permisoFila: PermisoDeFila | undefined;
        if (permiso) {
          const { proveedor: cambiados = [], ...suyo } = await permisoDeGuiaGuardada(permiso, d, d.originSourceNumber ?? null, guiaDelLibro);
          permisoFila = suyo;
          if (cambiados.length > 0 && permiso.titular && !guiasConProveedorDicho.has(clave)) {
            guiasConProveedorDicho.add(clave);
            const fuentes = [...new Set(cambiados.map((c) => c.fuente).filter((f): f is string => !!f))];
            completado +=
              ` · proveedor${mode === "commit" ? "" : " pasará a ser"}: ${permiso.titular} (titular del permiso) en ${cambiados.length} ingreso${cambiados.length === 1 ? "" : "s"}` +
              (fuentes.length > 0 ? ` · la fuente «${fuentes.join("», «")}» ${mode === "commit" ? "quedó" : "quedará"} guardada` : "");
          }
        }

        // Insert-only: existe → NO se sobrescribe. «difiere» si el libro trae otros valores.
        const diff = diffIngreso(prev, d);
        const otraEspecie = normCmp(prev.speciesCommonName) !== normCmp(d.speciesCommonName)
          ? ` · AVISO: la guía ya está con ${[...new Set(enBase.map((e) => e.speciesCommonName))].join(", ")} y el archivo no las trae todas: ${d.speciesCommonName} no se cargó (revisa el nombre de la especie)`
          : "";
        if (diff) {
          difieren++;
          anotarGrupo(g, { row: g.filas[0].row, gtf: d.gtfNumber, action: "difiere", message: `Ya existe con datos distintos (no se sobrescribe): ${diff}${deVarias}${completado}${otraEspecie}${avisoGuia}`, permiso: permisoFila }, permisoFila);
        } else {
          saltados++;
          anotarGrupo(g, { row: g.filas[0].row, gtf: d.gtfNumber, action: "existe", message: `Ya existe, idéntico — se salta${deVarias}${completado}${avisoGuia}`, permiso: permisoFila }, permisoFila);
        }
        continue;
      }

      /* Guía (o especie de la guía) nueva: se llena lo vacío con el permiso del
         archivo; la que trae otro conserva el suyo. El proveedor de RELLENO de
         la Sección 1 («Origen X · GTF») pasa a ser el titular del permiso, con
         SU RUC; la marca del inventario de patio y un nombre real quedan como
         vienen. */
      /* La fila que eligió OTRO permiso que el del archivo no recibe el del archivo. */
      const decision =
        permiso && !(d.contratoId && d.contratoId !== permiso.contratoId)
          ? decidirPermisoFila({ codigo: d.originCode, resolucion: d.originSourceNumber }, permiso)
          : null;
      const permisoFila: PermisoDeFila | undefined = decision ? permisoDeLaDecision(decision) : undefined;
      const proveedor = permiso && decision ? proveedorDelPermiso(d.providerName, d.gtfNumber, permiso, decision.estado) : null;
      const originCode = decision?.escribir?.originCode ?? d.originCode ?? null;
      /* El relleno «Origen X · GTF» era el ÚNICO lugar de la fuente X en la
         Sección 1 (reviewer 19-10): antes de que el titular lo reemplace, X va
         a la resolución si está vacía o a las notas. Nunca se pierde. No decide
         el permiso: X puede ser la resolución o el código de origen, y sólo la
         columna de resolución dice cuál es. */
      const rescate = proveedor
        ? rescatarFuenteDelRelleno({
            providerName: d.providerName,
            originCode,
            originSourceNumber: decision?.escribir?.originSourceNumber ?? d.originSourceNumber,
            notes: d.notes,
          })
        : null;
      const originSourceNumber = rescate ? rescate.originSourceNumber : (decision?.escribir?.originSourceNumber ?? d.originSourceNumber ?? null);
      const notas = rescate ? rescate.notes : (d.notes ?? null);
      const queda = mode === "commit" ? "quedó" : "quedará";
      const fraseFuente =
        rescate?.guardadaEn === "resolucion" ? ` · la fuente «${rescate.fuente}» ${queda} como N° de fuente de origen`
        : rescate?.guardadaEn === "notas" ? ` · la fuente «${rescate.fuente}» ${queda} en las notas`
        : "";
      const otraEspecieDeLaGuia = enBase.length > 0 ? ` · otra especie de la guía ${d.gtfNumber}, que ya estaba con ${[...new Set(enBase.map((e) => e.speciesCommonName))].join(", ")}` : "";
      if (mode === "preview") {
        creables++;
        anotarGrupo(g, { row: g.filas[0].row, gtf: d.gtfNumber, action: "crear", message: `${d.speciesCommonName} · ${d.volumeM3} m³${d.speciesCites ? " · CITES" : ""}${deVarias}${otraEspecieDeLaGuia}${proveedor ? ` · proveedor: ${proveedor.providerName}` : ""}${fraseFuente}${avisoGuia}`, permiso: permisoFila }, permisoFila);
        continue;
      }
      /* Si el alta falla después, el permiso ya puesto a la guía vieja se
         queda (es la misma guía: un reintento la encuentra `misma` y la
         especie entra en ella) y la fila lo dice. No va en la tx del alta:
         `permisoDeGuiaGuardada` se memoriza por guía y la comparten sus filas. */
      let permisoPuesto = false;
      try {
        /* La guía sin permiso que ES ésta (`asignar-permiso`) recibe el permiso
           del archivo ANTES del alta de su otra especie: si no, quedarían dos
           guías (la vieja sin permiso y la especie nueva con él). */
        if (dec.estado === "asignar-permiso" && permiso && ponePermiso) {
          const puesto = await permisoDeGuiaGuardada(permiso, d, d.originSourceNumber ?? null, guiaDelLibro);
          permisoPuesto = puesto.estado === "asignado";
        }
        const creado = await WoodEntriesDB.create(auth.tenantId, {
          entryDate: d.entryDate ? new Date(d.entryDate) : undefined,
          gtfNumber: d.gtfNumber,
          providerName: proveedor?.providerName ?? d.providerName,
          ...(proveedor?.providerDocument
            ? { providerDocument: proveedor.providerDocument, providerDocumentType: proveedor.providerDocumentType }
            : {}),
          originType: d.originType as WoodOriginType,
          originRegion: d.originRegion ?? null,
          originCode,
          originSourceNumber,
          /* ADR-504: el permiso de la guía es parte de su identidad (fila ›
             archivo › código de origen); `create` lo valida contra el negocio. */
          ...(g.contratoId ? { contratoId: g.contratoId } : {}),
          speciesCommonName: d.speciesCommonName,
          speciesScientificName: d.speciesScientificName ?? null,
          speciesCites: d.speciesCites,
          productType: d.productType as WoodProductType,
          volumeM3: d.volumeM3,
          notes: notas,
          /* Las piezas van en la MISMA tx que la guía (ADR-312/320): si falla, no
             queda un ingreso al que después haya que pegarle las trozas a mano.
             Dos fuentes, una sola lista (`agruparIngresos`):
              · el inventario de patio manda `trozas[]` —una fila por troza, y
                varias comparten guía—;
              · la Sección 1 del libro declara una fila por pieza, así que su
                «Código de CTP» ES la troza. */
          trozas: g.piezas,
          importacion: { filas: g.filasDePiezas },
          createdBy: auth.username ?? "import",
        });

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
        const piezas = g.piezas?.length ?? 0;
        anotarGrupo(
          g,
          {
            row: g.filas[0].row,
            gtf: d.gtfNumber,
            action: "creado",
            permiso: permisoFila,
            message:
              (validado ? "Importado y validado (libro oficial)" : "Importado (pendiente de validar)") +
              (piezas > 0 ? ` · ${piezas} troza${piezas === 1 ? "" : "s"}` : "") +
              deVarias +
              otraEspecieDeLaGuia +
              fraseFuente +
              /* Una guía nueva que trae trozas de otra especie: sin fila de esa
                 especie se quedan en ésta, y se dice (ADR-435). */
              fraseDeColocacion(
                creado.acomodo.aOtrasFilas.length > 0
                  ? [
                      { especie: creado.speciesCommonName, agregadas: piezas - creado.acomodo.aOtrasFilas.reduce((a, f) => a + f.trozas, 0) },
                      ...creado.acomodo.aOtrasFilas.map((f) => ({ especie: f.especie, agregadas: f.trozas })),
                    ]
                  : [],
                creado.acomodo.fueraDeSuFila,
                creado.speciesCommonName,
              ) +
              (creado.acomodo.yaEstabanEnSuFila.length > 0
                ? ` · AVISO: ${creado.acomodo.yaEstabanEnSuFila.length} troza(s) ya estaban en la fila de su especie: no se duplicaron`
                : "") +
              (creado.acomodo.avisos.length > 0 ? ` · AVISO: ${creado.acomodo.avisos.join(" · ")}` : "") +
              avisoGuia,
          },
          permisoFila,
        );
      } catch (e) {
        errores++;
        logger.error("[wood-entries.import] row failed", { gtf: d.gtfNumber, error: String(e) });
        const yaPuesto = permisoPuesto
          ? ` · La guía ${d.gtfNumber} que ya estaba sin permiso SÍ quedó con el permiso: vuelve a subir el archivo y esta especie entra en ella.`
          : "";
        anotarGrupo(g, { row: g.filas[0].row, gtf: d.gtfNumber, action: "error", message: `${e instanceof Error ? e.message : String(e)}${yaPuesto}` }, undefined);
      }
    }
  } finally {
    /* Aunque algo corte a la mitad, el rastro queda con lo que SÍ se hizo
       (reviewer 19-10): sin esto, una guía que tiraba dejaba ingresos con el
       permiso escrito y ningún asiento `ctp_import_permiso` que lo explique. */
    if (mode === "commit") {
      auditImport(auth.tenantId, auth.username ?? "unknown", "ingresos", fileName, { creados, saltados, difieren, errores });
      if (permiso) auditPermiso(auth.tenantId, auth.username ?? "unknown", "ingresos", fileName, permiso, permisos);
    }
  }
  const detalle = porPosicion.filter((r): r is ResultRow => r != null);
  return NextResponse.json({
    mode,
    resumen: {
      total: ingresos.length,
      crear: mode === "commit" ? creados : creables,
      creados,
      saltados,
      difieren,
      errores,
      /* Filas que entraron en el ingreso de otra (misma guía y especie). */
      agrupadas,
      ...(permiso ? { permiso: resumirPermiso(permiso.codigo, permisos) } : {}),
    },
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
