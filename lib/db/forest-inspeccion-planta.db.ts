import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { ForestPatioConteoDB } from "@/lib/db/forest-patio-conteo.db";
import type { ResumenActaConteo } from "@/lib/forestal/conteo-patio-guardado";
import { editarInspeccionSchema, type EditarInspeccion } from "@/lib/superadmin/plantas-forestales/schemas";
import type {
  ConteoAserrada,
  EstadoInspeccion,
  FotoDelLibro,
  HallazgoInspeccion,
  InspeccionPlanta,
  InspeccionResumen,
} from "@/lib/superadmin/plantas-forestales/tipos";

/**
 * ForestInspeccionPlantaDB — las inspecciones de planta del superadmin
 * (ADR-498, fase 3 de «Plantas forestales», Brandon 17-10).
 *
 * Es un ACTA: no mueve saldos ni la frena el cierre. Al abrirla se congela el
 * libro (`libro` = `FotoDelLibro`); lo que el inspector cuenta y anota se
 * compara contra ESO, no contra el libro de hoy.
 *
 * Máquina de estados: abierta → cerrada → anulada, o abierta → anulada. Sólo
 * «abierta» se edita o se cierra; anular vale desde abierta o cerrada (el acta
 * firmada no se borra: queda anulada con su motivo). La guardia va en el mismo
 * UPDATE (`WHERE estado = …`): dos pestañas a la vez no la saltean.
 *
 * El conteo de trozas se guarda IGUAL que el de la planta (`ForestPatioConteoDB
 * .guardar`, idempotente por `iniciadoEn`) y la inspección guarda su id y una
 * copia de su resumen (`trozas`): la lista no relee el acta y el acta cerrada
 * no cambia si la tablet re-sube el conteo después.
 *
 * Los JSON se validan al LEER con `safeParse`: una fila o un elemento roto se
 * reporta en el log y no tumba la lista. Toda lectura y escritura lleva
 * `tenantId` (el de la PLANTA) en el WHERE; `ultimaPorPlanta` es la única que
 * cruza negocios y la usa sólo la lista del superadmin.
 */

const CACHE_PREFIX = "forest-inspeccion-planta";
const TTL_LISTA_SEG = 30;
const TTL_ULTIMA_SEG = 60;

/** Tope de la lista por planta: años de inspecciones mensuales. */
export const LIMITE_INSPECCIONES = 100;

export const ESTADOS_INSPECCION: readonly EstadoInspeccion[] = ["abierta", "cerrada", "anulada"];

export type AccionInspeccion = "editar" | "cerrar" | "anular";

/** Desde qué estados se puede cada acción. */
const DESDE: Record<AccionInspeccion, readonly EstadoInspeccion[]> = {
  editar: ["abierta"],
  cerrar: ["abierta"],
  anular: ["abierta", "cerrada"],
};

export function transicionPermitida(accion: AccionInspeccion, estado: EstadoInspeccion): boolean {
  return DESDE[accion].includes(estado);
}

export type CodigoErrorInspeccion = "no_editable" | "datos_invalidos" | "corrupta";

/** Error tipado: la ruta lo devuelve con `status` tal cual. */
export class InspeccionError extends Error {
  constructor(
    readonly codigo: CodigoErrorInspeccion,
    message: string,
    readonly status: 409 | 422 | 500,
    readonly estado?: EstadoInspeccion,
  ) {
    super(message);
    this.name = "InspeccionError";
  }
}

const MENSAJE_NO_EDITABLE: Record<EstadoInspeccion, string> = {
  abierta: "La inspección está abierta.",
  cerrada: "La inspección ya está cerrada: no se puede cambiar.",
  anulada: "La inspección está anulada: no se puede cambiar.",
};

function noEditable(estado: EstadoInspeccion): InspeccionError {
  return new InspeccionError("no_editable", MENSAJE_NO_EDITABLE[estado], 409, estado);
}

// ── Lectura de los JSON (safeParse; lo roto se reporta, no rompe) ─────────────

