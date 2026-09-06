/**
 * planta-resumen — qué hay parado en una zona, en números.
 *
 * La ficha de una zona tiene que responder lo que pregunta el jefe de patio
 * cuando la señala: cuánta troza hay, cuánta aserrada, y **de qué especies**.
 * El desglose por especie es el que decide si se puede cumplir un pedido: 40 m³
 * de troza no sirven si el pedido es de shihuahuaco y todo lo que hay es
 * tornillo.
 *
 * La regla que evita mentir: **nunca se suman dos unidades distintas**. Las
 * trozas están siempre en m³, pero la producción puede estar en pies tablares,
 * en m³ o en unidades según el producto; sumarlas daría un total sin
 * significado. Cada unidad lleva su propio subtotal y se muestran una al lado
 * de la otra.
 *
 * PURO y client-safe.
 */

import type { Item, ItemKind } from "./planta-zona-types";

/** Un subtotal es siempre «cuánto» + «de qué unidad»: nunca un número suelto. */
export interface Subtotal {
  unidad: string;
  cantidad: number;
  /** Cuántas líneas del libro lo componen. */
  lineas: number;
}

export interface PorEspecie {
  especie: string;
  subtotales: Subtotal[];
  lineas: number;
  /** Para ordenar: el volumen en m³ si lo hay, si no la cantidad mayor. */
  peso: number;
}

export interface ResumenZona {
  /** Subtotales por tipo (troza / aserrada / despacho), cada uno por unidad. */
  porKind: { kind: ItemKind; subtotales: Subtotal[]; lineas: number }[];
  /** Desglose por especie, de mayor a menor. */
  porEspecie: PorEspecie[];
  lineas: number;
  /** Alguna línea es de especie CITES: la zona lo tiene que decir. */
  cites: boolean;
}

const r3 = (n: number) => Number(n.toFixed(3));
const ORDEN: ItemKind[] = ["troza", "producto", "despacho"];

/** Unidad normalizada: «M3 » y «m3» son la misma cosa en el patio. */
export function normalizarUnidad(u: string | null | undefined): string {
  const s = (u ?? "").trim();
  if (!s) return "u";
  const b = s.toLowerCase();
  return b === "m3" || b === "m³" ? "m³" : b;
}

function acumular(mapa: Map<string, Subtotal>, unidad: string, cantidad: number): void {
  const u = normalizarUnidad(unidad);
  const cur = mapa.get(u) ?? { unidad: u, cantidad: 0, lineas: 0 };
  cur.cantidad = r3(cur.cantidad + (Number.isFinite(cantidad) ? cantidad : 0));
  cur.lineas += 1;
  mapa.set(u, cur);
}

/** Los subtotales ordenados: m³ primero (es la unidad del libro), después el resto. */
function ordenarSubtotales(m: Map<string, Subtotal>): Subtotal[] {
  return [...m.values()].sort((a, b) => (a.unidad === "m³" ? -1 : b.unidad === "m³" ? 1 : a.unidad.localeCompare(b.unidad)));
}

/**
 * Resumen de un conjunto de ítems (los de una zona, o los de toda la planta).
 *
 * `especieDe` sale afuera porque el ítem guarda la especie en `sub`, que para
 * la producción puede traer el tipo de producto en su lugar.
 */
export function resumirItems(
  items: readonly Item[],
  especieDe: (it: Item) => string | null = (it) => it.sub,
): ResumenZona {
  const porKindMap = new Map<ItemKind, Map<string, Subtotal>>();
  const porEspecieMap = new Map<string, Map<string, Subtotal>>();
  let cites = false;

  for (const it of items) {
    if (it.cites) cites = true;
    const k = porKindMap.get(it.kind) ?? new Map<string, Subtotal>();
    acumular(k, it.unidad, it.cantidad);
    porKindMap.set(it.kind, k);

    // El despacho ya salió de la planta: cuenta en su tipo, pero no infla el
    // desglose de lo que hay parado en la zona.
    if (it.kind === "despacho") continue;
    const esp = (especieDe(it) ?? "").trim() || "Sin especie";
    const e = porEspecieMap.get(esp) ?? new Map<string, Subtotal>();
    acumular(e, it.unidad, it.cantidad);
    porEspecieMap.set(esp, e);
  }

  const porEspecie: PorEspecie[] = [...porEspecieMap.entries()].map(([especie, m]) => {
    const subtotales = ordenarSubtotales(m);
    const m3 = subtotales.find((s) => s.unidad === "m³");
    return {
      especie,
      subtotales,
      lineas: subtotales.reduce((a, s) => a + s.lineas, 0),
      peso: m3 ? m3.cantidad : Math.max(0, ...subtotales.map((s) => s.cantidad)),
    };
  });
  // Lo que más pesa arriba; «Sin especie» siempre último — es un pendiente de
  // carga, no una especie del patio.
  porEspecie.sort((a, b) => {
    if (a.especie === "Sin especie") return 1;
    if (b.especie === "Sin especie") return -1;
    return b.peso - a.peso || a.especie.localeCompare(b.especie);
  });

  return {
    porKind: ORDEN.filter((k) => porKindMap.has(k)).map((kind) => {
      const subtotales = ordenarSubtotales(porKindMap.get(kind) as Map<string, Subtotal>);
      return { kind, subtotales, lineas: subtotales.reduce((a, s) => a + s.lineas, 0) };
    }),
    porEspecie,
    lineas: items.length,
    cites,
  };
}

/** «12.5 m³» / «1,240 pt» — para pantalla, no para el CSV. */
export function fmtSubtotal(s: Subtotal): string {
  const n = Number.isInteger(s.cantidad)
    ? s.cantidad.toLocaleString("es-PE")
    : s.cantidad.toLocaleString("es-PE", { maximumFractionDigits: 2 });
  return `${n} ${s.unidad}`;
}

/** Los subtotales de un tipo, listos para una línea: «40 m³ · 1,200 pt». */
export function fmtSubtotales(subs: readonly Subtotal[]): string {
  return subs.map(fmtSubtotal).join(" · ");
}
