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
import { claveGrupo } from "./cubicacion-salidas";
import { ORDEN_TIPO, tipoDePieza, type TipoComercial } from "./cubicacion-tipo";

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
    /* Una pieza sin precio propio se valorizó con el general (`precioDeCubicacion`):
       cuenta como tal. Antes una sola así (guardada por otro camino) apagaba la
       reposición entera y Tornillo a 2,5 volvía al general (medido 24-10). */
    const precio = p.precio === undefined || p.precio === null ? general : p.precio;
    if (!Number.isFinite(precio)) return null;
    const k = p.especie?.trim().toLowerCase() ?? "";
    /* Sin especie sólo puede ir al general: con otro precio, «A mano» no lo reproduce. */
    if (!k) {
      if (cent(precio) !== cent(general)) return null;
      continue;
    }
    const previo = porEspecie.get(k);
    if (previo === undefined) porEspecie.set(k, precio);
    else if (cent(previo) !== cent(precio)) return null;
  }
  const distintos = [...porEspecie].filter(([, v]) => cent(v) !== cent(general));
  if (distintos.length === 0) return null;
  /* El editor ignora una especie en 0 (va al general): si el general no es 0, no se puede reproducir. */
  if (distintos.some(([, v]) => cent(v) <= 0)) return null;
  return Object.fromEntries(distintos.map(([k, v]) => [k, String(v)]));
}

/** Lo que vuelve al editor «A mano» al reabrir una guardada (28-10, precio por especie y tipo). */
export interface PreciosAManoDeGuardada {
  /** Especie en minúsculas → texto: sólo las que no van al general. */
  porEspecie: Record<string, string>;
  /** `claveGrupo(especie, tipo)` → texto: sólo los tipos que no van al precio de su especie. */
  porEspecieTipo: Record<string, string>;
  /** Las especies de la guardada (minúsculas): las que el editor reescribe; las demás no se tocan. */
  especies: string[];
}

type PiezaDeGuardada = Pick<PiezaCubicada, "especie" | "precio" | "pieTablar" | "tipo" | "espesor" | "ancho" | "largo" | "uEspesor" | "uAncho" | "uLargo">;

/**
 * Como `preciosParejosPorEspecie`, pero también reproduce un precio por tipo
 * DENTRO de una especie (Brandon 28-10: «a cuánto lo acordado de corta,
 * comercial…»). Cada especie toma como suyo el precio que más pie tablar
 * cubre (empate: el general); los tipos a otro precio quedan en
 * `porEspecieTipo`. `null` = no se puede reproducir con «A mano» (dos precios
 * en el mismo especie × tipo, un tipo a S/ 0 que el editor mandaría a la
 * especie, una pieza sin especie fuera del general) o es una cubicación vieja
 * sin precio por pieza: entonces no se toca nada.
 *
 * Si TODO va al general devuelve listas vacías (no `null`): sus especies se
 * limpian y el lote vale lo mismo que el día que se guardó.
 */
export function preciosAManoDeGuardada(piezas: readonly PiezaDeGuardada[], precioGeneral: number): PreciosAManoDeGuardada | null {
  if (piezas.length === 0 || !piezas.some((p) => p.precio !== undefined && p.precio !== null)) return null;
  const general = Number.isFinite(precioGeneral) ? precioGeneral : 0;
  const cGeneral = cent(general);
  /* especie → tipo → { céntimos, PT } */
  const especies = new Map<string, Map<TipoComercial, { c: number; pt: number }>>();
  for (const p of piezas) {
    const precio = p.precio === undefined || p.precio === null ? general : p.precio;
    if (!Number.isFinite(precio)) return null;
    const k = p.especie?.trim().toLowerCase() ?? "";
    if (!k) {
      if (cent(precio) !== cGeneral) return null;
      continue;
    }
    const tipos = especies.get(k) ?? new Map<TipoComercial, { c: number; pt: number }>();
    especies.set(k, tipos);
    const tipo = tipoDePieza(p);
    const pt = Number.isFinite(p.pieTablar) ? p.pieTablar : 0;
    const previo = tipos.get(tipo);
    if (!previo) tipos.set(tipo, { c: cent(precio), pt });
    else if (previo.c !== cent(precio)) return null;
    else previo.pt += pt;
  }

  const porEspecie: Record<string, string> = {};
  const porEspecieTipo: Record<string, string> = {};
  const texto = (c: number) => String(c / 100);
  for (const [k, tipos] of especies) {
    const enOrden = [...tipos].sort(([a], [b]) => ORDEN_TIPO.indexOf(a) - ORDEN_TIPO.indexOf(b));
    const ptPorPrecio = new Map<number, number>();
    for (const [, { c, pt }] of enOrden) ptPorPrecio.set(c, (ptPorPrecio.get(c) ?? 0) + pt);
    let base = enOrden[0][1].c;
    for (const [c, pt] of ptPorPrecio) if (pt > (ptPorPrecio.get(base) ?? 0)) base = c;
    if (ptPorPrecio.get(cGeneral) === ptPorPrecio.get(base)) base = cGeneral;
    if (base !== cGeneral) {
      /* El editor manda una especie en 0 al general. */
      if (base <= 0) return null;
      porEspecie[k] = texto(base);
    }
    for (const [tipo, { c }] of enOrden) {
      if (c === base) continue;
      /* Un tipo en 0 caería al precio de la especie. */
      if (c <= 0) return null;
      porEspecieTipo[claveGrupo(k, tipo)] = texto(c);
    }
  }
  return { porEspecie, porEspecieTipo, especies: [...especies.keys()] };
}
