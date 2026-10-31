"use client";

/**
 * La tabla de Personas con sus filtros tipo Excel en el encabezado (25-10) y el
 * paginado. Convive con el buscador y los chips de situación de
 * `PersonasView`: éstos recortan la lista y los filtros de columna afinan lo que
 * quedó (se anidan, AND).
 *
 * 30-10: el orden se elige en los encabezados (como Adelantos › Lista; antes un
 * desplegable en una fila propia), las celdas usan el relleno del DS —la misma
 * altura que Deudas y Cobranza— y al pie va el total de lo que se ve.
 */

import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { ChevronLeft, ChevronRight } from "@buleje/design-system/icons";
import { BarraFiltrosTabla, SinCoincidenciasFila, type FiltrosTabla } from "@/components/admin/forestal/filtros-tabla-forestal";
import { paginar } from "@/lib/adelantos/ordenar-lista";
import { cuentaDePersona, hayDeuda } from "@/lib/adelantos/modos-alta";
import type { BeneficiarioConSaldo } from "../crear-adelanto/tipos";
import { ThColumna, type OrdenDeColumnas } from "@/components/admin/shared/th-columna";
import { BotonPagina, IconoOrden } from "../lista/tabla-controles";
import { MontosEnLineas } from "../shared";
import FilaPersona from "./FilaPersona";

/** Personas por página: 12 filas entran en una pantalla y media a 1280×900. */
const PERSONAS_POR_PAGINA = 12;

/** Suma por moneda (cada persona ya trae sus cifras del servidor, por moneda: no se mezclan). */
function sumarPorMoneda(mapas: readonly Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of mapas) for (const [moneda, v] of Object.entries(m)) out[moneda] = (out[moneda] ?? 0) + v;
  return out;
}

export default function TablaPersonas({
  ft,
  orden,
  hayTopes,
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
  /** El orden de los encabezados (`useOrdenPersonas`). */
  orden: OrdenDeColumnas;
  /** Con algún tope cargado, Cumplimiento ofrece además «Tope» (quien está más cerca del suyo). */
  hayTopes: boolean;
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

  /* «Total de lo que se ve» (regla de los filtros, 25-10): suma TODAS las
     filtradas, no sólo la página; con una sola fila no aporta nada. */
  const total = useMemo(() => {
    const cuentas = ft.filtradas.map(cuentaDePersona);
    return {
      adelantado: sumarPorMoneda(ft.filtradas.map((b) => b.totalAdelantado)),
      teDebe: sumarPorMoneda(cuentas.map((c) => c.teDebe)),
      leDebes: sumarPorMoneda(cuentas.map((c) => c.leDebes)),
    };
  }, [ft.filtradas]);
  const n = ft.filtradas.length;

  return (
    <>
      <BarraFiltrosTabla vistas="adelantos-personas" f={ft} sinConteo />
      <DataTable zebra>
        <thead className="[&_th]:align-top">
          <tr>
            <ThColumna ids={["persona"]} label="Persona" f={ft} orden={orden} ordenId="nombre" />
            <ThColumna ids={["adelantado"]} label="Adelantado" f={ft} derecha orden={orden} ordenId="adelantado" />
            <ThColumna ids={["debe"]} label="Te debe" f={ft} derecha orden={orden} ordenId="saldo" />
            <ThColumna ids={["cumplimiento"]} label="Cumplimiento" f={ft} orden={orden} ordenId="cumplimiento" title="Primero quien menos devolvió">
              {hayTopes && (
                <button
                  type="button"
                  onClick={() => orden.alternar("riesgo")}
                  title="Primero quien está más cerca de su tope"
                  aria-label="Ordenar por cercanía al tope"
                  aria-pressed={orden.activa === "riesgo"}
                  className={`inline-flex items-center gap-1 text-xs font-bold transition-colors hover:text-[var(--text-primary)] ${orden.activa === "riesgo" ? "text-[var(--text-primary)]" : ""}`}
                >
                  Tope
                  <IconoOrden activo={orden.activa === "riesgo"} direccion={orden.direccion} />
                </button>
              )}
            </ThColumna>
            <ThColumna ids={["estado"]} label="Estado" f={ft} orden={orden} ordenId="reciente" title="Ordena por el último adelanto" />
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
        {n > 1 && (
          <tfoot>
            <tr className="border-t border-[var(--rule-strong)] bg-[var(--surface-sunken)]" data-total-personas>
              <td className="font-bold text-[var(--text-primary)]">
                Total de lo que se ve
                <span className="block text-xs font-normal tabular-nums text-[var(--text-tertiary)]">{n} personas</span>
              </td>
              <td className="whitespace-nowrap text-right font-bold tabular-nums">
                <MontosEnLineas map={total.adelantado} />
              </td>
              <td className="whitespace-nowrap text-right">
                <span className={`block font-extrabold tabular-nums ${hayDeuda(total.teDebe) ? "text-[var(--data-warning-ink)]" : "text-[var(--data-success-ink)]"}`}>
                  <MontosEnLineas map={total.teDebe} />
                </span>
                {hayDeuda(total.leDebes) && (
                  <span className="block text-xs font-semibold tabular-nums text-[var(--data-info-ink)]">
                    Le debes <MontosEnLineas map={total.leDebes} />
                  </span>
                )}
              </td>
              <td colSpan={3} aria-hidden />
            </tr>
          </tfoot>
        )}
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
