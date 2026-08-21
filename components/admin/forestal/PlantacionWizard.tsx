"use client";

/**
 * PlantacionWizard — shell del Formato Único RNPF (Inscripción/Actualización
 * de Plantación Forestal). Los 6 pasos viven acá como navegación; el estado
 * editable (`PlantacionInput`) es único y vive en este componente, así que ir
 * y volver entre pasos nunca pierde lo tipeado.
 *
 * Autoguardado: debounce de 2s tras cualquier cambio, upsert por id (nunca
 * duplica el expediente). Una falla puntual no interrumpe — se reintenta solo
 * con el próximo cambio, mismo criterio que `TramiteFormulario`.
 *
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, ArrowLeft, Check, CheckCircle2, Circle, Loader2 } from "@buleje/design-system/icons";
import { PageTitle } from "@buleje/design-system";
import { useForestPlantaciones } from "@/hooks/use-forest-plantaciones";
import { ESTADOS_PLANTACION } from "@/lib/forestal/plantacion-catalogo";
import {
  calcularAvance,
  calcularResumen,
  validarPlantacion,
  type AdvertenciaPlantacion,
  type PlantacionInput,
  type PlantacionRegistro,
} from "@/lib/forestal/plantacion-tramite";
import { Btn, Field, I, PanelSkeleton } from "./ctp-shared";
import PlantacionPasoTitular from "./PlantacionPasoTitular";
import PlantacionPasoPredio from "./PlantacionPasoPredio";
import PlantacionPasoBloques from "./PlantacionPasoBloques";
import PlantacionPasoMapa from "./PlantacionPasoMapa";
import PlantacionPasoDocumentos from "./PlantacionPasoDocumentos";
import PlantacionPasoRevision from "./PlantacionPasoRevision";
import PlantacionDocumentoModal from "./PlantacionDocumentoModal";

type PasoId = "titular" | "predio" | "plantacion" | "mapa" | "documentos" | "revision";
const PASOS: { id: PasoId; numero: number; label: string }[] = [
  { id: "titular", numero: 1, label: "Titular" },
  { id: "predio", numero: 2, label: "Predio" },
  { id: "plantacion", numero: 3, label: "Plantación" },
  { id: "mapa", numero: 4, label: "Mapa" },
  { id: "documentos", numero: 5, label: "Documentos" },
  { id: "revision", numero: 6, label: "Revisión" },
];
const pasoValido = (p?: string): PasoId => (PASOS.some((x) => x.id === p) ? (p as PasoId) : "titular");

/** A qué paso pertenece un aviso de `validarPlantacion` — por el `campo`, no
 *  por texto libre (evita que un mensaje reescrito rompa la asociación). */
function pasoDeAviso(campo: string): PasoId | null {
  if (campo.startsWith("predioAreaTotalHa")) return "predio";
  if (/^bloques\.\d+\.vertices$/.test(campo)) return "mapa";
  if (/^bloques\.\d+\.especies\./.test(campo)) return "plantacion";
  if (campo === "bloques") return "plantacion";
  return null;
}

/** Heurística liviana SÓLO para el puntito del paso en la navegación — no
 *  reemplaza `calcularAvance` (que pesa el expediente completo). */
function pasoTieneDatos(id: PasoId, d: PlantacionInput): boolean {
  switch (id) {
    case "titular":
      return Boolean(d.titularTipoPersona && (d.titularNumeroDocumento?.trim() || d.titularRazonSocial?.trim()));
    case "predio":
      return Boolean(d.predioNombre?.trim() || d.predioAreaTotalHa);
    case "plantacion":
      return d.bloques.some((b) => b.especies.length > 0);
    case "mapa":
      return d.bloques.some((b) => b.vertices.length >= 3);
    case "documentos":
      return (d.documentos ?? []).some((doc) => Boolean(doc.documentId));
    case "revision":
      return Boolean(d.djAceptado);
  }
}

type EstadoPaso = "incompleto" | "observado" | "completo";
function estadoDelPaso(id: PasoId, d: PlantacionInput, avisos: AdvertenciaPlantacion[]): EstadoPaso {
  if (avisos.some((a) => pasoDeAviso(a.campo) === id)) return "observado";
  return pasoTieneDatos(id, d) ? "completo" : "incompleto";
}

