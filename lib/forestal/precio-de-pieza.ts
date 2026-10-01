/**
 * El precio por pie tablar de una pieza del cubicador (ADR-430).
 *
 * Pedido de Brandon (22-09): «que al cubicar, elegir el cliente ponga solo ese
 * precio». La pieza sabe de quién es (`duenoParteId`, elegido del Directorio);
 * con el modo de precio en **Aserrío** o **Venta**, su precio sale del trato de
 * ese cliente para ese servicio —especie → grupo → tipo → su global, la misma
 * regla del cobro (`precioDelCliente`)—. Lo que su trato no cubre, y todo en
 * modo **A mano**, va al precio a mano de siempre: el de la especie si se puso,
 * si no el general.
 *
 * Antes este cálculo vivía copiado en el cubicador y en Resúmenes: dos copias
 * de una cuenta de plata terminan diciendo dos números. Ahora es UNO, y el
 * papel (PDF, Excel, WhatsApp, liquidación) lee el mismo.
 *
 * PURO y client-safe.
 */
import type { PiezaCubicada } from "./cubicacion";
import { tipoDePieza, ORDEN_TIPO, type TipoComercial } from "./cubicacion-tipo";
import {
  explicarOrigenCliente,
  precioDelCliente,
  tarifaVigente,
  type GrupoEspecies,
  type OrigenPrecioCliente,
  type TarifaCliente,
} from "./precio-cliente";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Con qué se pone el precio: el trato de aserrío o de venta del dueño, o a mano. */
export type ModoPrecio = "aserrio" | "venta" | "manual";
export const MODOS_PRECIO: readonly ModoPrecio[] = ["aserrio", "venta", "manual"];
export const ETIQUETA_MODO_PRECIO: Record<ModoPrecio, string> = {
  aserrio: "Aserrío",
  venta: "Venta",
  manual: "A mano",
};

export function esModoPrecio(v: unknown): v is ModoPrecio {
  return typeof v === "string" && (MODOS_PRECIO as readonly string[]).includes(v);
}

/** Lo puesto a mano en el cubicador. */
export interface PreciosAMano {
  /** S/ por PT de todo lo que no tiene precio propio. 0 = sin precio. */
  general: number;
  /**
   * Especie en minúsculas → S/ por PT, como lo guarda el cubicador desde julio
   * (`-precios-especie`). Vacío o 0 = usa el general.
   */
  porEspecie: Readonly<Record<string, string | number>>;
}

export type OrigenPrecioPieza = OrigenPrecioCliente | "mano-especie" | "mano-general";

export interface PrecioDePieza {
  /** S/ por pie tablar. 0 = sin precio (nunca se inventa). */
  precioPt: number;
  /** De dónde salió. `null` = no hay precio. */
  desde: OrigenPrecioPieza | null;
  /** El grupo de especies, si el precio salió de uno. */
  grupo: string | null;
}

export interface ContextoPrecio {
  modo: ModoPrecio;
  aMano: PreciosAMano;
  /** Todas las versiones del trato de cada cliente, por `parteId`. */
  tratos?: ReadonlyMap<string, readonly TarifaCliente[]>;
  /** Los grupos de especies de la planta. Sin ellos no hay precio por grupo. */
  grupos?: readonly GrupoEspecies[];
  /** El día con que se busca la versión vigente del trato (`AAAA-MM-DD`). */
  fecha: string;
}

type PiezaConPrecio = Pick<PiezaCubicada, "especie" | "duenoParteId" | "tipo" | "espesor" | "ancho" | "largo" | "uEspesor" | "uAncho" | "uLargo">;

/** El precio a mano: el de la especie si se puso (> 0), si no el general. */
export function precioAMano(pieza: Pick<PiezaCubicada, "especie">, aMano: PreciosAMano): PrecioDePieza {
  const esp = pieza.especie?.trim().toLowerCase();
  const propio = esp ? Number(aMano.porEspecie[esp]) : 0;
  if (propio > 0) return { precioPt: propio, desde: "mano-especie", grupo: null };
  if (aMano.general > 0) return { precioPt: aMano.general, desde: "mano-general", grupo: null };
  return { precioPt: 0, desde: null, grupo: null };
}

/** La versión del trato del dueño que rige para esta pieza, o `null`. */
export function tratoDeLaPieza(pieza: Pick<PiezaCubicada, "duenoParteId">, ctx: ContextoPrecio): TarifaCliente | null {
  if (ctx.modo === "manual" || !pieza.duenoParteId) return null;
  return tarifaVigente(ctx.tratos?.get(pieza.duenoParteId) ?? [], ctx.modo, ctx.fecha);
}

