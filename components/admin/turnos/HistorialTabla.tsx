"use client";

/**
 * La lista del historial (la «Línea de tiempo» la repetía y se fue el 10-10). La diferencia es la del servidor
 * (la caja que se cerró con el turno); sin caja vinculada se muestra «—».
 * Tocar un turno abre su resumen (medio de pago, más vendidos, corte).
 */
import { useEffect, useMemo, type MutableRefObject } from "react";
import { DataTable } from "@buleje/design-system";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla, type ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { useOrdenColumna, type AccesorOrden } from "@/components/admin/shared/use-orden-columna";
import { ChevronLeft, ChevronRight, Loader2 } from "@buleje/design-system/icons";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { cn, limaDateKey } from "@/lib/utils";
import { turnoConAlerta, type Turno } from "./tipos";

type Props = {
  turnos: Turno[];
  nombreDe: (t: Turno) => string;
  onVer: (t: Turno) => void;
  cargandoId: string | null;
  page: number;
  setPage: (p: number) => void;
  porPagina: number;
  /** Las filas que dejan los embudos, en el orden de la tabla (todas las páginas): lo que exporta «Exportar historial». */
  visiblesRef?: MutableRefObject<Turno[] | null>;
};

const dia = (v: string | null | undefined) => (v ? limaDateKey(v) || null : null);
const ddmm = (v: number | string) => String(v).split("-").reverse().slice(0, 2).join("/");
const efFinal = (t: Turno) => (t.cierreEfectivo != null && !t.cerradoPorSistema ? t.cierreEfectivo : null);

type Fila = { t: Turno; quien: string };

/** Filtros de columna (como Adelantos › Lista) sobre lo que pasan el buscador y los chips de arriba: los turnos cerrados llegan enteros. */
const COLUMNAS: readonly ColumnaFiltro<Fila>[] = [
  { id: "quien", label: "Atendió", tipo: "multi", valor: ({ quien }) => quien, soloConVarios: true },
  { id: "apertura", label: "Apertura", tipo: "fecha", numero: ({ t }) => dia(t.abrioEn), formatearValor: ddmm },
  { id: "cierre", label: "Cierre", tipo: "fecha", numero: ({ t }) => dia(t.cerroEn), formatearValor: ddmm },
  { id: "inicial", label: "Ef. inicial", tipo: "rango", numero: ({ t }) => t.inicioEfectivo, unidad: "S/", paso: 0.01 },
  { id: "ventas", label: "Ventas", tipo: "rango", numero: ({ t }) => t.ventasTotal, unidad: "S/", paso: 0.01 },
  { id: "final", label: "Ef. final", tipo: "rango", numero: ({ t }) => efFinal(t), unidad: "S/", paso: 0.01 },
  { id: "diferencia", label: "Diferencia", tipo: "rango", numero: ({ t }) => t.diferencia, unidad: "S/", paso: 0.01 },
];

const ORDEN: Record<string, AccesorOrden<Fila>> = {
  quien: { valor: ({ quien }) => quien, texto: true },
  apertura: { valor: ({ t }) => new Date(t.abrioEn).getTime() },
  cierre: { valor: ({ t }) => (t.cerroEn ? new Date(t.cerroEn).getTime() : null) },
  inicial: { valor: ({ t }) => t.inicioEfectivo },
  ventas: { valor: ({ t }) => t.ventasTotal },
  final: { valor: ({ t }) => efFinal(t) },
  diferencia: { valor: ({ t }) => t.diferencia },
};

export function Diferencia({ t }: { t: Turno }) {
  if (t.diferencia == null) {
    return <span className="text-[var(--text-tertiary)]" title={t.cerradoPorSistema ? "Lo cerró el sistema sin conteo" : "Turno sin caja vinculada"}>—</span>;
  }
  const d = t.diferencia;
  if (Math.abs(d) < 0.01) return <span className="font-semibold text-[var(--data-success-ink)] tabular-nums">{formatCurrency(0)}</span>;
  return (
    <span className={cn("font-bold tabular-nums", d > 0 ? "text-[var(--data-warning-ink)]" : "text-[var(--data-error-ink)]")}>
      {d > 0 ? "+" : ""}{formatCurrency(d)}
    </span>
  );
}

function Marca({ t }: { t: Turno }) {
  if (t.cerradoPorSistema) {
    return <span className="ml-1.5 rounded px-1.5 py-0.5 text-sm font-bold bg-[var(--data-warning-500)]/10 border border-[var(--data-warning-500)]/40 text-[var(--text-primary)]">Sistema</span>;
  }
  if (turnoConAlerta(t)) {
    return <span className="ml-1.5 rounded px-1.5 py-0.5 text-sm font-bold bg-[var(--data-error-500)]/10 border border-[var(--data-error-500)]/40 text-[var(--text-primary)]">Revisar</span>;
  }
  return null;
}