function plantacionVacia(): PlantacionInput {
  return {
    tipoTramite: "inscripcion",
    codigoPlantacionSerfor: null,
    estado: "borrador",
    repTiene: false,
    predioDatum: "WGS84",
    tituloHabilitanteTiene: false,
    documentos: [],
    bloques: [],
  };
}

export default function PlantacionWizard({
  plantacionId,
  soloLectura,
  pasoInicial,
  onCerrar,
}: {
  plantacionId: string | null;
  soloLectura?: boolean;
  pasoInicial?: string;
  onCerrar: () => void;
}) {
  const { cargarDetalle, guardar } = useForestPlantaciones();
  const [datos, setDatos] = useState<PlantacionInput>(plantacionVacia());
  const [registro, setRegistro] = useState<PlantacionRegistro | null>(null);
  const [idGuardado, setIdGuardado] = useState<string | null>(null);
  const [cargando, setCargando] = useState(Boolean(plantacionId));
  const [cargado, setCargado] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [paso, setPaso] = useState<PasoId>(pasoValido(pasoInicial));
  const [estadoGuardado, setEstadoGuardado] = useState<"idle" | "guardando" | "guardado" | "error">("idle");
  const [documentoAbierto, setDocumentoAbierto] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      if (!plantacionId) {
        setDatos(plantacionVacia());
        setCargado(true);
        return;
      }
      setCargando(true);
      const r = await cargarDetalle(plantacionId);
      if (cancelado) return;
      if (r) {
        setDatos(r.datos);
        setRegistro(r);
        setIdGuardado(r.id);
      } else {
        setErrorCarga("No se pudo cargar el registro.");
      }
      setCargando(false);
      setCargado(true);
    }
    void cargar();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantacionId]);

  useEffect(() => {
    if (!cargado || soloLectura) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setEstadoGuardado("guardando");
      void guardar({ ...datos, id: idGuardado ?? datos.id }).then((r) => {
        if (r) {
          setIdGuardado(r.id);
          setRegistro(r);
          setEstadoGuardado("guardado");
        } else {
          setEstadoGuardado("error");
        }
      });
    }, 2000);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos, cargado, soloLectura]);

  const onChange = useCallback((patch: Partial<PlantacionInput>) => {
    setDatos((prev) => ({ ...prev, ...patch }));
  }, []);

  const avisos = useMemo(() => validarPlantacion(datos), [datos]);
  const avance = useMemo(() => calcularAvance(datos), [datos]);
  const resumen = useMemo(() => calcularResumen(datos), [datos]);

  return (
    <div className="space-y-4">
      <div
        className="relative overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] p-5"
        style={{ background: "linear-gradient(135deg, var(--accent-soft) 0%, var(--surface-raised) 60%)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <PageTitle as="h2" className="text-xl sm:text-2xl">Registro Nacional de Plantaciones Forestales</PageTitle>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Inscripción / Actualización de Plantación Forestal</p>
          </div>
          <Btn variant="secondary" onClick={onCerrar}>
            <ArrowLeft className="h-4 w-4" />
            Volver al listado
          </Btn>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Tipo de trámite">
            <div className="flex gap-2">
              {(["inscripcion", "actualizacion"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={soloLectura}
                  aria-pressed={datos.tipoTramite === t}
                  onClick={() => onChange({ tipoTramite: t })}
                  className={`h-11 flex-1 rounded-xl border-2 text-sm font-bold transition ${
                    datos.tipoTramite === t
                      ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                      : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)]"
                  }`}
                >
                  {t === "inscripcion" ? "Inscripción" : "Actualización"}
                </button>
              ))}
            </div>
          </Field>

          {datos.tipoTramite === "actualizacion" && (
            <Field
              label="Código de Plantación / N° de Registro"
              hint="Lo emite la ARFFS/SERFOR al inscribir — escribilo sólo si ya lo tenés. Nunca se genera acá; distinto del código interno de abajo."
            >
              <input className={I} disabled={soloLectura} value={datos.codigoPlantacionSerfor ?? ""} onChange={(e) => onChange({ codigoPlantacionSerfor: e.target.value || null })} />
            </Field>
          )}

          <Field label="Estado del expediente">
            <select className={I} disabled={soloLectura} value={datos.estado ?? "borrador"} onChange={(e) => onChange({ estado: e.target.value })}>
              {ESTADOS_PLANTACION.map((e) => (
                <option key={e.key} value={e.key}>{e.label}</option>
              ))}
            </select>
          </Field>
        </div>

        {registro && (
          <p className="mt-3 text-xs text-[var(--text-tertiary)]">
            Código interno: <span className="font-mono font-bold text-[var(--text-secondary)]">{registro.codigoInterno}</span> — uso administrativo interno, no es el código oficial SERFOR.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="h-2 w-40 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
            <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-[var(--motion-base)]" style={{ width: `${avance}%` }} />
          </div>
          <p className="text-sm font-bold text-[var(--text-secondary)]">Información completada: {avance} %</p>
        </div>

        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {resumen.areaBloquesHa.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha | {resumen.numBloques} bloques | {resumen.numEspecies} especies | {resumen.totalPlantas.toLocaleString("es-PE")} plantas
        </p>

        <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-[var(--text-tertiary)]">
          {soloLectura ? (
            "Modo solo lectura"
          ) : estadoGuardado === "guardando" ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> Guardando…
            </>
          ) : estadoGuardado === "guardado" ? (
            <>
              <Check className="h-3 w-3 text-[var(--data-success-600)] dark:text-[var(--data-success-500)]" /> Guardado hace unos segundos
            </>
          ) : estadoGuardado === "error" ? (
            "No se pudo guardar automáticamente — se reintenta con el próximo cambio"
          ) : null}
        </p>
      </div>

      {errorCarga && (
        <p className="flex items-start gap-2 rounded-xl border-l-4 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {errorCarga}
        </p>
      )}

      <div className="flex flex-col gap-4 lg:flex-row">
        <nav className="flex flex-wrap gap-2 lg:w-56 lg:shrink-0 lg:flex-col">
          {PASOS.map((p) => {
            const est = estadoDelPaso(p.id, datos, avisos);
            const Icono = est === "completo" ? CheckCircle2 : est === "observado" ? AlertTriangle : Circle;
            const tonoIcono =
              est === "completo"
                ? "text-[var(--data-success-600)] dark:text-[var(--data-success-500)]"
                : est === "observado"
                  ? "text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]"
                  : "text-[var(--text-tertiary)]";
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPaso(p.id)}
                aria-current={paso === p.id ? "step" : undefined}
                className={`flex items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-left text-sm font-bold transition ${
                  paso === p.id
                    ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
                }`}
              >
                <Icono className={`h-4 w-4 shrink-0 ${tonoIcono}`} aria-hidden="true" />
                <span className="truncate">{p.numero}. {p.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1 space-y-4">
          {cargando ? (
            <PanelSkeleton />
          ) : (
            <>
              {paso === "titular" && <PlantacionPasoTitular datos={datos} soloLectura={soloLectura} onChange={onChange} />}
              {paso === "predio" && <PlantacionPasoPredio datos={datos} soloLectura={soloLectura} onChange={onChange} />}
              {paso === "plantacion" && (
                <PlantacionPasoBloques
                  bloques={datos.bloques}
                  predioAreaTotalHa={datos.predioAreaTotalHa ?? null}
                  tipoTramite={datos.tipoTramite}
                  soloLectura={soloLectura}
                  onChange={(bloques) => onChange({ bloques })}
                />
              )}
              {paso === "mapa" && (
                <PlantacionPasoMapa
                  bloques={datos.bloques}
                  soloLectura={soloLectura}
                  onChange={(bloques) => onChange({ bloques })}
                />
              )}
              {paso === "documentos" && (
                <PlantacionPasoDocumentos
                  documentos={datos.documentos ?? []}
                  tipoTramite={datos.tipoTramite}
                  soloLectura={soloLectura}
                  onChange={(documentos) => onChange({ documentos })}
                />
              )}
              {paso === "revision" && (
                <PlantacionPasoRevision
                  datos={datos}
                  soloLectura={soloLectura}
                  onChange={onChange}
                  onGenerarDocumento={() => setDocumentoAbierto(true)}
                />
              )}
            </>
          )}
        </div>
      </div>

      <PlantacionDocumentoModal
        open={documentoAbierto}
        onClose={() => setDocumentoAbierto(false)}
        datos={datos}
        codigoInterno={registro?.codigoInterno ?? "—"}
      />
    </div>
  );
}
