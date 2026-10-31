/**
 * ForestLothArbolesAManoDB — los árboles del censo que se pueden elegir para
 * una troza anotada a mano al despachar con guía (15-10, «Árbol de origen en
 * la troza»). Las reglas viven en `lib/forestal/loth-arbol-a-mano.ts`; acá sólo
 * se leen los datos, y en la transacción del despacho, bajo candado.
 *
 * Lo que dice de cada árbol es lo que mide T4 al asentar la troza
 * (`ForestLothDB.enforceInvariants`, rama trozado): la tala viva y lo trozado
 * por `treeCode` en todo el negocio. Las trozas que ocupan una letra son las
 * del trozado de siempre (`lineasDelArbol`) por su `treeCode` y, además, toda
 * troza cuyo código empiece con el del árbol («001-TOR-A» ocupa la «A» de
 * 001-TOR aunque su columna de árbol diga otra cosa): es lo que imprime la guía.
 *
 * tenantId 1er parámetro. Sólo lectura (el alta la hace `ForestLothDB`).
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { codigoDeLaGuia } from "@/lib/forestal/codigo-unico-troza";
import type { ArbolParaTroza } from "@/lib/forestal/loth-arbol-a-mano";

type Db = Prisma.TransactionClient | typeof prisma;

/** Tope de árboles que ofrece el selector (Blas tiene 2; un censo grande, cientos). */
export const ARBOLES_PARA_ELEGIR_MAX = 5_000;
/** Tope de líneas de tala/trozado que se leen para armar lo de cada árbol (como `estadoDeArboles`). */
const LINEAS_MAX = 20_000;

const r4 = (n: number): number => Math.round(n * 10_000) / 10_000;
const natural = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true });

export class ForestLothArbolesAManoDB {
  /**
   * Los árboles del censo de los permisos vivos, sin los descartados, con su
   * tala (m³ o `null`), lo ya trozado y los códigos de sus trozas. Para el
   * selector del modal: no toma candados (la última palabra la tiene el POST).
   */
  static async paraElegir(tenantId: string): Promise<ArbolParaTroza[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const arboles = await ForestLothArbolesAManoDB.delCenso(prisma, tenantId, null);
    return ForestLothArbolesAManoDB.conElLibro(prisma, tenantId, arboles);
  }

