"use client";

/**
 * Las celdas de la tabla de «Extracción»: las 12 columnas de cifras de UNA
 * fila (permiso, especie o total), iguales para las tres. El nombre de la fila
 * lo pone la tabla.
 *
 * Todas las cifras en m³ con tres decimales y `tabular-nums` (la columna
 * alinea); la cantidad de árboles o trozas va debajo, en chico. Los saldos
 * contra el censo que quedan negativos van en ámbar («se midió más de lo
 * estimado»), nunca en rojo: el rojo es sólo pasar lo AUTORIZADO.
 */

import type { FilaExtraccion, SaldoContra } from "@/lib/forestal/loth-extraccion-tipos";
import {
  BARRA_TONO,
  NOMBRE_NIVEL,
  TEXTO_TONO,
  fm3,
  fpct,
  plural,
  tonoDeAvance,
  tonoDeSaldo,
} from "./loth-extraccion-shared";

/** Clase de cada celda de cifra: angosta, a la derecha, sin partir la cifra. */
export const TD_NUM = "px-1! py-1.5! text-right align-top whitespace-nowrap tabular-nums first-of-type:pl-2!";
/** El borde que separa los grupos (Tala | Trozado | Despacho | Planta). */
export const CORTE = "border-l border-[var(--rule-soft)]";

function Cifra({ m3, sub, fuerte = false, className = "" }: { m3: number | null; sub?: string | null; fuerte?: boolean; className?: string }) {
  return (
    <>
      <span className={`block ${fuerte ? "font-bold" : ""} ${m3 == null ? "text-[var(--text-tertiary)]" : ""} ${className}`}>
        {m3 == null ? "—" : fm3(m3)}
      </span>
      {sub && <span className="block text-xs text-[var(--text-tertiary)]">{sub}</span>}
    </>
  );
}

function Saldo({ s, sinCenso }: { s: SaldoContra; sinCenso: boolean }) {
  /* Sin un árbol censado (la fila «Sin plan», una especie que el censo no
     tiene) el saldo sería 0 − lo operado: un negativo que no dice nada. */
  if (sinCenso || s.nivel === "sin_base") {
    return (
      <span className="block text-[var(--text-tertiary)]" title="Sin censo contra qué medir">
        —
      </span>
    );
  }
  const tono = tonoDeSaldo(s);
  return (
    <span
      className={`block font-semibold ${TEXTO_TONO[tono]}`}
      title={s.m3 < 0 ? "Se midió más de lo que estimó el censo" : undefined}
    >
      {fm3(s.m3)}
    </span>
  );
}

function Avance({ f }: { f: FilaExtraccion }) {
  const a = f.avance;
  const tono = tonoDeAvance(a, f.tope?.base ?? null);
  const ancho = a.pct == null ? 0 : Math.max(2, Math.min(100, a.pct));
  const contra = f.tope ? (f.tope.base === "autorizado" ? "lo autorizado" : "el censo") : null;
  return (
    <div
      className="ml-auto w-14"
      title={
        contra
          ? `${fpct(a.pct)} de ${fm3(f.tope?.m3 ?? null)} m³ (${contra}) · ${NOMBRE_NIVEL[a.nivel]}`
          : "Sin base: el plan no tiene censo ni especies autorizadas"
      }
    >
      <span className={`block text-right font-bold ${TEXTO_TONO[tono]}`}>{fpct(a.pct)}</span>
      <span
        className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
        role="img"
        aria-label={`Avance ${fpct(a.pct)}, ${NOMBRE_NIVEL[a.nivel]}`}
      >
        <span className={`block h-full rounded-full ${BARRA_TONO[tono]}`} style={{ width: `${ancho}%` }} />
      </span>
    </div>
  );
}

/** Las 12 celdas de cifras de una fila, en el orden de la cabecera. */
export function CeldasDeFila({ f, fuerte = false }: { f: FilaExtraccion; fuerte?: boolean }) {
  /* El saldo autorizado va en el título; en la celda sólo si ya se pasó (medido
     a 1280: «queda 182.239» ensanchaba la columna 30 px y sacaba la tabla de la caja). */
  const sinCenso = f.censo.censados === 0;
  const sa = f.saldoAutorizado;
  const pasado = sa != null && sa.m3 < 0;
  const autorizadoSub = pasado ? `se pasó ${fm3(-sa.m3)}` : null;
  const autorizadoTitulo =
    f.censo.autorizadoM3 == null
      ? "El plan no tiene especies autorizadas"
      : sa
        ? `Queda ${fm3(sa.m3)} m³ de lo autorizado (autorizado − movilizado ${fm3(f.movilizadoM3)} m³)`
        : undefined;
  return (
    <>
      <td
        className={`${TD_NUM} ${CORTE}`}
        title={`Censado ${fm3(f.censo.censadoM3)} m³ (${plural(f.censo.censados, "árbol", "árboles")}) − semilleros ${fm3(f.censo.semillerosM3)} − excluidos ${fm3(f.censo.excluidosM3)}`}
      >
        <Cifra m3={f.censo.aprovechableM3} sub={plural(f.censo.aprovechables, "árbol", "árboles")} fuerte={fuerte} />
      </td>
      <td className={TD_NUM} title={autorizadoTitulo}>
        <Cifra m3={f.censo.autorizadoM3} sub={autorizadoSub} className={pasado ? TEXTO_TONO.error : ""} />
      </td>
      <td className={`${TD_NUM} ${CORTE}`}>
        <Cifra m3={f.talado.m3} sub={plural(f.talado.n, "árbol", "árboles")} fuerte={fuerte} />
      </td>
      <td className={TD_NUM}>
        <Saldo s={f.saldo.tala} sinCenso={sinCenso} />
      </td>
      <td className={`${TD_NUM} ${CORTE}`}>
        <Cifra m3={f.trozado.m3} sub={plural(f.trozado.n, "troza", "trozas")} fuerte={fuerte} />
      </td>
      <td className={TD_NUM}>
        <Saldo s={f.saldo.trozado} sinCenso={sinCenso} />
      </td>
      <td className={`${TD_NUM} ${CORTE}`}>
        <Cifra m3={f.despachado.m3} sub={plural(f.despachado.n, "troza", "trozas")} fuerte={fuerte} />
      </td>
      <td className={TD_NUM}>
        <Saldo s={f.saldo.despacho} sinCenso={sinCenso} />
      </td>
      <td className={`${TD_NUM} ${CORTE}`}>
        <Cifra m3={f.enElMonte.m3} sub={plural(f.enElMonte.n, "troza", "trozas")} />
      </td>
      <td className={TD_NUM} title={f.recibido.n > 0 ? `La guía dice ${fm3(f.recibido.m3Guia)} m³` : undefined}>
        <Cifra m3={f.recibido.m3} sub={plural(f.recibido.n, "troza", "trozas")} />
      </td>
      <td className={TD_NUM}>
        <Cifra m3={f.aserrado.m3} sub={plural(f.aserrado.n, "troza", "trozas")} />
      </td>
      <td className={`${TD_NUM} ${CORTE}`}>
        <Avance f={f} />
      </td>
    </>
  );
}

/** Cuántas columnas de cifras pinta `CeldasDeFila` (para el `colSpan` del vacío). */
export const COLUMNAS_DE_CIFRAS = 12;
