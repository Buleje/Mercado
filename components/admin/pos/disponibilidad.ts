/**
 * Qué dice la tarjeta del POS de cada ítem según su TIPO (M10, 17-10).
 *
 * La grilla pintaba el número de `stock` para todo: un servicio con stock 0
 * (el aserrado de Blas) se leía «0» al lado del precio, como mercadería
 * terminada, aunque `estaAgotado` ya lo dejaba vender. Ahora:
 *  - producto  → «12 kg» (con su unidad), bajo / agotado como siempre;
 *  - servicio  → su duración («45 min») o «Sin control de stock»;
 *  - alquiler  → un servicio que se cobra por hora o por día: «Por hora».
 * El precio lleva la unidad con que se cobra («/ kg», «/ m³», «/ hora»).
 * No cambia ninguna regla de venta: sólo lo que se lee.
 */
import { STOCK_MINIMO_GLOBAL_POR_DEFECTO, enStockBajo } from "@/lib/inventario/stock-minimo";
import { estaAgotado } from "@/lib/pos/stock-vendible";

export type TipoVendible = "producto" | "servicio" | "alquiler";
export type NivelDisponible = "ok" | "bajo" | "agotado" | "sin-control";

export interface ItemConDisponibilidad {
  type?: string | null;
  stock?: number | null;
  stockMin?: number | null;
  unit?: string | null;
  pricingUnit?: string | null;
  durationLabel?: string | null;
}

export interface Disponibilidad {
  tipo: TipoVendible;
  /** «Servicio» / «Alquiler»; null para productos (no hace falta distintivo). */
  distintivo: string | null;
  /** Lo que va al lado del precio: «12 kg», «45 min», «Sin control de stock». null = nada que decir. */
  texto: string | null;
  nivel: NivelDisponible;
  /** «/ kg», «/ hora»; null cuando se cobra por unidad suelta o precio fijo. */
  sufijoPrecio: string | null;
}

/** Unidades que no aportan nada al lado del precio («S/ 3 / unidad» es ruido). */
const UNIDAD_SUELTA = new Set(["", "unidad", "unidades", "und", "u", "un", "servicio", "pza", "pieza"]);
const UNIDAD_LEIDA: Record<string, string> = { m3: "m³", "m³": "m³", pt: "pt", dia: "día", día: "día", hora: "hora" };
const COBRO_POR_TIEMPO: Record<string, string> = { hora: "Por hora", dia: "Por día", día: "Por día" };

function unidadLeida(u: string | null | undefined): string | null {
  const t = (u ?? "").trim().toLowerCase();
  if (UNIDAD_SUELTA.has(t)) return null;
  return UNIDAD_LEIDA[t] ?? t;
}

/** `minimoGlobal`: el mínimo del negocio para los productos sin el suyo (regla única de lib/inventario/stock-minimo). */
export function disponibilidadPOS(p: ItemConDisponibilidad, minimoGlobal: number = STOCK_MINIMO_GLOBAL_POR_DEFECTO): Disponibilidad {
  const esServicio = (p.type ?? "product").toLowerCase() === "service";
  const cobro = (p.pricingUnit ?? "").trim().toLowerCase();
  const duracion = p.durationLabel?.trim() || null;

  if (esServicio) {
    const porTiempo = COBRO_POR_TIEMPO[cobro];
    if (porTiempo) {
      return { tipo: "alquiler", distintivo: "Alquiler", texto: duracion ? `${porTiempo} · ${duracion}` : porTiempo, nivel: "sin-control", sufijoPrecio: `/ ${UNIDAD_LEIDA[cobro]}` };
    }
    // «fijo» o vacío = precio por servicio; «m3»/«unidad» = se cobra por cantidad.
    const sufijo = cobro && cobro !== "fijo" ? unidadLeida(cobro) : null;
    return { tipo: "servicio", distintivo: "Servicio", texto: duracion ?? "Sin control de stock", nivel: "sin-control", sufijoPrecio: sufijo ? `/ ${sufijo}` : null };
  }

  const unidad = unidadLeida(p.unit);
  const sufijoPrecio = unidad ? `/ ${unidad}` : null;
  if (p.stock == null) return { tipo: "producto", distintivo: null, texto: null, nivel: "ok", sufijoPrecio };
  if (estaAgotado(p)) return { tipo: "producto", distintivo: null, texto: "Agotado", nivel: "agotado", sufijoPrecio };
  const texto = unidad ? `${p.stock} ${unidad}` : String(p.stock);
  const nivel: NivelDisponible = enStockBajo(p, minimoGlobal) ? "bajo" : "ok";
  return { tipo: "producto", distintivo: null, texto, nivel, sufijoPrecio };
}
