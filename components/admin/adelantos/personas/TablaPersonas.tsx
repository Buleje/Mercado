"use client";

/**
 * La tabla de Personas con sus filtros tipo Excel en el encabezado (25-10) y el
 * paginado. Convive con el buscador, los chips de situación y el orden de
 * `PersonasView`: éstos recortan la lista y los filtros de columna afinan lo que
 * quedó (se anidan, AND).
 */

import { useEffect, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { ChevronLeft, ChevronRight } from "@buleje/design-system/icons";
import { BarraFiltrosTabla, SinCoincidenciasFila, type FiltrosTabla } from "@/components/admin/forestal/filtros-tabla-forestal";
import { paginar } from "@/lib/adelantos/ordenar-lista";
import type { BeneficiarioConSaldo } from "../crear-adelanto/tipos";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { BotonPagina } from "../lista/tabla-controles";
import FilaPersona from "./FilaPersona";

/** Personas por página: 12 filas entran en una pantalla y media a 1280×900. */
const PERSONAS_POR_PAGINA = 12;

export default function TablaPersonas({
  ft,
  reinicio,
  onVerFicha,
  onEditar,
  onEliminar,
  onAdelanto,
  onEntregar,
  onCompletar,
}: {
  /** Los filtros de columna (ya aplicados sobre lo que dejan el buscador, los chips y el orden). */
  ft: FiltrosTabla<BeneficiarioConSaldo>;
  /** Cambia cuando se mueve el buscador, el chip, el orden o un filtro: vuelve a la página 1. */
  reinicio: string;
  onVerFicha: (b: BeneficiarioConSaldo) => void;
  onEditar: (b: BeneficiarioConSaldo) => void;
  onEliminar: (b: BeneficiarioConSaldo) => void;
  onAdelanto: (b: BeneficiarioConSaldo) => void;
  onEntregar?: (b: BeneficiarioConSaldo) => void;
  onCompletar: (b: BeneficiarioConSaldo) => void;
}) {
  const [pagina, setPagina] = useState(1);
  /** Cambiar de filtro con la página 4 abierta dejaba una grilla en blanco. */
  useEffect(() => setPagina(1), [reinicio]);
  const pag = paginar(ft.filtradas, pagina, PERSONAS_POR_PAGINA);

  return (
    <>
      <BarraFiltrosTabla f={ft} sinConteo />
      <DataTable zebra className="[&_tbody_td]:py-1.5">
        <thead className="[&_th]:align-top">
          <tr>
            <ThColumna ids={["persona"]} label="Persona" f={ft} />
            <ThColumna ids={["adelantado"]} label="Adelantado" f={ft} derecha />
            <ThColumna ids={["debe"]} label="Te debe" f={ft} derecha />
            <ThColumna ids={["cumplimiento"]} label="Cumplimiento" f={ft} />
            <ThColumna ids={["estado"]} label="Estado" f={ft} />
            <th><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {pag.items.length === 0 && <SinCoincidenciasFila colSpan={6} />}
          {pag.items.map((b) => (
            <FilaPersona
              key={b.id}
              persona={b}
              onVerFicha={() => onVerFicha(b)}
              onEditar={() => onEditar(b)}
              onEliminar={() => onEliminar(b)}
              onAdelanto={() => onAdelanto(b)}
              onEntregar={onEntregar ? () => onEntregar(b) : undefined}
              onCompletar={() => onCompletar(b)}
            />
          ))}
        </tbody>
      </DataTable>
      {pag.totalPaginas > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold tabular-nums text-[var(--text-secondary)]">
            {pag.desde}–{pag.hasta} de {pag.total}
          </p>
          <div className="flex items-center gap-1.5">
            <BotonPagina onClick={() => setPagina(pag.pagina - 1)} disabled={pag.pagina <= 1} label="Página anterior">
              <ChevronLeft className="h-4 w-4" />
            </BotonPagina>
            <span className="px-2 text-sm font-bold tabular-nums text-[var(--text-secondary)]">
              {pag.pagina} / {pag.totalPaginas}
            </span>
            <BotonPagina onClick={() => setPagina(pag.pagina + 1)} disabled={pag.pagina >= pag.totalPaginas} label="Página siguiente">
              <ChevronRight className="h-4 w-4" />
            </BotonPagina>
          </div>
        </div>
      )}
    </>
  );
}
