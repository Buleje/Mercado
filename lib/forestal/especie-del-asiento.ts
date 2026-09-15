/**
 * especie-del-asiento.ts — qué especie declara una corrida del Libro (ADR-417).
 *
 * El LO-CTP declara **una** especie por asiento. Hasta hoy salía sola de lo
 * cubicado, y cuando nadie la había puesto en las piezas el campo mostraba
 * «Sin especie declarada» y la corrida se registraba igual: así quedó la única
 * producción sin lote real del tenant (N.º 28 del 10/09 — 6 paquetes,
 * 0,2417 m³, sin especie y sin permiso). Un asiento sin especie no le sirve a
 * nadie: ni al saldo por permiso (que cuenta por especie) ni a una
 * fiscalización.
 *
 * La regla, en un solo lugar para que la pantalla y los tests digan lo mismo.
 */

export type EspecieDelAsiento =
  /** Lo cubicado declara una sola: esa manda y no se pregunta. */
  | { estado: "de-lo-cubicado"; especie: string }
  /** Falta o hay varias, y ya se eligió cuál declara el asiento. */
  | { estado: "elegida"; especie: string }
  /** No hay con qué declarar todavía: la pantalla tiene que pedirla. */
  | { estado: "falta"; especie: null; motivo: "sin-especie" | "varias" };

/**
 * `cubicadas` son las especies distintas que traen las piezas; `elegida`, la que
 * se eligió a mano en el paso «declarar».
 *
 * Con una sola especie cubicada, esa gana **aunque haya una elegida**: volver a
 * cubicar y corregir la especie tiene que tener efecto, si no la pantalla
 * seguiría declarando la vieja.
 */
export function especieDelAsiento(
  cubicadas: readonly string[],
  elegida: string | null | undefined,
): EspecieDelAsiento {
  const limpias = [...new Set(cubicadas.map((e) => e?.trim()).filter((e): e is string => Boolean(e)))];
  if (limpias.length === 1) return { estado: "de-lo-cubicado", especie: limpias[0]! };
  const aMano = elegida?.trim();
  if (aMano) return { estado: "elegida", especie: aMano };
  return { estado: "falta", especie: null, motivo: limpias.length === 0 ? "sin-especie" : "varias" };
}

/** Lo que se dice bajo el campo. Vacío cuando no hay nada que aclarar. */
export function avisoDeEspecie(r: EspecieDelAsiento, piezas: number): string {
  if (r.estado === "de-lo-cubicado") return "";
  if (r.estado === "falta" && r.motivo === "sin-especie") {
    return "Lo cubicado no dice de qué especie es. El asiento declara una, y elegirla acá se la pone a todas las piezas.";
  }
  return `El asiento declara UNA especie: la que elijas se le pone a las ${piezas} piezas cubicadas.`;
}