export function precioDePieza(pieza: PiezaConPrecio, ctx: ContextoPrecio): PrecioDePieza {
  const trato = tratoDeLaPieza(pieza, ctx);
  const delCliente = trato ? precioDelCliente(trato, ctx.grupos ?? [], pieza.especie, tipoDePieza(pieza)) : null;
  if (delCliente) return { precioPt: delCliente.precioPt, desde: delCliente.desde, grupo: delCliente.grupo };
  return precioAMano(pieza, ctx.aMano);
}

/** «precio del cliente para Tornillo», «precio a mano para Cedro», «precio general a mano». */
export function explicarPrecioDePieza(p: PrecioDePieza, pieza: PiezaConPrecio): string {
  switch (p.desde) {
    case null:
      return "sin precio";
    case "mano-especie":
      return `precio a mano para ${pieza.especie?.trim() || "la especie"}`;
    case "mano-general":
      return "precio general a mano";
    default:
      return explicarOrigenCliente({ precioPt: p.precioPt, desde: p.desde, grupo: p.grupo }, pieza.especie, tipoDePieza(pieza));
  }
}

/** El resolver `(pieza) => S/ por PT` que piden `agruparPor`, el PDF, el Excel y la liquidación. */
export function resolverPrecio(ctx: ContextoPrecio): (p: PiezaConPrecio) => number {
  return (p) => precioDePieza(p, ctx).precioPt;
}

/** ¿Hay piezas con un precio que no es el general? Cambia cómo se rotula el valor. */
export function hayPrecioVariable(rows: readonly PiezaConPrecio[], ctx: ContextoPrecio): boolean {
  return rows.some((r) => {
    const d = precioDePieza(r, ctx).desde;
    return d != null && d !== "mano-general";
  });
}

/** Una línea del desglose: un dueño, una especie y el precio que le tocó. */
export interface LineaDePrecio {
  clave: string;
  dueno: string | null;
  /** Salió del Directorio: el nombre es el de la ficha, no un texto suelto. */
  delDirectorio: boolean;
  especie: string | null;
  /** Sólo cuando el precio dependió del tipo (trato del cliente «por tipo»). */
  tipo: TipoComercial | null;
  pt: number;
  piezas: number;
  precio: PrecioDePieza;
  explicacion: string;
  /** PT × precio de cada pieza, sumado. `null` = sin precio. */
  importe: number | null;
}

/**
 * Cómo se puso el precio del lote: una línea por dueño y especie (y por tipo,
 * cuando el trato del cliente cobra por tipo), con su origen en palabras.
 * Es lo que se lee para discutir el importe frente al cliente.
 */
export function desglosePorPrecio(rows: readonly (PiezaConPrecio & Pick<PiezaCubicada, "dueno" | "pieTablar" | "cantidad">)[], ctx: ContextoPrecio): LineaDePrecio[] {
  const mapa = new Map<string, LineaDePrecio>();
  for (const r of rows) {
    const precio = precioDePieza(r, ctx);
    const tipo = precio.desde === "cliente-tipo" ? tipoDePieza(r) : null;
    const dueno = r.dueno?.trim() || null;
    const especie = r.especie?.trim() || null;
    const clave = [r.duenoParteId ?? dueno ?? "", (especie ?? "").toLowerCase(), tipo ?? "", precio.desde ?? "", precio.precioPt].join("|");
    const previa = mapa.get(clave);
    const importe = precio.desde ? r.pieTablar * precio.precioPt : null;
    if (previa) {
      previa.pt += r.pieTablar;
      previa.piezas += r.cantidad;
      previa.importe = previa.importe != null && importe != null ? previa.importe + importe : previa.importe;
    } else {
      mapa.set(clave, {
        clave,
        dueno,
        delDirectorio: Boolean(r.duenoParteId),
        especie,
        tipo,
        pt: r.pieTablar,
        piezas: r.cantidad,
        precio,
        explicacion: explicarPrecioDePieza(precio, r),
        importe,
      });
    }
  }
  const ordenTipo = (t: TipoComercial | null) => (t ? ORDEN_TIPO.indexOf(t) : -1);
  return [...mapa.values()]
    .map((l) => ({ ...l, pt: r2(l.pt), importe: l.importe != null ? r2(l.importe) : null }))
    .sort(
      (a, b) =>
        (a.dueno ?? "￿").localeCompare(b.dueno ?? "￿", "es") ||
        (a.especie ?? "￿").localeCompare(b.especie ?? "￿", "es") ||
        ordenTipo(a.tipo) - ordenTipo(b.tipo),
    );
}
