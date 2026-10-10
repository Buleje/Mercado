import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { auditCtpEsperando, m3 } from "@/lib/forestal/ctp-audit";
import { closedPeriodOf, type CtpCierrePeriodo } from "@/lib/forestal/ctp-cierre-types";
import {
  TOL_RESTO_M3,
  anexoRegistrado,
  clasificarAnexos,
  esMonton,
  fechaCorta,
  proponerDespachoDeAnexo,
  proponerTanda,
  type AnexoReemplazado,
  type BloqueoDeGuia,
  type CorridaOrigen,
  type EleccionDeOrigen,
  type EstadoDelLibro,
  type LineaPropuesta,
  type PropuestaDeGuia,
  type PropuestaDeTanda,
} from "@/lib/forestal/anexo-a-despacho";
import { etiquetaEmision, vincularDespachos, type AnexoEmitido } from "@/lib/forestal/anexo04-registro";
import { mismoNumeroGtf } from "@/lib/forestal/gtf-talonario";
import { presentacionSugerida } from "@/lib/forestal/loctp-catalogos";
import { ForestCtpDB, type CreadoEnTx, type CreatePreparado, type CtpEntryInput } from "./forest-ctp.db";
import { CtpInvariantError } from "./forest-ctp-consumo.db";
import { ORIGEN_VIGENTE } from "./forest-ctp-despacho.db";
import { ForestCtpCierreDB } from "./forest-ctp-cierre.db";
import { ForestAnexosDB, claveAnexos, normalizarAnexos } from "./forest-anexos.db";
import { ClaveOcupadaError, PlatformSettingsDB } from "./platform-settings.db";
import { esEsperaDeLockVencida } from "@/lib/errores/codigo-pg";
import { esChoqueDeLocks } from "@/lib/forestal/ctp-api-errors";
import { saldosDeCorridas } from "./forest-ctp-saldo-corrida";

/**
 * forest-ctp-guia-desde-anexo.db — «Guías sin registrar» (ADR-446): la salida
 * que sólo vive como Anexo 04 guardado entra al libro como líneas de Despacho,
 * atadas a sus corridas y al anexo.
 *
 * ── Qué garantiza ──────────────────────────────────────────────────────────
 * · UNA transacción por guía: los montones que se parten, las líneas, sus
 *   orígenes y el vínculo del anexo entran juntos o no entra nada. Una tanda
 *   son N transacciones: una guía rechazada no deshace las anteriores.
 * · Idempotente por número de guía (por tramos: `019-001-…` ≡ `19-001-…`):
 *   si el anexo ya tiene sus despachos vivos, vuelve «ya registrada»; si hay
 *   un despacho vivo con ese número que no vino de acá, «ya existe» y no se
 *   crea nada.
 * · Dos pestañas a la vez: la transacción arranca con el bloqueo de la bandeja
 *   de anexos del tenant (`PlatformSettingsDB.actualizar`), así que la segunda
 *   espera y ve la guía ya registrada.
 * · Orden de locks: bandeja → producción del tenant (el de I3) → paquetes
 *   `ORDER BY id` → lo que tomen `crearEnTx` y `setOrigenesEnTx`, que siguen el
 *   orden de siempre (corridas → paquete).
 * · Cierre de período en todo lo que escribe: la fecha de la guía (alta y
 *   orígenes) y la corrida del montón que se parte.
 * · WASACO y cualquier salida sin precio: `valorVenta` queda `null`, nunca 0.
 *
 * La propuesta es la función pura `lib/forestal/anexo-a-despacho.ts`; acá sólo
 * se lee el libro, se vuelve a proponer bajo los locks y se escribe.
 */

const CACHE_PREFIX = "forest-ctp";
/**
 * Registrar una guía son decenas de líneas con sus locks (la 064 de Blas, 37).
 * Contra la base desde el panel local cada consulta va y vuelve por el pooler:
 * los 20 s de `CTP_TX_OPTS` no alcanzan. En producción tarda un par de segundos.
 */
const TX_GUIA = { timeout: 120_000, maxWait: 15_000 } as const;
/** Lo más que la guía espera un lock de fila (corridas, paquetes) antes de rendirse con 409. */
const ESPERA_LOCKS_MS = 15_000;
const VIGENTE = ORIGEN_VIGENTE.despacho;
/** Una salida de trozas sin aserrar guarda el código de la PIEZA: no lleva paquete (ADR-444). */
const NO_ES_SALIDA_DE_TROZAS = { trozasDespachadas: { none: {} } } as const;

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const fechaIso = (d: Date) => d.toISOString().slice(0, 10);

type Lector = Pick<
  Prisma.TransactionClient,
  "forestCtpEntry" | "forestCtpDespachoOrigen" | "forestCtpReproceso" | "forestCtpPaquete" | "forestCtpApartado" | "forestCtpConsumo"
>;

export interface PartidoDeMonton {
  paqueteId: string;
  codigo: string;
  corridaId: string;
  corridaLineNo: number;
  antesM3: number;
  salidaM3: number;
  /** El paquete nuevo con lo que queda. `null` = el montón salió entero. */
  resto: { id: string; codigo: string; m3: number } | null;
}

export interface DespachoCreado {
  id: string;
  lineNo: number;
  especie: string;
  tipo: string;
  m3: number;
  origenM3: number;
  corridaLineNo: number | null;
  codigo: string | null;
}

interface BaseResultado {
  anexoId: string;
  numero: string;
  gtf: string;
}

export type ResultadoGuia =
  | (BaseResultado & {
      estado: "registrada";
      despachos: DespachoCreado[];
      atribuidoM3: number;
      sinAtribuirM3: number;
      partidos: PartidoDeMonton[];
      /** Otros anexos de la misma guía que quedaron «reemplazados». */
      reemplazados: string[];
      /** Corridas «usado» que la guía tomó como origen. */
      usadasTocadas: string[];
    })
  | (BaseResultado & { estado: "ya_registrada"; despachos: { id: string; lineNo: number }[] })
  | (BaseResultado & { estado: "ya_existe"; despachos: { id: string; lineNo: number; gtfNumber: string | null }[]; mensaje: string })
  | (BaseResultado & { estado: "bloqueada"; bloqueos: BloqueoDeGuia[]; mensaje: string })
  | (BaseResultado & { estado: "error"; codigo: string; mensaje: string; detalle?: Record<string, unknown> });

export interface UsadaLiberada {
  corridaId: string;
  lineNo: number;
  restoM3: number;
}

