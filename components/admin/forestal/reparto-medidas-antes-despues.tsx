"use client";

/**
 * «Repartir respetando medidas» en Bloques (ADR-505, Brandon 2026-10-20: «que
 * la distribución actúe de acuerdo a Faltante y cierre según cuadran las
 * medidas»). Una línea: el interruptor, cuántos avisos había y cuántos quedan,
 * y cuántas piezas cambiaron de bloque. «Ver antes/después» abre lo que cambió
 * por permiso, lo ya escrito que queda tocado y el interruptor por bloque.
 * «Dejar como estaba» marca todos los bloques «sin respetar medidas»: el
 * reparto vuelve a ser el de antes, con sus avisos.
 */

import { useState } from "react";
import { CardTitle, DataTable } from "@buleje/design-system";
import { AlertTriangle, ArrowRight, Ruler } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { fmtM3, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import type { CifrasPermiso, DiffRepartoMedidas } from "@/lib/forestal/reparto-medidas-diff";
import { cn } from "@/lib/utils";
import type { RepartoMedidas } from "./hooks/use-reparto-medidas";

const avisos = (n: number) => `${n} ${n === 1 ? "aviso" : "avisos"}`;
const piezas = (n: number) => `${fmtPiezas(n)} ${n === 1 ? "pieza" : "piezas"}`;

function Interruptor({ prendido, parcial, onClick }: { prendido: boolean; parcial: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={prendido ? true : parcial ? "mixed" : false}
      onClick={onClick}
      className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-xl px-1 text-sm font-bold text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      <span
        aria-hidden
        className={cn(
          "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors",
          prendido || parcial ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--rule-strong)] bg-[var(--surface-sunken)]",
        )}
      >
        <span
          className={cn(
            "absolute h-4 w-4 rounded-full bg-[var(--surface-raised)] shadow-[var(--shadow-sm)] transition-[left]",
            prendido ? "left-5" : parcial ? "left-3" : "left-1",
          )}
        />
      </span>
      Repartir respetando medidas
    </button>
  );
}

function Resumen({ m, avisosAhora }: { m: RepartoMedidas; avisosAhora: number }) {
  const { diff } = m;
  if (!diff)
    return (
      <span className="text-sm text-[var(--text-secondary)]">
        Repartiendo sin respetar medidas · <b className="text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">{avisos(avisosAhora)}</b>
      </span>
    );
  const respetan = m.bloques.filter((b) => b.respeta).length;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 text-sm text-[var(--text-secondary)]">
      {!m.prendido && <span>En {respetan} de {m.bloques.length} bloques ·</span>}
      <b className="tabular-nums text-[var(--text-primary)]">{avisos(diff.avisosAntes)}</b>
      <ArrowRight className="h-3.5 w-3.5 text-[var(--text-tertiary)]" aria-label="ahora" />
      <b className={cn("tabular-nums", diff.avisosDespues > 0 ? "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]" : "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]")}>
        {diff.avisosDespues}
      </b>
      <span>· {piezas(diff.piezasMovidas)} cambiaron de bloque</span>
    </span>
  );
}

function Celda({ antes, despues, fmt }: { antes: number; despues: number; fmt: (v: number) => string }) {
  const igual = fmt(antes) === fmt(despues);
  return (
    <td className="text-right font-mono tabular-nums">
      {!igual && <span className="block text-xs text-[var(--text-tertiary)] line-through">{fmt(antes)}</span>}
      <b className={igual ? "font-normal text-[var(--text-secondary)]" : "text-[var(--text-primary)]"}>{fmt(despues)}</b>
    </td>
  );
}

