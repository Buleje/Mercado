/**
 * Los argumentos con los que se cotiza el aserrío de UNA corrida (ADR-430).
 *
 * `cotizarAserrio(version, bloques, opciones)` es la misma función en la
 * pantalla y en el servidor; lo que podía diferir eran las OPCIONES. El
 * revisor de ADR-429 midió lo que pasa cuando la vista previa cotiza con
 * menos datos que el cobro: la pantalla decía «no se carga nada» y el servidor
 * cargó S/ 9 272,68. Con el trato de cada cliente (ADR-430) hay dos datos más
 * que pueden faltar de un lado —el trato vigente y los grupos de especies—, así
 * que se arman en UN solo lugar:
 *
 *   - el precio a mano de la corrida (ADR-429), que manda sobre todo;
 *   - la versión del trato de **aserrío** del cliente que regía el DÍA de la
 *     corrida (no la de hoy: lo cobrado queda con el trato de ese día);
 *   - los grupos de especies de la planta (el catálogo), sin los que un precio
 *     «por grupo» no se encuentra.
 *
 * Lo usan Declarar producción, Cobrar aserrío (una y en tanda) y el bloque del
 * dueño, y es lo que tiene que usar `cobrarCorrida` para que la vista previa
 * sea el cargo y no una cuenta parecida.
 *
 * PURO y client-safe.
 */
import { tarifaVigente, type GrupoEspecies, type TarifaCliente } from "./precio-cliente";
import { cotizarAserrio, type BloqueACobrar, type Cotizacion, type VersionTarifa } from "./tarifa-aserrio";

export interface ArgumentosDelCobro {
  precioManualPt: number | null;
  /** La versión del trato de aserrío del cliente vigente ese día, o `null`. */
  cliente: TarifaCliente | null;
  grupos: readonly GrupoEspecies[];
}

export interface DatosDelCobro {
  /** El precio único pactado para esta corrida. `null`/0 = no hay. */
  precioManualPt?: number | null;
  /** TODAS las versiones del trato del cliente, de los dos servicios: se elige la de aserrío. */
  tarifasCliente?: readonly TarifaCliente[] | null;
  /** Los grupos de especies de la planta (`catalogo.grupos`). */
  grupos?: readonly GrupoEspecies[] | null;
  /** El día de la corrida: `AAAA-MM-DD`, un ISO con hora o la fecha del libro. */
  fecha: string | Date | null | undefined;
}

/** El día `AAAA-MM-DD` de una fecha del libro (date-only guardada a medianoche UTC). */
export function diaDeLaCorrida(fecha: string | Date | null | undefined): string {
  if (fecha instanceof Date) return Number.isNaN(fecha.getTime()) ? "" : fecha.toISOString().slice(0, 10);
  return (fecha ?? "").slice(0, 10);
}

export function argumentosDelCobro(d: DatosDelCobro): ArgumentosDelCobro {
  const manual = d.precioManualPt != null && Number.isFinite(d.precioManualPt) && d.precioManualPt > 0 ? d.precioManualPt : null;
  return {
    precioManualPt: manual,
    cliente: tarifaVigente(d.tarifasCliente ?? [], "aserrio", diaDeLaCorrida(d.fecha)),
    grupos: d.grupos ?? [],
  };
}

/** `cotizarAserrio` con los argumentos del cobro: lo que la pantalla muestra y el servidor carga. */
export function cotizarCorrida(
  version: VersionTarifa | null,
  bloques: readonly BloqueACobrar[],
  datos: DatosDelCobro,
): Cotizacion {
  return cotizarAserrio(version, bloques, argumentosDelCobro(datos));
}