export interface ResultadoTanda {
  guias: ResultadoGuia[];
  /** Corridas «usado» cuyo resto volvió a Productos disponibles (decisión 6). */
  liberadas: UsadaLiberada[];
  noLiberadas: { corridaId: string; lineNo: number | null; motivo: string }[];
  resumen: { registradas: number; yaRegistradas: number; yaExisten: number; bloqueadas: number; errores: number };
}

export interface GuiaPedida {
  anexoId: string;
  elecciones?: readonly EleccionDeOrigen[];
}

export interface RespuestaPendientes {
  tanda: PropuestaDeTanda;
  reemplazados: AnexoReemplazado[];
  registrados: { anexoId: string; numero: string; gtf: string; fecha: string; despachoIds: string[] }[];
  sinGuia: { anexoId: string; numero: string; fecha: string }[];
  /** Pedidos que no son una guía pendiente (ya registrada, reemplazada, no existe). */
  fuera: { anexoId: string; motivo: string }[];
}

export type RespuestaAnexo =
  | { estado: "pendiente"; anexoId: string; propuesta: PropuestaDeGuia }
  | { estado: "registrado"; anexoId: string; despachos: { id: string; lineNo: number; m3: number | null; especie: string | null; producto: string | null }[] }
  | { estado: "reemplazado"; anexoId: string; por: string }
  | { estado: "sin_guia"; anexoId: string }
  | { estado: "no_existe"; anexoId: string };

// ── Lecturas ──────────────────────────────────────────────────────────────

/**
 * El libro que la propuesta necesita, leído con el cliente dado (la tx o el
 * global). Consultas planas y EN SERIE: dentro de una transacción interactiva
 * de Prisma 7 un `Promise.all` o un `select` anidado comparten la conexión.
 */
async function estadoDelLibro(client: Lector, tenantId: string): Promise<EstadoDelLibro> {
  const corridas = await client.forestCtpEntry.findMany({
    where: { tenantId, section: "produccion", deletedAt: null, status: "registrado", quantity: { not: null } },
    orderBy: [{ entryDate: "asc" }, { lineNo: "asc" }],
    take: 5000,
    select: {
      id: true, lineNo: true, entryDate: true, speciesCommon: true, productType: true, presentacion: true,
      unit: true, usadoAt: true, volumeInputM3: true, duenoMadera: true, titularNombre: true,
    },
  });
  const ids = corridas.map((c) => c.id);
  if (ids.length === 0) return { corridas: [], stock: Object.fromEntries(await ForestCtpDB.stockPorProducto(client, tenantId)) };

  const consumos = await client.forestCtpConsumo.groupBy({
    by: ["ctpEntryId"],
    where: { tenantId, ctpEntryId: { in: ids } },
    _count: { _all: true },
  });
  const conConsumos = new Set(consumos.filter((c) => c._count._all > 0).map((c) => c.ctpEntryId));
  const paquetes = await client.forestCtpPaquete.findMany({
    where: { tenantId, ctpEntryId: { in: ids }, deletedAt: null },
    orderBy: { codigo: "asc" },
    select: {
      id: true, ctpEntryId: true, codigo: true, productType: true, presentacion: true, cantidad: true,
      volumenM3: true, espesorCm: true, anchoCm: true, largoM: true,
    },
  });
  const apartados = paquetes.length
    ? await client.forestCtpApartado.findMany({
        where: { tenantId, paqueteId: { in: paquetes.map((p) => p.id) }, liberadoAt: null },
        select: { paqueteId: true },
      })
    : [];
  const apartado = new Set(apartados.map((a) => a.paqueteId).filter((x): x is string => Boolean(x)));
  const codigos = [...new Set(paquetes.map((p) => p.codigo))];
  const despachados = codigos.length
    ? await client.forestCtpEntry.findMany({
        where: { tenantId, section: "despacho", codigoProducto: { in: codigos }, ...VIGENTE, ...NO_ES_SALIDA_DE_TROZAS },
        select: { codigoProducto: true },
      })
    : [];
  const codigoDespachado = new Set(despachados.map((d) => d.codigoProducto).filter((x): x is string => Boolean(x)));
  const saldos = await saldosDeCorridas(client, tenantId, ids);
  const origenes = await client.forestCtpDespachoOrigen.findMany({
    where: { tenantId, produccionEntryId: { in: ids }, despacho: VIGENTE },
    select: { produccionEntryId: true, despachoEntryId: true, quantity: true },
  });
  const despachosDeOrigen = origenes.length
    ? await client.forestCtpEntry.findMany({
        where: { tenantId, id: { in: [...new Set(origenes.map((o) => o.despachoEntryId))] } },
        select: { id: true, productType: true, codigoProducto: true },
      })
    : [];
  const despachoPorId = new Map(despachosDeOrigen.map((d) => [d.id, d]));
  const stock = await ForestCtpDB.stockPorProducto(client, tenantId);

  const paquetesDe = new Map<string, typeof paquetes>();
  for (const p of paquetes) paquetesDe.set(p.ctpEntryId, [...(paquetesDe.get(p.ctpEntryId) ?? []), p]);

  const salida: CorridaOrigen[] = corridas.map((c) => {
    const propios = paquetesDe.get(c.id) ?? [];
    const codigosPropios = new Set(propios.map((p) => p.codigo));
    return {
      id: c.id,
      lineNo: c.lineNo,
      fecha: fechaIso(c.entryDate),
      especie: c.speciesCommon,
      producto: c.productType,
      presentacion: c.presentacion,
      unidad: c.unit,
      disponibleM3: saldos.get(c.id)?.disponible ?? 0,
      usado: c.usadoAt != null,
      sinOrigen: !(Number(c.volumeInputM3 ?? 0) > 0) && !conConsumos.has(c.id),
      duenoMadera: c.duenoMadera,
      titularNombre: c.titularNombre,
      paquetes: propios.map((p) => ({
        id: p.id,
        codigo: p.codigo,
        producto: p.productType,
        presentacion: p.presentacion,
        cantidad: p.cantidad,
        volumenM3: Number(p.volumenM3),
        conMedidas: p.espesorCm != null && p.anchoCm != null && p.largoM != null,
        despachado: codigoDespachado.has(p.codigo),
        apartado: apartado.has(p.id),
      })),
      /* Lo que salió de esta corrida sin nombrar uno de SUS paquetes. */
      salidoSinPaquete: origenes
        .filter((o) => o.produccionEntryId === c.id)
        .map((o) => ({ o, d: despachoPorId.get(o.despachoEntryId) }))
        .filter(({ d }) => !d?.codigoProducto || !codigosPropios.has(d.codigoProducto.trim()))
        .map(({ o, d }) => ({ producto: d?.productType ?? null, m3: Number(o.quantity) })),
    };
  });
  return { corridas: salida, stock: Object.fromEntries(stock) };
}

