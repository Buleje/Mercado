/**
 * Las cifras de una sección del Libro TH que se leen en DOS lugares —el pie de
 * la tabla y los indicadores de arriba— salen de acá (backlog L11, 08-10:
 * «KPIs que filtran al tocarlos»).
 *
 * Con un filtro de columna puesto, la tarjeta «Volumen registrado» y el total
 * del pie son el MISMO número porque son la misma cuenta (`totalesDe`) sobre
 * las mismas líneas, escrita con el mismo formato. Dos cuentas parecidas se
 * desincronizan a la primera regla nueva; una sola no puede.
 *
 * PURO: sin React. Sólo presentación: no decide qué se lee ni cómo se suma
 * (eso es `lib/forestal/loth-seccion`).
 */

import { claveEspecie, estaFueraDePlazo, type LothEntryDTO, type LothSection } from "@/lib/forestal/loth-constants";
import { totalRelevante, totalesDe, type TotalesSeccion } from "@/lib/forestal/loth-seccion";
import { especieDeLinea, volumenDeLinea } from "@/lib/forestal/loth-despacho-medidas";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { ValorFaceta } from "@/lib/admin/filtros-columna";
import type { FilaDesglose } from "./CtpKpi";

/** El total de la columna que suma, como se lee al pie: «12.345 m³», «40.0000 Kg», «—» si mezcla unidades. */
export function textoTotal(section: LothSection, t: TotalesSeccion): string {
  const queSuma = totalRelevante(section);
  if (queSuma === "volumen") return `${fmtM3(t.volumenM3)} m³`;
  if (queSuma === "cantidad") {
    if (t.unidades.length > 1) return "—";
    if (t.unidades[0] === "m3") return `${fmtM3(t.cantidad)} m³`;
    return `${Number(t.cantidad).toFixed(4)} ${t.unidades[0] ?? ""}`.trim();
  }
  return "";
}

/** La columna bajo la que cae el total del pie (`null`: la sección cuenta líneas, no suma). */
export function columnaDelTotal(section: LothSection): "vol" | "qty" | null {
  const queSuma = totalRelevante(section);
  return queSuma === "volumen" ? "vol" : queSuma === "cantidad" ? "qty" : null;
}

export interface CifrasDeSeccion {
  totales: TotalesSeccion;
  /** El total como se lee al pie (mismo texto que `textoTotal`). */
  total: string;
  /** Vigentes asentadas después del plazo (el MISMO predicado que la columna Estado). */
  tardias: number;
  cites: number;
  /** Guías distintas entre las vigentes. */
  guias: number;
  /** El reparto por especie de las vigentes (m³ si la sección suma volumen; si no, líneas). */
  porEspecie: FilaDesglose[];
  /** El reparto por guía de las vigentes (Despacho de trozas). */
  porGuia: FilaDesglose[];
}

const n = (v: string | null | undefined) => (v == null || v === "" ? 0 : Number(v) || 0);

/** Lo que dicen las tarjetas de las líneas que se miran (la sección, o lo que deja el filtro). */
export function cifrasDeLineas(section: LothSection, lineas: readonly LothEntryDTO[]): CifrasDeSeccion {
  const totales = totalesDe([...lineas]);
  const vigentes = lineas.filter((e) => e.status !== "anulado");
  const conVolumen = totalRelevante(section) === "volumen";

  /* Por especie, agrupado por `claveEspecie` («Tornillo» y «TORNILLO» son una)
     y nombrado como lo nombra el filtro de la columna: tocar la fila filtra. */
  const especies = new Map<string, FilaDesglose>();
  const guias = new Map<string, FilaDesglose>();
  /* En Despacho la especie y el m³ son los del trozado de cada troza (la línea no los guarda). */
  const suma = (fila: FilaDesglose, e: LothEntryDTO) => {
    fila.count += 1;
    if (conVolumen) fila.volumeM3 = Math.round(((fila.volumeM3 ?? 0) + n(volumenDeLinea(e))) * 10000) / 10000;
  };
  for (const e of vigentes) {
    const nombre = especieDeLinea(e) || "Sin especie";
    const k = claveEspecie(nombre);
    const fila = especies.get(k) ?? { value: nombre, count: 0, volumeM3: conVolumen ? 0 : null };
    suma(fila, e);
    especies.set(k, fila);
    if (e.gtfNumber) {
      const g = guias.get(e.gtfNumber) ?? { value: e.gtfNumber, count: 0, volumeM3: conVolumen ? 0 : null };
      suma(g, e);
      guias.set(e.gtfNumber, g);
    }
  }

  return {
    totales,
    total: textoTotal(section, totales),
    tardias: vigentes.filter((e) => estaFueraDePlazo(e.entryDate, e.createdAt)).length,
    cites: vigentes.filter((e) => e.cites).length,
    guias: guias.size,
    porEspecie: [...especies.values()],
    porGuia: [...guias.values()],
  };
}

/** ¿La columna tiene puesto exactamente ese valor y ningún otro? (el anillo de la tarjeta que filtra). */
export function filtraSolo(actual: ValorFaceta | undefined, valor: string): boolean {
  return Array.isArray(actual) && actual.length === 1 && actual[0] === valor;
}

/**
 * Tocar una tarjeta que filtra: pone SÓLO su valor en la columna, o lo saca si
 * ya era el único (segundo toque = deshacer). Reemplaza en vez de sumar: en la
 * columna Estado, «Registrada» o «Fuera de plazo» juntas darían todas las vigentes.
 */
export function alternarSolo(actual: ValorFaceta | undefined, valor: string): string[] | undefined {
  return filtraSolo(actual, valor) ? undefined : [valor];
}
