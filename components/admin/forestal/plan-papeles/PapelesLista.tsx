"use client";

/**
 * La lista de «Papeles del permiso», agrupada por lo que pide hacer
 * (`agruparPapeles`): Vencidos · Faltan · Por vencer · Al día, abiertos; y
 * «Si aplica» plegado y recordado. Plegado no esconde el dato: la línea dice
 * cuántos son y cuáles.
 */

import { Kicker } from "@buleje/design-system";
import { ChevronDown } from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { button } from "@/components/ui-system/button-variants";
import type { PapelDelPlan } from "@/lib/forestal/loth-plan-papeles";
import { agruparPapeles, type GrupoPapeles } from "./papeles-grupos";
import PapelFila from "./PapelFila";

/** Recordado para todos los planes: quien lo abrió una vez lo quiere abierto. */
const CLAVE_SI_APLICA = "loth:plan:papeles-si-aplica-abierto";

export interface FilaProps {
  destino: (p: PapelDelPlan) => string | null;
  subiendo: string | null;
  bloqueado: boolean;
  onSubir: (p: PapelDelPlan, files: File[]) => void;
  onVer: (documentId: string) => void;
  onIrACarpeta?: (p: PapelDelPlan) => void;
}

function Filas({ papeles, f }: { papeles: readonly PapelDelPlan[]; f: FilaProps }) {
  return (
    <ul className="divide-y divide-[var(--rule-soft)]">
      {papeles.map((p) => (
        <PapelFila
          key={p.clave}
          papel={p}
          destino={f.destino(p)}
          subiendo={f.subiendo === p.clave}
          bloqueado={f.bloqueado}
          onSubir={(files) => f.onSubir(p, files)}
          onVer={f.onVer}
          onIrACarpeta={f.onIrACarpeta ? () => f.onIrACarpeta?.(p) : undefined}
        />
      ))}
    </ul>
  );
}

function SiAplica({ grupo, f }: { grupo: GrupoPapeles; f: FilaProps }) {
  const [abierto, setAbierto] = useLocalStorage(CLAVE_SI_APLICA, false);
  const nombres = grupo.papeles.map((p) => p.nombre).join(" · ");
  return (
    <div data-papeles-grupo="segun_caso" className="pt-1">
      <button
        type="button"
        aria-expanded={abierto}
        onClick={() => setAbierto(!abierto)}
        className={button({ variant: "ghost", className: "h-auto min-h-11 w-full justify-start gap-2 rounded-xl px-1 text-left font-normal active:scale-100" })}
      >
        <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform ${abierto ? "" : "-rotate-90"}`} aria-hidden="true" />
        <Kicker className="shrink-0">
          {grupo.titulo} · <span className="tabular-nums">{grupo.papeles.length}</span>
        </Kicker>
        {!abierto && <span className="min-w-0 truncate text-sm text-[var(--text-secondary)]">{nombres}</span>}
      </button>
      {abierto && <Filas papeles={grupo.papeles} f={f} />}
    </div>
  );
}

export default function PapelesLista({ lista, ...f }: { lista: readonly PapelDelPlan[] } & FilaProps) {
  const grupos = agruparPapeles(lista);
  return (
    <div className="space-y-2" aria-label="Papeles del permiso" role="group">
      {grupos.map((g) =>
        g.estado === "segun_caso" ? (
          <SiAplica key={g.estado} grupo={g} f={f} />
        ) : (
          <div key={g.estado} data-papeles-grupo={g.estado}>
            <Kicker as="p" className="px-1 pt-1">
              {g.titulo} · <span className="tabular-nums">{g.papeles.length}</span>
            </Kicker>
            <Filas papeles={g.papeles} f={f} />
          </div>
        ),
      )}
    </div>
  );
}
