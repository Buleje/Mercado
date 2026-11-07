/**
 * gtf-datos-papel-comun — lo que comparten las pantallas «como el papel» de una
 * guía importada («Datos de la GTF» y la vista previa de «Importar guías»):
 *
 *   · el número y el rótulo 2024 de cada casillero (ADR-494): salen de
 *     `casilleroGtf2024(clave)` y de `CASILLEROS_GTF_2024`, nunca a mano;
 *   · el valor de cada casillero, de `bloquesDeGuia` (la MISMA fuente que la
 *     hoja y el PDF), limpio de las rayas con que SERFOR rellena lo vacío;
 *   · la fila de renglones del papel, que a 400 px se apila.
 *
 * Sólo presentación: ningún valor cambia ni sale de otro lado.
 */

import type { ReactNode } from "react";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { CASILLEROS_GTF_2024, casilleroGtf2024 } from "@/lib/forestal/ctp-gtf-formato";
import { bloquesDeGuia } from "@/lib/forestal/gtf-serfor-bloques";
import { sinRaya } from "@/lib/forestal/loth-importar-guia";
import { separarDocumento } from "@/lib/forestal/serfor-gtf-campos";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import { mismaPersona } from "@/lib/forestal/serfor-titular";
import { RenglonGtf } from "./gtf-papel";

export const NO_PUBLICA = "No lo publica SERFOR";
export const EN_BLANCO = "En blanco";
export const NOTA_SERFOR = "Como la publica SERFOR. No se edita: es la declaración de un documento ajeno.";

const ROTULO_2024: ReadonlyMap<string, string> = new Map(CASILLEROS_GTF_2024.map((c) => [c.n as string, c.rotulo as string]));

/** El casillero 2024 de una clave interna (las del 2015): su número y su rótulo del Anexo I. */
export function casilla(clave: string): { n?: string; rotulo: string } {
  const n = casilleroGtf2024(clave);
  return { n, rotulo: (n && ROTULO_2024.get(n)) || clave };
}

/** El rótulo del Anexo I de un número 2024 («34» → «Cuadro detalle de productos»). */
export const rotuloDelNumero = (n: string): string => ROTULO_2024.get(n) ?? n;

/** «(5) a (11c)» con los números del papel, para los ⓘ de cada franja. */
export const rango = (desde: string, hasta: string): string =>
  `Casilleros (${casilleroGtf2024(desde) ?? "?"}) a (${casilleroGtf2024(hasta) ?? "?"})`;

/** SERFOR rellena lo vacío con rayas («V2H-901 / ----------»): se quitan los tramos que son sólo raya. */
export function limpio(v: string | null | undefined): string | null {
  /* Sólo el « / » con espacios (o al borde: «D3B-740 /») separa tramos: «17/12/2024» y «19-SEC/PER-FMC-2024-008» no se tocan. */
  const partes = (v ?? "")
    .split(/(?:^|\s+)\/(?:\s+|$)/)
    .map((p) => p.trim())
    .filter((p) => sinRaya(p));
  return partes.length ? partes.join(" / ") : null;
}

/** Un dato de la ficha: su valor, si SERFOR no lo publica (ausente ≠ en blanco) y su rótulo del 2015. */
export interface DatoPapel {
  valor: string | null;
  noPublicado?: boolean;
  mono?: boolean;
  label: string;
}
export type DatosPapel = Readonly<Record<string, DatoPapel>>;

/** La clave interna (2015) de cada casillero de `bloquesDeGuia`: su `n`, salvo los que no lo llevan o lo repiten. */
function claveDe(c: { n?: string; label: string }): string {
  if (c.n === "31" && /placa/i.test(c.label)) return "31p";
  if (c.n) return c.n;
  if (/representante/i.test(c.label)) return "rep";
  if (/direcci/i.test(c.label)) return "dirTitular";
  return c.label;
}

/**
 * Los valores de la ficha por clave interna, desde `bloquesDeGuia`. El punto de
 * partida no lo publica SERFOR: el importador guarda como partida el lugar del
 * origen del recurso (`gtfDatosDesdeFicha`), y eso mismo es lo que se ve en
 * (20b)-(20d). Lo que la ficha no trae va como ausente, no como vacío.
 */
export function datosDeLaFicha(f: GtfSerfor): DatosPapel {
  const d: Record<string, DatoPapel> = {};
  for (const b of bloquesDeGuia(f)) {
    for (const c of b.casilleros) {
      d[claveDe(c)] = { valor: limpio(c.valor), noPublicado: c.noPublicado, mono: c.mono, label: c.label };
    }
  }
  if (d["10"]) d.p20b = d["10"];
  if (d["11"]) d.p20c = d["11"];
  if (d["12"]) d.p20d = d["12"];
  for (const k of ["p17", "p18", "p19", "p20a", "d22", "38"]) d[k] ??= { valor: null, noPublicado: true, label: k };
  return d;
}

