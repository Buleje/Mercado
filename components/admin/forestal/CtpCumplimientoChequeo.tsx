"use client";

/**
 * Cumplimiento › «Chequeo del período» (ADR-124/127).
 *
 * Las alertas que antes sólo aparecían al abrir el Excel exportado
 * (`lib/forestal/ctp-export.ts`, hoja Resumen) se ven acá sin descargar nada.
 * Mismos números, misma fuente: los agregados vienen de `WoodEntriesDB.stats()`
 * y `ForestCtpDB.saldos()` (DB, no cliente), y el score sale de
 * `lib/forestal/ctp-compliance.ts` — el mismo archivo que consume el export, así
 * que panel y Excel nunca dicen números distintos.
 *
 * Diseño (triage-first): un veredicto de "¿puedo cerrar el período?" arriba,
 * chips de conteo, los problemas flotan al tope (bloqueos antes que advertencias)
 * y las verificaciones en orden se pliegan en una tarjeta compacta — no en un
 * muro de cajas verdes que entierra el único punto a revisar.
 *
 * Compactación (17-10): Indicadores, el reporte y Recargar van al riel del
 * libro (íconos); el título lo dice la pestaña.
 */

import { useState } from "react";
import { AlertTriangle, RefreshCw } from "@buleje/design-system/icons";
import { CardTitle, WarningAlert, ErrorAlert, LoadingState } from "@buleje/design-system";
import CtpComplianceHistoria from "./CtpComplianceHistoria";
import CtpEspeciesCatalogoModal from "./CtpEspeciesCatalogoModal";
import { useEspeciesCatalogo } from "./hooks/use-especies-catalogo";
import CtpKpiFiltros from "./CtpKpiFiltros";
import CtpCuadreSniffs from "./CtpCuadreSniffs";
import CtpDescuadresPanel from "./CtpDescuadresPanel";
import CtpSobreTopePanel from "./CtpSobreTopePanel";
import { Btn, VistaHeader } from "./ctp-shared";
import { useCtpCompliance } from "@/hooks/use-ctp-compliance";
import CtpComplianceScore, { TONE_LABEL } from "./CtpComplianceScore";
import { useKpisPlegables } from "./kpis-plegables";
import { ctpComplianceTone, ctpComplianceBreakdown } from "@/lib/forestal/ctp-compliance";
import { printCumplimiento } from "@/lib/forestal/ctp-cumplimiento-print";
import { ctpPeriodShortLabel, type CtpPeriod } from "@/lib/forestal/ctp-period";
import type { CtpIngresosFiltroRapido } from "./ctp-shared";
import { formatNumber } from "@/lib/format";
import { armarChequeos, clasificarChequeos, type ComplianceNavTarget } from "./ctp-cumplimiento-checks";
import { EnOrden, ProblemCard, ReadinessBanner, TriageChips } from "./CtpCumplimientoPiezas";
import { BotonDescargar, BotonRecargar } from "./ctp-riel-control";

