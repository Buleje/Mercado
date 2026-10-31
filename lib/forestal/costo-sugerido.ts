/**
 * Cuánto se suele pagar por esta madera — la sugerencia del costo (ADR-135).
 *
 * El libro registra volumen desde siempre y plata casi nunca: medido en el
 * tenant forestal, **0 % del patio valorizado** (0 m³ de 32.933). La pantalla
 * para cargarlo existe desde agosto; lo que falta es que el número esté a un
 * click cuando llega la factura, en vez de tener que recordarlo de memoria.
 *
 * La sugerencia sale del propio libro —lo que ya se pagó— y no de un catálogo
 * que alguien tendría que mantener. Prioridad: **mismo proveedor y especie**
 * gana, porque un precio es de un trato concreto; si no hay, la misma especie
 * de cualquier proveedor sirve de referencia, y se DICE de dónde salió: una
 * cifra sugerida sin decir su origen se copia sin pensarla.
 *
 * PURO: sin React ni fetch. Lo que propone un costo que va a terminar en un
 * estado de resultados se testea sin navegador.
 */

/** Lo mínimo que hace falta de un ingreso para proponer un precio. */
export interface IngresoValorizable {
  id: string;
  speciesCommonName?: string | null;
  providerName?: string | null;
  volumeM3: number | string | null;
  costoTotal?: number | string | null;
  /** Para elegir el más reciente. */
  entryDate?: string | Date | null;
  createdAt?: string | Date | null;
}

/** De dónde salió la sugerencia. Se muestra: un número sin origen no se piensa. */
export type OrigenSugerencia = "proveedor-especie" | "especie" | "proveedor";

export interface CostoSugerido {
  /** Soles por m³. */
  porM3: number;
  origen: OrigenSugerencia;
  /** El ingreso del que salió, para poder nombrarlo. */
  deGuia: string | null;
  /** Cuántos ingresos respaldan la sugerencia (1 = un solo antecedente). */
  casos: number;
}

const num = (v: number | string | null | undefined): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Sin tildes ni mayúsculas: «Tornillo» y «TORNILLO» son la misma especie. */
const norm = (v: string | null | undefined) =>
  (v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const fecha = (e: IngresoValorizable): number => {
  const d = new Date(e.entryDate ?? e.createdAt ?? 0).getTime();
  return Number.isFinite(d) ? d : 0;
};

/**
 * El costo por m³ de un ingreso, o `null` si no se puede calcular.
 *
 * Un costo de 0 NO es un costo: es lo que deja `@default(0)` de un campo que
 * nadie llenó. Tomarlo por bueno pondría «S/ 0.00 por m³» como antecedente y
 * arrastraría el error a todos los ingresos siguientes.
 */
export function costoPorM3(e: IngresoValorizable): number | null {
  const costo = num(e.costoTotal);
  const vol = num(e.volumeM3);
  if (costo == null || costo <= 0 || vol == null || vol <= 0) return null;
  return Math.round((costo / vol) * 100) / 100;
}

/** ¿Este ingreso ya tiene su plata cargada? */
export const tieneCosto = (e: IngresoValorizable): boolean => (num(e.costoTotal) ?? 0) > 0;

/**
 * Qué proponer para una guía de esta especie y este proveedor.
 *
 * Devuelve `null` cuando no hay ningún antecedente: preferible a inventar un
 * número, que es exactamente lo que un libro fiscalizable no puede hacer.
 */
export function sugerirCostoPorM3(
  ingresos: readonly IngresoValorizable[],
  de: { especie?: string | null; proveedor?: string | null },
): CostoSugerido | null {
  const especie = norm(de.especie);
  const proveedor = norm(de.proveedor);
  const conCosto = ingresos.filter((e) => costoPorM3(e) != null);
  if (conCosto.length === 0) return null;

  const buscar = (
    filtro: (e: IngresoValorizable) => boolean,
    origen: OrigenSugerencia,
  ): CostoSugerido | null => {
    const cand = conCosto.filter(filtro);
    if (cand.length === 0) return null;
    /* El MÁS RECIENTE, no el promedio: el precio de la madera se mueve, y un
       promedio de seis meses propone un número que hoy no paga nadie. */
    const ultimo = cand.reduce((a, b) => (fecha(b) >= fecha(a) ? b : a));
    return {
      porM3: costoPorM3(ultimo) as number,
      origen,
      deGuia: (ultimo as { gtfNumber?: string | null }).gtfNumber ?? null,
      casos: cand.length,
    };
  };

  return (
    (especie && proveedor
      ? buscar((e) => norm(e.speciesCommonName) === especie && norm(e.providerName) === proveedor, "proveedor-especie")
      : null) ??
    (especie ? buscar((e) => norm(e.speciesCommonName) === especie, "especie") : null) ??
    (proveedor ? buscar((e) => norm(e.providerName) === proveedor, "proveedor") : null)
  );
}

/** Cómo se explica de dónde salió la sugerencia. */
export function textoDeOrigen(s: CostoSugerido, especie?: string | null, proveedor?: string | null): string {
  const base =
    s.origen === "proveedor-especie"
      ? `lo último que pagaste por ${especie ?? "esta especie"} a ${proveedor ?? "este proveedor"}`
      : s.origen === "especie"
        ? `lo último que pagaste por ${especie ?? "esta especie"}, de otro proveedor`
        : `lo último que le pagaste a ${proveedor ?? "este proveedor"}, de otra especie`;
  return s.deGuia ? `${base} (guía ${s.deGuia})` : base;
}
