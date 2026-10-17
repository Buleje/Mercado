"use client";

/**
 * CtpReportesView — el apartado «Reportes» del Libro CTP: la PRODUCCIÓN del
 * aserradero en el tiempo, partida por dueño, permiso y especie.
 *
 * Pedido de Brandon (2026-09-23): *«un apartado especializado de reportes…
 * resumen de semana, elegir cuántas semanas, gráficos de progreso semanal,
 * mensual, días, rango, gráficos de alto nivel, lo de madera de los dueños y
 * permisos»*.
 *
 * Qué NO repite: el Tablero (Control) ya mira las cuatro secciones del libro en
 * m³ y Análisis la tendencia fija de 6 meses. Esto mira lo que salió de la
 * sierra, en PT —como habla el aserradero—, con el período y los recortes que
 * elige el dueño, y cierra al pie con la tira de días.
 *
 * Orden por pregunta: ¿cuánto? (cifras) → ¿cómo fue? (progreso) → ¿de quién?
 * (composición) → ¿y cada semana? (tabla). Los filtros, pegados arriba de todo
 * lo que cambian.
 */

import { useState } from "react";
import { SectionTitle } from "@buleje/design-system";
import {
  AlertTriangle,
  Boxes,
  CalendarDays,
  ChevronDown,
  FileSpreadsheet,
  Gauge,
  Layers,
  RefreshCw,
  TrendingUp,
} from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { exportSheetsToExcel } from "@/lib/export-excel";
import { fmtM3, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { hojasDelReporte, nombreDelArchivo } from "@/lib/forestal/reportes-produccion-excel";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import { formatNumber } from "@/lib/format";
import type { ReporteDeProduccion } from "@/lib/forestal/reportes-produccion";
import { Btn, PanelSkeleton } from "./ctp-shared";
import CtpKpi from "./CtpKpi";
import { useReporteProduccion } from "./hooks/use-reporte-produccion";
import ReportesFiltros from "./reportes/ReportesFiltros";
import { ReportesComposicion, ReportesProgreso } from "./reportes/ReportesGraficos";
import ReportesSemanas from "./reportes/ReportesSemanas";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Las cinco cifras del período. Plegadas siguen diciendo su número en una línea. */
function ReportesKpis({ r }: { r: ReporteDeProduccion }) {
  const [abiertas, setAbiertas] = useLocalStorage<boolean>("ctp-reportes:kpis-abiertos", true);
  const t = r.totales;
  const previo = r.periodo.previo.etiqueta;
  const serie = r.cubos.map((c) => c.pt);
  const resumen = `${fmtPt(t.pt)} PT · ${fmtM3(t.m3)} m³ · ${fmtPiezas(t.piezas)} piezas · ${plural(t.corridas, "corrida", "corridas")} · ${t.diasConProduccion} de ${r.periodo.diasTranscurridos} días con sierra`;

  return (
    <div>
      <button
        type="button"
        onClick={() => setAbiertas((v) => !v)}
        aria-expanded={abiertas}
        className="mb-2 flex w-full items-center gap-2 rounded-lg text-left text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${abiertas ? "" : "-rotate-90"}`} aria-hidden />
        <span className="font-bold text-[var(--text-primary)]">{abiertas ? "Cifras del período" : resumen}</span>
      </button>
      {abiertas && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <CtpKpi
            label="PT producidos"
            icon={TrendingUp}
            value={`${fmtPt(t.pt)} PT`}
            subValue={`${fmtM3(t.m3)} m³`}
            actual={t.pt}
            previo={r.previo.pt}
            etiquetaPrevio={previo}
            serie={serie}
          />
          <CtpKpi
            label="Piezas"
            icon={Boxes}
            value={fmtPiezas(t.piezas)}
            subValue={plural(t.corridas, "corrida", "corridas")}
            actual={t.piezas}
            previo={r.previo.piezas}
            etiquetaPrevio={previo}
          />
          <CtpKpi
            label="Días con sierra"
            icon={CalendarDays}
            value={`${t.diasConProduccion} de ${r.periodo.diasTranscurridos}`}
            subValue={
              t.diasConProduccion === 0
                ? "ningún día con producción"
                : `${r.periodo.diasTranscurridos - t.diasConProduccion} sin producción`
            }
            tono="neutral"
          />
          <CtpKpi
            label="Promedio por día"
            icon={Gauge}
            value={t.ptPorDiaTrabajado == null ? "—" : `${fmtPt(t.ptPorDiaTrabajado)} PT`}
            subValue={
              r.mejorDia
                ? `por día con sierra · mejor: ${etiquetaLarga(r.mejorDia.dia)}, ${fmtPt(r.mejorDia.pt)} PT`
                : "sin días con sierra"
            }
            tono="neutral"
          />
          <CtpKpi
            label="Rendimiento"
            icon={Layers}
            value={r.rendimiento ? `${formatNumber(r.rendimiento.pct, { max: 1 })} %` : "—"}
            subValue={
              r.rendimiento
                ? `sólo ${r.rendimiento.corridas} de ${plural(t.corridas, "corrida", "corridas")}: las que tienen materia prima atribuida`
                : "ninguna corrida tiene materia prima atribuida"
            }
            tono="neutral"
          />
        </div>
      )}
    </div>
  );
}