/** Serie y N° de un número de talonario (`020-001-0000771` → `020-001` · `0000771`). Lo que no tiene esa forma va entero. */
export function partirNumero(n: string | null | undefined): { serie: string | null; numero: string | null } {
  const t = (n ?? "").trim();
  if (!t) return { serie: null, numero: null };
  if (!/^\d+(\s*-\s*\d+)+$/.test(t)) return { serie: null, numero: t };
  const corte = t.lastIndexOf("-");
  return { serie: t.slice(0, corte).trim(), numero: t.slice(corte + 1).trim() };
}

/**
 * El recuadro del titular, como lo imprime la imprenta: nombre, RUC, título
 * habilitante (6) y «distrito - provincia - departamento». La ficha no publica
 * el RUC del titular: se muestra el del (13) sólo cuando el propietario ES el
 * titular (la misma persona escrita igual o con relleno distinto).
 */
export function cabeceraDeLaFicha(f: GtfSerfor): { titular: string | null; ruc: string | null; titulo: string | null; ubicacion: string | null } {
  const titular = limpio(f.titular);
  const ruc = titular && f.propietario && mismaPersona(titular, f.propietario) ? separarDocumento(f.propietarioDoc).ruc || null : null;
  const ubicacion = [f.distrito, f.provincia, f.departamento].map(limpio).filter(Boolean).join(" - ");
  return { titular, ruc, titulo: limpio(f.numeroTitulo), ubicacion: ubicacion || null };
}

/**
 * El piso del renglón: `RenglonGtf` pone `min-w-[6rem]` al valor, pero el
 * `* { min-width: 0 }` sin capa de globals.css le gana a toda utilidad
 * `min-w-*` (medido a 400 px: 0px, el valor quedaba en 19 px, una palabra por
 * línea). Con `!` gana; desde afuera porque gtf-papel.tsx es de otro carril.
 */
export const PISO_RENGLON = "[&>span:last-child]:min-w-[6rem]!";

/**
 * Un casillero del papel. `claves` = las claves internas que lo llenan (el (13)
 * del 2024 junta el RUC y el DNI del 2015); número y rótulo, del Anexo I.
 */
export function CasilleroPapel({ d, claves, className = "" }: { d: DatosPapel; claves: readonly string[]; className?: string }) {
  const { n, rotulo } = casilla(claves[0]);
  const partes = claves.map((k) => d[k]).filter((p): p is DatoPapel => Boolean(p));
  const valor = partes.map((p) => p.valor).filter(Boolean).join(" / ");
  const ausentes = partes.filter((p) => p.noPublicado);
  const vacio =
    partes.length > 0 && ausentes.length === partes.length
      ? NO_PUBLICA
      : ausentes.length > 0
        ? `${EN_BLANCO} (el ${ausentes.map((a) => a.label.replace(/ N°$/, "")).join(", ")} no lo publica SERFOR)`
        : EN_BLANCO;
  return (
    <RenglonGtf n={n} rotulo={rotulo} vacio={vacio} className={`${PISO_RENGLON} ${className}`}>
      {valor ? <span className={`break-words ${partes.some((p) => p.mono) ? "font-mono" : ""}`}>{valor}</span> : null}
    </RenglonGtf>
  );
}

/** Columnas de una fila del papel cuando el ancho alcanza (container query: vale igual en el modal y en la vista previa). */
const COLUMNAS = {
  1: "",
  2: "@xl/papel:grid-cols-2",
  3: "@xl/papel:grid-cols-3",
  ancha: "@xl/papel:grid-cols-[3fr_2fr]",
  "3a": "@xl/papel:grid-cols-[2fr_1fr_1fr]",
} as const;

/** Una fila del papel: sus renglones lado a lado; angosto, uno debajo del otro. */
export function FilaPapel({ cols = 1, children }: { cols?: keyof typeof COLUMNAS; children: ReactNode }) {
  return <div className={`grid grid-cols-1 gap-x-6 gap-y-2 ${COLUMNAS[cols]}`}>{children}</div>;
}

/** El cuerpo de una sección: los renglones con aire, como en el talonario. */
export function CuerpoPapel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`space-y-2.5 px-3 py-3 sm:px-4 ${className}`}>{children}</div>;
}

/** El ⓘ de una franja (va en su `extra`). */
export function AyudaFranja({ titulo, que, nota = NOTA_SERFOR }: { titulo: string; que: string; nota?: string }) {
  return <InfoTip title={titulo} what={que} affects={nota} ariaLabel={`Qué es: ${titulo}`} />;
}