  /**
   * Los árboles pedidos (por id), dentro de la transacción del despacho y con
   * el candado de cada `treeCode` tomado ANTES de leer sus trozas: dos guías a
   * la vez con trozas del mismo árbol no se llevan la misma letra (T3 no lo
   * frena: el código del libro lleva el N° de cada guía y sería distinto).
   *
   * Orden de candados: quien llama ya tiene el del N° de la guía
   * (`GtfNumeroDB.bloquear`); éstos van después, ordenados y ANTES de toda
   * fila del libro (`candadosDeArboles`), igual que en el alta normal y el
   * importador: no hay orden inverso con el que abrazarse.
   *
   * Un id que no está (otro negocio, borrado, descartado, plan de baja) no
   * vuelve en el Map: quien llama lo rechaza (`ARBOL_NO_EXISTE`).
   */
  static async bloquearEnTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    ids: readonly string[],
  ): Promise<Map<string, ArbolParaTroza>> {
    if (!tenantId) throw new Error("tenantId is required");
    const unicos = [...new Set(ids.map((i) => i.trim()).filter(Boolean))];
    if (unicos.length === 0) return new Map();
    const arboles = await ForestLothArbolesAManoDB.delCenso(tx, tenantId, unicos);
    await ForestLothArbolesAManoDB.candadosDeArboles(tx, tenantId, arboles.map((a) => a.treeCode));
    const conLibro = await ForestLothArbolesAManoDB.conElLibro(tx, tenantId, arboles);
    return new Map(conLibro.map((a) => [a.id, a]));
  }

  /**
   * El candado de cada árbol (`loth-arbol:<ÁRBOL>`), el MISMO en todo camino
   * que asienta trozado de un árbol: la troza a mano (`bloquearEnTx`), el alta
   * de siempre (`ForestLothDB.enforceInvariants`, rama trozado) y el importador
   * (`ForestLothImportarDB.libroDe`). Sin él, en un árbol sin filas el
   * FOR UPDATE del alta no bloquea nada y dos altas a la vez dejan vivas
   * «X-A» y «X-A-0123» (15-10). Llave sin espacios y en mayúsculas: T3 compara
   * la placa sin mayúsculas. Ordenados y reentrantes; van después del N° de la
   * guía y ANTES de cualquier FOR UPDATE de filas del libro.
   */
  static async candadosDeArboles(
    tx: Pick<Prisma.TransactionClient, "$executeRaw">,
    tenantId: string,
    treeCodes: readonly string[],
  ): Promise<void> {
    if (!tenantId) throw new Error("tenantId is required");
    const llaves = [...new Set(treeCodes.map((c) => c.trim().toUpperCase()).filter(Boolean))].sort();
    for (const llave of llaves) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${`loth-arbol:${llave}`}))`;
    }
  }

  /** Los árboles vivos del censo (de permisos vivos, no descartados); `ids` = sólo ésos. */
  private static async delCenso(db: Db, tenantId: string, ids: readonly string[] | null) {
    const planes = await db.forestPlan.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true },
    });
    if (planes.length === 0) return [];
    const filas = await db.forestCensusTree.findMany({
      where: {
        tenantId,
        deletedAt: null,
        estado: { not: "descartado" },
        planId: { in: planes.map((p) => p.id) },
        ...(ids ? { id: { in: [...ids] } } : {}),
      },
      select: {
        id: true,
        treeCode: true,
        speciesCommon: true,
        speciesScientific: true,
        planId: true,
        estado: true,
      },
      orderBy: { treeCode: "asc" },
      take: ARBOLES_PARA_ELEGIR_MAX,
    });
    return filas.map((a) => ({ ...a, treeCode: a.treeCode.trim() })).filter((a) => a.treeCode);
  }

  /** La tala, lo trozado y los códigos de cada árbol, leídos del libro (todo el negocio, como T4). */
  private static async conElLibro(
    db: Db,
    tenantId: string,
    arboles: {
      id: string;
      treeCode: string;
      speciesCommon: string;
      speciesScientific: string | null;
      planId: string;
      estado: string;
    }[],
  ): Promise<ArbolParaTroza[]> {
    if (arboles.length === 0) return [];
    const codes = [...new Set(arboles.map((a) => a.treeCode))];
    const delCenso = new Set(codes);
    /** Los árboles del censo que son prefijo del código («DEMO-014-A» → «DEMO-014»): exacto, sin adivinar dónde corta. */
    const arbolesDelCodigo = (troza: string): string[] => {
      const partes = troza.split("-");
      return partes.slice(1).flatMap((_, i) => {
        const prefijo = partes.slice(0, i + 1).join("-");
        return delCenso.has(prefijo) ? [prefijo] : [];
      });
    };
    const lineas = await db.forestLothEntry.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: "registrado",
        OR: [
          { section: "tala", treeCode: { in: codes } },
          { section: "trozado", treeCode: { in: codes } },
          // Trozas con el código del árbol («001-TOR-A»), diga lo que diga su
          // columna de árbol: la guía imprime el código, y dos «001-TOR-A» en
          // papeles distintos ya no dicen de qué troza se habla. En QA el
          // trozado «DEMO-014-A» lleva el árbol «014-TOR» (medido 15-10).
          { section: "trozado", OR: codes.map((c) => ({ trozaCode: { startsWith: `${c}-` } })) },
        ],
      },
      select: { section: true, treeCode: true, trozaCode: true, volumeM3: true, lineNo: true },
      orderBy: { lineNo: "asc" },
      take: LINEAS_MAX,
    });
    const tala = new Map<string, number>();
    const trozado = new Map<string, number>();
    const trozas = new Map<string, string[]>();
    for (const l of lineas) {
      const v = l.volumeM3 == null ? null : Number(l.volumeM3);
      const arbol = l.treeCode?.trim() || null;
      if (l.section === "tala") {
        // T4 mira la primera tala viva con volumen del árbol.
        if (arbol && v != null && !tala.has(arbol)) tala.set(arbol, v);
        continue;
      }
      if (arbol && v != null) trozado.set(arbol, (trozado.get(arbol) ?? 0) + v);
      const code = l.trozaCode?.trim();
      if (!code) continue;
      for (const de of new Set([...(arbol ? [arbol] : []), ...arbolesDelCodigo(codigoDeLaGuia(code))]))
        trozas.set(de, [...(trozas.get(de) ?? []), code]);
    }
    return arboles
      .map((a) => ({
        id: a.id,
        treeCode: a.treeCode,
        especie: a.speciesCommon,
        cientifico: a.speciesScientific?.trim() || null,
        planId: a.planId,
        estado: a.estado,
        talaM3: tala.get(a.treeCode) ?? null,
        trozadoM3: r4(trozado.get(a.treeCode) ?? 0),
        trozas: (trozas.get(a.treeCode) ?? []).sort(natural),
      }))
      .sort((a, b) => natural(a.treeCode, b.treeCode));
  }
}
