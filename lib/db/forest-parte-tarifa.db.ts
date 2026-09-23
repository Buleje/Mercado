import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { esTipoComercial } from "@/lib/forestal/tarifa-aserrio";
import {
  ETIQUETA_SERVICIO_PRECIO,
  tarifaVigente,
  type PrecioEspecieCliente,
  type PrecioGrupo,
  type PrecioTipoCliente,
  type ServicioPrecio,
  type TarifaCliente,
  type TarifaClienteInput,
} from "@/lib/forestal/precio-cliente";
import { ForestEspeciesDB } from "./forest-especies.db";

/**
 * ForestParteTarifaDB — el trato de precio con cada cliente (ADR-430).
 *
 * Una fila = una versión del trato, por cliente, servicio y fecha; rige hasta
 * que empieza la siguiente. Guardar el mismo día CORRIGE esa versión (hay un
 * único parcial en la base que lo sostiene). Guardar o quitar un trato no
 * reescribe lo ya cobrado: cada cargo quedó con su importe y su
 * `clienteTarifaId`. PERO si después se corrige la corrida (ampliar, corregir
 * paquetes, volver a declarar), se recotiza con el trato que rija en SU fecha,
 * igual que la tarifa de la planta (ADR-412): corregir el trato de ese día
 * cambia ese cargo la próxima vez que se toque la corrida.
 *
 * Sin caché a propósito: la caché del proyecto es de la instancia, y la vista
 * previa de una instancia podía mostrar el trato de hace un minuto mientras el
 * cobro (siempre fresco) usaba el nuevo. Es una consulta con índice y tope.
 *
 * `parteId` no tiene FK (ADR-426): una FK aceptaría una parte de otro tenant.
 * Lo que aísla es el `findFirst({ id, tenantId })` antes de escribir.
 *
 * `tenantId` 1er parámetro; todo write auditado — es plata de un tercero.
 */


const r4 = (n: number) => Math.round(n * 10000) / 10000;
const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;

/** La parte (o lo vinculado) no existe en ESTE tenant. El route responde 404. */
export class ParteNoEncontradaError extends Error {
  constructor(motivo = "Esa parte no está en el Directorio.") {
    super(motivo);
    this.name = "ParteNoEncontradaError";
  }
}

/** Lo que el trato rechaza por sus reglas (un tipo que no existe, un grupo borrado). 422. */
export class TarifaClienteError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "TarifaClienteError";
  }
}

/**
 * Tira `ParteNoEncontradaError` si la parte no es de este tenant. Incluye las
 * dadas de baja: su historia (tratos, vínculos, saldo) se sigue pudiendo leer.
 * Lo usan las lecturas por `parteId`: una parte ajena es 404, no una lista vacía
 * que parece «todavía no tiene nada».
 */
export async function exigirParteDelTenant(tenantId: string, parteId: string): Promise<void> {
  if (!tenantId) throw new Error("tenantId is required");
  const fila = parteId
    ? await prisma.forestParty.findFirst({ where: { id: parteId, tenantId }, select: { id: true } })
    : null;
  if (!fila) throw new ParteNoEncontradaError();
}

export const esChoqueUnico = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

type Row = Prisma.ForestParteTarifaGetPayload<Record<string, never>>;

const arr = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : [];

/**
 * La fila a `TarifaCliente`, sin confiar en la forma del JSON: lo que no se
 * entiende se descarta — un precio que no se puede leer no se cobra.
 */
function aTarifa(r: Row): TarifaCliente {
  const d = (r.detalle ?? {}) as { grupos?: unknown; especies?: unknown; tipos?: unknown };
  return {
    id: r.id,
    parteId: r.parteId,
    servicio: r.servicio === "venta" ? "venta" : "aserrio",
    vigenteDesde: r.vigenteDesde.toISOString().slice(0, 10),
    basePt: r.basePt != null && Number(r.basePt) > 0 ? Number(r.basePt) : null,
    grupos: arr(d.grupos)
      .map((g) => ({ grupoId: typeof g.grupoId === "string" ? g.grupoId : "", precioPt: Number(g.precioPt) }))
      .filter((g) => g.grupoId && g.precioPt > 0),
    especies: arr(d.especies)
      .map((e) => ({
        clave: claveEspecie(String(e.clave ?? e.nombre ?? "")),
        nombre: String(e.nombre ?? e.clave ?? ""),
        precioPt: Number(e.precioPt),
      }))
      .filter((e) => e.clave && e.precioPt > 0),
    tipos: arr(d.tipos)
      .map((t) => ({ tipo: t.tipo, precioPt: Number(t.precioPt) }))
      .filter((t): t is PrecioTipoCliente => esTipoComercial(t.tipo) && t.precioPt > 0),
    nota: r.nota,
  };
}