export default function CtpCumplimientoChequeo({
  period,
  onNavigate,
  onCerrar,
}: {
  period: CtpPeriod;
  /** Salta a la pestaña donde se resuelve la alerta (Ingresos, Saldos, etc.),
   *  con el filtro del caso ya puesto cuando el destino sabe aplicarlo. */
  onNavigate: (target: ComplianceNavTarget, filtro?: CtpIngresosFiltroRapido) => void;
  /** La pestaña hermana «Cerrar el mes». */
  onCerrar: () => void;
}) {
  /**
   * El recorte por especie (ADR-400): viaja a los cuatro pedidos que arman el
   * puntaje, así que el número describe esa especie y no una mezcla.
   */
  const [especie, setEspecie] = useState("");
  const { data, loading, error, reload } = useCtpCompliance(period, especie || undefined);
  const [reportError, setReportError] = useState<string | null>(null);
  /* Las grafías del libro (ADR-410). Va acá y no en el score: escribir
     «Tornillo» y «TORNILLO» no incumple ninguna norma —el libro no se cae por
     eso—, pero parte los totales por especie y el saldo por permiso en dos, que
     es lo que un fiscalizador mira. Advertencia, no bloqueo.

     ⚠️ ARRIBA de los `return` tempranos: este componente devuelve antes de
     tiempo mientras carga y ante un error, y un hook debajo de eso cambia la
     cantidad de hooks entre renders — «Rendered more hooks than during the
     previous render», la pantalla en blanco (encontrado en el navegador; ni
     tsc ni lint lo ven). */
  const especies = useEspeciesCatalogo({ conLibro: true });
  const [verEspecies, setVerEspecies] = useState(false);

  /* El puntaje, plegable (Brandon 05-10): el botón va al riel y el titular
     viaja adentro. ARRIBA de los `return` tempranos (ver la nota de arriba):
     sin datos aún no hay tarjeta y el botón no se dibuja. */
  const kpis = useKpisPlegables({
    claveMemoria: "ctp-cumplimiento",
    resumen: data ? `${data.score}/100 · ${TONE_LABEL[ctpComplianceTone(data.score)]}` : undefined,
    tarjetas: data ? [<CtpComplianceScore key="puntaje" data={data} />] : [],
  });

  if (loading && !data) return <LoadingState message="Calculando cumplimiento del período..." />;

  if (error && !data) {
    return (
      <ErrorAlert
        title="No se pudo calcular el cumplimiento"
        description={error}
        action={
          <Btn variant="secondary" size="sm" onClick={() => void reload()}>
            <RefreshCw className="h-3.5 w-3.5" /> Reintentar
          </Btn>
        }
      />
    );
  }
  if (!data) return null;

  const tone = ctpComplianceTone(data.score);
  const breakdown = ctpComplianceBreakdown(data.counts);
  const checks = armarChequeos(data, especies.duplicadas, () => setVerEspecies(true));
  const { problemas, enOrden, bloqueos, advertencias, readiness } = clasificarChequeos(checks);

  // Reporte imprimible (PDF) para fiscalización: misma data del panel + la
  // identidad del CTP (best-effort desde la Ficha; si falla, el reporte igual sale).
  const reportData = data; // alias no-nullable (data ya pasó el guard `if (!data)`).
  async function handleReport() {
    setReportError(null);
    const ficha = await fetch("/api/admin/forestal/ctp-ficha", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => body?.ficha ?? null)
      .catch((err) => {
        console.warn("[ctp-report] ficha fetch failed", err);
        return null;
      });
    try {
      printCumplimiento({
        /* Con una especie puesta el reporte NO es el del período: lo dice en su
           encabezado. Un PDF que se presenta ante una autoridad no puede llevar
           un puntaje recortado bajo el rótulo del período completo (ADR-400). */
        periodLabel: especie ? `${period.label} · sólo especie ${especie}` : period.label,
        score: reportData.score,
        toneLabel: TONE_LABEL[tone],
        totalIngresos: reportData.totalIngresos,
        readiness,
        bloqueos,
        advertencias,
        enOrdenCount: enOrden.length,
        breakdown: breakdown.map((b) => ({ label: b.label, puntos: b.puntos, casos: b.casos, topeAlcanzado: b.topeAlcanzado })),
        problemas: problemas.map((c) => ({ severity: c.severity, title: c.title, description: c.description, action: c.action })),
        enOrden: enOrden.map((c) => c.okTitle),
        ficha,
      });
    } catch (err) {
      setReportError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-3">
      <VistaHeader
        titulo="Chequeo del período"
        meta={`${ctpPeriodShortLabel(period)} · ${formatNumber(data.totalIngresos)} ingresos`}
        hint="Los mismos números que exporta el libro a Excel."
      >
        {kpis.boton}
        <BotonDescargar onClick={() => void handleReport()} etiqueta="Descargar el reporte de cumplimiento (PDF)" />
        <BotonRecargar onClick={() => void reload()} cargando={loading} etiqueta="Recargar el chequeo" />
      </VistaHeader>

      {reportError && <WarningAlert title="No se pudo abrir el reporte" description={reportError} />}

      {/* El recorte por especie (ADR-400). Lo aplican los CUATRO pedidos que
          arman el puntaje —ingresos, saldos, trazabilidad y conciliación— así
          que el gauge, el desglose y las verificaciones hablan de esa especie.
          La nota dice hasta dónde llega: los cuadres de más abajo tienen su
          propia lectura y siguen mirando el período entero. */}
      <CtpKpiFiltros
        campos={[
          {
            key: "especie",
            label: "Especie",
            todos: "Todas las especies",
            valor: especie || undefined,
            opciones: data.especiesDelPeriodo.map((e) => ({ value: e, label: e })),
            onChange: (v) => setEspecie(v[0] ?? ""),
            /* Viaja a los cuatro pedidos del puntaje: la consulta admite una. */
            unico: true,
          },
        ]}
        onLimpiar={() => setEspecie("")}
        nota={
          especie
            ? `El puntaje y las verificaciones muestran sólo la especie ${especie} · los cuadres de abajo siguen viendo todo el período`
            : null
        }
      />

      <ReadinessBanner readiness={readiness} bloqueos={bloqueos} advertencias={advertencias} periodLabel={period.label} onCerrar={onCerrar} />

      {kpis.panel}

      {/* El gauge dice cómo estoy; esto, cómo vengo (ADR-384). Va pegado
          debajo porque la pregunta que sigue a «74/100» es siempre «¿y antes?». */}
      <CtpComplianceHistoria periodo={period.key} periodLabel={period.label} especieFiltrada={especie || undefined} />

      {/* Qué parte del libro está respaldada ante SERFOR, y cómo viene el
          movimiento contra el período de al lado (ADR-386). */}
      <CtpCuadreSniffs period={period} onNavigate={() => onNavigate("ingresos")} />

      <TriageChips bloqueos={bloqueos} advertencias={advertencias} enOrden={enOrden.length} />

      {/* El cruce de entrada del fiscalizador (ADR-353): declarado vs lista de
          piezas, sobre todo el libro. Va acá y no en una pestaña nueva porque
          una guía que no cuadra ES un hallazgo de fiscalización. */}
      <CtpDescuadresPanel />

      {/* El espejo del anterior, del otro lado del libro (ADR-358): corridas que
          declaran más de lo que sale de su materia prima. */}
      <CtpSobreTopePanel onNavigate={() => onNavigate("produccion")} />

      {problemas.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[var(--data-warning-600)]" />
            <CardTitle className="text-sm font-bold">
              Requiere atención <span className="text-[var(--text-tertiary)]">({problemas.length})</span>
            </CardTitle>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {problemas.map((c) => (
              <ProblemCard
                key={c.key}
                check={c}
                onNavigate={() => (c.onAction ? c.onAction() : onNavigate(c.navTarget, c.navFiltro))}
              />
            ))}
          </div>
        </section>
      )}

      <EnOrden checks={enOrden} />

      {/* El catálogo se abre ACÁ: la advertencia y donde se arregla son la misma
          pantalla — mandar a buscarlo a Herramientas es perder el hilo. */}
      {verEspecies && (
        <CtpEspeciesCatalogoModal open onClose={() => setVerEspecies(false)} onCambio={() => void especies.recargar()} />
      )}
    </div>
  );
}
