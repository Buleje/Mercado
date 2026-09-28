import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import {
  construirRegistro,
  corridasDeCubicacion,
  totalesDe,
  type CubicacionRegistro,
} from "@/lib/forestal/cubicacion-registro";
import { recubicarPiezas } from "@/lib/forestal/cubicacion";
import type { CubicacionParaVincular } from "@/lib/forestal/origen-y-salida-del-dia";

/**
 * ForestCubicacionesDB — cubicaciones guardadas del aserradero.
 *
 * POR QUÉ KV: una cubicación es la MEDICIÓN de un lote (el papel que se firma
 * con el cliente), no un movimiento del Libro de Operaciones — al Libro entra
 * después, como producción, con su propio registro. Se guarda como lista en un
 * `PlatformSetting` por tenant, igual que las zonas de planta y la cartografía
 * EUDR: sin fabricar una migración (que necesita DIRECT_URL).
 *
 * `tenantId` 1er parámetro en toda operación; auditado vía `auditCtp`.
 */

const KEY_PREFIX = "ctp-cubicaciones:";
/**
 * Tope por tenant: el KV es un JSON; sin límite, un dictado diario lo infla.
 * Al pasarlo se descartan las SUELTAS más viejas; una ligada a corridas del
 * libro no se descarta nunca (es la pieza por pieza que el libro no guarda y la
 * que completa un día declarado por tipo — ADR-445).
 */
export const MAX_GUARDADAS = 300;

/**
 * La cubicación cambió después de que la pantalla la leyó (HTTP 409): guardar
 * lo que trae el pedido reescribiría piezas viejas encima de las nuevas.
 */
export class CubicacionDesactualizadaError extends Error {
  constructor(readonly actual: string) {
    super("Esta cubicación cambió mientras la tenías abierta. Vuelve a abrirla para no pisar lo último que se guardó.");
    this.name = "CubicacionDesactualizadaError";
  }
}

/** Una corrida pedida no se puede ligar: se dice cuál y por qué (HTTP 422). */
export class CubicacionVinculoError extends Error {
  constructor(
    message: string,
    readonly ids: string[],
  ) {
    super(message);
    this.name = "CubicacionVinculoError";
  }
}

const esRegistro = (c: unknown): c is CubicacionRegistro =>
  Boolean(c) &&
  typeof (c as CubicacionRegistro).id === "string" &&
  Array.isArray((c as CubicacionRegistro).piezas);

