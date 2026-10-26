"use client";

/**
 * Una tarjeta de «Por bloque o zona» con su saldo (Brandon 25-10): por especie,
 * lo autorizado del bloque, lo usado (registrado en el libro y atado a este
 * bloque por su GTF preliminar), lo preliminar pendiente, el saldo y el saldo si
 * se registran; el total del bloque; el aviso rojo si se pasa, y sus guías.
 *
 * Todo viene calculado del servidor (`porBloque` del saldo): acá sólo se pinta.
 */

import { useState } from "react";
import { AlertTriangle, ArrowRight, ChevronDown } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import type { BloqueDelPlan } from "@/lib/forestal/loth-plan-bloques";
import { textoDeExceso, type EspecieEnElBloque, type ExcesoDeBloque, type SaldoDelBloque } from "@/lib/forestal/loth-plan-bloques-saldo";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { Btn } from "./ctp-shared";
import LothPlanBloqueGuias from "./LothPlanBloqueGuias";

const NUM = "font-mono tabular-nums";
const ROJO = "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";

type Cifras = Pick<EspecieEnElBloque, "autorizadoM3" | "usadoM3" | "pendienteM3" | "quedaM3" | "quedaSiSeRegistranM3"> & {
  excede?: boolean;
  excedeHoy?: boolean;
};

