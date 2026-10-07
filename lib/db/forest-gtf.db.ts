/**
 * ForestGtfDB — Guía de Transporte Forestal (GTF), ADR-126 Fase 4. Interna, no oficial.
 * Patrón Buleje: tenantId 1er param · cache invalidate.
 */
import { prisma } from "@/lib/prisma";
import { claveFilaGTF, filasGTF, totalizarGTF } from "@/lib/forestal/gtf-redondeo";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { auditLoth } from "@/lib/forestal/loth-audit";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { claveNumeroGtf, colaDeGtf, mismoNumeroGtf } from "@/lib/forestal/gtf-talonario";
import { chocanEnElLibro, elegirGuiaDelDueno, puedeSerDelDueno, type IdentidadDeGuiaBuscada } from "@/lib/forestal/loth-talonario";
import { leerGtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import type { FiltroPermiso } from "@/lib/forestal/loth-filtro-permiso";
import type { GtfUsadaLoth } from "@/lib/forestal/loth-talonario";
import { identidadDeGuiaTh, soloDigitos } from "@/lib/forestal/guia-th-al-ctp";
import { ForestCtpFichaDB } from "./forest-ctp-ficha.db";
import { ESTADOS_SIN_INGRESO, GtfNumeroDB } from "./gtf-numero.db";

const CACHE_PREFIX = "forest-gtf";

export type EstadoCtpDeGuia = "ingresada" | "por_ingresar" | "otra_empresa";

type IngresoVivo = { gtfNumber: string | null; providerName: string; originCode: string | null };

/** Los ingresos vivos del CTP agrupados por N° de guía normalizado (tramo a tramo). */
function indexarIngresos(entries: readonly IngresoVivo[]) {
  const porClave = new Map<string, IngresoVivo[]>();
  for (const e of entries) {
    const k = claveNumeroGtf(e.gtfNumber);
    if (k) porClave.set(k, [...(porClave.get(k) ?? []), e]);
  }
  return porClave;
}

/* Ingresada = un ingreso vivo con su N° Y del mismo titular o permiso: el
   N° solo no identifica la guía (dos titulares comparten 019-001). */
function tieneIngresoVivo(
  porClave: Map<string, IngresoVivo[]>,
  g: { gtfNumber: string; titularName: string | null; tituloHabilitante: string | null },
): boolean {
  const mismos = porClave.get(claveNumeroGtf(g.gtfNumber) ?? "") ?? [];
  return mismos.some((e) =>
    puedeSerDelDueno({ titular: e.providerName, permiso: e.originCode }, { titular: g.titularName, permiso: g.tituloHabilitante }),
  );
}

/**
 * Se intentó registrar una GTF con un número que ya existe. Es dato del operador
 * (una GTF no se anota dos veces), no un fallo del server → el route lo mapea a 409.
 */
export class GtfDuplicateError extends Error {
  constructor(readonly gtfNumber: string, readonly titular?: string | null) {
    super(
      `Ya existe una GTF registrada con el número ${gtfNumber}${titular?.trim() ? ` de ${titular.trim()}` : ""}. Una guía no se anota dos veces.`,
    );
    this.name = "GtfDuplicateError";
  }
}

/** De quién es la guía que se quiere anotar (para saber si su N° choca). */
export interface DuenoDeGuia {
  titular: string | null;
  permiso: string | null;
  planId: string | null;
}

/**
 * La GTF transporta una o más especies que no están autorizadas en el plan de
 * manejo (POA). Es la 2ª barrera después de T7 (que ya frena el despacho): un
 * fiscalizador cruza la guía contra la resolución. Dato del operador → el route
 * lo mapea a 422.
 */
export class GtfSpeciesNotAuthorizedError extends Error {
  constructor(readonly species: string[]) {
    super(
      `La GTF incluye especie(s) no autorizada(s) en el plan de manejo: ${species.join(", ")}. ` +
        `Movilizar una especie fuera del POA es infracción — corrige la guía o el plan antes de emitirla.`,
    );
    this.name = "GtfSpeciesNotAuthorizedError";
  }
}

export interface GtfItem {
  code?: string | null;
  species?: string | null;
  scientific?: string | null;
  cites?: boolean;
  diamMayorM?: number | null;
  diamMenorM?: number | null;
  lengthM?: number | null;
  volumeM3?: number | null;
  productType?: string | null;
  pieces?: number | null;
  quantity?: number | null;
  unit?: string | null;
}

export interface GtfInput {
  planId?: string | null;
  gtfNumber: string;
  gtfDate?: Date | null;
  tipo?: string;
  titularName?: string | null;
  tituloHabilitante?: string | null;
  parcelaCorta?: string | null;
  transportista?: string | null;
  transportistaDoc?: string | null;
  conductor?: string | null;
  conductorLicencia?: string | null;
  placaVehiculo?: string | null;
  origen?: string | null;
  destino?: string | null;
  items: GtfItem[];
  observations?: string | null;
  createdBy: string;
}

/**
 * El `where` del listado por permiso. Mismo criterio que `cumplePermiso` del libro:
 * plan → sólo ése (con `conSinPlan`, también las guías sin plan) · sin-plan → `planId null`.
 * Siempre con `tenantId` y sin dadas de baja.
 */
export function dondeDelPermiso(tenantId: string, permiso?: FiltroPermiso | null) {
  const base = { tenantId, deletedAt: null };
  if (!permiso) return base;
  if (permiso.tipo === "sin-plan") return { ...base, planId: null };
  if (permiso.conSinPlan) return { ...base, OR: [{ planId: permiso.planId }, { planId: null }] };
  return { ...base, planId: permiso.planId };
}

export class ForestGtfDB {
  /**
   * Emite (registra) una GTF. Guard de UNICIDAD: no se puede anotar dos veces la
   * misma GTF (integridad de la cadena de custodia — un fiscalizador que ve el
   * mismo N° dos veces no puede cruzar el documento). Se serializa con un
   * `pg_advisory_xact_lock` sobre (tenant, número): a diferencia de un `FOR
   * UPDATE`, el advisory lock protege también contra dos INSERT concurrentes del
   * MISMO número nuevo (no hay fila que lockear todavía) sin necesidad de una
   * constraint única en la tabla (aislamiento app-level).
   */
  static async create(tenantId: string, input: GtfInput) {
    if (!tenantId) throw new Error("tenantId is required");
    const num = input.gtfNumber?.trim();
    if (!num) throw new Error("gtfNumber is required");
    const items = input.items ?? [];

    // Barrera de especie autorizada (2ª, tras T7 en el despacho): si la GTF se
    // emite contra un plan que declara especies, ninguna especie transportada
    // puede caer fuera del POA. Sin plan atado, o plan sin especies, no se juzga.
    if (input.planId) {
      const autorizadas = await prisma.forestPlanSpecies.findMany({
        where: { tenantId, planId: input.planId, deletedAt: null },
        select: { speciesCommon: true },
      });
      if (autorizadas.length > 0) {
        /* `claveEspecie` y NO un `trim().toLowerCase()` propio. Esta comparación
           decide si se ACUSA a una especie de estar fuera del POA, y un plan que
           dice «TORNILLO (Cedrelinga cateniformis)» contra una troza que dice
           «TORNILLO» —o una tilde de diferencia en «Ishpíngo»— daba una
           infracción forestal que no existe, con la guía bloqueada. Es la misma
           función que ya usan el balance del plan y `speciesKey`. */
        const set = new Set(autorizadas.map((s) => claveEspecie(s.speciesCommon)));
        const fuera = [
          ...new Set(
            items
              .map((it) => it.species?.trim())
              .filter((s): s is string => !!s)
              .filter((s) => !set.has(claveEspecie(s))),
          ),
        ];
        if (fuera.length > 0) throw new GtfSpeciesNotAuthorizedError(fuera);
      }
    }

    /* El total de la guía es la SUMA de sus filas (científico + tipo), cada una
       redondeada a 3 decimales HALF_UP — la regla de la GTF (2026-10-03:
       sumando crudo la guía real daba 31,185 y SERFOR dice 31,188). */
    const volumenTotal = totalizarGTF(
      filasGTF(
        items,
        (it) => claveFilaGTF({ cientifico: it.scientific, comun: it.species, tipo: it.productType, unidad: it.unit }),
        (it) => it.volumeM3 ?? it.quantity ?? 0,
      ),
    ).m3;
    const piezas = items.reduce((a, it) => a + Number(it.pieces ?? 0), 0);

    const gtf = await prisma.$transaction(async (tx) => {
      // Serializa por (tenant, N° NORMALIZADO) — cubre el INSERT de un número
      // que aún no existe, y «19-001-65» con «019-001-0000065» esperan el mismo
      // turno (29-09-2026). El mismo candado que Recibir y Anular en el TH.
      await GtfNumeroDB.bloquear(tx, tenantId, num);
      await ForestGtfDB.exigirSinRepetir(tx, tenantId, num, {
        titular: input.titularName?.trim() || null,
        permiso: input.tituloHabilitante?.trim() || null,
        planId: input.planId ?? null,
      });

      return tx.forestGtf.create({
        data: {
          tenantId,
          planId: input.planId ?? null,
          gtfNumber: num,
          gtfDate: input.gtfDate ?? new Date(),
          tipo: input.tipo ?? "trozas",
          titularName: input.titularName?.trim() || null,
          tituloHabilitante: input.tituloHabilitante?.trim() || null,
          parcelaCorta: input.parcelaCorta?.trim() || null,
          transportista: input.transportista?.trim() || null,
          transportistaDoc: input.transportistaDoc?.trim() || null,
          conductor: input.conductor?.trim() || null,
          conductorLicencia: input.conductorLicencia?.trim() || null,
          placaVehiculo: input.placaVehiculo?.trim() || null,
          origen: input.origen?.trim() || null,
          destino: input.destino?.trim() || null,
          items: items as unknown as Prisma.InputJsonValue,
          volumenTotalM3: volumenTotal > 0 ? new Prisma.Decimal(Math.round(volumenTotal * 10000) / 10000) : null,
          piezasTotal: piezas > 0 ? piezas : null,
          observations: input.observations?.trim() || null,
          createdBy: input.createdBy,
        },
      });
    }, { timeout: 15_000 });

    auditLoth({
      tenantId,
      action: "loth_gtf_create",
      entity: "ForestGtf",
      entityId: gtf.id,
      detail: `Emitió la GTF ${gtf.gtfNumber} (${gtf.tipo}${gtf.destino ? ` → ${gtf.destino}` : ""})`,
      user: input.createdBy,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }
    return gtf;
  }

  /**
   * Frena un N° que este libro ya usó en el MISMO talonario. Va DENTRO de la
   * transacción, después de `GtfNumeroDB.bloquear`.
   *
   * Los talonarios son del titular (Blas: la Ficha del CTP va por 054…064 en
   * 19-001 y la C.N. Santa Rosa de Chivis usó 019-001-0000003/4 el mismo mes):
   * el mismo N° de OTRO titular es otra guía y no frena. Choca si es del mismo
   * titular (plan, título o nombre escrito como sea) o si a una de las dos le
   * falta el titular — por las dudas. Anuladas incluidas: un N° que se usó no
   * vuelve. El N° se compara tramo a tramo (`019-001-0000065` ≡ `19-001-65`).
   */
  static async exigirSinRepetir(tx: Prisma.TransactionClient, tenantId: string, gtfNumber: string, dueno: DuenoDeGuia) {
    if (!tenantId) throw new Error("tenantId is required");
    const cola = colaDeGtf(gtfNumber);
    if (!cola) return;
    const candidatas = await tx.forestGtf.findMany({
      where: { tenantId, deletedAt: null, gtfNumber: { endsWith: cola } },
      select: { gtfNumber: true, titularName: true, tituloHabilitante: true, planId: true },
    });
    const choque = candidatas.find(
      (g) =>
        mismoNumeroGtf(g.gtfNumber, gtfNumber) &&
        chocanEnElLibro(dueno, { titular: g.titularName, permiso: g.tituloHabilitante, planId: g.planId }),
    );
    if (choque) throw new GtfDuplicateError(choque.gtfNumber, choque.titularName);
  }

  /**
   * Sugiere el siguiente número correlativo a partir del MÁXIMO ya registrado que
   * calce con `<serie>-<NNN...>` (parseo del máximo, sin columna/migración nueva —
   * mismo criterio que `emitirGtf` del CTP). El operador puede aceptarlo o pisarlo
   * con el número oficial del SNIFFS. Si no hay serie o ninguna GTF previa con ese
   * patrón, devuelve `<serie>-000001`.
   */
  static async sugerirNumero(tenantId: string, serie: string): Promise<string | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const s = serie.trim();
    if (!s) return null;
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^${escaped}-(\\d+)$`);
    const rows = await prisma.forestGtf.findMany({
      where: { tenantId, deletedAt: null, gtfNumber: { startsWith: `${s}-` } },
      select: { gtfNumber: true },
    });
    let maxN = 0;
    let width = 6;
    for (const r of rows) {
      const m = r.gtfNumber.match(re);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxN) maxN = n;
        width = Math.max(width, m[1].length);
      }
    }
    return `${s}-${String(maxN + 1).padStart(width, "0")}`;
  }

  /**
   * Los N° usados en este libro CON de quién son —anuladas incluidas: un N° de
   * talonario que se usó no vuelve—: titular, título, plan y los N° de lista
   * de trozas que llevó cada guía (el (35)). El talonario por región los
   * filtra por titular —dos titulares de Pasco comparten la serie 019-001— y
   * la lista sigue su propio correlativo (29-09-2026).
   *
   * El (35) se lee del JSON en la consulta: traer `gtfDatos` entero de 2000
   * guías para leer un campo sería pesado en cada apertura del modal.
   */
  static async usadasConDueno(tenantId: string): Promise<GtfUsadaLoth[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const rows = await prisma.$queryRaw<
      {
        gtfNumber: string;
        gtfDate: Date | null;
        status: string;
        titularName: string | null;
        tituloHabilitante: string | null;
        planId: string | null;
        listas: string | null;
      }[]
    >`
      SELECT "gtfNumber", "gtfDate", "status", "titularName", "tituloHabilitante", "planId",
             "gtfDatos"->'guia'->>'listaTrozasNro' AS "listas"
      FROM "ForestGtf"
      WHERE "tenantId" = ${tenantId} AND "deletedAt" IS NULL
      ORDER BY "createdAt" DESC
      LIMIT 2000`;
    return rows.map((r) => ({
      numero: r.gtfNumber,
      fuente: r.status === "anulada" ? ("despacho_anulado" as const) : ("despacho" as const),
      fecha: r.gtfDate ? r.gtfDate.toISOString().slice(0, 10) : null,
      titular: r.titularName,
      permiso: r.tituloHabilitante,
      planId: r.planId,
      listas: r.listas,
    }));
  }

  /**
   * Los N° de las guías que ya entraron al Libro CTP como ingresos
   * (`WoodEntry`), con su titular, su título y su N° de lista tal como los
   * publicó SERFOR (`serforGtf`; si el ingreso se tipeó a mano, el proveedor y
   * el código de origen). En Blas las 12 GTF reales viven acá: el talonario
   * del Libro TH también las cuenta (29-09-2026).
   *
   * Fuera los borrados y los anulados; un rechazado cuenta: la guía existió y
   * su N° se gastó aunque la madera no se recibiera. Un ingreso por especie
   * repite el N°: se agrupa.
   */
  static async numerosDeIngresos(tenantId: string): Promise<GtfUsadaLoth[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const rows = await prisma.$queryRaw<
      { gtfNumber: string; gtfDate: Date | null; titular: string | null; permiso: string | null; listas: string | null }[]
    >`
      SELECT "gtfNumber",
             MIN("gtfDate") AS "gtfDate",
             COALESCE(NULLIF(TRIM("serforGtf"->>'titular'), ''), "providerName") AS "titular",
             COALESCE(NULLIF(TRIM("serforGtf"->>'numeroTitulo'), ''), "originCode") AS "permiso",
             MAX("serforGtf"->>'listaTrozas') AS "listas"
      FROM "WoodEntry"
      WHERE "tenantId" = ${tenantId} AND "deletedAt" IS NULL AND "status"::text <> 'anulado'
        AND COALESCE(TRIM("gtfNumber"), '') <> ''
      GROUP BY 1, 3, 4
      ORDER BY MAX("createdAt") DESC
      LIMIT 2000`;
    return rows.map((r) => ({
      numero: r.gtfNumber,
      fuente: "ingreso" as const,
      fecha: r.gtfDate ? r.gtfDate.toISOString().slice(0, 10) : null,
      titular: r.titular,
      permiso: r.permiso,
      planId: null,
      listas: r.listas,
    }));
  }

  /**
   * El cuerpo de la última guía emitida con los casilleros completos: de ahí
   * se heredan el destinatario, el transportista, el camión y el chofer, que
   * casi nunca cambian de un viaje al siguiente.
   */
  static async ultimaConDatos(tenantId: string): Promise<unknown | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const g = await prisma.forestGtf.findFirst({
      where: { tenantId, deletedAt: null, status: "emitida", gtfDatos: { not: Prisma.DbNull } },
      orderBy: { createdAt: "desc" },
      select: { gtfDatos: true },
    });
    return g?.gtfDatos ?? null;
  }

  /**
   * `permiso` (02-10-2026): `null`/ausente = todas · `{tipo:"plan"}` = sólo las de ese
   * plan · `{tipo:"sin-plan"}` = las que no citan plan.
   */
  static async list(tenantId: string, permiso?: FiltroPermiso | null) {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.forestGtf.findMany({
      where: dondeDelPermiso(tenantId, permiso),
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  /**
   * Las guías dadas de baja del libro (Brandon 07-10: «otra sección de Anuladas
   * o Rechazadas»): las anuladas y las borradas (`deletedAt`). Sólo lectura,
   * mismo filtro de permiso que `list`. La «fecha de baja» de una anulada es su
   * `updatedAt` (la tabla no guarda la hora de la anulación aparte).
   */
  static async listBajas(tenantId: string, permiso?: FiltroPermiso | null) {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.forestGtf.findMany({
      where: {
        ...dondeDelPermiso(tenantId, permiso),
        deletedAt: undefined,
        AND: [{ OR: [{ status: "anulada" }, { deletedAt: { not: null } }] }],
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
  }

  static async getById(tenantId: string, id: string) {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.forestGtf.findFirst({ where: { tenantId, id, deletedAt: null } });
  }

  /**
   * Guías de trozas EMITIDAS en el Libro de Títulos Habilitantes que todavía no
   * tienen ingreso VIGENTE en el CTP — la bandeja "monte → planta" (rec #9 del
   * QA 2026-07-17: cerrar la trazabilidad sin doble digitación).
   *
   * Un ingreso rechazado o anulado NO cuenta como ingresada: esa madera sigue
   * fuera del libro, así que la guía vuelve a la bandeja hasta registrarse bien.
   * El N° se compara tramo a tramo (`019-001-…` ≡ `19-001-…`, 28-09-2026).
   *
   * La usan también el cron de plazos y el reporte diario: acá NO se esconde
   * nada más (una guía guardada sigue pendiente para ellos). Lo que esconde
   * la bandeja de Ingresos va en `paraLaBandejaDelMonte`.
   */
  static async sinIngresarAlCtp(tenantId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    return (await ForestGtfDB.sinIngresarConDatos(tenantId)).map(({ gtfDatos: _datos, ...g }) => g);
  }

  /**
   * La bandeja «guías del monte sin ingresar» de Ingresos: lo de
   * `sinIngresarAlCtp` menos lo que ya tiene otro camino (28-09-2026):
   *   · las GUARDADAS en el Libro CTP (ADR-442): se reciben desde «guías
   *     guardadas por ingresar», con sus trozas;
   *   · las que dicen el RUC de OTRA empresa como destinatario: esa madera no
   *     viene a esta planta. Sin RUC del destinatario (la GTF corta de antes)
   *     sigue saliendo: no se sabe, y no se esconde.
   */
  static async paraLaBandejaDelMonte(tenantId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const [gtfs, guardadas, ficha] = await Promise.all([
      ForestGtfDB.sinIngresarConDatos(tenantId),
      prisma.forestGuiaGuardada.findMany({
        where: { tenantId, deletedAt: null },
        select: { gtfNumber: true, titularNombre: true, permisoCodigo: true },
        take: 1000,
      }),
      ForestCtpFichaDB.get(tenantId),
    ]);
    const rucPropio = soloDigitos(ficha.ruc);
    return gtfs
      /* La guardada de ESTA guía: mismo N° y mismo titular o permiso (29-09-2026). */
      .filter(
        (g) =>
          !guardadas.some(
            (x) =>
              mismoNumeroGtf(x.gtfNumber, g.gtfNumber) &&
              puedeSerDelDueno({ titular: x.titularNombre, permiso: x.permisoCodigo }, { titular: g.titularName, permiso: g.tituloHabilitante }),
          ),
      )
      .filter((g) => {
        const dest = soloDigitos(leerGtfDatos(g.gtfDatos).destinatario.docNumero);
        return !dest || !rucPropio || dest === rucPropio;
      })
      .map(({ gtfDatos: _datos, ...g }) => g);
  }

  private static async sinIngresarConDatos(tenantId: string) {
    const [gtfs, entries] = await Promise.all([
      prisma.forestGtf.findMany({
        where: { tenantId, deletedAt: null, status: "emitida", tipo: "trozas" },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true, gtfNumber: true, gtfDate: true, titularName: true,
          tituloHabilitante: true, volumenTotalM3: true, piezasTotal: true, origen: true,
          gtfDatos: true,
        },
      }),
      prisma.woodEntry.findMany({
        where: { tenantId, deletedAt: null, status: { notIn: [...ESTADOS_SIN_INGRESO] } },
        select: { gtfNumber: true, providerName: true, originCode: true },
      }),
    ]);
    const porClave = indexarIngresos(entries);
    return gtfs.filter((g) => !tieneIngresoVivo(porClave, g));
  }

  /**
   * Dónde está, respecto del Libro CTP, cada guía de TROZAS emitida de una
   * lista (columna «Estado» del Libro TH, 07-10). No sale de la bandeja
   * (`paraLaBandejaDelMonte`): ésa trae sólo las 100 últimas y esconde las
   * guardadas y las de otra empresa — usarla para decir «ingresada» mentiría.
   *   · ingresada    → tiene un ingreso vivo con su N° y del mismo dueño;
   *   · otra_empresa → el destinatario (casillero) es otro RUC: no viene acá;
   *   · por_ingresar → todavía no entró (aunque esté guardada en el CTP).
   * Producto y anuladas no llevan estado CTP (no están en el mapa).
   */
  static async estadoCtpDeLista(
    tenantId: string,
    gtfs: readonly {
      id: string; gtfNumber: string; tipo: string; status: string;
      titularName: string | null; tituloHabilitante: string | null; gtfDatos?: unknown;
    }[],
  ): Promise<Map<string, EstadoCtpDeGuia>> {
    if (!tenantId) throw new Error("tenantId is required");
    const out = new Map<string, EstadoCtpDeGuia>();
    const trozas = gtfs.filter((g) => g.tipo !== "producto" && g.status !== "anulada");
    if (trozas.length === 0) return out;
    const [entries, ficha] = await Promise.all([
      prisma.woodEntry.findMany({
        where: { tenantId, deletedAt: null, status: { notIn: [...ESTADOS_SIN_INGRESO] } },
        select: { gtfNumber: true, providerName: true, originCode: true },
      }),
      ForestCtpFichaDB.get(tenantId),
    ]);
    const porClave = indexarIngresos(entries);
    const rucPropio = soloDigitos(ficha.ruc);
    for (const g of trozas) {
      if (tieneIngresoVivo(porClave, g)) {
        out.set(g.id, "ingresada");
        continue;
      }
      const dest = soloDigitos(leerGtfDatos(g.gtfDatos).destinatario.docNumero);
      out.set(g.id, dest && rucPropio && dest !== rucPropio ? "otra_empresa" : "por_ingresar");
    }
    return out;
  }

  /**
   * Busca una guía por su número (para importar sus datos al ingreso CTP),
   * tramo a tramo. El N° solo no identifica la guía (29-09-2026): con
   * `identidad`, la del mismo titular o permiso; con dos de dueños distintos y
   * sin con qué elegir, «ambigua» — nunca la primera.
   */
  static async findByNumber(tenantId: string, gtfNumber: string, identidad?: IdentidadDeGuiaBuscada | null) {
    if (!tenantId) throw new Error("tenantId is required");
    const cola = colaDeGtf(gtfNumber);
    if (!cola) return { estado: "ninguna" as const };
    const candidatas = await prisma.forestGtf.findMany({
      where: { tenantId, deletedAt: null, gtfNumber: { endsWith: cola } },
      orderBy: { createdAt: "desc" },
    });
    return elegirGuiaDelDueno(
      candidatas.filter((g) => mismoNumeroGtf(g.gtfNumber, gtfNumber)),
      identidad,
      (g) => ({ titular: g.titularName, permiso: g.tituloHabilitante }),
    );
  }

  static async annul(tenantId: string, id: string, reason: string, user = "unknown") {
    if (!tenantId) throw new Error("tenantId is required");
    if (!reason?.trim()) throw new Error("reason is required");
    /* Con el candado del N° y frenando si la guía ya entró al Libro CTP del
       negocio (ver `GtfNumeroDB.exigirSinIngresosEnElCtp`, 28-09-2026). */
    const gtf = await prisma.$transaction(async (tx) => {
      const actual = await tx.forestGtf.findFirst({
        where: { id, tenantId },
        select: { gtfNumber: true, tituloHabilitante: true, titularName: true, gtfDatos: true },
      });
      if (actual) {
        await GtfNumeroDB.exigirSinIngresosEnElCtp(tx, tenantId, {
          gtfNumber: actual.gtfNumber,
          ...identidadDeGuiaTh(actual, leerGtfDatos(actual.gtfDatos)),
        });
      }
      return tx.forestGtf.update({
        where: { id, tenantId } satisfies Prisma.ForestGtfWhereUniqueInput,
        data: { status: "anulada", annulledReason: reason.trim() },
      });
    }, { timeout: 20_000, maxWait: 10_000 });
    auditLoth({
      tenantId,
      action: "loth_gtf_annul",
      entity: "ForestGtf",
      entityId: id,
      detail: `Anuló la GTF ${gtf.gtfNumber}. Motivo: ${reason.trim()}`,
      user,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }
    return gtf;
  }
}
