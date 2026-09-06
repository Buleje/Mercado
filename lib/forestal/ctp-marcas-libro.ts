/**
 * Las marcas que el libro escribe en Observaciones.
 *
 * El pie de cada reporte del SNIFFS trae su propia leyenda, y no es decorativa:
 * define qué significan las filas. En el libro real del aserradero, **516 de
 * 771 salidas** llevan `C/I` — 423 m³ que NO salieron a un tercero sino que se
 * usaron adentro. Leerlas como despachos infla lo despachado en dos tercios y
 * deja el producto terminado en un saldo que no existe.
 *
 *     C/I      Consumo Interno
 *     P/R      Paquete Reprocesado
 *     P/A[N]   Paquete Agrupado al correlativo N
 *     DIV[N]   Paquete dividido del correlativo N
 *     S/D      Saldo descartado en la transformación
 *     T/D      Troza Descartada (Apartado 2)
 *
 * PURO: recibe el texto de la observación y dice qué declara.
 */

export type MarcaLibro = "consumoInterno" | "reprocesado" | "agrupado" | "dividido" | "saldoDescartado" | "trozaDescartada";

export type LecturaDeMarcas = {
  marcas: MarcaLibro[];
  /**
   * El correlativo al que apunta `P/A[N]` o `DIV[N]`.
   *
   * Es una relación entre filas del mismo libro: el paquete 44 salió de dividir
   * el 12. Sin guardarlo, esa fila queda huérfana y nadie puede reconstruir de
   * dónde vino.
   */
  correlativo: number | null;
};

const VACIO: LecturaDeMarcas = { marcas: [], correlativo: null };

/**
 * Lee las marcas de una observación.
 *
 * Se buscan como palabra suelta: una observación que dice «llegó con corte
 * irregular» no lleva C/I sólo porque la letra aparezca adentro de otra palabra.
 */
export function leerMarcas(observaciones: unknown): LecturaDeMarcas {
  const t = (observaciones == null ? "" : String(observaciones)).toUpperCase();
  if (!t.trim()) return VACIO;

  const marcas: MarcaLibro[] = [];
  if (/\bC\s*\/\s*I\b/.test(t)) marcas.push("consumoInterno");
  if (/\bP\s*\/\s*R\b/.test(t)) marcas.push("reprocesado");
  if (/\bP\s*\/\s*A\b/.test(t)) marcas.push("agrupado");
  if (/\bDIV\b/.test(t)) marcas.push("dividido");
  if (/\bS\s*\/\s*D\b/.test(t)) marcas.push("saldoDescartado");
  if (/\bT\s*\/\s*D\b/.test(t)) marcas.push("trozaDescartada");

  /* El número entre corchetes de `DIV[12]` o `P/A[44]`. Se toma el primero:
     una fila apunta a un correlativo, no a varios. */
  const m = t.match(/(?:DIV|P\s*\/\s*A)\s*\[?\s*(\d+)\s*\]?/);
  const correlativo = m ? Number(m[1]) : null;

  return { marcas, correlativo: Number.isFinite(correlativo) ? correlativo : null };
}

/** ¿Esta salida se usó adentro en vez de despacharse a un tercero? */
export function esConsumoInterno(observaciones: unknown): boolean {
  return leerMarcas(observaciones).marcas.includes("consumoInterno");
}

/** ¿Este pedazo del retrozado es descarte y no producto? */
export function esDescarte(observaciones: unknown): boolean {
  const { marcas } = leerMarcas(observaciones);
  return marcas.includes("trozaDescartada") || marcas.includes("saldoDescartado");
}

/** Cómo se lee cada marca en pantalla. */
export const ETIQUETA_MARCA: Record<MarcaLibro, string> = {
  consumoInterno: "Consumo interno",
  reprocesado: "Reprocesado",
  agrupado: "Agrupado a otro paquete",
  dividido: "Dividido de otro paquete",
  saldoDescartado: "Saldo descartado",
  trozaDescartada: "Troza descartada",
};

/** Una frase para el operador, o `null` si la fila no declara nada especial. */
export function explicarMarcas(observaciones: unknown): string | null {
  const { marcas, correlativo } = leerMarcas(observaciones);
  if (marcas.length === 0) return null;
  const partes = marcas.map((m) => {
    /* El correlativo sólo aclara las marcas que apuntan a otra fila. */
    if ((m === "dividido" || m === "agrupado") && correlativo != null) {
      return `${ETIQUETA_MARCA[m]} (N° ${correlativo})`;
    }
    return ETIQUETA_MARCA[m];
  });
  return partes.join(" · ");
}
