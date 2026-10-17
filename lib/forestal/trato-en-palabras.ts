/**
 * El trato de un cliente en una línea (ADR-430): «Tornillo 0.60 · Duras 1.20 ·
 * lo demás 0.50». Es lo que se lee al lado del selector de cliente —en
 * Declarar producción, al cobrar el aserrío y en el cubicador— para saber de
 * dónde va a salir el precio antes de ver el importe.
 *
 * PURO y client-safe.
 */
import { formatNumber } from "@/lib/format";
import { etiquetaLarga } from "./semana-de-registro";
import type { GrupoEspecies, TarifaCliente } from "./precio-cliente";

const precio = (n: number) => formatNumber(n, { min: 2, max: 4 });
/** Más que esto no entra en una línea: se dice cuántos quedan. */
const MAX_PRECIOS = 5;

export function tratoEnPalabras(t: TarifaCliente, grupos: readonly GrupoEspecies[]): string {
  const partes: string[] = [
    ...t.especies.filter((e) => e.precioPt > 0).map((e) => `${e.nombre} ${precio(e.precioPt)}`),
    ...t.grupos
      .filter((g) => g.precioPt > 0)
      .map((g) => `${grupos.find((x) => x.id === g.grupoId)?.nombre ?? "un grupo"} ${precio(g.precioPt)}`),
    ...t.tipos.filter((x) => x.precioPt > 0).map((x) => `${x.tipo} ${precio(x.precioPt)}`),
  ];
  const visibles = partes.slice(0, MAX_PRECIOS);
  if (partes.length > MAX_PRECIOS) visibles.push(`y ${partes.length - MAX_PRECIOS} más`);
  if (t.basePt != null && t.basePt > 0) visibles.push(`${partes.length > 0 ? "lo demás" : "toda especie"} ${precio(t.basePt)}`);
  return visibles.join(" · ");
}

/** «vigente desde el lunes 01/09». */
export function vigenciaEnPalabras(t: Pick<TarifaCliente, "vigenteDesde">): string {
  return `vigente desde el ${etiquetaLarga(t.vigenteDesde)}`;
}
