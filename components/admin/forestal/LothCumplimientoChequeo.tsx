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
 *
 * 26-10 (Brandon: «que todo se cumpla… para evitar multas»): se suman los
 * chequeos avanzados del servidor (guías, árboles y bloques, plan y papeles,
 * plazos, fechas) y la vista va por secciones con filtro por severidad
 * (`LothChequeoSecciones`); sus ajustes, en el riel (`LothChequeoAjustes`).
 */

import { useState } from "react";
import { RefreshCw } from "@buleje/design-system/icons";
import { ErrorAlert, LoadingState, WarningAlert } from "@buleje/design-system";
import type { LothNavTarget } from "@/lib/forestal/loth-compliance";
import { loNoRevisado, printLothCumplimiento } from "@/lib/forestal/loth-cumplimiento-print";
import { formatNumber } from "@/lib/format";
import { Btn, VistaHeader } from "./ctp-shared";
import { BotonDescargar, BotonRecargar } from "./ctp-riel-control";
import { useKpisPlegables } from "./kpis-plegables";
import { PuntajeLoth, ReadinessBanner, TONE_A_MEDIAS, TONE_LABEL, plural } from "./LothCumplimientoPiezas";
import LothChequeoAjustes from "./LothChequeoAjustes";
import LothChequeoSecciones from "./LothChequeoSecciones";
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
  const { result, caratula, loading, ready, error, load, avanzado } = useLothCumplimiento(totalLineas, reloadSignal);
  const [reportError, setReportError] = useState<string | null>(null);
  /* Con algo sin revisar, ni el panel ni el PDF dicen «al día» (reviewer 26-10): la misma regla en los dos. */
  const aMedias = loNoRevisado({ sinLeer: avanzado.sinLeer, errorAvanzado: avanzado.error, avanzadoLeido: avanzado.leido }).length > 0;
  const tono = result ? (aMedias && result.tone === "success" ? TONE_A_MEDIAS : TONE_LABEL[result.tone]) : "";
  /* Arriba de los returns tempranos: es un hook. */
  const kpis = useKpisPlegables({
    claveMemoria: "loth-cumplimiento",
    resumen: result ? `${result.score}/100 · ${tono}` : undefined,
    tarjetas: result ? [<PuntajeLoth key="puntaje" result={result} etiqueta={tono} />] : [],
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

  const { checks, enOrden, bloqueos, advertencias, readiness } = result;

  function handleReport() {
    if (!result) return;
    setReportError(null);
    try {
      printLothCumplimiento({
        result,
        caratula,
        totalLineas,
        sinLeer: avanzado.sinLeer,
        errorAvanzado: avanzado.error,
        avanzadoLeido: avanzado.leido,
      });
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
        <LothChequeoAjustes ajustes={avanzado.ajustes} onGuardar={avanzado.guardar} />
        <BotonDescargar onClick={handleReport} etiqueta="Descargar el reporte de cumplimiento (PDF)" />
        <BotonRecargar onClick={() => void load()} cargando={loading} etiqueta="Recargar el chequeo" />
      </VistaHeader>

      {reportError && <WarningAlert title="No se pudo abrir el reporte" description={reportError} />}
      {error && <WarningAlert title="No se pudo recargar: se muestra el último cálculo" description={error} />}

      <ReadinessBanner readiness={readiness} aMedias={aMedias} bloqueos={bloqueos} advertencias={advertencias} enOrden={enOrden.length} onNavigate={onNavigate} />

      {kpis.panel}

      <LothChequeoSecciones
        checks={checks}
        sinLeer={avanzado.sinLeer}
        errorAvanzado={avanzado.error}
        avanzadoLeido={avanzado.leido}
        onNavigate={onNavigate}
      />
    </div>
  );
}
