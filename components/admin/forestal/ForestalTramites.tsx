"use client";

/**
 * ForestalTramites — los documentos que el CTP le presenta a la autoridad.
 *
 * El sistema ya generaba todo lo que el CTP REGISTRA (libro, anexo 04, GTF,
 * informe, carpeta de fiscalización). Esto es lo otro: lo que el CTP PIDE —
 * visado de talonario de GTF, inspección de campo, actualización de datos,
 * descargo ante una supervisión, permiso CITES, oficios. Antes se escribía a
 * mano en Word, cada vez desde cero y sin rastro de qué se presentó (ADR-308).
 *
 * Este archivo es el SHELL: trae los datos del autollenado y decide qué vista se
 * ve. El catálogo, el formulario y el expediente viven en sus propios archivos.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Building2, CalendarClock, FileText, Inbox, Stamp, TreePine } from "@buleje/design-system/icons";
import LibroChrome, { type LibroGroup } from "@/components/admin/shared/libro-chrome";
import { useForestTramites } from "@/hooks/use-forest-tramites";
import { FORMATOS_TRAMITE, formatoPorId } from "@/lib/forestal/tramites-catalogo";
import { tramitesSinRespuesta, type TramiteRegistro } from "@/lib/forestal/tramites-registro";
import { avisoPlazoRelacion, relacionesDelFormato } from "@/lib/forestal/tramites-relacion-guias";
import type { CtpReportFicha } from "@/lib/forestal/ctp-print-shared";
import TramiteFormulario, { type AutollenadoTramite } from "./TramiteFormulario";
import TramitesCatalogo from "./TramitesCatalogo";
import TramitesExpediente from "./TramitesExpediente";
import PlantacionesModule from "./PlantacionesModule";

const MODULE_ID = "forestal-tramites";
type Vista = "catalogo" | "expediente" | "plantaciones";

const GRUPOS: LibroGroup[] = [
  {
    id: "tramites",
    label: "Trámites",
    views: [
      { key: "catalogo", label: "Formatos", icon: FileText, hint: "Elegí el trámite y llenalo" },
      { key: "expediente", label: "Expediente", icon: Inbox, hint: "Qué se presentó y en qué estado está" },
      { key: "plantaciones", label: "Plantaciones", icon: TreePine, hint: "Registro RNPF — inscripción y actualización" },
    ],
  },
];

export default function ForestalTramites() {
  const [vista, setVista] = useState<Vista>("catalogo");
  const [formatoId, setFormatoId] = useState<string | null>(null);
  const [editando, setEditando] = useState<TramiteRegistro | null>(null);
  const [auto, setAuto] = useState<AutollenadoTramite>({ ficha: null });
  const { tramites, cargando, error, setError, recargar, guardar, borrar } = useForestTramites();

  /**
   * Autollenado: la Ficha CTP es el membrete y el Libro tiene el resto (la serie
   * y el correlativo de la última GTF emitida). Se carga una vez al montar: son
   * los datos que el operador no debería re-tipear.
   */
  useEffect(() => {
    let vivo = true;
    (async () => {
      const [f, salida] = await Promise.all([
        fetch("/api/admin/forestal/ctp-ficha", { credentials: "include" })
          .then((r) => (r.ok ? r.json() : null))
          .catch((err) => {
            console.warn("[tramites] ficha no disponible", err);
            return null;
          }),
        fetch("/api/admin/forestal/ctp?section=despacho", { credentials: "include" })
          .then((r) => (r.ok ? r.json() : null))
          .catch((err) => {
            console.warn("[tramites] despachos no disponibles", err);
            return null;
          }),
      ]);
      if (!vivo) return;
      const ficha: CtpReportFicha | null = f?.ficha ?? f ?? null;

      // Última GTF emitida: la serie es lo que va antes del último guion y el
      // correlativo lo que sigue. Si el CTP la escribe distinto, el operador lo
      // corrige en el formulario — es una sugerencia, no un dato del libro.
      const conGtf = (salida?.entries ?? []).filter((e: { gtfNumber?: string | null }) => e.gtfNumber?.trim());
      const ultima: string = conGtf[0]?.gtfNumber ?? "";
      const corte = ultima.lastIndexOf("-");
      setAuto({
        ficha,
        serieGtf: corte > 0 ? ultima.slice(0, corte) : ultima || undefined,
        ultimoCorrelativo: corte > 0 ? ultima.slice(corte + 1) : undefined,
        despachosCount: conGtf.length || undefined,
      });
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const formato = formatoId ? formatoPorId(formatoId) : null;
  const esperando = useMemo(() => tramitesSinRespuesta(tramites, new Date()), [tramites]);
  const fichaFloja = !auto.ficha?.razonSocial || !auto.ficha?.ruc;

  /**
   * Plazo vencido (ADR-364 ronda 4): formatos con correlativo se presentan
   * período tras período — si pasaron 15+ días desde que terminó el último
   * período declarado sin uno nuevo, avisa acá arriba, ANTES de que el
   * operador tenga que abrir el formato para descubrirlo.
   */
  const avisosPlazo = useMemo(() => {
    const hoy = new Date();
    return FORMATOS_TRAMITE.filter((f) => f.correlativo)
      .map((f) => {
        const aviso = avisoPlazoRelacion(relacionesDelFormato(tramites, f.id), hoy);
        return aviso ? { formato: f, aviso } : null;
      })
      .filter((x): x is { formato: (typeof FORMATOS_TRAMITE)[number]; aviso: NonNullable<ReturnType<typeof avisoPlazoRelacion>> } => x !== null);
  }, [tramites]);

  const abrirFormato = useCallback((id: string) => {
    setFormatoId(id);
    setEditando(null);
    setVista("catalogo");
  }, []);

  const abrirExpediente = useCallback((t: TramiteRegistro) => {
    setFormatoId(t.formatoId);
    setEditando(t);
    setVista("catalogo");
  }, []);

  return (
    <LibroChrome
      moduleId={MODULE_ID}
      eyebrow="Forestal · SERFOR · ARFFS · OSINFOR"
      title="Trámites y Oficios"
      icon={Stamp}
      groups={GRUPOS}
      view={vista}
      onView={(v) => {
        setVista(v as Vista);
        if (v === "expediente" || v === "plantaciones") setFormatoId(null);
      }}
      alerts={esperando.length > 0 ? { expediente: esperando.length } : undefined}
    >
      {error && (
        <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div><strong>Error:</strong> {error}</div>
          <button type="button" onClick={() => setError(null)} className="ml-auto shrink-0 text-xs font-bold underline opacity-70">
            Cerrar
          </button>
        </div>
      )}

      {/* Sin membrete la autoridad observa el documento: se avisa una vez, arriba
          del catálogo, y no en cada formato. */}
      {vista === "catalogo" && !formato && fichaFloja && (
        <p className="flex items-start gap-3 rounded-2xl border-2 border-[var(--data-warning-500)]/50 bg-[var(--data-warning-50)] p-4 text-sm text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
          <Building2 className="mt-0.5 h-5 w-5 shrink-0" />
          <span>
            La <strong>Ficha CTP</strong> está incompleta: sin razón social, RUC y Código de CTP los documentos
            salen sin membrete y la autoridad los observa. Completala en el Libro CTP → Ficha CTP.
          </span>
        </p>
      )}

      {/* Plazo vencido (ADR-364 ronda 4): el siguiente tramo de un formato con
          correlativo quedó sin declarar hace 15+ días. */}
      {vista === "catalogo" && !formato && avisosPlazo.map(({ formato: f, aviso }) => (
        <button
          key={f.id}
          type="button"
          onClick={() => abrirFormato(f.id)}
          className="flex w-full items-start gap-3 rounded-2xl border-2 border-[var(--data-warning-500)]/50 bg-[var(--data-warning-50)] p-4 text-left text-sm text-[var(--data-warning-700)] transition-colors hover:border-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]"
        >
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0" />
          <span>
            <strong>{f.nombre}</strong>: la última {aviso.numeroDocumento ? `(N° ${aviso.numeroDocumento}) ` : ""}
            cubrió hasta el {aviso.periodoHasta} — pasaron {aviso.dias} días sin declarar el siguiente tramo. Tocá para abrirlo.
          </span>
        </button>
      ))}

      {vista === "catalogo" && !formato && (
        <TramitesCatalogo tramites={tramites} onElegir={abrirFormato} onAbrirPlantaciones={() => setVista("plantaciones")} />
      )}

      {vista === "catalogo" && formato && (
        <TramiteFormulario
          formato={formato}
          auto={auto}
          existente={editando}
          tramites={tramites}
          onGuardar={guardar}
          onCerrar={() => {
            setFormatoId(null);
            setEditando(null);
          }}
        />
      )}

      {vista === "expediente" && (
        <TramitesExpediente
          tramites={tramites}
          cargando={cargando}
          onRecargar={() => void recargar()}
          onAbrir={abrirExpediente}
          onBorrar={(id) => void borrar(id)}
        />
      )}

      {vista === "plantaciones" && <PlantacionesModule />}
    </LibroChrome>
  );
}