const idsDeAnexos = (lista: readonly AnexoEmitido[]): string[] => [
  ...new Set(lista.flatMap((a) => [...(a.despachoIds ?? []), ...(a.ctpEntryId ? [a.ctpEntryId] : [])])),
];

interface DespachoVivo {
  id: string;
  lineNo: number;
  gtfNumber: string | null;
}

interface BandejaConfiable {
  /** La bandeja como la lee el puente: `ctpEntryId` sólo si ese despacho lleva la MISMA guía. */
  lista: AnexoEmitido[];
  /** Despachos vivos citados por la bandeja. */
  vigentes: Set<string>;
  /** Anexos cuyo `ctpEntryId` apunta a un despacho vivo con OTRA guía (o sin guía). */
  desdeOtraLinea: Map<string, DespachoVivo>;
}

/**
 * La bandeja con sus vínculos verificados (seguridad S3). `despachoIds` lo
 * escribe sólo el servidor al registrar, pero `ctpEntryId` llega con el anexo
 * desde el cliente: sin mirar qué guía lleva ese despacho, un id cualquiera
 * escondía una guía de «sin registrar». Se trabaja sobre una COPIA: lo que se
 * vuelve a grabar en el KV es la lista original.
 */
async function bandejaConfiable(client: Lector, tenantId: string, cruda: readonly AnexoEmitido[]): Promise<BandejaConfiable> {
  const ids = idsDeAnexos(cruda);
  const filas = ids.length
    ? await client.forestCtpEntry.findMany({
        where: { tenantId, id: { in: ids }, section: "despacho", ...VIGENTE },
        select: { id: true, lineNo: true, gtfNumber: true },
      })
    : [];
  const porId = new Map(filas.map((f) => [f.id, f]));
  const desdeOtraLinea = new Map<string, DespachoVivo>();
  const lista = cruda.map((a) => {
    if (!a.ctpEntryId) return a;
    const d = porId.get(a.ctpEntryId);
    if (d && mismoNumeroGtf(d.gtfNumber, a.gtf)) return a;
    if (d) desdeOtraLinea.set(a.id, d);
    return { ...a, ctpEntryId: undefined };
  });
  return { lista, vigentes: new Set(porId.keys()), desdeOtraLinea };
}

/** Los despachos vivos con ESE número de guía, comparado por tramos. */
async function despachosDeLaGuia(client: Lector, tenantId: string, gtf: string) {
  const ultimo = /(\d+)\D*$/.exec(gtf)?.[1]?.replace(/^0+(?=\d)/, "") ?? "";
  const filas = await client.forestCtpEntry.findMany({
    where: { tenantId, section: "despacho", ...VIGENTE, gtfNumber: ultimo ? { contains: ultimo } : { not: null } },
    select: { id: true, lineNo: true, gtfNumber: true },
    orderBy: { lineNo: "asc" },
    take: 500,
  });
  return filas.filter((f) => mismoNumeroGtf(f.gtfNumber, gtf));
}

/** La entrada del alta para una línea propuesta. Cantidades y piezas salen del anexo, nunca del cliente. */
function entradaDeLinea(anexo: AnexoEmitido, l: LineaPropuesta, user: string): CtpEntryInput {
  const nota =
    `Salida registrada desde el Anexo 04 N° ${anexo.numero || "s/n"} del ${fechaCorta(anexo.fecha)}` +
    (l.origen ? "" : " · sin corrida de origen: el libro no tiene producción de ese tipo para cubrirla");
  return {
    section: "despacho",
    /* Mediodía UTC: el día sale igual formateado en UTC (convención del libro)
       y cae en el mismo mes de Lima — medianoche UTC es las 19:00 del día
       anterior en Pucallpa, y el 1.° del mes lo juzgaba el cierre del mes pasado. */
    entryDate: new Date(`${anexo.fecha.slice(0, 10)}T12:00:00.000Z`),
    speciesCommon: l.especie,
    productType: l.producto,
    presentacion: l.origen?.presentacion ?? presentacionSugerida(l.producto),
    quantity: l.m3,
    unit: "m3",
    pieces: l.piezas,
    gtfNumber: anexo.gtf.trim(),
    docType: "GTF",
    codigoProducto: l.origen?.codigo ?? null,
    duenoMadera: l.origen?.duenoMadera ?? null,
    titularNombre: l.origen?.titularNombre ?? null,
    /* Sin precio en el anexo: `null`, nunca 0 (WASACO es servicio, decisión 7). */
    valorVenta: null,
    observations: nota,
    origenes: l.origen ? [{ produccionEntryId: l.origen.corridaId, quantity: l.origenM3 }] : undefined,
    createdBy: user,
  };
}

/** Dos propuestas describen las mismas líneas (para saber si el libro cambió bajo el lock). */
const huella = (p: PropuestaDeGuia): string =>
  JSON.stringify([
    p.registrable,
    p.lineas.map((l) => [l.grupo, l.m3, l.origenM3, l.piezas, l.origen?.corridaId ?? null, l.origen?.paqueteId ?? null, l.origen?.clase ?? null, l.origen?.restoM3 ?? 0]),
  ]);

/** Un error del libro como resultado de UNA guía: la tanda sigue con las demás. */
function comoResultado(anexo: BaseResultado, err: unknown): ResultadoGuia {
  if (err instanceof ClaveOcupadaError) {
    return {
      ...anexo,
      estado: "error",
      codigo: "TANDA_EN_CURSO",
      mensaje: "Otra tanda (o un guardado de anexo) está en curso en este momento: espera unos segundos y vuelve a intentar.",
    };
  }
  if (esEsperaDeLockVencida(err) || esChoqueDeLocks(err)) {
    return {
      ...anexo,
      estado: "error",
      codigo: "LIBRO_OCUPADO",
      mensaje: "Otra operación del libro tiene tomadas estas corridas o paquetes: no se registró nada; vuelve a intentar en unos segundos.",
    };
  }
  if (err instanceof CtpInvariantError) {
    return { ...anexo, estado: "error", codigo: err.code, mensaje: err.message, detalle: err.detail };
  }
  logger.error("[guia-desde-anexo] no se pudo registrar", { error: String(err), anexoId: anexo.anexoId });
  return { ...anexo, estado: "error", codigo: "INTERNO", mensaje: "No se pudo registrar esta guía por un error del servidor; las demás siguen." };
}

