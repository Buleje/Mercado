"use client";

/** Permisos CITES — acreditan la legalidad de las especies protegidas (ADR-305). Plegado por defecto. */

import { useId, useState } from "react";
import { ChevronDown, Plus, ShieldAlert, Trash2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { estadoVencimiento, type LothCitesPermiso } from "@/lib/forestal/loth-cites-types";
import { CLS_CONTROL } from "./LothCaratulaCampo";

interface Props {
  permisos: LothCitesPermiso[];
  agregar: () => void;
  quitar: (i: number) => void;
  cambiar: (i: number, k: keyof LothCitesPermiso, v: string) => void;
}

const INPUT = `${CLS_CONTROL} border-[var(--rule-base)] h-11 sm:h-9`;

export default function LothCaratulaCites({ permisos, agregar, quitar, cambiar }: Props) {
  // Sin decidir = plegado, salvo que ya haya permisos cargados (llegan async).
  const [elegido, setElegido] = useState<boolean | null>(null);
  const abierto = elegido ?? permisos.length > 0;
  const idCuerpo = useId();
  return (
    <section className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setElegido(!abierto)}
          aria-expanded={abierto}
          aria-controls={idCuerpo}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg text-left text-sm font-bold text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${abierto ? "" : "-rotate-90"}`} aria-hidden="true" />
          <ShieldAlert className="h-4 w-4 shrink-0 text-[var(--data-error-600)]" aria-hidden="true" />
          <span className="min-w-0">
            Permisos CITES <span className="font-normal text-[var(--text-tertiary)]">(especies protegidas{permisos.length ? ` · ${permisos.length}` : ""})</span>
          </span>
        </button>
        <InfoTip
          title="Permisos CITES"
          what="Una especie CITES (caoba, cedro, shihuahuaco) es legal con su permiso archivado — el booleano de cada línea no alcanza."
          affects="Acredita el origen de esas especies ante OSINFOR."
          example="Carga el N° de permiso y su vencimiento por cada especie protegida que aprovechas."
        />
      </div>
      {abierto && (
      <div id={idCuerpo} className="mt-2 space-y-2">
        {permisos.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--rule-base)] px-3 py-2.5 text-sm text-[var(--text-tertiary)]">
            Sin permisos cargados. Agrega uno si aprovechas especies CITES.
          </p>
        ) : (
          permisos.map((p, i) => {
            const est = estadoVencimiento(p.vencimiento);
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input type="text" value={p.especie} onChange={(e) => cambiar(i, "especie", e.target.value)} placeholder="Especie (Caoba)" aria-label="Especie" className={`${INPUT} min-w-[8rem] flex-1`} />
                <input type="text" value={p.numero} onChange={(e) => cambiar(i, "numero", e.target.value)} placeholder="N° permiso CITES" aria-label="N° de permiso CITES" className={`${INPUT} min-w-[8rem] flex-1 font-mono`} />
                <input type="date" value={p.vencimiento} onChange={(e) => cambiar(i, "vencimiento", e.target.value)} aria-label="Vencimiento del permiso" className={`${INPUT} w-40`} />
                {est === "vencido" && (
                  <span className="rounded-full bg-[var(--data-error-100)] px-2 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--data-error-700)]">vencido</span>
                )}
                {est === "por_vencer" && (
                  <span className="rounded-full bg-[var(--data-warning-100)] px-2 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--data-warning-700)]">por vencer</span>
                )}
                <button type="button" onClick={() => quitar(i)} aria-label="Quitar permiso" className="grid h-11 w-11 place-items-center rounded-lg border border-[var(--rule-base)] text-[var(--data-error-600)] transition-colors hover:bg-[var(--data-error-50)] sm:h-9 sm:w-9">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            );
          })
        )}
        <button type="button" onClick={agregar} className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-[var(--rule-strong)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] sm:h-9">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Agregar permiso
        </button>
      </div>
      )}
    </section>
  );
}
