"use client";

/**
 * «Chequeo del libro» — la pestaña por defecto de Cumplimiento del Libro TH.
 *
 * Gemelo de `CtpCumplimientoChequeo` (ADR-305). Reencuadra las anomalías que ya
 * calcula «Rentabilidad y rendimiento» como un veredicto de «¿el libro resiste
 * una fiscalización de OSINFOR ahora?»: los bloqueos flotan al tope, las
 * advertencias abajo, y las verificaciones en orden se pliegan — no un muro de
 * cajas verdes que entierra el único punto a revisar.
 *
 * Compacta (17-10, «compactar el Libro TH»): el ⓘ, «Indicadores», descargar y
 * recargar van al riel de las pestañas; el puntaje (gauge + cómo se compone,
 * 287 px) es la tarjeta de «Indicadores», plegada y recordada; el veredicto y
 * sus contadores, una línea. El score y los chequeos salen de
 * `computeLothCompliance` (puro), el MISMO que consume el reporte imprimible.
 */

import { useState } from "react";
import { AlertTriangle, RefreshCw } from "@buleje/design-system/icons";
import { CardTitle, ErrorAlert, LoadingState, WarningAlert } from "@buleje/design-system";
import type { LothNavTarget } from "@/lib/forestal/loth-compliance";
import { printLothCumplimiento } from "@/lib/forestal/loth-cumplimiento-print";
import { formatNumber } from "@/lib/format";
import { Btn, VistaHeader } from "./ctp-shared";
import { BotonDescargar, BotonRecargar } from "./ctp-riel-control";
import { useKpisPlegables } from "./kpis-plegables";
import { EnOrden, ProblemCard, PuntajeLoth, ReadinessBanner, TONE_LABEL, plural } from "./LothCumplimientoPiezas";
import { useLothCumplimiento } from "./hooks/use-loth-cumplimiento";

export default function LothCumplimientoChequeo({
  totalLineas,
  onNavigate,
  reloadSignal,
}: {
  totalLineas: number;
  onNavigate: (target: LothNavTarget) => void;
  /** Se incrementa tras cada escritura del libro → gatilla refetch (fin del "apretá Recargar"). */
  reloadSignal?: number;
}) {
  const { result, caratula, loading, ready, error, load } = useLothCumplimiento(totalLineas, reloadSignal);
  const [reportError, setReportError] = useState<string | null>(null);
  /* Arriba de los returns tempranos: es un hook. */
  const kpis = useKpisPlegables({
    claveMemoria: "loth-cumplimiento",
    resumen: result ? `${result.score}/100 · ${TONE_LABEL[result.tone]}` : undefined,
    tarjetas: result ? [<PuntajeLoth key="puntaje" result={result} />] : [],
  });

  if (loading && !ready) return <LoadingState message="Calculando cumplimiento del libro..." />;
  if (!result) {
    return (
      <ErrorAlert
        title="No se pudo calcular el cumplimiento"
        description={error ?? "Sin respuesta del servidor."}
        action={
          <Btn variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" /> Reintentar
          </Btn>
        }
      />
    );
  }

  const { problemas, enOrden, bloqueos, advertencias, readiness } = result;

  function handleReport() {
    if (!result) return;
    setReportError(null);
    try {
      printLothCumplimiento({ result, caratula, totalLineas });
    } catch (err) {
      setReportError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-4">
      <VistaHeader
        titulo="Chequeo del libro"
        meta={`${formatNumber(totalLineas)} ${plural(totalLineas, "línea registrada", "líneas registradas")}`}
        hint="Cifras del libro entero (todos los planes). «Rentabilidad y rendimiento» es de un plan: con 2 o más planes puede dar otra cifra."
      >
        {kpis.boton}
        <BotonDescargar onClick={handleReport} etiqueta="Descargar el reporte de cumplimiento (PDF)" />
        <BotonRecargar onClick={() => void load()} cargando={loading} etiqueta="Recargar el chequeo" />
      </VistaHeader>

      {reportError && <WarningAlert title="No se pudo abrir el reporte" description={reportError} />}
      {error && <WarningAlert title="No se pudo recargar: se muestra el último cálculo" description={error} />}

      <ReadinessBanner readiness={readiness} bloqueos={bloqueos} advertencias={advertencias} enOrden={enOrden.length} onNavigate={onNavigate} />

      {kpis.panel}

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
              <ProblemCard key={c.key} check={c} onNavigate={() => onNavigate(c.navTarget)} />
            ))}
          </div>
        </section>
      )}

      <EnOrden checks={enOrden} />
    </div>
  );
}