const porRecientes = (a: CubicacionRegistro, b: CubicacionRegistro) =>
  (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");

/**
 * Deja la lista en el tope sacando las SUELTAS más viejas.
 *
 * `lista[0]` es la RECIÉN guardada y no se descarta nunca: si las otras están
 * todas ligadas, la lista queda por encima del tope —perder una medición que
 * ampara el libro, o la que el usuario acaba de guardar mientras la respuesta
 * dice 201, es peor que un JSON más largo—. Del resto se recorre desde la más
 * vieja hasta el índice 1.
 */
export function recortarAlTope(lista: readonly CubicacionRegistro[], tope = MAX_GUARDADAS): CubicacionRegistro[] {
  const [nueva, ...anteriores] = lista;
  if (!nueva) return [];
  const orden = [nueva, ...[...anteriores].sort(porRecientes)];
  let sobran = orden.length - tope;
  if (sobran <= 0) return orden;
  const fuera = new Set<number>();
  for (let i = orden.length - 1; i >= 1 && sobran > 0; i--) {
    const c = orden[i];
    if (c && corridasDeCubicacion(c).length === 0) {
      fuera.add(i);
      sobran -= 1;
    }
  }
  return orden.filter((_, i) => !fuera.has(i));
}

/**
 * Las corridas que la cubicación va a amparar al guardar. Sin corridas en el
 * pedido se conservan las que ya tenía: re-guardar desde el cubicador (que no
 * las manda) las BORRABA, y con ellas el hilo al libro. Con corridas, se suman
 * a las que ya tenía — «reusar una guardada le agrega las corridas contra las
 * que ahora cuadra» (`CtpCubicarProductoModal`).
 */
export function corridasAlGuardar(
  existente: Pick<CubicacionRegistro, "ctpEntryId" | "ctpEntryIds"> | undefined,
  pedido: { ctpEntryId?: string; ctpEntryIds?: string[] },
): { todas: string[]; nuevas: string[] } {
  const previas = existente ? corridasDeCubicacion(existente) : [];
  const pedidas = corridasDeCubicacion(pedido);
  const todas = [...new Set([...previas, ...pedidas])];
  return { todas, nuevas: pedidas.filter((id) => !previas.includes(id)) };
}

/**
 * Las corridas nuevas tienen que existir, ser DEL TENANT y de producción viva
 * (no anulada ni borrada). El `tenantId` va en el WHERE: una corrida de otro
 * negocio no «existe» para éste (regla de ownership, no un `if` después).
 */
async function exigirCorridasLigables(
  tx: Prisma.TransactionClient,
  tenantId: string,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  const vivas = await tx.forestCtpEntry.findMany({
    where: { tenantId, id: { in: [...ids] }, section: "produccion", status: "registrado", deletedAt: null },
    select: { id: true },
  });
  const ok = new Set(vivas.map((v) => v.id));
  const malas = ids.filter((id) => !ok.has(id));
  if (malas.length > 0) {
    throw new CubicacionVinculoError(
      malas.length === 1
        ? "La corrida a la que quieres ligar la cubicación no existe, está anulada o no es de producción."
        : `${malas.length} de las corridas a las que quieres ligar la cubicación no existen, están anuladas o no son de producción.`,
      malas,
    );
  }
}

/**
 * Corrige el VOLUMEN de una cubicación vieja al leerla: el m³ se re-deriva del
 * pie tablar (÷ 424, `PT_POR_M3`) porque las guardadas antes del cambio traen
 * el volumen geométrico —13.026 PT figuraban como 30,738 m³ en vez de 30,722—
 * y ese número congelado seguía apareciendo en el historial, en el Anexo 04 y
 * en el cuadre contra el Libro (Brandon, 2026-09-01).
 *
 * Lo que NO se toca: `precioPt` y `valor` siguen congelados al momento de
 * guardar —son el papel que se firmó—; acá sólo se corrige una unidad derivada,
 * que nunca debió guardarse con otra fórmula que la de la pantalla.
 */
function normalizarVolumen(c: CubicacionRegistro): CubicacionRegistro {
  const piezas = recubicarPiezas(c.piezas);
  if (piezas === c.piezas && c.totales?.m3 === totalesDe(piezas).m3) return c;
  return { ...c, piezas, totales: totalesDe(piezas) };
}

export const ForestCubicacionesDB = {
  /** Todas las cubicaciones del tenant, la más reciente primero. */
  async list(tenantId: string): Promise<CubicacionRegistro[]> {
    if (!tenantId) throw new Error("tenantId is required");
    /* De la base, sin el caché de 5 min (por instancia): «Vincular» y el
       cubicador reenvían la cubicación ENTERA, y una lista vieja reescribiría
       piezas viejas (ADR-445). Es una fila por PK. */
    const raw = await PlatformSettingsDB.getFresco<unknown[]>(`${KEY_PREFIX}${tenantId}`);
    if (!Array.isArray(raw)) return [];
    return raw.filter(esRegistro).map(normalizarVolumen).sort(porRecientes);
  },

  /**
   * Las ligadas a alguna corrida del libro, en la forma que pide el origen de
   * los días (ADR-445). UNA lectura del KV para toda la semana o el día.
   */
  async paraVincular(tenantId: string): Promise<CubicacionParaVincular[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const lista = await this.list(tenantId);
    return lista
      .map((c) => ({
        id: c.id,
        nombre: c.nombre,
        m3: c.totales?.m3 ?? 0,
        pt: c.totales?.pieTablar ?? 0,
        piezas: c.totales?.piezas ?? 0,
        corridas: corridasDeCubicacion(c),
      }))
      .filter((c) => c.corridas.length > 0);
  },

  /**
   * Crea o actualiza una cubicación (upsert por id). Los totales NO se creen
   * del cliente: `construirRegistro` los recalcula desde las piezas.
   */
  async save(
    tenantId: string,
    input: Parameters<typeof construirRegistro>[0],
    user = "unknown",
    /**
     * `updatedAt` de la versión que la pantalla leyó. Si viene y la guardada es
     * otra, 409 en vez de pisarla (el que reenvía la cubicación entera —«Vincular»—
     * puede traer piezas viejas). Sin él, se guarda como siempre.
     */
    opts: { updatedAtLeido?: string } = {},
  ): Promise<CubicacionRegistro> {
    if (!tenantId) throw new Error("tenantId is required");
    /* Leer-modificar-escribir bajo lock: dos guardados a la vez ya no pierden
       uno (antes, las dos leían la misma lista y la segunda pisaba). */
    const { registro, existia } = await PlatformSettingsDB.actualizar<
      unknown[],
      { registro: CubicacionRegistro; existia: boolean }
    >(
      `${KEY_PREFIX}${tenantId}`,
      async (actual, tx) => {
        const list = (Array.isArray(actual) ? actual : []).filter(esRegistro);
        const existente = input.id ? list.find((c) => c.id === input.id) : undefined;
        if (existente && opts.updatedAtLeido && existente.updatedAt !== opts.updatedAtLeido) {
          throw new CubicacionDesactualizadaError(existente.updatedAt);
        }
        const { todas, nuevas } = corridasAlGuardar(existente, input);
        await exigirCorridasLigables(tx, tenantId, nuevas);
        const registro = construirRegistro({
          ...input,
          ctpEntryId: todas[0],
          ctpEntryIds: todas.length > 0 ? todas : undefined,
          createdAt: existente?.createdAt,
          createdBy: existente?.createdBy ?? user,
        });
        const next = existente
          ? list.map((c) => (c.id === registro.id ? registro : c))
          : recortarAlTope([registro, ...list]);
        return { valor: next, resultado: { registro, existia: Boolean(existente) } };
      },
      user,
    );
    auditCtp({
      tenantId,
      action: existia ? "ctp_cubicacion_update" : "ctp_cubicacion_create",
      entity: "ForestCubicacion",
      entityId: registro.id,
      detail:
        `${existia ? "Actualizó" : "Guardó"} la cubicación "${registro.nombre}" · ${registro.totales.piezas} piezas · ${registro.totales.pieTablar} PT` +
        (registro.ctpEntryIds?.length ? ` · ligada a ${registro.ctpEntryIds.length} corrida(s) del libro` : ""),
      user,
    });
    return registro;
  },

  /** Borra una cubicación por id. Devuelve true si existía. */
  async remove(tenantId: string, id: string, user = "unknown"): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!id) return false;
    const registro = await PlatformSettingsDB.actualizar<unknown[], CubicacionRegistro | null>(
      `${KEY_PREFIX}${tenantId}`,
      (actual) => {
        const list = (Array.isArray(actual) ? actual : []).filter(esRegistro);
        const hallado = list.find((c) => c.id === id);
        return hallado ? { valor: list.filter((c) => c.id !== id), resultado: hallado } : { resultado: null };
      },
      user,
    );
    if (!registro) return false;
    auditCtp({
      tenantId,
      action: "ctp_cubicacion_delete",
      entity: "ForestCubicacion",
      entityId: id,
      detail: `Borró la cubicación "${registro.nombre}" (${registro.totales?.pieTablar ?? 0} PT)`,
      user,
    });
    return true;
  },
};
