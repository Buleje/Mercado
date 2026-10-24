/**
 * El Anexo 04 guardado de un permiso de la Distribución (Fase 5, 2026-10-03).
 *
 * El anexo no guarda de qué permiso salió: es el papel que se entregó, no un
 * movimiento del libro. En vez de agregar un campo al KV (y a un guardado que
 * mueve stock), el vínculo se lee por CONTENIDO: un anexo guardado es «el de
 * este permiso» si sus medidas son las mismas que la Distribución le arma hoy
 * (medida por medida, con las piezas sumadas). Si la distribución cambió desde
 * que se guardó, ya no es el mismo papel y la pantalla lo dice «sin guardar»:
 * es lo correcto, ese anexo ya no ampara lo que dice la Distribución.
 *
 * Sin React ni red: testeable.
 */
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import type { AnexoEmitido } from "@/lib/forestal/anexo04-registro";

const n = (v: number): string => String(Math.round((Number.isFinite(v) ? v : 0) * 10000) / 10000);

/** Especie + medida con sus unidades: `tornillo|2|pulg|8|pulg|10|pies`. Sin la especie, dos
 *  permisos con las mismas medidas de distinta madera serían «el mismo papel». */
const medida = (p: PiezaCubicada, especieGlobal?: string | null): string =>
  [(p.especie?.trim() || especieGlobal?.trim() || "").toLowerCase(), p.espesor, p.uEspesor, p.ancho, p.uAncho, p.largo, p.uLargo]
    .map((x) => (typeof x === "number" ? n(x) : x))
    .join("|");

/**
 * Las medidas de un conjunto de piezas con la cantidad de cada una, en orden
 * fijo. Dos conjuntos con la misma firma son el mismo papel aunque las filas
 * vengan partidas o en otro orden.
 */
export function firmaDePiezas(piezas: readonly PiezaCubicada[], especieGlobal?: string | null): string {
  const por = new Map<string, number>();
  for (const p of piezas) {
    if (!(p.cantidad > 0)) continue;
    const k = medida(p, especieGlobal);
    por.set(k, (por.get(k) ?? 0) + p.cantidad);
  }
  return [...por.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, c]) => `${k}=${n(c)}`)
    .join(";");
}

/**
 * El anexo guardado que corresponde a las piezas del permiso, o `null`.
 * Con varios iguales (re-guardados, o el reemplazado y el vigente) gana el que
 * ya está en el libro, después el que no fue reemplazado y, si empatan, el más
 * reciente (la lista llega con el más reciente primero).
 */
export function anexoGuardadoDelPermiso(
  piezas: readonly PiezaCubicada[],
  emitidos: readonly AnexoEmitido[],
): AnexoEmitido | null {
  if (piezas.length === 0) return null;
  const firma = firmaDePiezas(piezas);
  if (!firma) return null;
  const iguales = emitidos.filter((a) => firmaDePiezas(a.piezas, a.especieGlobal) === firma);
  if (iguales.length === 0) return null;
  const puntaje = (a: AnexoEmitido): number => ((a.despachoIds?.length ?? 0) > 0 ? 2 : 0) + (a.reemplazadoPor ? 0 : 1);
  return [...iguales].sort((a, b) => puntaje(b) - puntaje(a))[0];
}