// ── La clase ──────────────────────────────────────────────────────────────

export class ForestCtpGuiaDesdeAnexoDB {
  /** Las guías que sólo viven como Anexo 04, con su propuesta en el orden en que se registrarían. */
  static async pendientes(tenantId: string): Promise<RespuestaPendientes> {
    return ForestCtpGuiaDesdeAnexoDB.simularTanda(tenantId, null);
  }

  /**
   * Sólo el conteo (2026-09-28): la pastilla de Despacho no necesita la
   * propuesta entera (qué corrida cubre cada línea) para decir «9 guías, 12,4
   * m³» — sólo el KV de anexos y los despachos vivos por número de guía. Se
   * salta `estadoDelLibro` (hasta 5000 corridas + saldos + orígenes) y
   * `proponerTanda`, que es lo que tarda: medido en Blas, 3,4 s → contra esto.
   * `contarPendientes` es la MITAD barata de `pendientes`: comparte
   * `bandejaConfiable`+`clasificarAnexos`, nunca diverge en qué cuenta como
   * pendiente porque es el mismo código.
   */
  static async contarPendientes(tenantId: string): Promise<{ guias: number; totalM3: number }> {
    if (!tenantId) throw new Error("tenantId is required");
    const { lista, vigentes } = await bandejaConfiable(prisma, tenantId, await ForestAnexosDB.list(tenantId));
    const { pendientes } = clasificarAnexos(lista, vigentes);
    const totalM3 = Math.round(pendientes.reduce((a, p) => a + p.totalM3, 0) * 10000) / 10000;
    return { guias: pendientes.length, totalM3 };
  }

  /**
   * La tanda como quedaría, sin escribir nada. `guias = null` = todas las
   * pendientes; si no, sólo esas, con las elecciones de origen de cada una.
   */
  static async simularTanda(tenantId: string, guias: readonly GuiaPedida[] | null): Promise<RespuestaPendientes> {
    if (!tenantId) throw new Error("tenantId is required");
    const { lista, vigentes } = await bandejaConfiable(prisma, tenantId, await ForestAnexosDB.list(tenantId));
    const cl = clasificarAnexos(lista, vigentes);
    const pedidas = guias ? new Map(guias.map((g) => [g.anexoId, g])) : null;
    const fuera: RespuestaPendientes["fuera"] = [];
    if (pedidas) {
      for (const id of pedidas.keys()) {
        if (cl.pendientes.some((a) => a.id === id)) continue;
        const motivo = !lista.some((a) => a.id === id)
          ? "no existe"
          : cl.registrados.some((a) => a.id === id)
            ? "ya está registrada"
            : cl.reemplazados.some((a) => a.anexoId === id)
              ? "quedó reemplazado por otro anexo de la misma guía"
              : "no tiene número de guía";
        fuera.push({ anexoId: id, motivo });
      }
    }
    const aProponer = pedidas ? cl.pendientes.filter((a) => pedidas.has(a.id)) : cl.pendientes;
    const estado = await estadoDelLibro(prisma, tenantId);
    const elecciones = pedidas
      ? Object.fromEntries([...pedidas].filter(([, g]) => g.elecciones?.length).map(([id, g]) => [id, g.elecciones!]))
      : undefined;
    const tanda = proponerTanda(aProponer, estado, { elecciones, claveStock: ForestCtpDB.claveDeStock });
    return {
      tanda,
      reemplazados: cl.reemplazados,
      registrados: cl.registrados.map((a) => ({
        anexoId: a.id, numero: a.numero, gtf: a.gtf, fecha: a.fecha,
        despachoIds: (a.despachoIds ?? []).filter((id) => vigentes.has(id)),
      })),
      sinGuia: cl.sinGuia.map((a) => ({ anexoId: a.id, numero: a.numero, fecha: a.fecha })),
      fuera,
    };
  }

  /** Un anexo: su estado y, si falta registrarlo, lo que pasaría si se registra AHORA. */
  static async proponer(
    tenantId: string,
    anexoId: string,
    elecciones?: readonly EleccionDeOrigen[],
  ): Promise<RespuestaAnexo> {
    if (!tenantId) throw new Error("tenantId is required");
    const { lista, vigentes } = await bandejaConfiable(prisma, tenantId, await ForestAnexosDB.list(tenantId));
    const anexo = lista.find((a) => a.id === anexoId);
    if (!anexo) return { estado: "no_existe", anexoId };
    if (!anexo.gtf?.trim()) return { estado: "sin_guia", anexoId };
    const cl = clasificarAnexos(lista, vigentes);
    if (cl.registrados.some((a) => a.id === anexoId)) {
      const ids = [...(anexo.despachoIds ?? []), ...(anexo.ctpEntryId ? [anexo.ctpEntryId] : [])].filter((id) => vigentes.has(id));
      const filas = await prisma.forestCtpEntry.findMany({
        where: { tenantId, id: { in: ids } },
        select: { id: true, lineNo: true, quantity: true, speciesCommon: true, productType: true },
        orderBy: { lineNo: "asc" },
      });
      return {
        estado: "registrado",
        anexoId,
        despachos: filas.map((f) => ({
          id: f.id, lineNo: f.lineNo, m3: f.quantity != null ? Number(f.quantity) : null,
          especie: f.speciesCommon, producto: f.productType,
        })),
      };
    }
    const reemplazo = cl.reemplazados.find((r) => r.anexoId === anexoId);
    if (reemplazo) return { estado: "reemplazado", anexoId, por: reemplazo.por };
    const estado = await estadoDelLibro(prisma, tenantId);
    return {
      estado: "pendiente",
      anexoId,
      propuesta: proponerDespachoDeAnexo(anexo, estado, { elecciones, claveStock: ForestCtpDB.claveDeStock }),
    };
  }

