import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { prisma } from "@/lib/prisma";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import {
  construirRegistro,
  corridasDeCubicacion,
  normalizarCompraAMano,
  totalesDe,
  type CompraAMano,
  type CubicacionRegistro,
  type FichaCubicacion,
} from "@/lib/forestal/cubicacion-registro";
import {
  idSalidaNueva,
  lineasDeLoQueQueda,
  normalizarSalida,
  saldoDeLaCubicacion,
  SALIDAS_MAX,
  type SalidaCubicacion,
} from "@/lib/forestal/cubicacion-salidas";
import { recubicarPiezas, type PiezaCubicada } from "@/lib/forestal/cubicacion";
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

/**
 * Un viaje que no se puede anotar (HTTP 400/404/409): sin ninguna cantidad, uno
 * que ya se quitó, o la cubicación ya tiene el tope de viajes. El mensaje va tal
 * cual a la pantalla.
 */
export class SalidaInvalidaError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 = 400) {
    super(message);
    this.name = "SalidaInvalidaError";
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

/** Una línea VIVA del Libro que la cubicación ampara (la que el Anexo 04 lee con sus medidas). */
export interface LineaDelLibro {
  id: string;
  lineNo: number;
  /** YYYY-MM-DD (date-only, en UTC). */
  fecha: string;
}

/** Por qué no se borra: dice qué línea y el camino para sacarla del Libro. */
export function motivoEnLibro(lineas: readonly LineaDelLibro[]): string {
  const orden = [...lineas].sort((a, b) => a.lineNo - b.lineNo);
  const nums = orden.map((l) => `N° ${l.lineNo}`);
  const cuales =
    nums.length === 1
      ? `la línea ${nums[0]} del ${orden[0]?.fecha.split("-").reverse().join("/") ?? ""}`
      : `las líneas ${nums.slice(0, -1).join(", ")} y ${nums[nums.length - 1]}`;
  const esa = nums.length === 1 ? "esa línea" : "esas líneas";
  return (
    `Está en el Libro (Producción, ${cuales}) y sus medidas pieza por pieza son las del Anexo 04. ` +
    `Para borrarla, primero anula ${esa} en el Libro › Producción (⋯ › Anular la línea); si solo quieres cambiarla, ábrela o duplícala.`
  );
}

/**
 * No se borra una cubicación que ampara líneas vivas del Libro (HTTP 409): la
 * línea queda, pero sus medidas pieza por pieza —las del Anexo 04 y el cuadre
 * contra el asiento (ADR-368/369/405)— no están en ningún otro lado.
 */
export class CubicacionEnLibroError extends Error {
  constructor(readonly lineas: LineaDelLibro[]) {
    super(motivoEnLibro(lineas));
    this.name = "CubicacionEnLibroError";
  }
}

type LectorDeLineas = Pick<Prisma.TransactionClient, "forestCtpEntry">;

/**
 * Las líneas del Libro que siguen VIVAS entre `ids`: del tenant (ownership en el
 * WHERE), sin borrar y sin anular. Se mira el estado, nunca el id pelado: una
 * cubicación cuya línea se anuló o se purgó ya no está en el Libro y se borra.
 * Cualquier estado que no sea «anulado» cuenta como vivo (lo seguro es frenar).
 */
async function lineasVivas(db: LectorDeLineas, tenantId: string, ids: readonly string[]): Promise<LineaDelLibro[]> {
  if (ids.length === 0) return [];
  const filas = await db.forestCtpEntry.findMany({
    where: { tenantId, id: { in: [...ids] }, deletedAt: null, status: { not: "anulado" } },
    select: { id: true, lineNo: true, entryDate: true },
  });
  return filas.map((f) => ({ id: f.id, lineNo: f.lineNo, fecha: f.entryDate.toISOString().slice(0, 10) }));
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
/**
 * Lo que llega a `save`. Los textos del papel aceptan `null` = «borrarlo»;
 * ausentes (`undefined`) = «dejar el que tenía» (ver `datosQueSeConservan`).
 */
export type EntradaGuardar = Omit<Parameters<typeof construirRegistro>[0], "cliente" | "notas" | "gtfNumber" | "ficha" | "compraAMano" | "salidas"> & {
  cliente?: string | null;
  notas?: string | null;
  gtfNumber?: string | null;
  ficha?: FichaCubicacion | null;
  /** El POST del cubicador nunca lo trae (se conserva); se anota con `anotarCompraAMano`. */
  compraAMano?: CompraAMano | null;
};

/**
 * «Vincular» y «Enviar al Libro» reenvían la cubicación SIN las notas ni la
 * ficha (24-10: las notas se borraban al enviar al Libro). Un campo ausente
 * conserva el guardado; `null` lo borra; un valor lo reemplaza. Lo mismo el
 * precio de cada pieza: si el pedido no trae ninguno, cada pieza conserva el
 * suyo por id (si no, el valor congelado caería a PT × un solo precio).
 */
export function datosQueSeConservan(
  input: EntradaGuardar,
  existente: CubicacionRegistro | undefined,
): {
  cliente: string | undefined;
  notas: string | undefined;
  gtfNumber: string | undefined;
  ficha: FichaCubicacion | undefined;
  compraAMano: CompraAMano | undefined;
  salidas: SalidaCubicacion[] | undefined;
  piezas: Record<string, unknown>[];
} {
  const tomar = <T,>(nuevo: T | null | undefined, viejo: T | undefined): T | undefined =>
    nuevo === undefined ? viejo : (nuevo ?? undefined);
  const traePrecio = input.piezas.some((p) => p.precio !== undefined && p.precio !== null);
  /* Sólo si la pieza sigue siendo de la misma especie y del mismo dueño: una que pasó
     de cedro a moena no se queda con los S/ 8 del cedro (va al precio del lote). */
  const misma = (p: Record<string, unknown>, v: PiezaCubicada) =>
    (typeof p.especie === "string" ? p.especie.trim() : "") === (v.especie ?? "").trim() &&
    (typeof p.duenoParteId === "string" ? p.duenoParteId.trim() : "") === (v.duenoParteId ?? "").trim();
  const viejas = new Map((existente?.piezas ?? []).filter((p) => p.precio !== undefined).map((p) => [p.id, p]));
  const precioViejo = new Map(
    input.piezas.flatMap((p) => {
      const v = typeof p.id === "string" ? viejas.get(p.id) : undefined;
      return v && misma(p, v) ? [[p.id as string, v.precio] as const] : [];
    }),
  );
  return {
    cliente: tomar(input.cliente, existente?.cliente),
    notas: tomar(input.notas, existente?.notas),
    gtfNumber: tomar(input.gtfNumber, existente?.gtfNumber),
    ficha: tomar(input.ficha, existente?.ficha),
    /* El precio de compra anotado en el margen: re-guardar desde el cubicador no lo borra. */
    compraAMano: tomar(input.compraAMano, existente?.compraAMano),
    /* Los viajes se anotan con su propio PATCH (`anotarSalida`): guardar el lote nunca los toca. */
    salidas: existente?.salidas,
    piezas: traePrecio || precioViejo.size === 0
      ? input.piezas
      : input.piezas.map((p) => (typeof p.id === "string" && precioViejo.has(p.id) ? { ...p, precio: precioViejo.get(p.id) } : p)),
  };
}

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
    input: EntradaGuardar,
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
          ...datosQueSeConservan(input, existente),
          ctpEntryId: todas[0],
          ctpEntryIds: todas.length > 0 ? todas : undefined,
          /* Sin trasera en el pedido (Vincular, Enviar al Libro) se conserva la
             que ya tenía; con ella —aunque vacía— manda el pedido. */
          trasera: input.trasera ?? existente?.trasera,
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

  /**
   * Anota (o borra, con `null`) el precio de compra por PT escrito a mano en
   * «Margen del camión» (Brandon 24-10), SIN reescribir la cubicación: sólo
   * ese campo, bajo el mismo lock que `save`. No toca `updatedAt` (es la
   * versión de la MEDICIÓN: si cambiara, el cubicador abierto daría 409 por un
   * dato que no es suyo, y la guardada saltaría al primer lugar de la lista).
   * `fecha` y `por` salen de acá, no del cliente. null = no existe.
   */
  async anotarCompraAMano(
    tenantId: string,
    id: string,
    precioPt: number | null,
    user = "unknown",
  ): Promise<CubicacionRegistro | null> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!id) return null;
    const compraAMano = precioPt === null ? undefined : normalizarCompraAMano({ precioPt, fecha: new Date().toISOString(), por: user });
    if (precioPt !== null && !compraAMano) throw new Error("precio de compra fuera de rango");
    const res = await PlatformSettingsDB.actualizar<unknown[], { registro: CubicacionRegistro; antes: CompraAMano | undefined; igual?: boolean } | null>(
      `${KEY_PREFIX}${tenantId}`,
      async (actual) => {
        const list = (Array.isArray(actual) ? actual : []).filter(esRegistro);
        const hallado = list.find((c) => c.id === id);
        if (!hallado) return { resultado: null };
        const { compraAMano: antes, ...resto } = hallado;
        /* Sin cambio (el mismo precio, o borrar lo que no hay): ni se escribe ni se audita («de 1,80 a 1,80»). */
        if ((antes?.precioPt ?? null) === (compraAMano?.precioPt ?? null)) return { resultado: { registro: hallado, antes, igual: true } };
        const registro: CubicacionRegistro = compraAMano ? { ...resto, compraAMano } : resto;
        return { valor: list.map((c) => (c.id === id ? registro : c)), resultado: { registro, antes } };
      },
      user,
    );
    if (!res) return null;
    if (res.igual) return normalizarVolumen(res.registro);
    const soles = (n: number) => `S/ ${n.toFixed(2)}`;
    const { registro, antes } = res;
    auditCtp({
      tenantId,
      action: "ctp_cubicacion_compra_a_mano",
      entity: "ForestCubicacion",
      entityId: id,
      detail: compraAMano
        ? antes
          ? `Cambió el precio de compra de ${soles(antes.precioPt)} a ${soles(compraAMano.precioPt)} por PT en la cubicación "${registro.nombre}"`
          : `Anotó el precio de compra ${soles(compraAMano.precioPt)} por PT en la cubicación "${registro.nombre}"`
        : `Borró el precio de compra anotado${antes ? ` (${soles(antes.precioPt)} por PT)` : ""} de la cubicación "${registro.nombre}"`,
      user,
    });
    return normalizarVolumen(registro);
  },

  /**
   * Anota un viaje de la madera (Brandon 28-10: «cuánto se despachó y cuánto
   * sobra») o, con el `id` de uno que ya está, lo reemplaza. NO reescribe la
   * cubicación: sólo `salidas`, bajo el mismo lock que `save` y sin tocar
   * `updatedAt` (es la versión de la MEDICIÓN: el cubicador abierto no da 409
   * por un viaje anotado desde Guardadas). `registradoAt` y `por` salen de acá;
   * al editar se conservan los del viaje original. null = no existe la cubicación.
   */
  async anotarSalida(
    tenantId: string,
    id: string,
    entrada: Record<string, unknown>,
    user = "unknown",
  ): Promise<CubicacionRegistro | null> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!id) return null;
    const idSalida = typeof entrada.id === "string" && entrada.id.trim() ? entrada.id.trim() : null;
    const res = await PlatformSettingsDB.actualizar<unknown[], { registro: CubicacionRegistro; salida: SalidaCubicacion; edito: boolean } | null>(
      `${KEY_PREFIX}${tenantId}`,
      async (actual) => {
        const list = (Array.isArray(actual) ? actual : []).filter(esRegistro);
        const hallado = list.find((c) => c.id === id);
        if (!hallado) return { resultado: null };
        const previas = hallado.salidas ?? [];
        const original = idSalida ? previas.find((s) => s.id === idSalida) : undefined;
        if (idSalida && !original) throw new SalidaInvalidaError("Ese viaje ya no está: alguien lo quitó. Vuelve a abrir las salidas.", 404);
        if (!original && previas.length >= SALIDAS_MAX) {
          throw new SalidaInvalidaError(`Esta cubicación ya tiene ${SALIDAS_MAX} viajes anotados: junta algunos antes de anotar otro.`, 409);
        }
        /* «Se llevó todo lo que quedaba»: las líneas salen de lo guardado, bajo el lock, y no de la
           pantalla, que puede tener viajes viejos (otro anotó uno desde Guardadas con el lote abierto)
           y mandaría el saldo dos veces (revisión 28-10). */
        const otras = original ? previas.filter((s) => s.id !== original.id) : previas;
        const delServidor = entrada.completo === true
          ? lineasDeLoQueQueda(saldoDeLaCubicacion(hallado.piezas, otras, hallado.precioPt))
          : null;
        if (delServidor && delServidor.length === 0) {
          throw new SalidaInvalidaError("Ya salió todo lo cubicado: no queda nada para este viaje.", 409);
        }
        const salida = normalizarSalida(delServidor ? { ...entrada, lineas: delServidor } : entrada, {
          id: original?.id ?? idSalidaNueva(),
          registradoAt: original?.registradoAt ?? new Date().toISOString(),
          por: original?.por ?? user,
        });
        if (!salida) throw new SalidaInvalidaError("El viaje no lleva nada: pon cuántas piezas o cuántos m³ salieron de al menos una fila.");
        const salidas = (original ? previas.map((s) => (s.id === salida.id ? salida : s)) : [...previas, salida])
          .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.registradoAt.localeCompare(b.registradoAt));
        const registro: CubicacionRegistro = { ...hallado, salidas };
        return { valor: list.map((c) => (c.id === id ? registro : c)), resultado: { registro, salida, edito: Boolean(original) } };
      },
      user,
    );
    if (!res) return null;
    const { registro, salida, edito } = res;
    const saldo = saldoDeLaCubicacion(registro.piezas, registro.salidas, registro.precioPt);
    const piezas = salida.lineas.reduce((a, l) => a + l.piezas, 0);
    const pt = salida.lineas.reduce((a, l) => a + l.pt, 0);
    auditCtp({
      tenantId,
      action: "ctp_cubicacion_salida",
      entity: "ForestCubicacion",
      entityId: id,
      detail:
        `${edito ? "Cambió el viaje" : "Anotó un viaje"} del ${salida.fecha} de la cubicación "${registro.nombre}": ` +
        `${piezas} piezas · ${pt.toFixed(2)} PT${salida.placa ? ` · placa ${salida.placa}` : ""} · queda ${saldo.queda.pt.toFixed(2)} PT`,
      user,
    });
    return normalizarVolumen(registro);
  },

  /**
   * Quita un viaje anotado. Igual que `anotarSalida`: sólo `salidas`, bajo lock,
   * sin tocar `updatedAt`. null = no existe la cubicación; un viaje que ya no
   * está da `SalidaInvalidaError` 404.
   */
  async quitarSalida(
    tenantId: string,
    id: string,
    salidaId: string,
    user = "unknown",
  ): Promise<CubicacionRegistro | null> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!id || !salidaId) return null;
    const res = await PlatformSettingsDB.actualizar<unknown[], { registro: CubicacionRegistro; quitada: SalidaCubicacion } | null>(
      `${KEY_PREFIX}${tenantId}`,
      async (actual) => {
        const list = (Array.isArray(actual) ? actual : []).filter(esRegistro);
        const hallado = list.find((c) => c.id === id);
        if (!hallado) return { resultado: null };
        const quitada = (hallado.salidas ?? []).find((s) => s.id === salidaId);
        if (!quitada) throw new SalidaInvalidaError("Ese viaje ya no está: alguien lo quitó.", 404);
        const { salidas: _todas, ...resto } = hallado;
        const quedan = (hallado.salidas ?? []).filter((s) => s.id !== salidaId);
        const registro: CubicacionRegistro = quedan.length > 0 ? { ...resto, salidas: quedan } : resto;
        return { valor: list.map((c) => (c.id === id ? registro : c)), resultado: { registro, quitada } };
      },
      user,
    );
    if (!res) return null;
    const { registro, quitada } = res;
    const pt = quitada.lineas.reduce((a, l) => a + l.pt, 0);
    auditCtp({
      tenantId,
      action: "ctp_cubicacion_salida",
      entity: "ForestCubicacion",
      entityId: id,
      detail: `Quitó el viaje del ${quitada.fecha} (${pt.toFixed(2)} PT${quitada.placa ? ` · placa ${quitada.placa}` : ""}) de la cubicación "${registro.nombre}"`,
      user,
    });
    return normalizarVolumen(registro);
  },

  /**
   * Las cubicaciones que hoy están EN el Libro (con al menos una línea viva), con
   * esas líneas y el motivo por el que no se borran. UNA lectura del Libro para
   * toda la lista. Las que no aparecen se pueden borrar.
   */
  async enLibro(
    tenantId: string,
    lista: readonly CubicacionRegistro[],
  ): Promise<Record<string, { lineas: LineaDelLibro[]; motivo: string }>> {
    if (!tenantId) throw new Error("tenantId is required");
    const ids = [...new Set(lista.flatMap((c) => corridasDeCubicacion(c)))];
    const vivas = new Map((await lineasVivas(prisma, tenantId, ids)).map((l) => [l.id, l]));
    const out: Record<string, { lineas: LineaDelLibro[]; motivo: string }> = {};
    for (const c of lista) {
      const lineas = corridasDeCubicacion(c).flatMap((id) => vivas.get(id) ?? []);
      if (lineas.length > 0) out[c.id] = { lineas, motivo: motivoEnLibro(lineas) };
    }
    return out;
  },

  /**
   * Borra una cubicación por id. Devuelve true si existía. Si ampara líneas
   * vivas del Libro, `CubicacionEnLibroError` y no se toca: se mira DENTRO del
   * mismo lock del guardado, así nadie la liga entre la consulta y el borrado.
   */
  async remove(tenantId: string, id: string, user = "unknown"): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!id) return false;
    const registro = await PlatformSettingsDB.actualizar<unknown[], CubicacionRegistro | null>(
      `${KEY_PREFIX}${tenantId}`,
      async (actual, tx) => {
        const list = (Array.isArray(actual) ? actual : []).filter(esRegistro);
        const hallado = list.find((c) => c.id === id);
        if (!hallado) return { resultado: null };
        const vivas = await lineasVivas(tx, tenantId, corridasDeCubicacion(hallado));
        if (vivas.length > 0) throw new CubicacionEnLibroError(vivas);
        return { valor: list.filter((c) => c.id !== id), resultado: hallado };
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
