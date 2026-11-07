/**
 * gtf-anexos — el (36) «Anexos que forman parte integrante de la GTF» del
 * formato 2024: qué casilla lleva la «X» (Brandon 16-10: su guía 19-000003
 * trae marcado a mano «Anexo 03: Listado de Trozas»; hasta hoy el sistema lo
 * dejaba en blanco, ADR-494).
 *
 * Regla: la guía lleva lista cuando su (33) «Lista de Trozas/Productos
 * Transformados N°» tiene número. Si lo que viaja es madera en rollo, la lista
 * es el Anexo 03 (Listado de Trozas); si son productos transformados, el
 * Anexo 04. Los anexos 01 (detalle adicional) y 02 (varios orígenes) los
 * marca quien emite: el sistema no los arma.
 *
 * Claves de `casillerosGtf` (las usan la hoja SERFOR, el talonario y «Datos»):
 * `36a3` y `36a4`, con «X» o vacío. PURO y client-safe.
 */

export const CLAVE_ANEXO_TROZAS = "36a3";
export const CLAVE_ANEXO_TRANSFORMADOS = "36a4";

/** ¿Lo que viaja es madera en rollo? (trozas: tipo «Madera en rollo»/«rolliza» o presentación «Trozas»). */
export function esMaderaEnRollo(lineas: ReadonlyArray<{ tipoProducto?: string | null; presentacion?: string | null }>): boolean {
  if (lineas.length === 0) return true;
  return lineas.every((l) => /rollo|rolliz|troza/i.test(`${l.tipoProducto ?? ""} ${l.presentacion ?? ""}`));
}

/** Las dos casillas del (36) que salen de los datos: «X» en la que corresponde, vacío en la otra. */
export function marcasAnexos(listasTrozas: string | null | undefined, enRollo: boolean): Record<typeof CLAVE_ANEXO_TROZAS | typeof CLAVE_ANEXO_TRANSFORMADOS, string> {
  const hayLista = String(listasTrozas ?? "").trim() !== "";
  return {
    [CLAVE_ANEXO_TROZAS]: hayLista && enRollo ? "X" : "",
    [CLAVE_ANEXO_TRANSFORMADOS]: hayLista && !enRollo ? "X" : "",
  };
}