export function HistorialTabla({ turnos, nombreDe, onVer, cargandoId, page, setPage, porPagina, visiblesRef }: Props) {
  const base = useMemo<Fila[]>(() => turnos.map((t) => ({ t, quien: nombreDe(t) })), [turnos, nombreDe]);
  const f = useFiltrosTabla(base, COLUMNAS);
  const ord = useOrdenColumna(ORDEN);
  const filas = ord.ordenar(f.filtradas);
  useEffect(() => {
    if (!visiblesRef) return;
    visiblesRef.current = filas.map(({ t }) => t);
    return () => { visiblesRef.current = null; };
  }, [filas, visiblesRef]);
  /* Lo que se ve (todas las páginas): la diferencia suma sólo los turnos con caja contada. */
  const totalVentas = filas.reduce((n, { t }) => n + t.ventasTotal, 0);
  const conDiferencia = filas.filter(({ t }) => t.diferencia != null);
  const totalDiferencia = conDiferencia.reduce((n, { t }) => n + (t.diferencia ?? 0), 0);
  const totalPages = Math.max(1, Math.ceil(filas.length / porPagina));
  const pg = Math.min(page, totalPages);
  const pagina = filas.slice((pg - 1) * porPagina, pg * porPagina);
  /* Un embudo nuevo deja la tabla en la primera página, no en una que ya no existe. */
  useEffect(() => { setPage(1); }, [f.filtradas.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <BarraFiltrosTabla vistas="turnos" f={f} className="px-3 py-2" />
      <DataTable>
        <thead>
          <tr>
            <ThColumna label="Atendió" ids={["quien"]} f={f} orden={ord} ordenId="quien" />
            <ThColumna label="Apertura" ids={["apertura"]} f={f} orden={ord} ordenId="apertura" />
            <ThColumna label="Cierre" ids={["cierre"]} f={f} className="hidden sm:table-cell" orden={ord} ordenId="cierre" />
            <ThColumna label="Ef. inicial" ids={["inicial"]} f={f} derecha orden={ord} ordenId="inicial" />
            <ThColumna label="Ventas" ids={["ventas"]} f={f} derecha orden={ord} ordenId="ventas" />
            <ThColumna label="Ef. final" ids={["final"]} f={f} derecha className="hidden sm:table-cell" orden={ord} ordenId="final" />
            <ThColumna label="Diferencia" ids={["diferencia"]} f={f} derecha orden={ord} ordenId="diferencia" />
          </tr>
        </thead>
        <tbody>
          {pagina.length === 0 && <SinCoincidenciasFila colSpan={7} />}
          {pagina.map(({ t }) => (
            <tr key={t.id} className="cursor-pointer" onClick={() => onVer(t)}>
              <td className="font-semibold">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onVer(t); }}
                  className="inline-flex items-center gap-1 text-left hover:underline truncate max-w-[200px]"
                  title="Ver el resumen de este turno"
                >
                  {cargandoId === t.id && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />}
                  {nombreDe(t)}
                </button>
                <Marca t={t} />
              </td>
              <td className="text-[var(--text-secondary)] tabular-nums">{formatDateTime(t.abrioEn)}</td>
              <td className="text-[var(--text-secondary)] hidden sm:table-cell tabular-nums">{t.cerroEn ? formatDateTime(t.cerroEn) : "—"}</td>
              <td className="text-right text-[var(--text-secondary)] tabular-nums">{formatCurrency(t.inicioEfectivo)}</td>
              <td className="text-right font-bold text-[var(--data-success-ink)] tabular-nums">{formatCurrency(t.ventasTotal)}</td>
              <td className="text-right text-[var(--text-secondary)] hidden sm:table-cell tabular-nums">{t.cierreEfectivo != null && !t.cerradoPorSistema ? formatCurrency(t.cierreEfectivo) : "—"}</td>
              <td className="text-right"><Diferencia t={t} /></td>
            </tr>
          ))}
        </tbody>
        {filas.length > 0 && (
          <tfoot className="max-sm:hidden">
            <tr className="border-t-2 border-[var(--rule-base)] font-bold">
              <td colSpan={4}>{f.activos > 0 ? "Total de lo que se ve" : "Total"} · {filas.length} {filas.length === 1 ? "turno" : "turnos"}</td>
              <td className="text-right tabular-nums text-[var(--data-success-ink)]">{formatCurrency(totalVentas)}</td>
              <td />
              <td className="text-right tabular-nums" title={conDiferencia.length < filas.length ? `Suma de los ${conDiferencia.length} turnos con caja contada` : undefined}>
                {conDiferencia.length === 0 ? "—" : `${totalDiferencia > 0 ? "+" : ""}${formatCurrency(totalDiferencia)}`}
              </td>
            </tr>
          </tfoot>
        )}
      </DataTable>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--rule-soft)]">
          <p className="text-sm text-[var(--text-secondary)]">{filas.length} turnos · pág. {pg}/{totalPages}</p>
          <div className="flex gap-1">
            <button type="button" aria-label="Anterior" disabled={pg <= 1} onClick={() => setPage(pg - 1)} className="inline-flex h-12 w-12 items-center justify-center rounded-xl hover:bg-[var(--surface-sunken)] disabled:opacity-30">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" aria-label="Siguiente" disabled={pg >= totalPages} onClick={() => setPage(pg + 1)} className="inline-flex h-12 w-12 items-center justify-center rounded-xl hover:bg-[var(--surface-sunken)] disabled:opacity-30">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
