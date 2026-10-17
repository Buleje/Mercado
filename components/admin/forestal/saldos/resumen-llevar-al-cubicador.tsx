"use client";

/**
 * «Lo que se va al cubicador»: resumen en vivo de lo tildado, por especie y
 * tipo (Brandon, 2026-10-03). Al lado de la lista, para ver cuántos m³ salen.
 */

import { useMemo, useState } from "react";
import { ChevronDown } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { CandidatoDeCapacidad } from "@/lib/forestal/capacidad-a-bloques";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { resumenDeLlevar } from "./resumen-llevar-agrupar";

const FILA = "grid grid-cols-[minmax(0,1fr)_5.5rem_3rem_4.5rem] items-baseline gap-x-3";
const TH =
  "px-2 py-1 text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]";
const TD = "px-2 py-1.5 text-sm text-[var(--text-secondary)]";
const NUM = "text-right font-mono tabular-nums";

export default function ResumenLlevarAlCubicador({
  seleccion,
  candidatos,
}: {
  seleccion: CandidatoDeCapacidad[];
  candidatos: CandidatoDeCapacidad[];
}) {
  const [abierto, setAbierto] = useState(true);
  const r = useMemo(() => resumenDeLlevar(seleccion, candidatos), [seleccion, candidatos]);
  const queda = Math.max(0, Math.round((r.disponibleM3 - r.totalM3) * 1000) / 1000);

  return (
    <section
      aria-label="Resumen de lo que se va al cubicador"
      className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3"
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0 text-left text-sm font-bold text-[var(--text-primary)] lg:pointer-events-none"
        >
          <span>Lo que se va al cubicador</span>
          <span className="font-mono text-sm font-bold tabular-nums text-[var(--accent-ink)] dark:text-[var(--accent)]">
            {fmtM3(r.totalM3)} m³
          </span>
          <ChevronDown
            className={`ml-auto h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform lg:hidden ${abierto ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
        <InfoTip
          icono="ayuda"
          title="Cómo se arma el resumen"
          what="Agrupa lo que tildaste por especie y tipo. Cada fila suma sus líneas y se redondea una vez a 3 decimales; el total suma las filas."
          affects="La rolliza y la ya aserrada no se miden igual: la rolliza pasa por el % antes de amparar. Aquí se ve el volumen tal cual sale."
        />
      </div>

      <div className={abierto ? "mt-2 block" : "mt-2 hidden lg:block"}>
        {r.filas.length === 0 ? (
          <p className="rounded-lg bg-[var(--surface-sunken)] px-3 py-5 text-center text-sm text-[var(--text-secondary)]">
            Elige qué madera llevar
          </p>
        ) : (
          /* Tabla con roles y grilla, NO <table>: `.admin-mobile-cards table` la
             volvía tarjetas a 400 px y un resumen de 4 columnas se leía peor. */
          <div role="table" aria-label="m³ por especie y tipo">
            <div role="row" className={`${FILA} ${TH}`}>
              <span role="columnheader">Especie</span>
              <span role="columnheader">Tipo</span>
              <span role="columnheader" className="text-right">Piezas</span>
              <span role="columnheader" className="text-right">m³</span>
            </div>
            {r.filas.map((f) => (
              <div key={f.clave} role="row" className={`${FILA} ${TD} border-t border-[var(--rule-soft)]`}>
                <span role="cell" className="min-w-0 truncate font-bold text-[var(--text-primary)]">
                  {f.especie || "Sin especie"}
                </span>
                <span role="cell">{f.tipo === "rolliza" ? "Rolliza" : "Ya aserrada"}</span>
                <span role="cell" className={NUM}>{f.piezas > 0 ? f.piezas : "—"}</span>
                <span role="cell" className={`${NUM} text-[var(--text-primary)]`}>{fmtM3(f.m3)}</span>
              </div>
            ))}
            <div role="row" className={`${FILA} ${TD} border-t border-[var(--rule-strong)] font-bold text-[var(--text-primary)]`}>
              <span role="cell" className="col-span-2">Total que se va</span>
              <span role="cell" className="text-right font-mono tabular-nums">{r.totalPiezas > 0 ? r.totalPiezas : "—"}</span>
              <span role="cell" className="text-right font-mono tabular-nums">{fmtM3(r.totalM3)}</span>
            </div>
          </div>
        )}
        {r.porTipo.rolliza > 0 && r.porTipo.aserrada > 0 && (
          <p className="mt-2 text-xs text-[var(--text-secondary)]">
            Rolliza <b className="font-mono tabular-nums">{fmtM3(r.porTipo.rolliza)} m³</b> · ya aserrada{" "}
            <b className="font-mono tabular-nums">{fmtM3(r.porTipo.aserrada)} m³</b>
          </p>
        )}
        <p className="mt-2 text-xs text-[var(--text-tertiary)]">
          de <b className="font-mono tabular-nums">{fmtM3(r.disponibleM3)} m³</b> disponibles · quedan{" "}
          <b className="font-mono tabular-nums">{fmtM3(queda)} m³</b>
        </p>
      </div>
    </section>
  );
}