  /**
   * Parte un paquete de MONTÓN dentro de la transacción del llamador
   * (decisión 10): el paquete se queda con lo que sale en esta guía —su código
   * es el que nombra la línea— y el resto pasa a un paquete nuevo de la misma
   * corrida (`55` → `55-R1`, `55-R1` → `55-R2`). Σ paquetes de la corrida no
   * cambia. Un bulto con piezas o medidas NO se parte (ADR-444: sale entero).
   *
   * El llamador ya bloqueó la producción del tenant; acá se bloquea el paquete
   * y se relee bajo el lock. Verifica el cierre del período de la CORRIDA: el
   * montón del inventario del 1/08 vive en agosto aunque la guía sea de
   * septiembre.
   */
  static async partirMontonEnTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    paqueteId: string,
    salidaM3: number,
    ctx: { user: string; cierres: readonly CtpCierrePeriodo[]; guia: string },
  ): Promise<PartidoDeMonton> {
    if (!tenantId) throw new Error("tenantId is required");
    await tx.$queryRaw`
      SELECT "id" FROM "ForestCtpPaquete"
      WHERE "tenantId" = ${tenantId} AND "id" = ${paqueteId}
      FOR UPDATE
    `;
    const p = await tx.forestCtpPaquete.findFirst({
      where: { id: paqueteId, tenantId, deletedAt: null },
      select: {
        id: true, codigo: true, ctpEntryId: true, productType: true, presentacion: true, cantidad: true, unit: true,
        volumenM3: true, espesorCm: true, anchoCm: true, largoM: true, precioVentaPt: true, pieTablar: true,
      },
    });
    if (!p) throw new CtpInvariantError("El paquete a partir ya no existe.", "PAQUETE_NO_SE_PARTE", { paqueteId });
    if (!esMonton({ cantidad: p.cantidad, conMedidas: p.espesorCm != null && p.anchoCm != null && p.largoM != null })) {
      throw new CtpInvariantError(
        `El paquete ${p.codigo} tiene piezas o medidas: es un bulto con etiqueta y sale entero en una sola guía.`,
        "PAQUETE_NO_SE_PARTE",
        { codigo: p.codigo },
      );
    }
    const previo = await tx.forestCtpEntry.findFirst({
      where: { tenantId, section: "despacho", codigoProducto: p.codigo, ...VIGENTE, ...NO_ES_SALIDA_DE_TROZAS },
      select: { lineNo: true, gtfNumber: true },
    });
    if (previo) {
      throw new CtpInvariantError(
        `El paquete ${p.codigo} ya va en la guía ${previo.gtfNumber ?? "en borrador"} (línea N° ${previo.lineNo}).`,
        "PAQUETE_YA_DESPACHADO",
        { codigo: p.codigo, lineNo: previo.lineNo },
      );
    }
    const reserva = await tx.forestCtpApartado.findFirst({
      where: { tenantId, paqueteId: p.id, liberadoAt: null },
      select: { id: true },
    });
    if (reserva) {
      throw new CtpInvariantError(
        `El paquete ${p.codigo} está apartado: libera el apartado antes de registrar la guía.`,
        "PAQUETE_NO_SE_PARTE",
        { codigo: p.codigo },
      );
    }
    const corrida = await tx.forestCtpEntry.findFirst({
      where: { id: p.ctpEntryId, tenantId, deletedAt: null, status: "registrado" },
      select: { lineNo: true, entryDate: true },
    });
    if (!corrida) {
      throw new CtpInvariantError("La corrida del paquete fue anulada o borrada.", "PAQUETE_NO_SE_PARTE", { codigo: p.codigo });
    }
    const cerrado = closedPeriodOf([...ctx.cierres], corrida.entryDate);
    if (cerrado) {
      throw new CtpInvariantError(
        `El período ${cerrado.label} está cerrado: no se puede partir el paquete ${p.codigo} de la corrida N° ${corrida.lineNo}.`,
        "PERIODO_CERRADO",
        { periodKey: cerrado.periodKey, codigo: p.codigo },
      );
    }
    const antes = r4(Number(p.volumenM3));
    const salida = r4(salidaM3);
    if (!(salida > 0) || salida > antes) {
      throw new CtpInvariantError(
        `El paquete ${p.codigo} mide ${antes} y se quieren sacar ${salida}.`,
        "I5_SOBRE_SALIDA_PRODUCCION",
        { codigo: p.codigo, mide: antes, pedido: salida },
      );
    }
    const queda = r4(antes - salida);
    const base = { paqueteId: p.id, codigo: p.codigo, corridaId: p.ctpEntryId, corridaLineNo: corrida.lineNo, antesM3: antes, salidaM3: salida };
    if (queda < TOL_RESTO_M3) return { ...base, resto: null };

    /* El código del resto: `55-R<n>`, el siguiente libre. El índice único
       (tenantId, codigo) también ve los paquetes borrados. */
    const raiz = p.codigo.replace(/-R\d+$/, "");
    const usados = await tx.forestCtpPaquete.findMany({
      where: { tenantId, codigo: { startsWith: `${raiz}-R` } },
      select: { codigo: true },
    });
    const escapada = raiz.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patron = new RegExp(`^${escapada}-R(\\d+)$`);
    const n = Math.max(0, ...usados.map((u) => Number(patron.exec(u.codigo)?.[1] ?? 0))) + 1;
    const codigoResto = `${raiz}-R${n}`;

    /* El pie tablar, si el montón lo trae, se reparte en la misma proporción. */
    const ptAntes = p.pieTablar != null ? Number(p.pieTablar) : null;
    const ptSalida = ptAntes != null && antes > 0 ? Math.round(((ptAntes * salida) / antes) * 100) / 100 : null;
    const ptResto = ptAntes != null && ptSalida != null ? Math.round((ptAntes - ptSalida) * 100) / 100 : null;
    await tx.forestCtpPaquete.updateMany({
      where: { id: p.id, tenantId },
      data: {
        volumenM3: new Prisma.Decimal(salida),
        ...(ptSalida != null ? { pieTablar: new Prisma.Decimal(ptSalida) } : {}),
      },
    });
    const resto = await tx.forestCtpPaquete.create({
      data: {
        tenantId,
        ctpEntryId: p.ctpEntryId,
        codigo: codigoResto,
        productType: p.productType,
        presentacion: p.presentacion,
        cantidad: 0,
        unit: p.unit,
        volumenM3: new Prisma.Decimal(queda),
        pieTablar: ptResto != null ? new Prisma.Decimal(ptResto) : null,
        precioVentaPt: p.precioVentaPt,
        observations: `Resto del paquete ${p.codigo} (${antes} m³): salieron ${salida} m³ en la guía ${ctx.guia}.`,
        createdBy: ctx.user,
      },
      select: { id: true, codigo: true },
    });
    return { ...base, resto: { id: resto.id, codigo: resto.codigo, m3: queda } };
  }

  /** Registra UNA guía (su propia transacción) y devuelve al patio el resto de las corridas «usado» que tomó. */
  static async registrarGuia(
    tenantId: string,
    anexoId: string,
    opts: { elecciones?: readonly EleccionDeOrigen[]; user: string; liberarUsadas?: readonly string[] },
  ): Promise<ResultadoTanda> {
    return ForestCtpGuiaDesdeAnexoDB.registrarTanda(tenantId, [{ anexoId, elecciones: opts.elecciones }], opts);
  }

  /**
   * Registra varias guías, UNA transacción cada una y la más vieja primero
   * (cada propuesta se vuelve a calcular sobre lo que dejó la anterior). Al
   * final, las corridas «usado» que las guías tomaron como origen y a las que
   * ninguna guía pendiente necesita vuelven a Productos disponibles con su
   * resto (decisión 6); `liberarUsadas` suma otras a mano (p. ej. una del
   * mismo inventario que ninguna guía tocó).
   */
  static async registrarTanda(
    tenantId: string,
    guias: readonly GuiaPedida[],
    opts: { user: string; liberarUsadas?: readonly string[] },
  ): Promise<ResultadoTanda> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!opts.user?.trim()) throw new Error("user is required");
    const { lista, vigentes } = await bandejaConfiable(prisma, tenantId, await ForestAnexosDB.list(tenantId));
    const orden = new Map(clasificarAnexos(lista, vigentes).pendientes.map((a, i) => [a.id, i]));
    const enOrden = [...guias].sort((a, b) => (orden.get(a.anexoId) ?? 1e9) - (orden.get(b.anexoId) ?? 1e9));

    const resultados: ResultadoGuia[] = [];
    for (const g of enOrden) {
      resultados.push(await ForestCtpGuiaDesdeAnexoDB.registrarUna(tenantId, g.anexoId, g.elecciones, opts.user));
    }
    /* Las candidatas salen de los orígenes VIGENTES de todos los anexos ya
       registrados (no sólo de lo registrado ahora): un reintento que vuelve
       «ya registrada», o una guía que se registró con otro origen, no dejan
       una corrida «usado» para siempre. */
    const { liberadas, noLiberadas } = await ForestCtpGuiaDesdeAnexoDB.liberarUsadas(tenantId, opts.liberarUsadas ?? [], opts.user);
    const cuenta = (e: ResultadoGuia["estado"]) => resultados.filter((r) => r.estado === e).length;
    return {
      guias: resultados,
      liberadas,
      noLiberadas,
      resumen: {
        registradas: cuenta("registrada"),
        yaRegistradas: cuenta("ya_registrada"),
        yaExisten: cuenta("ya_existe"),
        bloqueadas: cuenta("bloqueada"),
        errores: cuenta("error"),
      },
    };
  }

  /** El núcleo de una guía: todo o nada, sin la liberación de «usado» (esa va al final de la tanda). */
  private static async registrarUna(
    tenantId: string,
    anexoId: string,
    elecciones: readonly EleccionDeOrigen[] | undefined,
    user: string,
  ): Promise<ResultadoGuia> {
    const { lista, vigentes, desdeOtraLinea } = await bandejaConfiable(prisma, tenantId, await ForestAnexosDB.list(tenantId));
    const anexo = lista.find((a) => a.id === anexoId);
    const base: BaseResultado = { anexoId, numero: anexo?.numero ?? "", gtf: anexo?.gtf ?? "" };
    try {
      if (!anexo) throw new CtpInvariantError("Ese Anexo 04 no existe en la bandeja.", "ANEXO_NO_REGISTRABLE", { anexoId });
      if (!anexo.gtf?.trim()) {
        throw new CtpInvariantError("El anexo no tiene N° de guía: no hay salida que registrar.", "ANEXO_NO_REGISTRABLE", { anexoId });
      }
      if (anexoRegistrado(anexo, vigentes)) {
        return { ...base, estado: "ya_registrada", despachos: await ForestCtpGuiaDesdeAnexoDB.lineasDe(tenantId, anexo, vigentes) };
      }
      /* Se emitió desde una línea de Despacho viva que lleva otra guía: no se
         registra otra salida encima; se muestra para corregir el vínculo. */
      const otraLinea = desdeOtraLinea.get(anexoId);
      if (otraLinea) {
        return {
          ...base,
          estado: "ya_existe",
          despachos: [otraLinea],
          mensaje: `El anexo se emitió desde la línea N° ${otraLinea.lineNo} de Despacho, que lleva ${otraLinea.gtfNumber ? `la guía ${otraLinea.gtfNumber}` : "otra guía (sin número)"}: corrige esa línea o el anexo antes de registrarlo.`,
        };
      }
      /* Reemplazado de verdad = marcado en el registro. El que sólo la
         propuesta sugiere reemplazar (hay uno más nuevo de la misma guía) se
         puede registrar si el operador lo elige: el otro queda marcado. */
      const por = anexo.reemplazadoPor ? lista.find((a) => a.id === anexo.reemplazadoPor) : undefined;
      if (por) {
        throw new CtpInvariantError(
          `Este anexo quedó reemplazado por el ${etiquetaEmision(por)}: se registra ese.`,
          "ANEXO_NO_REGISTRABLE",
          { anexoId, por: por.id },
        );
      }
      const mismaGuia = await despachosDeLaGuia(prisma, tenantId, anexo.gtf);
      if (mismaGuia.length > 0) {
        return {
          ...base,
          estado: "ya_existe",
          despachos: mismaGuia,
          mensaje: `La guía ${anexo.gtf} ya está en Despacho (línea N° ${mismaGuia.map((d) => d.lineNo).join(", ")}) sin venir de este anexo: no se registra dos veces.`,
        };
      }

      const estado = await estadoDelLibro(prisma, tenantId);
      const propuesta = proponerDespachoDeAnexo(anexo, estado, { elecciones, claveStock: ForestCtpDB.claveDeStock });
      if (!propuesta.registrable) {
        return {
          ...base,
          estado: "bloqueada",
          bloqueos: propuesta.bloqueos,
          mensaje: propuesta.bloqueos.map((b) => b.mensaje).join(" "),
        };
      }
      /* Cierre, especie del catálogo y cierres de la atribución: ANTES de la
         transacción (KV que adentro pediría otra conexión). El período cerrado
         de la guía se rechaza acá mismo. */
      const entradas = propuesta.lineas.map((l) => entradaDeLinea(anexo, l, user));
      const preparados: CreatePreparado[] = [];
      for (const e of entradas) preparados.push(await ForestCtpDB.prepararCreate(tenantId, e));
      const cierres = await ForestCtpCierreDB.list(tenantId);

      const hecho = await PlatformSettingsDB.actualizar<unknown, ResultadoGuia & { creados?: CreadoEnTx[] }>(
        claveAnexos(tenantId),
        async (actual, tx) => {
          /* Un lock de fila que no llega en 15 s es un 409 «reintenta», no una
             transacción colgada dos minutos con la bandeja tomada. LOCAL: vale
             sólo en esta transacción (nunca de sesión en el pooler). */
          await tx.$queryRaw`SELECT set_config('lock_timeout', ${`${ESPERA_LOCKS_MS}ms`}, true)`;
          const listaTx = normalizarAnexos(actual);
          const bandejaTx = await bandejaConfiable(tx, tenantId, listaTx);
          const a = bandejaTx.lista.find((x) => x.id === anexoId);
          if (!a) throw new CtpInvariantError("Ese Anexo 04 ya no está en la bandeja.", "ANEXO_NO_REGISTRABLE", { anexoId });
          /* Una pestaña que llega DESPUÉS de otra (la bandeja se toma con
             `pg_try_advisory_xact_lock`: la que llega DURANTE recibe «otra tanda
             en curso») ve el anexo ya atado. */
          const vig = bandejaTx.vigentes;
          if (bandejaTx.desdeOtraLinea.has(anexoId)) {
            throw new CtpInvariantError("El anexo quedó atado a otra línea de Despacho mientras se registraba.", "ANEXO_NO_REGISTRABLE", { anexoId });
          }
          if (anexoRegistrado(a, vig)) {
            return { resultado: { ...base, estado: "ya_registrada", despachos: await ForestCtpGuiaDesdeAnexoDB.lineasDe(tenantId, a, vig, tx) } };
          }
          if (a.reemplazadoPor && listaTx.some((x) => x.id === a.reemplazadoPor)) {
            throw new CtpInvariantError("Este anexo quedó reemplazado mientras se registraba.", "ANEXO_NO_REGISTRABLE", { anexoId });
          }
          await ForestCtpDB.bloquearProduccion(tx, tenantId);
          const misma = await despachosDeLaGuia(tx, tenantId, a.gtf);
          if (misma.length > 0) {
            return {
              resultado: {
                ...base,
                estado: "ya_existe",
                despachos: misma,
                mensaje: `La guía ${a.gtf} entró a Despacho mientras se registraba (línea N° ${misma.map((d) => d.lineNo).join(", ")}).`,
              },
            };
          }
          /* Bajo los locks, la misma propuesta: si el libro cambió desde la
             lectura de afuera, no se registra algo que el operador no vio. */
          const bajoLock = proponerDespachoDeAnexo(a, await estadoDelLibro(tx, tenantId), {
            elecciones,
            claveStock: ForestCtpDB.claveDeStock,
          });
          if (huella(bajoLock) !== huella(propuesta)) {
            throw new CtpInvariantError(
              "El libro cambió mientras se registraba esta guía: revisa la propuesta y vuelve a registrarla.",
              "PROPUESTA_DESACTUALIZADA",
              { anexoId },
            );
          }
          const aBloquear = [...new Set(propuesta.lineas.map((l) => l.origen?.paqueteId).filter((x): x is string => Boolean(x)))];
          if (aBloquear.length > 0) {
            await tx.$queryRaw`
              SELECT "id" FROM "ForestCtpPaquete"
              WHERE "tenantId" = ${tenantId} AND "id" IN (${Prisma.join(aBloquear)})
              ORDER BY "id"
              FOR UPDATE
            `;
          }
          const partidos: PartidoDeMonton[] = [];
          for (const [i, l] of propuesta.lineas.entries()) {
            if (l.origen?.clase !== "monton" || !l.origen.paqueteId || !(l.origen.restoM3 > 0)) continue;
            const partido = await ForestCtpGuiaDesdeAnexoDB.partirMontonEnTx(tx, tenantId, l.origen.paqueteId, l.origenM3, {
              user, cierres, guia: a.gtf,
            });
            partidos.push(partido);
            if (partido.resto) {
              entradas[i] = {
                ...entradas[i],
                observations: `${entradas[i].observations ?? ""} · paquete ${partido.codigo} partido: el resto (${partido.resto.m3} m³) queda como ${partido.resto.codigo}`,
              };
            }
          }
          const creados: CreadoEnTx[] = [];
          for (const [i, e] of entradas.entries()) creados.push(await ForestCtpDB.crearEnTx(tx, tenantId, e, preparados[i], { produccionBloqueada: true }));
          const { lista: nueva, reemplazados } = vincularDespachos(
            listaTx, a.id, creados.map((c) => c.entry.id), user, new Date().toISOString(),
          );
          return {
            valor: nueva,
            resultado: {
              ...base,
              estado: "registrada",
              despachos: creados.map((c, i) => ({
                id: c.entry.id,
                lineNo: c.entry.lineNo,
                especie: propuesta.lineas[i].especie,
                tipo: propuesta.lineas[i].tipo,
                m3: propuesta.lineas[i].m3,
                origenM3: propuesta.lineas[i].origenM3,
                corridaLineNo: propuesta.lineas[i].origen?.lineNo ?? null,
                codigo: propuesta.lineas[i].origen?.codigo ?? null,
              })),
              atribuidoM3: propuesta.atribuidoM3,
              sinAtribuirM3: propuesta.sinAtribuirM3,
              partidos,
              reemplazados: reemplazados.map((r) => r.id),
              usadasTocadas: propuesta.usadasComoOrigen.map((u) => u.corridaId),
              creados,
            },
          };
        },
        user,
        { ...TX_GUIA, soloSiLibre: true },
      );

      if (hecho.estado !== "registrada") return hecho;
      const { creados = [], ...resultado } = hecho;
      /* Después del commit: los renglones de cada línea (y sus orígenes), el de
         cada montón partido y el de la guía. */
      for (const [i, c] of creados.entries()) await ForestCtpDB.despuesDeCrear(tenantId, entradas[i], c);
      for (const p of resultado.partidos.filter((x) => x.resto)) {
        await auditCtpEsperando({
          tenantId,
          action: "ctp_paquete_partido",
          entity: "ForestCtpPaquete",
          entityId: p.paqueteId,
          detail: `Partió el paquete ${p.codigo} de la corrida N° ${p.corridaLineNo} (${m3(p.antesM3)}): ${m3(p.salidaM3)} salieron en la guía ${anexo.gtf}; el resto (${m3(p.resto!.m3)}) queda como ${p.resto!.codigo}`,
          user,
        });
      }
      await auditCtpEsperando({
        tenantId,
        action: "ctp_guia_desde_anexo",
        entity: "ForestAnexo04",
        entityId: anexo.id,
        detail:
          `Registró la guía ${anexo.gtf} desde el ${etiquetaEmision(anexo)}: ${resultado.despachos.length} línea(s) de Despacho · ` +
          `${m3(propuesta.totalM3)} · ${m3(propuesta.atribuidoM3)} con corrida de origen · ${m3(propuesta.sinAtribuirM3)} sin atribuir` +
          (resultado.reemplazados.length ? ` · ${resultado.reemplazados.length} anexo(s) de la misma guía quedan reemplazados` : ""),
        user,
      });
      for (const id of resultado.reemplazados) {
        const r = lista.find((x) => x.id === id);
        await auditCtpEsperando({
          tenantId,
          action: "ctp_anexo04_reemplazado",
          entity: "ForestAnexo04",
          entityId: id,
          detail: `El ${r ? etiquetaEmision(r) : "anexo"} queda reemplazado por el ${etiquetaEmision(anexo)} (misma guía): no se borra, no se registra`,
          user,
        });
      }
      try {
        invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
      } catch (err) {
        logger.error("[guia-desde-anexo] invalidar caché falló", { error: String(err) });
      }
      return resultado;
    } catch (err) {
      return comoResultado(base, err);
    }
  }

  /** Las líneas vivas que registraron un anexo. */
  private static async lineasDe(
    tenantId: string,
    anexo: AnexoEmitido,
    vigentes: ReadonlySet<string>,
    client: Lector = prisma,
  ): Promise<{ id: string; lineNo: number }[]> {
    const ids = [...(anexo.despachoIds ?? []), ...(anexo.ctpEntryId ? [anexo.ctpEntryId] : [])].filter((id) => vigentes.has(id));
    if (ids.length === 0) return [];
    return client.forestCtpEntry.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, lineNo: true }, orderBy: { lineNo: "asc" } });
  }

  /**
   * Devuelve a Productos disponibles el resto de corridas marcadas «usado»
   * (decisión 6), SÓLO si: la corrida sigue marcada, le queda al menos un
   * resto de verdad (5 litros), y ninguna guía todavía pendiente la propone
   * como origen — si no, ofrecería madera que otra guía ya se llevó.
   */
  static async liberarUsadas(
    tenantId: string,
    /** Las que el dueño pide a mano (p. ej. una del mismo inventario que ninguna guía tocó). */
    pedidas: readonly string[],
    user: string,
  ): Promise<{ liberadas: UsadaLiberada[]; noLiberadas: ResultadoTanda["noLiberadas"] }> {
    if (!tenantId) throw new Error("tenantId is required");
    const liberadas: UsadaLiberada[] = [];
    const noLiberadas: ResultadoTanda["noLiberadas"] = [];

    const { lista, vigentes } = await bandejaConfiable(prisma, tenantId, await ForestAnexosDB.list(tenantId));
    const registrados = [...new Set(lista.flatMap((a) => (a.despachoIds ?? []).filter((id) => vigentes.has(id))))];
    const origenes = registrados.length
      ? await prisma.forestCtpDespachoOrigen.findMany({
          where: { tenantId, despachoEntryId: { in: registrados }, despacho: VIGENTE },
          select: { produccionEntryId: true },
        })
      : [];
    const automaticas = new Set(origenes.map((o) => o.produccionEntryId));
    const explicitas = new Set(pedidas.filter(Boolean));
    const ids = [...new Set([...automaticas, ...explicitas])];
    if (ids.length === 0) return { liberadas, noLiberadas };

    const estado = await estadoDelLibro(prisma, tenantId);
    const tanda = proponerTanda(clasificarAnexos(lista, vigentes).pendientes, estado, { claveStock: ForestCtpDB.claveDeStock });
    const enPendientes = new Set(tanda.guias.flatMap((g) => g.lineas.map((l) => l.origen?.corridaId).filter((x): x is string => Boolean(x))));
    const cierres = await ForestCtpCierreDB.list(tenantId);

    for (const id of ids) {
      const c = estado.corridas.find((x) => x.id === id);
      const motivo = !c
        ? "no es una corrida viva de esta tienda"
        : !c.usado
          ? "no está marcada «usado»"
          : c.disponibleM3 < TOL_RESTO_M3
            ? "no le queda resto"
            : enPendientes.has(id)
              ? "todavía la usa una guía sin registrar"
              : null;
      if (motivo || !c) {
        /* De las automáticas sólo se cuenta lo que importa: una corrida que no
           está «usado» no tiene nada que liberar y no es un aviso. */
        if (explicitas.has(id) || c?.usado) {
          noLiberadas.push({ corridaId: id, lineNo: c?.lineNo ?? null, motivo: motivo ?? "no existe" });
        }
        continue;
      }
      const hecho = await prisma.forestCtpEntry.updateMany({
        where: { tenantId, id, section: "produccion", usadoAt: { not: null } },
        data: { usadoAt: null, usadoPor: null, usadoMotivo: null },
      });
      if (hecho.count === 0) {
        noLiberadas.push({ corridaId: id, lineNo: c.lineNo, motivo: "otro la desmarcó antes" });
        continue;
      }
      const cerrado = closedPeriodOf(cierres, new Date(`${c.fecha}T12:00:00.000Z`));
      liberadas.push({ corridaId: id, lineNo: c.lineNo, restoM3: c.disponibleM3 });
      await auditCtpEsperando({
        tenantId,
        action: "ctp_linea_desmarcar_usado",
        entity: "ForestCtpEntry",
        entityId: id,
        detail:
          `Desmarcó «usado» la corrida N° ${c.lineNo}: las guías registradas desde su Anexo 04 explican lo que salió; ` +
          `el resto (${m3(c.disponibleM3)}) vuelve a Productos disponibles` +
          (cerrado ? ` · la línea está fechada en ${cerrado.label}, período CERRADO (la marca no altera el acta)` : ""),
        user,
      });
    }
    if (liberadas.length > 0) {
      try {
        invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
      } catch (err) {
        logger.error("[guia-desde-anexo] invalidar caché falló", { error: String(err) });
      }
    }
    return { liberadas, noLiberadas };
  }
}
