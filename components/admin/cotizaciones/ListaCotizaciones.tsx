"use client";

/**
 * La lista de una sección: tabla (a 400 px se vuelve tarjetas sola, por
 * `useMobileTableCards`) o tarjetas, con su paginado y sus estados de carga,
 * error y vacío.
 */
import { useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, MessageCircle } from "@buleje/design-system/icons";
import { DataTable, LoadingState } from "@buleje/design-system";
import { button } from "@/components/ui-system/button-variants";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { VistaLista } from "./FiltrosCotizaciones";
import { abrirWhatsApp, diasDeVigencia, PER_PAGE, STATUS_META, type Cotizacion } from "./tipos";

interface Props {
  filas: readonly Cotizacion[];
  vista: VistaLista;
  loading: boolean;
  error: string | null;
  onReintentar: () => void;
  onAbrir: (c: Cotizacion) => void;
  /** Lo que se dice cuando no hay ninguna (cambia con la sección y los filtros). */
  vacio: string;
  /** La acción del vacío (crear una), o nada si el vacío es por un filtro. */
  accionVacio?: { rotulo: string; onClick: () => void };
}

const Estado = ({ c }: { c: Cotizacion }) => (
  <span className={cn("inline-flex items-center rounded-lg px-2 py-1 text-sm font-semibold", STATUS_META[c.status].clase)}>{STATUS_META[c.status].label}</span>
);

/** Mejora 17: el resumen de la cotización al dejar el mouse sobre su N°. */
function Vistazo({ c }: { c: Cotizacion }) {
  return (
    <span className="pointer-events-none absolute bottom-full left-0 z-50 mb-2 hidden w-[300px] space-y-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 text-left shadow-[var(--shadow-md)] group-hover/num:block">
      <span className="block text-sm font-bold text-[var(--text-primary)]">{c.clienteNombre}</span>
      {(c.items ?? []).slice(0, 3).map((it, i) => (
        <span key={i} className="block truncate text-sm text-[var(--text-secondary)]">{it.cantidad} × {it.descripcion}</span>
      ))}
      {c.items.length > 3 && <span className="block text-sm text-[var(--text-tertiary)]">y {c.items.length - 3} más…</span>}
    </span>
  );
}

const alTeclado = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.target !== e.currentTarget) return;
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); }
};

export function ListaCotizaciones({ filas, vista, loading, error, onReintentar, onAbrir, vacio, accionVacio }: Props) {
  const [pagina, setPagina] = useState(1);
  const paginas = Math.max(1, Math.ceil(filas.length / PER_PAGE));
  const actual = Math.min(pagina, paginas);
  const visibles = filas.slice((actual - 1) * PER_PAGE, actual * PER_PAGE);

  if (loading && filas.length === 0) return <LoadingState />;
  if (error) {
    return (
      <div role="alert" className="flex flex-col items-center gap-2 rounded-xl border border-[var(--rule-base)] py-10 text-center">
        <AlertTriangle className="h-8 w-8 text-[var(--data-error-500)]" aria-hidden />
        <p className="text-sm text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">{error}</p>
        <button type="button" onClick={onReintentar} className={button({ variant: "secondary", className: "rounded-xl" })}>Reintentar</button>
      </div>
    );
  }
  if (filas.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--rule-base)] px-4 py-10 text-center">
        <p className="text-sm text-[var(--text-secondary)]">{vacio}</p>
        {accionVacio && (
          <button type="button" onClick={accionVacio.onClick} className={button({ variant: "secondary", className: "rounded-xl" })}>{accionVacio.rotulo}</button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {vista === "cards" ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibles.map((c) => {
            const dias = diasDeVigencia(c);
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => onAbrir(c)}
                onKeyDown={alTeclado(() => onAbrir(c))}
                aria-label={`Ver cotización ${c.numero} de ${c.clienteNombre}`}
                className="group cursor-pointer space-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 transition-colors hover:border-[var(--accent)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm tabular-nums text-[var(--text-secondary)]">{c.numero}</span>
                  <Estado c={c} />
                </div>
                <p className="truncate font-bold text-[var(--text-primary)]">
                  <EnlacePanel cosa="cliente" id={c.customerId} className="font-bold">{c.clienteNombre}</EnlacePanel>
                </p>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{formatCurrency(c.total)}</span>
                  <span className="text-sm text-[var(--text-secondary)]">{c.status === "ENVIADA" || c.status === "BORRADOR" ? (dias > 0 ? `vale ${dias} d más` : "venció") : formatDate(c.createdAt)}</span>
                </div>
                <div className="flex gap-2 border-t border-[var(--rule-soft)] pt-2">
                  <button type="button" onClick={(e) => { e.stopPropagation(); onAbrir(c); }} className={button({ variant: "secondary", className: "flex-1 rounded-xl" })}>Ver</button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); abrirWhatsApp(`Cotización ${c.numero} por ${formatCurrency(c.total)}`); }}
                    className={button({ variant: "secondary", className: "flex-1 gap-1.5 rounded-xl" })}
                  >
                    <MessageCircle className="h-4 w-4 text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]" aria-hidden /> WhatsApp
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Encabezados a 14 px y sin versalitas: el DataTable los trae a 12. */
        <DataTable className="[&_thead_th]:text-sm [&_thead_th]:normal-case [&_thead_th]:tracking-normal">
          <thead>
            <tr>
              <th>N°</th>
              <th>Cliente</th>
              <th className="text-right">Total</th>
              <th>Válido hasta</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((c) => (
              <tr
                key={c.id}
                tabIndex={0}
                onClick={() => onAbrir(c)}
                onKeyDown={alTeclado(() => onAbrir(c))}
                aria-label={`Ver cotización ${c.numero} de ${c.clienteNombre}`}
                className="cursor-pointer transition-colors hover:bg-[var(--surface-sunken)]"
              >
                <td className="text-sm tabular-nums text-[var(--text-secondary)]">
                  <span className="group/num relative">{c.numero}<Vistazo c={c} /></span>
                </td>
                <td>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[var(--text-primary)]"><EnlacePanel cosa="cliente" id={c.customerId}>{c.clienteNombre}</EnlacePanel></p>
                    {c.clienteRuc && <p className="truncate text-sm text-[var(--text-secondary)]">RUC {c.clienteRuc}</p>}
                  </div>
                </td>
                <td className="num font-bold text-[var(--text-primary)]">{formatCurrency(c.total)}</td>
                <td className="text-[var(--text-secondary)]">{formatDate(c.validoHasta)}</td>
                <td><Estado c={c} /></td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      {paginas > 1 && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-[var(--text-secondary)]">
            {filas.length} cotizaciones · página {actual} de {paginas}
          </p>
          <div className="flex gap-1">
            <button type="button" aria-label="Página anterior" disabled={actual <= 1} onClick={() => setPagina(actual - 1)} className={button({ variant: "ghost", className: "w-12 rounded-xl px-0" })}>
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" aria-label="Página siguiente" disabled={actual >= paginas} onClick={() => setPagina(actual + 1)} className={button({ variant: "ghost", className: "w-12 rounded-xl px-0" })}>
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