/** Las mismas reglas con las que la ruta acepta hallazgos y aserrada. */
const hallazgoSchema = editarInspeccionSchema.shape.hallazgos.unwrap().element;
const conteoAserradaSchema = editarInspeccionSchema.shape.aserrada.unwrap().element;

const estadoSchema = z.enum(["abierta", "cerrada", "anulada"]);

const trozasSchema = z.object({
  esperadas: z.number().int().nonnegative(),
  contadas: z.number().int().nonnegative(),
  m3Esperado: z.number().nullable(),
  m3Contado: z.number().nullable(),
  faltantes: z.number().int().nonnegative(),
  sobrantes: z.number().int().nonnegative(),
});

export type TrozasInspeccion = NonNullable<InspeccionPlanta["trozas"]>;

/**
 * La foto del libro: se valida la forma de arriba (cuándo se tomó, las cuatro
 * lecturas — `null` = esa lectura falló al abrir — y el conteo de
 * incoherencias). El detalle de cada lectura lo escribió `resumen.server` con
 * los tipos de `tipos.ts`.
 */
const lecturaSchema = z.record(z.string(), z.unknown()).nullable();
const libroSchema = z.object({
  tomadaEn: z.string().min(1),
  trozas: lecturaSchema,
  aserrada: lecturaSchema,
  movimiento: lecturaSchema,
  incoherencias: z.object({
    error: z.number(),
    warning: z.number(),
    info: z.number(),
    m3EnJuego: z.number(),
  }),
});

export function leerLibro(raw: unknown): FotoDelLibro | null {
  const r = libroSchema.safeParse(raw);
  return r.success ? (raw as FotoDelLibro) : null;
}

/** Una lista JSON elemento por elemento: lo válido se queda, lo roto se cuenta. */
function leerLista<T>(raw: unknown, esquema: z.ZodType<T>): { validos: T[]; rotos: number } {
  if (!Array.isArray(raw)) return { validos: [], rotos: raw == null ? 0 : 1 };
  const validos: T[] = [];
  let rotos = 0;
  for (const item of raw) {
    const r = esquema.safeParse(item);
    if (r.success) validos.push(r.data);
    else rotos++;
  }
  return { validos, rotos };
}

export function leerHallazgos(raw: unknown): { validos: HallazgoInspeccion[]; rotos: number } {
  return leerLista<HallazgoInspeccion>(raw, hallazgoSchema);
}

export function leerAserrada(raw: unknown): { validos: ConteoAserrada[]; rotos: number } {
  return leerLista<ConteoAserrada>(raw, conteoAserradaSchema);
}

