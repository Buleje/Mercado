/**
 * ctp-tarifa-aserrio-shared — el borrador de una versión de la tarifa de
 * aserrío (ADR-412), y su ida y vuelta con `VersionTarifaInput`.
 *
 * Vive aparte del modal y del formulario porque los dos lo necesitan: el modal
 * arma el borrador inicial al elegir «editar» o «nueva desde hoy», el
 * formulario lo muta campo por campo.
 */

import { claveEspecie } from "@/lib/forestal/loth-constants";
import { ORDEN_TIPO, type TipoComercial } from "@/lib/forestal/cubicacion-tipo";
import type { VersionTarifa, VersionTarifaInput } from "@/lib/forestal/tarifa-aserrio";

export interface FilaEspecie {
  nombre: string;
  /** Texto del input; vacío = sin precio propio (usa la base general). */
  precioPt: string;
}

export interface FilaTramo {
  /** Sólo de React: no viaja al servidor. */
  id: string;
  desdePies: string;
  hastaPies: string;
  ajustePt: string;
}

export interface BorradorTarifa {
  id?: string;
  vigenteDesde: string;
  basePt: string;
  especies: FilaEspecie[];
  tipos: Record<TipoComercial, string>;
  largos: FilaTramo[];
  nota: string;
}

/**
 * Arma el borrador desde una versión existente (editar) o en blanco (nueva),
 * con una fila de especie por cada nombre del catálogo — así el operador ve
 * TODAS las especies de la planta aunque hoy sólo una tenga precio propio.
 *
 * @param comoNueva «Nueva tarifa desde hoy» copia los VALORES de la vigente
 *   como punto de partida, pero tiene que nacer con un `id` propio — sin esto
 *   el PUT reusa el `id` de la vigente y, si esa versión regía desde ANTES de
 *   hoy, `guardarVersion` le muda la fecha a hoy en vez de crear una versión
 *   nueva: la vigente vieja desaparece del tarifario (ALTO, revisión
 *   2026-09-14). `guardar()` ya genera un id nuevo cuando éste falta.
 */
export function borradorDesde(
  version: VersionTarifa | null,
  nombresCatalogo: readonly string[],
  vigenteDesde: string,
  comoNueva = false,
): BorradorTarifa {
  const porClave = new Map((version?.especies ?? []).map((e) => [e.clave, e]));
  return {
    id: comoNueva ? undefined : version?.id,
    vigenteDesde,
    basePt: version ? String(version.basePt) : "",
    especies: nombresCatalogo.map((nombre) => {
      const e = porClave.get(claveEspecie(nombre));
      return { nombre, precioPt: e ? String(e.precioPt) : "" };
    }),
    tipos: Object.fromEntries(
      ORDEN_TIPO.map((t) => [t, String(version?.tipos.find((x) => x.tipo === t)?.ajustePt ?? "")]),
    ) as Record<TipoComercial, string>,
    largos: (version?.largos ?? []).map((l, i) => ({
      id: `v-${i}`,
      desdePies: String(l.desdePies),
      hastaPies: l.hastaPies == null ? "" : String(l.hastaPies),
      ajustePt: String(l.ajustePt),
    })),
    nota: version?.nota ?? "",
  };
}

/**
 * El borrador que arma el SERVIDOR con la producción real (`?borrador=1`,
 * ADR-412): ya trae sólo las especies y los tipos que este aserradero
 * trabaja, todos con precio en 0 — se muestra tal cual, sin completarlo con
 * el resto del catálogo (que es justo lo que este atajo evita tener que
 * mirar). `revisarVersion` rechaza guardarlo así, a propósito: el borrador es
 * un punto de partida, no una tarifa.
 */
export function borradorDesdeProduccion(input: VersionTarifaInput): BorradorTarifa {
  return {
    vigenteDesde: input.vigenteDesde,
    basePt: "",
    especies: input.especies.map((e) => ({ nombre: e.nombre, precioPt: "" })),
    tipos: Object.fromEntries(ORDEN_TIPO.map((t) => [t, ""])) as Record<TipoComercial, string>,
    /* Un tramo con ajuste 0 en la producción real no distinguió nada — mostrar
       esa fila igual que las demás es ruido, no un ajuste a completar (BAJO,
       revisión 2026-09-14). */
    largos: input.largos
      .filter((l) => l.ajustePt !== 0)
      .map((l, i) => ({
        id: `p-${i}`,
        desdePies: String(l.desdePies),
        hastaPies: l.hastaPies == null ? "" : String(l.hastaPies),
        ajustePt: "",
      })),
    /* La nota del borrador es la del servidor explicando qué es esto («armado
       con tu producción, pon los precios») — no una nota de la TARIFA. Guardar
       tal cual la dejaría pegada para siempre en la versión real (BAJO,
       revisión 2026-09-14). */
    nota: "",
  };
}

/** Los tipos que de verdad aparecen en la producción del borrador — para no
 *  mostrar filas de ajuste de tipos que este aserradero nunca corta. */
export function tiposDelBorrador(input: VersionTarifaInput): readonly TipoComercial[] {
  return input.tipos.map((t) => t.tipo);
}

/** El texto del formulario, tal cual lo va a leer `revisarVersion`. */
export function inputDesde(b: BorradorTarifa): VersionTarifaInput {
  return {
    id: b.id,
    vigenteDesde: b.vigenteDesde,
    basePt: Number(b.basePt) || 0,
    especies: b.especies
      .filter((e) => e.precioPt.trim() !== "")
      .map((e) => ({ nombre: e.nombre, precioPt: Number(e.precioPt) || 0 })),
    tipos: ORDEN_TIPO.filter((t) => (b.tipos[t] ?? "").trim() !== "").map((t) => ({
      tipo: t,
      ajustePt: Number(b.tipos[t]) || 0,
    })),
    largos: b.largos.map((l) => ({
      desdePies: Number(l.desdePies) || 0,
      hastaPies: l.hastaPies.trim() === "" ? null : Number(l.hastaPies) || 0,
      ajustePt: Number(l.ajustePt) || 0,
    })),
    nota: b.nota.trim() || null,
  };
}