export default function CtpReportesView({ onIr }: { onIr?: (vista: string) => void }) {
  const e = useReporteProduccion();
  const r = e.reporte;
  const [exportando, setExportando] = useState(false);
  const [errorExcel, setErrorExcel] = useState<string | null>(null);

  const exportar = async () => {
    if (!r) return;
    setExportando(true);
    setErrorExcel(null);
    try {
      await exportSheetsToExcel(hojasDelReporte(r), nombreDelArchivo(r));
    } catch (err) {
      setErrorExcel(err instanceof Error ? err.message : String(err));
    } finally {
      setExportando(false);
    }
  };

  return (
    /* `max-sm:pb-16`: en el celular el botón flotante de acciones rápidas tapaba
       el PT del total al final del scroll. */
    <div className="space-y-3 max-sm:pb-16" data-vista-reportes>
      {/* Título y botones en UNA fila y la bajada debajo, a todo el ancho: con
          la bajada al lado, a 400 px los botones caían solos a otra fila. */}
      <header>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <SectionTitle as="h2">Reportes de producción</SectionTitle>
            <InfoTip
              title="Reportes de producción"
              what="Lo que salió de la sierra, en PT, m³ y piezas."
              affects="Por semana, por dueño de la madera, por permiso y por especie."
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Btn
              variant="secondary"
              size="sm"
              onClick={() => void exportar()}
              disabled={!r || exportando || r.totales.corridas === 0}
              title="Bajar el reporte en Excel: resumen, semanas, dueños, permisos y especies"
            >
              <FileSpreadsheet className="h-4 w-4" aria-hidden />
              <span className="max-sm:sr-only">{exportando ? "Armando…" : "Excel"}</span>
            </Btn>
            <Btn
              variant="secondary"
              size="sm"
              onClick={e.recargar}
              disabled={e.cargando}
              aria-label="Recargar el reporte"
              title="Recargar el reporte"
            >
              <RefreshCw className={`h-4 w-4 ${e.cargando ? "animate-spin" : ""}`} aria-hidden />
            </Btn>
          </div>
        </div>
      </header>

      <ReportesFiltros
        periodo={e.periodo}
        agrupacion={e.agrupacion}
        filtros={e.filtros}
        reporte={r}
        onPeriodo={e.cambiarPeriodo}
        onAgrupacion={e.setAgrupacion}
        onFiltro={e.cambiarFiltro}
        onLimpiar={e.limpiarFiltros}
      />

      {(e.error || errorExcel) && (
        <p
          role="alert"
          className="flex items-start gap-1.5 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {errorExcel ? `No se pudo armar el Excel: ${errorExcel}` : `No se pudo leer el reporte: ${e.error}`}
          </span>
        </p>
      )}

      {!r ? (
        e.error ? null : <PanelSkeleton kpis={5} />
      ) : (
        /* Mientras llega el reporte nuevo se ve el anterior, apagado: saltar a
           un esqueleto en cada cambio de filtro hace perder dónde se estaba. */
        <div className={`space-y-3 transition-opacity ${e.cargando ? "opacity-60" : ""}`} aria-busy={e.cargando}>
          <ReportesKpis r={r} />
          {r.totales.corridas === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--rule-base)] px-4 py-8 text-center">
              <p className="text-base font-bold text-[var(--text-primary)]">
                Sin producción {r.periodo.diasTranscurridos === 0 ? "todavía: el período no empezó" : `en ${r.periodo.etiqueta.toLowerCase()}`}
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {e.filtros.duenos.length + e.filtros.permisos.length + e.filtros.especies.length > 0
                  ? "Con los filtros elegidos no hay corridas. Prueba con «Ver todo»."
                  : "Amplía el período o anota la producción en la vista Producción."}
              </p>
              {e.periodo.tipo === "semanas" && e.periodo.semanas < 26 && (
                <Btn variant="secondary" size="sm" className="mt-3" onClick={() => e.cambiarPeriodo({ semanas: 26 })}>
                  Ver las últimas 26 semanas
                </Btn>
              )}
            </div>
          ) : (
            <>
              <ReportesProgreso reporte={r} linea={e.linea} onLinea={e.setLinea} />
              <ReportesComposicion reporte={r} dimension={e.dimension} onDimension={e.setDimension} onIr={onIr} />
              <ReportesSemanas reporte={r} />
            </>
          )}
          {(r.truncado || r.totales.corridasOtraUnidad > 0) && (
            <p className="text-sm text-[var(--text-tertiary)]">
              {r.truncado && "El período es tan largo que se leyeron sólo las corridas más nuevas: acota las fechas. "}
              {r.totales.corridasOtraUnidad > 0 &&
                `${plural(r.totales.corridasOtraUnidad, "corrida declara", "corridas declaran")} en otra unidad: cuentan como corridas, pero no suman m³ ni PT.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
