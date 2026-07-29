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
 * Dos vistas: el CATÁLOGO (elegir formato y llenarlo, con el membrete y los
 * datos del libro ya puestos) y el EXPEDIENTE (qué se presentó, cuándo, ante
 * quién y en qué estado quedó).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Clock,
  FileText,
  Inbox,
  RefreshCw,
  Stamp,
  Trash2,
} from "@buleje/design-system/icons";
import LibroChrome, { type LibroGroup } from "@/components/admin/shared/libro-chrome";
import { useForestTramites } from "@/hooks/use-forest-tramites";
import {
  AUTORIDADES,
  FORMATOS_TRAMITE,
  formatoPorId,
  type AutoridadTramite,
} from "@/lib/forestal/tramites-catalogo";
import {
  contarPorEstado,
  diasDesdePresentacion,
  ESTADOS_TRAMITE,
  tramitesSinRespuesta,
  type EstadoTramite,
  type TramiteRegistro,
} from "@/lib/forestal/tramites-registro";
import type { CtpReportFicha } from "@/lib/forestal/ctp-print-shared";
import { Btn } from "./ctp-shared";
import TramiteFormulario, { type AutollenadoTramite } from "./TramiteFormulario";

const MODULE_ID = "forestal-tramites";
type Vista = "catalogo" | "expediente";

const GRUPOS: LibroGroup[] = [
  {
    id: "tramites",
    label: "Trámites",
    views: [
      { key: "catalogo", label: "Formatos", icon: FileText, hint: "Elegí el trámite y llenalo" },
      { key: "expediente", label: "Expediente", icon: Inbox, hint: "Qué se presentó y en qué estado está" },
    ],
  },
];

const TONO_ESTADO: Record<string, string> = {
  muted: "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  info: "border-[var(--data-info-500)]/40 bg-[var(--data-info-50)] text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/12 dark:text-[var(--data-info-500)]",
  warning:
    "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]",
  success:
    "border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]",
};

const fmtFecha = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
};

