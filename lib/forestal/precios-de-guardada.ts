/**
 * Reabrir una cubicación guardada con SUS precios (Brandon 24-10, modal
 * «Guardar cubicación»).
 *
 * Desde el 24-10 cada pieza guardada trae el precio por PT con que se
 * valorizó (`PiezaCubicada.precio`: el de su especie, o el trato de su
 * dueño). Si cada especie tiene UN solo precio, el lote se puede volver a
 * poner en «A mano» con el precio de cada especie y vale lo mismo que el día
 * que se guardó. Si no se puede (dos dueños con trato distinto en la misma
 * especie, una cubicación vieja sin precio por pieza, una especie a S/ 0 con
 * el general puesto), devuelve `null` y el cubicador queda como hasta hoy:
 * sólo el general.
 */
import type { PiezaCubicada } from "./cubicacion";

/** Céntimos: los precios se guardan con 2 decimales y se comparan así, no con un epsilon. */
const cent = (n: number) => Math.round(n * 100);

/**
 * El precio de cada especie que difiere del general, en la forma del editor
 * «A mano» (`preciosEspecie`: especie en minúsculas → texto). `null` = no es
 * parejo por especie (o no hay nada distinto del general): no tocar el precio.
 */
export function preciosParejosPorEspecie(
  piezas: readonly Pick<PiezaCubicada, "especie" | "precio">[],
  precioGeneral: number,
): Record<string, string> | null {
  if (piezas.length === 0) return null;
  const general = Number.isFinite(precioGeneral) ? precioGeneral : 0;
  const porEspecie = new Map<string, number>();
  for (const p of piezas) {
    if (p.precio === undefined || p.precio === null || !Number.isFinite(p.precio)) return null;
    const k = p.especie?.trim().toLowerCase() ?? "";
    /* Sin especie sólo puede ir al general: con otro precio, «A mano» no lo reproduce. */
    if (!k) {
      if (cent(p.precio) !== cent(general)) return null;
      continue;
    }
    const previo = porEspecie.get(k);
    if (previo === undefined) porEspecie.set(k, p.precio);
    else if (cent(previo) !== cent(p.precio)) return null;
  }
  const distintos = [...porEspecie].filter(([, v]) => cent(v) !== cent(general));
  if (distintos.length === 0) return null;
  /* El editor ignora una especie en 0 (va al general): si el general no es 0, no se puede reproducir. */
  if (distintos.some(([, v]) => cent(v) <= 0)) return null;
  return Object.fromEntries(distintos.map(([k, v]) => [k, String(v)]));
}