/** Autorizado · Usado · Preliminar · Saldo · Si se registran (y «Esta guía» en la ventana). `ultima` cambia el rótulo de la última cifra. */
export function CifrasDelBloque({ c, estaGuiaM3, columnas = "grid-cols-3 sm:grid-cols-5", ultima = "Si se registran" }: { c: Cifras; estaGuiaM3?: number; columnas?: string; ultima?: string }) {
  const items: { k: string; t: string; v: number; rojo?: boolean; fuerte?: boolean }[] = [
    { k: "aut", t: "Autorizado", v: c.autorizadoM3 },
    { k: "usado", t: "Usado", v: c.usadoM3 },
    { k: "pend", t: estaGuiaM3 == null ? "Preliminar" : "Otras prelim.", v: c.pendienteM3 - (estaGuiaM3 ?? 0) },
    ...(estaGuiaM3 == null ? [] : [{ k: "esta", t: "Esta guía", v: estaGuiaM3, fuerte: true }]),
    { k: "queda", t: "Saldo", v: c.quedaM3, rojo: c.excedeHoy },
    { k: "si", t: ultima, v: c.quedaSiSeRegistranM3, rojo: c.excede, fuerte: true },
  ];
  return (
    <dl className={`grid gap-x-3 gap-y-1 ${columnas}`}>
      {items.map((i) => (
        <div key={i.k} className="flex min-w-0 flex-col justify-between">
          {/* Sin truncar: «Si se registran» baja a dos líneas y la cifra queda alineada abajo. */}
          <dt className="text-xs leading-tight text-[var(--text-tertiary)]">{i.t}</dt>
          <dd className={`${NUM} text-sm ${i.fuerte ? "font-bold" : "font-medium"} ${i.rojo ? ROJO : "text-[var(--text-primary)]"}`}>{fmtM3(i.v)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** «30 árboles · 1,20 ha» del reparto, si se anotaron. */
function metaDelReparto(reparto: BloqueDelPlan | undefined, clave: string): string | null {
  const e = reparto?.especies.find((x) => claveEspecie(x.speciesCommon) === clave);
  if (!e) return null;
  const partes = [
    e.arboles != null ? `${formatNumber(e.arboles, 0)} ${e.arboles === 1 ? "árbol" : "árboles"}` : null,
    e.superficieHa != null ? `${formatNumber(e.superficieHa, 2)} ha` : null,
  ].filter(Boolean);
  return partes.length ? partes.join(" · ") : null;
}

export default function LothPlanBloqueTarjeta({
  saldo,
  reparto,
  excesos,
  onVerPreliminares,
}: {
  saldo: SaldoDelBloque;
  /** El reparto de ese bloque (árboles y hectáreas). */
  reparto?: BloqueDelPlan;
  excesos: readonly ExcesoDeBloque[];
  /** «Corregir»: lleva a las preliminares que lo hacen pasar. */
  onVerPreliminares?: (ids: string[]) => void;
}) {
  const [verGuias, setVerGuias] = useState(false);
  const t = saldo.total;
  const ids = [...new Set(excesos.flatMap((x) => x.preliminarIds))];
  const especies = saldo.especies.filter((e) => e.enElReparto || e.usadoM3 > 0 || e.pendienteM3 > 0);
  /* Lo que se pasa una especie no lo tapa lo libre de otra: «Disponible» suma sin negativos y lo pasado va aparte, en rojo. */
  const pasadas = saldo.especies.filter((e) => e.excede).map((e) => e.especie);
  return (
    <li
      data-testid="bloque-saldo"
      data-bloque={saldo.nombre}
      data-excede={saldo.excede ? "si" : "no"}
      className={`space-y-2 rounded-xl bg-[var(--surface-canvas)] p-3 ${saldo.excede ? "border-2 border-[var(--data-error-500)]" : "border border-[var(--rule-base)]"}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-sm font-bold text-[var(--text-primary)]">{saldo.nombre}</span>
        <span className={`${NUM} text-sm text-[var(--text-secondary)]`}>
          Disponible <b className="text-[var(--text-primary)]">{fmtM3(t.disponibleM3)} m³</b> de {fmtM3(t.autorizadoM3)}
          {t.seExcedeM3 > 0 && (
            <b data-testid="bloque-se-pasa" className={ROJO}>
              {" "}· Se pasa {fmtM3(t.seExcedeM3)} m³ ({pasadas.join(", ")})
            </b>
          )}
        </span>
      </div>
      <ul className="space-y-2">
        {especies.map((e) => {
          const meta = metaDelReparto(reparto, e.clave);
          return (
            <li key={e.clave} data-especie={e.clave} className="space-y-1 border-t border-[var(--rule-soft)] pt-2 first:border-t-0 first:pt-0">
              <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                <span className="font-semibold text-[var(--text-primary)]">{e.especie}</span>
                {meta && <span className={`${NUM} text-xs text-[var(--text-tertiary)]`}>{meta}</span>}
              </p>
              <CifrasDelBloque c={e} />
              {e.excede && (
                <p className={`text-sm font-semibold ${ROJO}`}>
                  {e.enElReparto ? `Se pasa por ${fmtM3(e.pasaPorM3)} m³` : `No está en este bloque: ${fmtM3(e.pasaPorM3)} m³ anotados`}
                  {e.excedeHoy ? " (ya con lo registrado)" : " si se registran las preliminares"}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {especies.length > 1 && (
        <div className="space-y-1 rounded-lg bg-[var(--surface-sunken)] px-2 py-1.5">
          <p className="text-xs font-semibold text-[var(--text-secondary)]">Total del bloque</p>
          <CifrasDelBloque c={{ ...t, quedaSiSeRegistranM3: t.disponibleM3, excede: false, excedeHoy: false }} ultima="Disponible" />
        </div>
      )}
      {excesos.length > 0 && (
        <div role="status" className="flex flex-wrap items-start gap-2 rounded-lg border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-2 py-1.5 text-sm dark:bg-[var(--data-error-500)]/12">
          <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${ROJO}`} aria-hidden="true" />
          <ul className={`min-w-0 flex-1 font-medium ${ROJO}`}>
            {excesos.map((x) => (
              <li key={x.clave}>{textoDeExceso(x, fmtM3)}</li>
            ))}
          </ul>
          <Btn
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => (ids.length > 0 && onVerPreliminares ? onVerPreliminares(ids) : setVerGuias(true))}
          >
            {ids.length > 0 && onVerPreliminares ? "Corregir" : "Ver guías"} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Btn>
        </div>
      )}
      <div>
        <Btn variant="ghost" size="sm" onClick={() => setVerGuias((v) => !v)} aria-expanded={verGuias}>
          <ChevronDown className={`h-4 w-4 transition-transform ${verGuias ? "rotate-180" : ""}`} aria-hidden="true" />
          Guías de este bloque ({saldo.guias.length})
        </Btn>
        {verGuias && <LothPlanBloqueGuias guias={saldo.guias} />}
      </div>
    </li>
  );
}
