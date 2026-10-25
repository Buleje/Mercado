"use client";

/** La lista de guías: tabla (tarjetas a 400 px por el shell) con vista rápida al pasar el mouse. */
import { DataTable } from "@buleje/design-system";
import { ChevronLeft, ChevronRight, Truck } from "@buleje/design-system/icons";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BOTON_ICONO } from "./estilos";
import { GuiaHoverRow, GuiaPreview } from "./GuiaPreview";
import { MOTIVO_ROTULO, POR_PAGINA, STATUS_META, type GuiaRemision } from "./tipos";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla, type ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { useOrdenColumna, type AccesorOrden } from "@/components/admin/shared/use-orden-columna";
import { diaDeVigencia } from "@/lib/cotizaciones/vigencia";

const motivoDe = (g: GuiaRemision) => MOTIVO_ROTULO[g.motivoTraslado] ?? g.motivoTraslado;

/** Filtros de columna sobre todas las guías (llegan enteras; se paginan acá). El estado ya tiene sus chips arriba. */
const COLUMNAS: readonly ColumnaFiltro<GuiaRemision>[] = [
  { id: "numero", label: "N° GRR", tipo: "texto", valor: (g) => g.numero },
  { id: "fecha", label: "Fecha de traslado", tipo: "fecha", numero: (g) => diaDeVigencia(g.fechaTraslado) },
  { id: "destinatario", label: "Destinatario", tipo: "texto", valor: (g) => g.destinatarioNombre },
  { id: "motivo", label: "Motivo", tipo: "multi", valor: (g) => motivoDe(g), soloConVarios: true },
];

const ORDEN: Record<string, AccesorOrden<GuiaRemision>> = {
  numero: { valor: (g) => g.numero, texto: true },
  fecha: { valor: (g) => diaDeVigencia(g.fechaTraslado) },
  destinatario: { valor: (g) => g.destinatarioNombre, texto: true },
  motivo: { valor: (g) => motivoDe(g), texto: true },
  estado: { valor: (g) => STATUS_META[g.status].label, texto: true },
};

interface Props {
  /** Todas las guías que pasan los chips de arriba (no sólo la página). */
  guias: GuiaRemision[];
  page: number;
  onPage: (p: number) => void;
  onAbrir: (g: GuiaRemision) => void;
}

export function GuiasTabla({ guias, page, onPage, onAbrir }: Props) {
  const f = useFiltrosTabla(guias, COLUMNAS);
  const ord = useOrdenColumna(ORDEN);
  const filas = ord.ordenar(f.filtradas);
  const totalPages = Math.max(1, Math.ceil(filas.length / POR_PAGINA));
  const actual = Math.min(page, totalPages);
  const pagina = filas.slice((actual - 1) * POR_PAGINA, actual * POR_PAGINA);
  return (
    <>
      <BarraFiltrosTabla excel="Guías de remisión" vistas="guias" f={f} className="px-3 pt-2" />
      <div className="admin-mobile-cards">
        <DataTable>
          <thead>
            <tr>
              <ThColumna label="N° GRR" ids={["numero"]} f={f} orden={ord} ordenId="numero" />
              <ThColumna label="Fecha de traslado" ids={["fecha"]} f={f} orden={ord} ordenId="fecha" />
              <ThColumna label="Destinatario" ids={["destinatario"]} f={f} orden={ord} ordenId="destinatario" />
              <ThColumna label="Motivo" ids={["motivo"]} f={f} orden={ord} ordenId="motivo" />
              <ThColumna label="Estado" className="align-top" f={f} orden={ord} ordenId="estado" />
            </tr>
          </thead>
          <tbody>
            {pagina.length === 0 && <SinCoincidenciasFila colSpan={5} />}
            {pagina.map((g) => {
              const meta = STATUS_META[g.status];
              return (
                <tr
                  key={g.id}
                  onClick={() => onAbrir(g)}
                  tabIndex={0}
                  role="button"
                  aria-label={`Ver guía ${g.numero} de ${g.destinatarioNombre}`}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAbrir(g); }
                  }}
                  className="cursor-pointer"
                >
                  <td data-label="N° GRR" className="font-mono text-[var(--text-secondary)]">
                    <GuiaHoverRow preview={<GuiaPreview guia={g} />}><span>{g.numero}</span></GuiaHoverRow>
                  </td>
                  <td data-label="Fecha de traslado" className="text-[var(--text-secondary)]">{formatDate(g.fechaTraslado)}</td>
                  <td data-label="Destinatario">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] max-sm:hidden">
                        <Truck className="h-4 w-4" aria-hidden />
                      </span>
                      <p className="truncate font-medium text-[var(--text-primary)]">{g.destinatarioNombre}</p>
                    </div>
                  </td>
                  <td data-label="Motivo" className="text-[var(--text-secondary)]">{motivoDe(g)}</td>
                  <td data-label="Estado">
                    <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-bold", meta.bg, meta.color)}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} aria-hidden />
                      {meta.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-[var(--rule-soft)] px-4 py-2">
          <p className="text-sm text-[var(--text-secondary)]">
            {filas.length} guía{filas.length !== 1 ? "s" : ""} — pág. {actual}/{totalPages}
          </p>
          <div className="flex gap-1">
            <button type="button" aria-label="Anterior" disabled={actual <= 1} onClick={() => onPage(actual - 1)} className={cn(BOTON_ICONO, "disabled:opacity-30")}>
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" aria-label="Siguiente" disabled={actual >= totalPages} onClick={() => onPage(actual + 1)} className={cn(BOTON_ICONO, "disabled:opacity-30")}>
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