export default function ForestalTramites() {
  const [vista, setVista] = useState<Vista>("catalogo");
  const [formatoId, setFormatoId] = useState<string | null>(null);
  const [editando, setEditando] = useState<TramiteRegistro | null>(null);
  const [ficha, setFicha] = useState<CtpReportFicha | null>(null);
  const [auto, setAuto] = useState<AutollenadoTramite>({ ficha: null });
  const { tramites, cargando, error, setError, recargar, guardar, borrar } = useForestTramites();

  /**
   * Autollenado: la Ficha CTP es el membrete y el Libro tiene el resto (la serie
   * y el correlativo de la última GTF emitida, y las cifras del período). Se
   * carga una vez al montar: son los datos que el operador no debería re-tipear.
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
      const fichaData: CtpReportFicha | null = f?.ficha ?? f ?? null;
      setFicha(fichaData);

      // Última GTF emitida: la serie es lo que va antes del último guion y el
      // correlativo lo que sigue. Si el CTP la escribe distinto, el operador lo
      // corrige en el formulario — es una sugerencia, no un dato del libro.
      const conGtf = (salida?.entries ?? []).filter((e: { gtfNumber?: string | null }) => e.gtfNumber?.trim());
      const ultima: string = conGtf[0]?.gtfNumber ?? "";
      const corte = ultima.lastIndexOf("-");
      setAuto({
        ficha: fichaData,
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
  const porEstado = useMemo(() => contarPorEstado(tramites), [tramites]);
  const hoy = useMemo(() => new Date(), []);
  const esperando = useMemo(() => tramitesSinRespuesta(tramites, hoy), [tramites, hoy]);

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
        if (v === "expediente") setFormatoId(null);
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

      {/* ── Catálogo / formulario ── */}
      {vista === "catalogo" && !formato && (
        <div className="space-y-4">
          <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
            <p className="text-sm text-[var(--text-secondary)]">
              Elegí el trámite: el documento sale con el membrete de tu CTP (razón social, RUC, Código de CTP,
              registro ARFFS) y los datos que ya están en el Libro. Se imprime o se guarda como PDF para
              presentar en mesa de partes.
            </p>
            {!ficha?.razonSocial && (
              <p className="mt-3 flex items-start gap-2 rounded-xl border-l-4 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-3 text-sm text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
                <Building2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  La <strong>Ficha CTP</strong> está incompleta: sin razón social, RUC y Código de CTP el
                  documento sale sin membrete y la autoridad lo observa. Completala en el Libro CTP → Ficha CTP.
                </span>
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {FORMATOS_TRAMITE.map((f) => {
              const a = AUTORIDADES[f.autoridad];
              const usados = tramites.filter((t) => t.formatoId === f.id).length;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => abrirFormato(f.id)}
                  className="flex h-full flex-col items-start gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 text-left transition hover:border-[var(--accent)] hover:shadow-sm"
                >
                  <span className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                    {a.label}
                  </span>
                  <span className="text-base font-bold text-[var(--text-primary)]">{f.nombre}</span>
                  <span className="text-sm text-[var(--text-secondary)]">{f.proposito}</span>
                  <span className="mt-auto flex w-full items-center justify-between pt-2 text-xs text-[var(--text-tertiary)]">
                    <span>{f.campos.length} campos{usados > 0 ? ` · ${usados} presentado${usados === 1 ? "" : "s"}` : ""}</span>
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {vista === "catalogo" && formato && (
        <TramiteFormulario
          formato={formato}
          auto={auto}
          existente={editando}
          onGuardar={guardar}
          onCerrar={() => {
            setFormatoId(null);
            setEditando(null);
          }}
        />
      )}

      {/* ── Expediente ── */}
      {vista === "expediente" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {ESTADOS_TRAMITE.map((e) => (
              <span
                key={e.key}
                className={`inline-flex h-9 items-center gap-2 rounded-full border-2 px-3.5 text-sm font-bold ${TONO_ESTADO[e.tono]}`}
              >
                {e.label}
                <span className="font-mono tabular-nums">{porEstado[e.key as EstadoTramite]}</span>
              </span>
            ))}
            <button
              type="button"
              onClick={() => void recargar()}
              disabled={cargando}
              className="ml-auto inline-flex h-9 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} /> Recargar
            </button>
          </div>

          {esperando.length > 0 && (
            <div className="rounded-2xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-4 dark:bg-[var(--data-warning-500)]/12">
              <p className="flex items-center gap-2 font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                <Clock className="h-5 w-5 shrink-0" />
                {esperando.length} {esperando.length === 1 ? "trámite lleva" : "trámites llevan"} más de 15 días sin respuesta
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                No es un plazo legal (cada procedimiento tiene el suyo en el TUPA): es el recordatorio de ir a
                preguntar por el expediente, que es lo que en la práctica lo mueve.
              </p>
            </div>
          )}

          {tramites.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-10 text-center text-[var(--text-tertiary)]">
              <Inbox className="mx-auto mb-3 h-9 w-9 opacity-30" />
              <p className="text-base font-medium">Todavía no hay trámites guardados.</p>
              <p className="mt-1 text-sm">Elegí un formato en «Formatos», llenalo y guardalo: acá queda el rastro de qué presentaste y cuándo.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {tramites.map((t) => {
                const meta = ESTADOS_TRAMITE.find((e) => e.key === t.estado);
                const dias = diasDesdePresentacion(t, hoy);
                return (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex h-7 items-center rounded-full border-2 px-2.5 text-xs font-bold ${TONO_ESTADO[meta?.tono ?? "muted"]}`}>
                          {meta?.label ?? t.estado}
                        </span>
                        <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                          {AUTORIDADES[t.autoridad as AutoridadTramite]?.label ?? t.autoridad}
                        </span>
                      </div>
                      <p className="mt-1.5 font-bold text-[var(--text-primary)]">{t.formatoNombre}</p>
                      {t.asunto && <p className="text-sm text-[var(--text-secondary)]">{t.asunto}</p>}
                      <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                        {t.expedienteAutoridad ? `Expediente ${t.expedienteAutoridad} · ` : ""}
                        Presentado: {fmtFecha(t.fechaPresentacion)}
                        {dias != null && t.estado !== "resuelto" ? ` (hace ${dias} días)` : ""}
                        {t.fechaRespuesta ? ` · Respuesta: ${fmtFecha(t.fechaRespuesta)}` : ""}
                      </p>
                      {t.notas && <p className="mt-1 text-xs text-[var(--text-secondary)]">{t.notas}</p>}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Btn variant="secondary" size="sm" onClick={() => abrirExpediente(t)}>
                        Abrir
                      </Btn>
                      <Btn
                        variant="danger"
                        size="sm"
                        onClick={() => void borrar(t.id)}
                        aria-label={`Borrar el trámite ${t.formatoNombre}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Btn>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </LibroChrome>
  );
}