function TablaPermisos({ diff }: { diff: DiffRepartoMedidas }) {
  const igual = (a: CifrasPermiso, b: CifrasPermiso) => fmtM3(a.m3) === fmtM3(b.m3) && a.piezas === b.piezas;
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <DataTable wrapperClassName="overflow-visible rounded-none border-0" className="w-full">
        <caption className="sr-only">Lo que ampara cada permiso antes y después de respetar las medidas</caption>
        <thead>
          <tr>
            <th scope="col" data-label="Permiso">Permiso</th>
            <th scope="col" data-label="m³" className="text-right">m³</th>
            <th scope="col" data-label="PT" className="text-right">PT</th>
            <th scope="col" data-label="Piezas" className="text-right">Piezas</th>
          </tr>
        </thead>
        <tbody>
          {diff.permisos.map((p) => (
            <tr key={p.permiso} className={igual(p.antes, p.despues) ? undefined : "bg-primary/5"}>
              <th scope="row" className="text-left font-bold text-[var(--text-primary)]">{p.permiso}</th>
              <Celda antes={p.antes.m3} despues={p.despues.m3} fmt={fmtM3} />
              <Celda antes={p.antes.pt} despues={p.despues.pt} fmt={fmtPt} />
              <Celda antes={p.antes.piezas} despues={p.despues.piezas} fmt={fmtPiezas} />
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}

function YaEscrito({ diff }: { diff: DiffRepartoMedidas }) {
  const n = diff.marcadasQueCambian.length;
  const jornadas = diff.jornadasLibroQueCambian;
  if (n === 0 && jornadas.length === 0)
    return <p className="text-sm text-[var(--text-secondary)]">Nada de lo ya tildado ni de lo pasado al Libro cambia.</p>;
  return (
    <ul className="space-y-1 text-sm text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">
      {n > 0 && (
        <li className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {n} {n === 1 ? "línea tildada como distribuida cambia" : "líneas tildadas como distribuidas cambian"}: revisa sus casillas en «Por distribuir».
        </li>
      )}
      {jornadas.map((j) => (
        <li key={`${j.bloqueId}|${j.dia}`} className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {j.etiqueta} · día {j.dia}: ya está en el Libro y su contenido cambia.
        </li>
      ))}
    </ul>
  );
}

function PorBloque({ m }: { m: RepartoMedidas }) {
  return (
    <ul className="space-y-1" aria-label="Respetar medidas en cada bloque">
      {m.bloques.map((b) => (
        <li key={b.id}>
          <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-2 hover:bg-[var(--surface-sunken)]">
            <input type="checkbox" checked={b.respeta} onChange={(e) => m.fijar(e.target.checked, b.id)} className="h-5 w-5 accent-[var(--accent)]" />
            <span className="min-w-0 flex-1 truncate text-sm">
              <b className="text-[var(--text-primary)]">{b.etiqueta}</b>
              <span className="text-[var(--text-secondary)]">
                {b.permiso ? ` · ${b.permiso}` : ""} · {b.trozas} {b.trozas === 1 ? "troza" : "trozas"}
              </span>
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

const SUBTITULO = "text-sm font-bold text-[var(--text-primary)]";

export default function RepartoMedidasAntesDespues({ medidas: m, avisosAhora }: { medidas: RepartoMedidas; avisosAhora: number }) {
  const [abierto, setAbierto] = useState(false);
  if (m.bloques.length === 0) return null;
  const alguno = m.bloques.some((b) => b.respeta);

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-1 print:hidden">
        <Interruptor prendido={m.prendido} parcial={alguno && !m.prendido} onClick={() => m.fijar(!alguno)} />
        <InfoTip
          title="Repartir respetando medidas"
          what="Cada pieza va sólo a un bloque que tenga una troza donde quepa: largo de la pieza ≤ troza + 15 cm y la diagonal de la sección ≤ Ø de la punta delgada + 1 cm."
          affects="Lo que ninguna troza da queda en «Falta por distribuir» con su porqué. Lo que pusiste a mano gana y queda como aviso. Un bloque sin medidas de troza recibe lo que sobra, «sin comprobar»."
          example="Una tabla de 12 pies no sale de un permiso con trozas de 3,42 m: va al permiso que tiene trozas de 9,75 m."
          side="bottom"
        />
        <Resumen m={m} avisosAhora={avisosAhora} />
        <button type="button" onClick={() => setAbierto(true)} className={cn(button({ variant: "secondary" }), "ml-auto")}>
          <Ruler className="h-4 w-4" aria-hidden /> Ver antes/después
        </button>
      </div>

      <AdminModal
        open={abierto}
        onClose={() => setAbierto(false)}
        title="Antes y después"
        description="Repartir respetando las medidas de las trozas"
        icon={Ruler}
        size="md"
        footer={
          <ModalFooter nota={m.diff ? `${avisos(m.diff.avisosAntes)} → ${m.diff.avisosDespues}` : avisos(avisosAhora)}>
            {alguno ? (
              <button type="button" onClick={() => m.fijar(false)} className={button({ variant: "secondary" })}>
                Dejar como estaba
              </button>
            ) : (
              <button type="button" onClick={() => m.fijar(true)} className={button({ variant: "secondary" })}>
                Respetar medidas
              </button>
            )}
            <button type="button" onClick={() => setAbierto(false)} className={button({ variant: "primary" })}>
              Listo
            </button>
          </ModalFooter>
        }
      >
        <div className={cn(MODAL_BODY, "space-y-4")}>
          {m.diff ? (
            <>
              <p className="text-sm text-[var(--text-secondary)]">
                <Resumen m={m} avisosAhora={avisosAhora} />
              </p>
              <TablaPermisos diff={m.diff} />
              <section className="space-y-1.5">
                <CardTitle as="h4" className={SUBTITULO}>Lo ya escrito</CardTitle>
                <YaEscrito diff={m.diff} />
              </section>
            </>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">
              Como antes de la regla: <b className="text-[var(--text-primary)]">{avisos(avisosAhora)}</b> en «¿Cuadran las medidas?».
            </p>
          )}
          <section className="space-y-1.5">
            <CardTitle as="h4" className={SUBTITULO}>Por bloque</CardTitle>
            <PorBloque m={m} />
          </section>
        </div>
      </AdminModal>
    </>
  );
}
