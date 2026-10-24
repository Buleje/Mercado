/**
 * Claves de deduplicación de corridas al importar el libro (ADR-138 etapa 2).
 *
 * Puras y sin servidor: las usa el endpoint de importación (vía `forest-ctp.db.ts`,
 * que las re-exporta) y el modal, que con ellas avisa ANTES de enviar si dos
 * archivos de la misma sección traen el mismo paquete (19-10, varios archivos
 * por sección).
 */
import { claveEspecie } from "@/lib/forestal/loth-constants";

/**
 * Clave estable de una corrida para el dedup de importación (ADR-138 etapa 2):
 * fecha date-only + producto + especie + cantidad(4 dec). La usan la DB class y
 * el endpoint de import — misma fórmula a ambos lados o el dedup no matchea.
 */
/**
 * La clave VIEJA, sin paquete ni lote.
 *
 * Existe sólo por compatibilidad: las corridas que se importaron antes de que la
 * clave incluyera el paquete no tienen con qué distinguirse. Si al re-importar
 * el mismo libro se las midiera con la clave nueva, no matchearían y la
 * producción entraría DOS VECES — declarar de más es exactamente lo que el
 * libro no puede hacer.
 */
export function produccionKeyBase(
  entryDate: Date | string,
  productType: string | null,
  speciesCommon: string | null,
  quantity: unknown,
): string {
  const d =
    entryDate instanceof Date
      ? entryDate.toISOString().slice(0, 10)
      : String(entryDate ?? "").slice(0, 10);
  const q = quantity == null || quantity === "" ? "" : Number(quantity).toFixed(4);
  return [
    d,
    (productType ?? "").trim().toLowerCase(),
    /* La especie va por `claveEspecie`, la MISMA con la que el libro decide qué
       grafía guardar (ADR-410). Con `toLowerCase()` a secas, un archivo que dice
       «Ishpíngo» o «Tornillo (Cedrelinga cateniformis)» se guardaba como
       «Ishpingo» / «Tornillo» y al reimportar la clave ya no matcheaba: la misma
       corrida entraba DOS VECES. Declarar de más es exactamente lo que el libro
       no puede hacer (encontrado por auditoría, 2026-09-11). */
    claveEspecie(speciesCommon),
    q,
  ].join("|");
}

export function produccionKey(
  entryDate: Date | string,
  productType: string | null,
  speciesCommon: string | null,
  quantity: unknown,
  /**
   * El código del PAQUETE y el LOTE, cuando el archivo los trae.
   *
   * Sin ellos, dos paquetes distintos de la misma especie, el mismo producto y
   * el mismo volumen —lo NORMAL en un inventario de aserrada: los paquetes se
   * arman iguales— tenían la misma clave y el importador descartaba el segundo
   * como «duplicado en el archivo». Se perdía madera que existe en el depósito.
   */
  codigoProducto?: string | null,
  materiaPrimaRef?: string | null,
): string {
  const d =
    entryDate instanceof Date
      ? entryDate.toISOString().slice(0, 10)
      : String(entryDate ?? "").slice(0, 10);
  const q = quantity == null || quantity === "" ? "" : Number(quantity).toFixed(4);
  const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
  return [
    d,
    norm(productType),
    /* Misma normalización que el guardado (ver `produccionKeyBase`). */
    claveEspecie(speciesCommon),
    q,
    norm(codigoProducto),
    norm(materiaPrimaRef),
  ].join("|");
}