const soles = (n: number) => n.toFixed(4).replace(/(\.\d\d\d??)0+$/, "$1");

/** «global S/ 0.50 · 2 especie(s) · 1 grupo(s) · 0 tipo(s)» — para el rastro. */
function resumen(t: Pick<TarifaCliente, "basePt" | "especies" | "grupos" | "tipos">): string {
  return [
    t.basePt != null ? `global S/ ${soles(t.basePt)} por PT` : "sin global",
    `${t.especies.length} especie(s)`,
    `${t.grupos.length} grupo(s)`,
    `${t.tipos.length} tipo(s)`,
  ].join(" · ");
}

/** Todas las versiones vivas de un cliente, ordenadas por fecha y alta (lo que espera `tarifaVigente`). */
async function leer(tenantId: string, parteId: string, servicio?: ServicioPrecio): Promise<TarifaCliente[]> {
  const rows = await prisma.forestParteTarifa.findMany({
    where: { tenantId, parteId, deletedAt: null, ...(servicio ? { servicio } : {}) },
    /* El tope corta las más VIEJAS: la vigente es la más nueva, y con el orden
       ascendente un tope la habría dejado afuera. */
    orderBy: [{ vigenteDesde: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
  return rows.reverse().map(aTarifa);
}

export const ForestParteTarifaDB = {
  /**
   * Los tratos de un cliente, de los dos servicios, del más viejo al más nuevo.
   * Sin caché (ver arriba): la vista previa lee lo mismo que el cobro.
   *
   * @throws ParteNoEncontradaError si la parte no es de este tenant.
   */
  async listar(tenantId: string, parteId: string): Promise<TarifaCliente[]> {
    await exigirParteDelTenant(tenantId, parteId);
    return leer(tenantId, parteId);
  },

  /**
   * El trato que regía ESE día para ese cliente y servicio, o `null`.
   * Fresca a propósito (sin caché): decide un cobro, y una versión guardada en
   * otra instancia hace un minuto tiene que entrar.
   */
  async vigente(
    tenantId: string,
    parteId: string,
    servicio: ServicioPrecio,
    fecha: Date | string | null | undefined,
  ): Promise<TarifaCliente | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const dia = (fecha instanceof Date ? fecha.toISOString() : (fecha ?? "")).slice(0, 10);
    if (!parteId || !ISO_DIA.test(dia)) return null;
    return tarifaVigente(await leer(tenantId, parteId, servicio), servicio, dia);
  },

  /**
   * Guarda una versión. Si ese cliente ya tenía una de ese servicio ESE día,
   * la corrige en vez de sumar otra.
   *
   * @throws ParteNoEncontradaError si la parte no es de este tenant.
   * @throws TarifaClienteError si un tipo no existe o un grupo ya no está en el catálogo.
   */
  async guardar(
    tenantId: string,
    input: TarifaClienteInput,
    user = "unknown",
  ): Promise<{ tarifa: TarifaCliente; corrigio: boolean }> {
    if (!tenantId) throw new Error("tenantId is required");
    const parte = await prisma.forestParty.findFirst({
      where: { id: input.parteId, tenantId, deletedAt: null },
      select: { id: true, nombre: true },
    });
    if (!parte) throw new ParteNoEncontradaError();

    const tipos: PrecioTipoCliente[] = [];
    for (const t of input.tipos) {
      if (!esTipoComercial(t.tipo)) throw new TarifaClienteError(`El tipo «${t.tipo}» no existe.`);
      tipos.push({ tipo: t.tipo, precioPt: r4(t.precioPt) });
    }

    /* Un precio para un grupo que ya no existe no se aplicaría nunca y la
       pantalla lo mostraría como pactado: se rechaza al guardar. */
    let grupos: PrecioGrupo[] = [];
    if (input.grupos.length > 0) {
      const catalogo = await ForestEspeciesDB.get(tenantId);
      const existen = new Set((catalogo.grupos ?? []).map((g) => g.id));
      if (input.grupos.some((g) => !existen.has(g.grupoId))) {
        throw new TarifaClienteError("Uno de los grupos ya no está en el catálogo de especies: vuelve a elegirlo.");
      }
      grupos = input.grupos.map((g) => ({ grupoId: g.grupoId, precioPt: r4(g.precioPt) }));
    }

    const especies: PrecioEspecieCliente[] = input.especies.map((e) => ({
      clave: claveEspecie(e.nombre),
      nombre: e.nombre.trim(),
      precioPt: r4(e.precioPt),
    }));

    const vigenteDesde = new Date(`${input.vigenteDesde}T00:00:00.000Z`);
    const datos = {
      basePt: input.basePt != null ? new Prisma.Decimal(r4(input.basePt)) : null,
      detalle: { grupos, especies, tipos } as unknown as Prisma.InputJsonValue,
      nota: input.nota?.trim() || null,
    };
    const donde = { tenantId, parteId: parte.id, servicio: input.servicio, vigenteDesde, deletedAt: null };

    const escribir = () =>
      prisma.$transaction(async (tx) => {
        const previa = await tx.forestParteTarifa.findFirst({ where: donde });
        if (previa) {
          /* Lo de antes se lee ANTES de escribir: es lo que el rastro dice que se pisó. */
          const antes = aTarifa(previa);
          const row = await tx.forestParteTarifa.update({
            where: { id: previa.id, tenantId } satisfies Prisma.ForestParteTarifaWhereUniqueInput,
            data: datos,
          });
          return { row, previa: antes };
        }
        const row = await tx.forestParteTarifa.create({
          data: { tenantId, parteId: parte.id, servicio: input.servicio, vigenteDesde, ...datos, createdBy: user || "unknown" },
        });
        return { row, previa: null };
      });

    let hecho: Awaited<ReturnType<typeof escribir>>;
    try {
      hecho = await escribir();
    } catch (err) {
      if (!esChoqueUnico(err)) throw err;
      /* Dos guardados del mismo día a la vez: el único parcial frenó al segundo
         insert. Otra vuelta encuentra la versión viva y la corrige. */
      hecho = await escribir();
    }

    const tarifa = aTarifa(hecho.row);
    auditCtp({
      tenantId,
      action: "ctp_tarifa_cliente_guardar",
      entity: "ForestParteTarifa",
      entityId: tarifa.id,
      detail:
        `${hecho.previa ? "Corrigió" : "Pactó"} el precio de ${ETIQUETA_SERVICIO_PRECIO[input.servicio].toLowerCase()} ` +
        `con ${parte.nombre} desde ${input.vigenteDesde}: ${resumen(tarifa)}` +
        (hecho.previa ? ` (antes: ${resumen(hecho.previa)})` : ""),
      user,
    });
    return { tarifa, corrigio: Boolean(hecho.previa) };
  },

  /** Baja lógica de una versión. `false` si no existía en este tenant (404). */
  async quitar(tenantId: string, id: string, user = "unknown"): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    const row = await prisma.forestParteTarifa.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!row) return false;
    const { count } = await prisma.forestParteTarifa.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (count === 0) return false;
    const t = aTarifa(row);
    const parte = await prisma.forestParty.findFirst({ where: { id: row.parteId, tenantId }, select: { nombre: true } });
    auditCtp({
      tenantId,
      action: "ctp_tarifa_cliente_quitar",
      entity: "ForestParteTarifa",
      entityId: id,
      detail:
        `Quitó el precio de ${ETIQUETA_SERVICIO_PRECIO[t.servicio].toLowerCase()} vigente desde ${t.vigenteDesde} ` +
        `con ${parte?.nombre ?? t.parteId} (${resumen(t)}). Lo ya cobrado no cambia hasta que se corrija la corrida.`,
      user,
    });
    return true;
  },
};