/** La copia del acta del conteo; sin conteo o rota = `null` (nunca 0). */
export function leerTrozas(raw: unknown): TrozasInspeccion | null {
  if (raw == null) return null;
  const r = trozasSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** El resumen del acta del conteo que se copia en la inspección. */
export function trozasDeActa(
  acta: Pick<ResumenActaConteo, "esperadas" | "contadas" | "faltan" | "sobrantes" | "m3Esperado" | "m3Contado">,
): TrozasInspeccion {
  return {
    esperadas: acta.esperadas,
    contadas: acta.contadas,
    m3Esperado: acta.m3Esperado,
    m3Contado: acta.m3Contado,
    faltantes: acta.faltan,
    sobrantes: acta.sobrantes,
  };
}

/** Faltantes de trozas del resumen: de la copia guardada; sin conteo = `null`. */
export function faltantesDeTrozas(raw: unknown): number | null {
  return leerTrozas(raw)?.faltantes ?? null;
}

// ── Filas → respuesta ─────────────────────────────────────────────────────────

const dia = (d: Date) => d.toISOString().slice(0, 10);
const isoONulo = (d: Date | null) => (d ? d.toISOString() : null);

/** Lo que la lista lee (sin `libro` ni `aserrada`: pesan y la lista no los usa). */
export interface FilaResumen {
  id: string;
  fecha: Date;
  inspector: string;
  estado: string;
  hallazgos: unknown;
  trozas: unknown;
}

export interface FilaInspeccion extends FilaResumen {
  tenantId: string;
  libro: unknown;
  conteoPatioId: string | null;
  aserrada: unknown;
  conclusion: string | null;
  responsablePlanta: string | null;
  notas: string | null;
  motivoAnulacion: string | null;
  cerradaAt: Date | null;
  anuladaAt: Date | null;
}

/** La inspección completa más lo que `tipos.ts` todavía no declara. */
export type InspeccionDetalle = InspeccionPlanta & {
  notas: string | null;
  motivoAnulacion: string | null;
  anuladaAt: string | null;
  /** Elementos de `hallazgos`/`aserrada` que no pasaron el Zod (se omiten). */
  rotos: number;
};

/** `null` = fila con estado desconocido (la lista la reporta y la saltea). */
export function aResumen(f: FilaResumen): InspeccionResumen | null {
  const estado = estadoSchema.safeParse(f.estado);
  if (!estado.success) return null;
  return {
    id: f.id,
    fecha: dia(f.fecha),
    inspector: f.inspector,
    estado: estado.data,
    hallazgos: leerHallazgos(f.hallazgos).validos.length,
    faltantesTrozas: faltantesDeTrozas(f.trozas),
  };
}

/** Lanza `InspeccionError("corrupta")` si el estado o el libro no se pueden leer. */
export function aInspeccion(f: FilaInspeccion): InspeccionDetalle {
  const resumen = aResumen(f);
  const libro = leerLibro(f.libro);
  if (!resumen || !libro) {
    throw new InspeccionError(
      "corrupta",
      `La inspección ${f.id} tiene ${resumen ? "el libro congelado" : "el estado"} ilegible.`,
      500,
    );
  }
  const hallazgos = leerHallazgos(f.hallazgos);
  const aserrada = leerAserrada(f.aserrada);
  return {
    ...resumen,
    tenantId: f.tenantId,
    libro,
    conteoPatioId: f.conteoPatioId,
    trozas: leerTrozas(f.trozas),
    aserrada: aserrada.validos,
    hallazgosDetalle: hallazgos.validos,
    conclusion: f.conclusion,
    responsablePlanta: f.responsablePlanta,
    cerradaAt: isoONulo(f.cerradaAt),
    notas: f.notas,
    motivoAnulacion: f.motivoAnulacion,
    anuladaAt: isoONulo(f.anuladaAt),
    rotos: hallazgos.rotos + aserrada.rotos,
  };
}

const SELECT_RESUMEN = {
  id: true,
  fecha: true,
  inspector: true,
  estado: true,
  hallazgos: true,
  trozas: true,
} satisfies Prisma.ForestInspeccionPlantaSelect;

const texto = (v: string | undefined) => (v === undefined ? undefined : v.trim() || null);
const json = (v: unknown) => v as Prisma.InputJsonValue;

function invalidar(tenantId: string): void {
  invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}:`);
  invalidateByPrefix(`${CACHE_PREFIX}:ultima:`);
}

function auditar(tenantId: string, accion: string, id: string, detalle: string, usuario: string): void {
  logActivity(accion, "ForestInspeccionPlanta", detalle, id, usuario, undefined, tenantId).catch((err) =>
    logger.error("[forest-inspeccion-planta] audit failed", { error: String(err), accion, id }),
  );
}

/** El UPDATE condicional no tocó nada: o no existe (null) o cambió de estado (409). */
async function rechazoDeCarrera(tenantId: string, id: string): Promise<null> {
  const ahora = await prisma.forestInspeccionPlanta.findFirst({ where: { tenantId, id }, select: { estado: true } });
  if (!ahora) return null;
  const estado = estadoSchema.safeParse(ahora.estado);
  if (!estado.success) throw new InspeccionError("corrupta", `La inspección ${id} tiene el estado ilegible.`, 500);
  throw noEditable(estado.data);
}

/** Cambios que `editar` acepta (cerrar y anular son métodos aparte). */
export type CambiosInspeccion = Omit<EditarInspeccion, "cerrar" | "anular">;

export const ForestInspeccionPlantaDB = {
  async listar(tenantId: string, limite = LIMITE_INSPECCIONES): Promise<InspeccionResumen[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const n = Math.min(Math.max(1, Math.trunc(limite)), LIMITE_INSPECCIONES);
    return getOrSet(`${CACHE_PREFIX}:${tenantId}:lista:${n}`, TTL_LISTA_SEG, async () => {
      const filas = await prisma.forestInspeccionPlanta.findMany({
        where: { tenantId },
        select: SELECT_RESUMEN,
        orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
        take: n,
      });
      const salida: InspeccionResumen[] = [];
      for (const f of filas) {
        const r = aResumen(f);
        if (r) salida.push(r);
        else logger.error("[forest-inspeccion-planta] fila con estado ilegible", { tenantId, id: f.id, estado: f.estado });
      }
      return salida;
    });
  },

  /** `null` = no existe en ESTA planta. Libro o estado ilegible → `InspeccionError` 500. */
  async obtener(tenantId: string, id: string): Promise<InspeccionDetalle | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const f = await prisma.forestInspeccionPlanta.findFirst({ where: { tenantId, id } });
    if (!f) return null;
    const detalle = aInspeccion(f);
    if (detalle.rotos > 0) {
      logger.warn("[forest-inspeccion-planta] elementos ilegibles omitidos", { tenantId, id, rotos: detalle.rotos });
    }
    return detalle;
  },

  async crear(
    tenantId: string,
    datos: { fecha: string; inspector: string; libro: FotoDelLibro; notas?: string },
    usuario?: string,
  ): Promise<InspeccionDetalle> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha)) {
      throw new InspeccionError("datos_invalidos", "Usa una fecha AAAA-MM-DD.", 422);
    }
    if (!leerLibro(datos.libro)) {
      throw new InspeccionError("datos_invalidos", "La foto del libro no tiene la forma esperada.", 422);
    }
    const inspector = datos.inspector.trim();
    if (!inspector) throw new InspeccionError("datos_invalidos", "Falta quién inspecciona.", 422);
    const f = await prisma.forestInspeccionPlanta.create({
      data: {
        tenantId,
        fecha: new Date(`${datos.fecha}T00:00:00.000Z`),
        inspector,
        libro: json(datos.libro),
        notas: texto(datos.notas) ?? null,
      },
    });
    invalidar(tenantId);
    auditar(tenantId, "inspeccion.crear", f.id, `Inspección del ${datos.fecha} abierta por ${inspector}`, usuario ?? inspector);
    return aInspeccion(f);
  },

  /**
   * Edita una inspección ABIERTA. Cerrada o anulada → `InspeccionError` 409 (y
   * el conteo NO se guarda). `null` = no existe en esta planta.
   *
   * Con `conteoPatio`: se guarda primero como acta del patio de la planta y la
   * inspección se queda con su id y su resumen. Si alguien la cierra entre las
   * dos escrituras, el acta del conteo queda guardada (es un conteo real) y
   * esta edición responde 409.
   */
  async editar(
    tenantId: string,
    id: string,
    cambios: CambiosInspeccion,
    usuario?: string,
  ): Promise<InspeccionDetalle | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const actual = await prisma.forestInspeccionPlanta.findFirst({
      where: { tenantId, id },
      select: { estado: true, inspector: true },
    });
    if (!actual) return null;
    const estado = estadoSchema.safeParse(actual.estado);
    if (!estado.success) throw new InspeccionError("corrupta", `La inspección ${id} tiene el estado ilegible.`, 500);
    if (!transicionPermitida("editar", estado.data)) throw noEditable(estado.data);

    const quien = usuario ?? actual.inspector;
    const data: Prisma.ForestInspeccionPlantaUpdateManyMutationInput = {};
    if (cambios.hallazgos !== undefined) data.hallazgos = json(cambios.hallazgos);
    if (cambios.aserrada !== undefined) data.aserrada = json(cambios.aserrada);
    if (cambios.conclusion !== undefined) data.conclusion = texto(cambios.conclusion);
    if (cambios.responsablePlanta !== undefined) data.responsablePlanta = texto(cambios.responsablePlanta);
    if (cambios.conteoPatio) {
      const { acta } = await ForestPatioConteoDB.guardar(tenantId, { conteo: cambios.conteoPatio }, quien);
      data.conteoPatioId = acta.id;
      data.trozas = json(trozasDeActa(acta));
    }
    if (Object.keys(data).length === 0) return ForestInspeccionPlantaDB.obtener(tenantId, id);

    const r = await prisma.forestInspeccionPlanta.updateMany({ where: { tenantId, id, estado: "abierta" }, data });
    if (r.count === 0) return rechazoDeCarrera(tenantId, id);
    invalidar(tenantId);
    auditar(tenantId, "inspeccion.editar", id, `Cambió: ${Object.keys(data).join(", ")}`, quien);
    return ForestInspeccionPlantaDB.obtener(tenantId, id);
  },

  async cerrar(tenantId: string, id: string, usuario?: string): Promise<InspeccionDetalle | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const r = await prisma.forestInspeccionPlanta.updateMany({
      where: { tenantId, id, estado: { in: [...DESDE.cerrar] } },
      data: { estado: "cerrada", cerradaAt: new Date() },
    });
    if (r.count === 0) return rechazoDeCarrera(tenantId, id);
    invalidar(tenantId);
    auditar(tenantId, "inspeccion.cerrar", id, "Inspección cerrada", usuario ?? "superadmin");
    return ForestInspeccionPlantaDB.obtener(tenantId, id);
  },

  async anular(tenantId: string, id: string, motivo: string, usuario?: string): Promise<InspeccionDetalle | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const m = motivo.trim();
    if (m.length < 5) throw new InspeccionError("datos_invalidos", "Escribe el motivo (mínimo 5 letras).", 422);
    const r = await prisma.forestInspeccionPlanta.updateMany({
      where: { tenantId, id, estado: { in: [...DESDE.anular] } },
      data: { estado: "anulada", motivoAnulacion: m, anuladaAt: new Date() },
    });
    if (r.count === 0) return rechazoDeCarrera(tenantId, id);
    invalidar(tenantId);
    auditar(tenantId, "inspeccion.anular", id, `Inspección anulada: ${m}`, usuario ?? "superadmin");
    return ForestInspeccionPlantaDB.obtener(tenantId, id);
  },

  /**
   * La última inspección NO anulada de cada planta, en UNA consulta. Única
   * lectura que cruza negocios: la usa la lista de plantas del superadmin.
   * Planta sin inspecciones = no aparece en el resultado.
   */
  async ultimaPorPlanta(
    tenantIds: string[],
  ): Promise<Record<string, { id: string; fecha: string; estado: EstadoInspeccion }>> {
    const ids = [...new Set(tenantIds.filter(Boolean))].sort();
    if (ids.length === 0) return {};
    const huella = createHash("sha1").update(ids.join(",")).digest("hex").slice(0, 16);
    return getOrSet(`${CACHE_PREFIX}:ultima:${huella}`, TTL_ULTIMA_SEG, async () => {
      const filas = await prisma.$queryRawUnsafe<{ tenantId: string; id: string; fecha: string; estado: string }[]>(
        `SELECT DISTINCT ON ("tenantId") "tenantId", "id", to_char("fecha", 'YYYY-MM-DD') AS "fecha", "estado"
           FROM "ForestInspeccionPlanta"
          WHERE "tenantId" = ANY($1::text[]) AND "estado" <> $2
          ORDER BY "tenantId", "fecha" DESC, "createdAt" DESC`,
        ids,
        "anulada",
      );
      const salida: Record<string, { id: string; fecha: string; estado: EstadoInspeccion }> = {};
      for (const f of filas) {
        const estado = estadoSchema.safeParse(f.estado);
        if (estado.success) salida[f.tenantId] = { id: f.id, fecha: f.fecha, estado: estado.data };
        else logger.error("[forest-inspeccion-planta] fila con estado ilegible", { tenantId: f.tenantId, id: f.id });
      }
      return salida;
    });
  },

};
