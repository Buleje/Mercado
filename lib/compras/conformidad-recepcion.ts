/**
 * conformidad-recepcion.ts — C22 «Fechas y conformidad pertinentes» (auditoría
 * Compras, 15-10): qué control pide cada línea de una recepción y las tres
 * fechas que antes se leían como una sola.
 *
 * - **Servicio** (`Product.type = "service"`): no se cuenta ni suma stock
 *   (`naturaleza.ts`); se acepta un ALCANCE y alguien lo acepta. Sin columna
 *   para eso (sin schema esta noche): viaja en las notas de la línea, que el
 *   endpoint ya guarda.
 * - **Perecible**: la fecha de vencimiento hace el lote (`lotes-recepcion.ts`).
 *   `Product.shelfLifeDays` existe pero nada lo escribe ni lo devuelve
 *   `/api/products`: se decide por la categoría.
 *
 * Puro y sin servidor.
 */
import { esServicio } from "@/lib/compras/naturaleza";

/** Categorías que vencen pronto (minúsculas, sin tildes; se busca la raíz). */
const RAICES_PERECIBLES = [
  "lacte", "leche", "yogur", "queso", "carne", "pollo", "embutid", "pescad", "marisco",
  "fruta", "verdura", "panader", "pasteler", "huevo", "helad", "congelad", "farmac",
] as const;

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** `true` si la categoría del producto es de las que vencen (lácteos, carnes, panadería, farmacia…). */
export function esPerecible(p: { category?: string | null; type?: string | null }): boolean {
  if (esServicio(p)) return false;
  const c = sinTildes(p.category ?? "");
  return c !== "" && RAICES_PERECIBLES.some((r) => c.includes(r));
}

export type ControlDeLinea = "servicio" | "perecible" | null;

/** Qué control pertinente pide la línea según su producto (null = mercadería común). */
export function controlDeLinea(p: { category?: string | null; type?: string | null } | undefined): ControlDeLinea {
  if (!p) return null;
  if (esServicio(p)) return "servicio";
  return esPerecible(p) ? "perecible" : null;
}

/** Lo que pide la conformidad de un servicio. */
export type ConformidadServicio = { alcance?: string; aceptaServicio?: string };

export const PREFIJO_ALCANCE = "Alcance aceptado: ";
export const PREFIJO_ACEPTA = "Acepta: ";

/** Las notas de la línea con el alcance y quién lo aceptó (tope 500 del endpoint). */
export function notasConConformidad(notas: string, c: ConformidadServicio): string {
  const partes = [
    notas.trim(),
    c.alcance?.trim() ? `${PREFIJO_ALCANCE}${c.alcance.trim()}` : "",
    c.aceptaServicio?.trim() ? `${PREFIJO_ACEPTA}${c.aceptaServicio.trim()}` : "",
  ].filter(Boolean);
  return partes.join(" · ").slice(0, 500);
}

type LineaParaConformidad = ConformidadServicio & {
  product: string;
  receivedQty: number;
  condition: string;
  expiryDate?: string;
};

/** Qué falta de la conformidad de un servicio, en una frase; null si está todo. */
export function faltaConformidad(lineas: LineaParaConformidad[], controles: ControlDeLinea[]): string | null {
  const i = lineas.findIndex((l, k) =>
    controles[k] === "servicio" && l.condition === "ok" && l.receivedQty > 0 && (!l.alcance?.trim() || !l.aceptaServicio?.trim()),
  );
  if (i < 0) return null;
  return `Anota el alcance aceptado y quién acepta «${lineas[i].product || "el servicio"}».`;
}

/** Perecibles que entran a stock sin fecha de vencimiento (no harán lote ni avisarán al vencer). */
export function pereciblesSinVence(lineas: LineaParaConformidad[], controles: ControlDeLinea[]): string[] {
  return lineas.flatMap((l, k) =>
    controles[k] === "perecible" && l.condition === "ok" && l.receivedQty > 0 && !l.expiryDate?.trim() ? [l.product] : [],
  );
}

/**
 * Las tres fechas de una recepción, separadas: la que prometió el proveedor,
 * cuándo llegó (la anota el servidor al guardar) y cuándo se aceptó. Hoy la
 * aceptación ocurre al guardar (aceptada o parcial con lo que se aceptó);
 * programada / en proceso = todavía sin aceptar; rechazada = no se aceptó.
 */
export function fechasDeRecepcion(r: { scheduledDate?: string; receivedDate?: string; status: string }): {
  programada: string | null; llego: string | null; aceptada: string | null; estadoAceptacion: "aceptada" | "parcial" | "pendiente" | "rechazada";
} {
  const llego = r.receivedDate || null;
  const estadoAceptacion = r.status === "aceptada" ? "aceptada"
    : r.status === "parcial" ? "parcial"
    : r.status === "rechazada" ? "rechazada"
    : "pendiente";
  return {
    programada: r.scheduledDate || null,
    llego,
    aceptada: estadoAceptacion === "aceptada" || estadoAceptacion === "parcial" ? llego : null,
    estadoAceptacion,
  };
}
