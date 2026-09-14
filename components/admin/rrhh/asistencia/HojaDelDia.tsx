"use client";

/**
 * HojaDelDia — la asistencia de UN día (ADR-414 §4/§7).
 *
 * Fila por persona, contadores arriba, ◀ ▶ para moverse de día (▶ apagado en
 * hoy: no se puede ir al futuro) y «Todos presentes» que sólo toca a quien NO
 * tiene marca — reemplazar exige el checkbox + confirma con el número en el
 * botón (nunca pisa lo cargado sin avisar, ADR-412).
 */

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Lock, Plus, UserPlus, Users } from "@buleje/design-system/icons";
import { LoadingState, EmptyState } from "@buleje/design-system";
import { avisarFallos, useRrhhAsistencia } from "@/hooks/use-rrhh-asistencia";
import { useRrhhDesdeAdelantos } from "@/hooks/use-rrhh-desde-adelantos";
import { etiquetaDia, sumarDias } from "@/lib/rrhh/fechas";
import { ESTADO_ASISTENCIA_META, ORDEN_ESTADOS_ASISTENCIA, dentroDeVentana, estaIncluidoEseDia, motivoFueraDeVentana, motivoNoIncluido } from "../rrhh-ui";
import FilaMarcaDelDia from "./FilaMarcaDelDia";
import HistorialMarcaModal from "./HistorialMarcaModal";
import ColaboradorFormModal from "../personal/ColaboradorFormModal";
import TraerDesdeAdelantosModal from "../personal/TraerDesdeAdelantosModal";
import { cn } from "@/lib/utils";
import type { ColaboradorMinDTO, EstadoAsistencia, NivelRrhh } from "@/lib/rrhh/tipos";

interface Props {
  fecha: string;
  onCambiarFecha: (f: string) => void;
  nivel: NivelRrhh;
  onCambioPersonal?: () => void;
}

export default function HojaDelDia({ fecha, onCambiarFecha, nivel, onCambioPersonal }: Props) {
  const { hoja, loading, error, guardando, pendientes, erroresPorCelda, marcar, masivo, guardarAhora, recargar } = useRrhhAsistencia(fecha, fecha);
  const [reemplazar, setReemplazar] = useState(false);
  const [historialDe, setHistorialDe] = useState<ColaboradorMinDTO | null>(null);
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [traerAbierta, setTraerAbierta] = useState(false);
  // «Estrenar RRHH con tu gente» (Brandon 2026-09-14) — mismo criterio de
  // nivel que en PersonalView.
  const { candidatos: candidatosAdelantos } = useRrhhDesdeAdelantos();

  const puedeGestionar = nivel === "gestion" || nivel === "completo";
  const hoy = hoja?.hoy ?? fecha;
  const esHoy = fecha === hoy;
  // Ventana de corrección del rol (§4): almacenero/cajero sólo hoy-2..hoy. Vista
  // previa — el servidor la revalida siempre (403 `fuera_de_ventana`).
  const editable = hoja ? dentroDeVentana(fecha, hoja.ventana) : true;

  const { incluidos, noIncluidos, marcasDelDia, marcadosIncluidos, sinMarcar, conteo } = useMemo(() => {
    const colaboradores = hoja?.colaboradores ?? [];
    const marcasDelDia = (hoja?.marcas ?? []).filter((m) => m.fecha === fecha);
    const incluidos = colaboradores.filter((c) => estaIncluidoEseDia(c, fecha));
    const noIncluidos = colaboradores.filter((c) => !estaIncluidoEseDia(c, fecha));
    const marcadosIncluidos = incluidos.filter((c) => marcasDelDia.some((m) => m.colaboradorId === c.id));
    const sinMarcar = incluidos.filter((c) => !marcasDelDia.some((m) => m.colaboradorId === c.id));
    const conteo: Record<EstadoAsistencia, number> = { PRESENTE: 0, TARDANZA: 0, MEDIO_DIA: 0, FALTA: 0, PERMISO: 0, DESCANSO: 0, VACACIONES: 0 };
    for (const c of incluidos) {
      const m = marcasDelDia.find((x) => x.colaboradorId === c.id);
      if (m) conteo[m.estado] += 1;
    }
    return { incluidos, noIncluidos, marcasDelDia, marcadosIncluidos, sinMarcar, conteo };
  }, [hoja, fecha]);

  const cambiarDia = async (delta: number) => {
    const resultado = await guardarAhora();
    // Si falló, avisarlo ACÁ — el GET del día nuevo (que viene ahora) borra
    // `erroresPorCelda` antes de que el error de HOY alcance a mostrarse
    // (ALTO 5). `flush()` no se avisa solo mientras el componente sigue
    // montado: quien navega es quien sabe que se está yendo.
    if (!resultado.ok) avisarFallos(resultado.fallos);
    onCambiarFecha(sumarDias(fecha, delta));
  };

  const ejecutarMasivo = async () => {
    const res = await masivo({ fecha, estado: "PRESENTE", sobrescribir: reemplazar });
    if (res.ok) {
      setReemplazar(false);
      onCambioPersonal?.();
    }
  };

  if (loading) return <LoadingState message="Cargando la hoja del día..." />;
  if (error || !hoja) {
    return (
      <div className="rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/5 p-4 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
        {error ?? "No se pudo cargar la hoja"}
        <button type="button" onClick={recargar} className="ml-2 font-bold underline">Reintentar</button>
      </div>
    );
  }

  if (hoja.colaboradores.length === 0) {
    return (
      <>
        <EmptyState
          icon={Users}
          title="Agrega a tu primera persona"
          description="Nombre, puesto y desde cuándo trabaja contigo — el resto se completa después."
          action={
            puedeGestionar
              ? {
                  label: "Agregar persona",
                  node: (
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {nivel === "completo" && candidatosAdelantos.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setTraerAbierta(true)}
                          className="inline-flex items-center gap-1.5 rounded-lg border-2 border-primary px-4 py-2 text-sm font-bold text-[var(--accent-ink)] hover:bg-primary/10 dark:text-[var(--accent)]"
                        >
                          <UserPlus className="h-4 w-4" /> Traer de Adelantos ({candidatosAdelantos.length})
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setAltaAbierta(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:brightness-110"
                      >
                        <Plus className="h-4 w-4" /> Agregar persona
                      </button>
                    </div>
                  ),
                }
              : undefined
          }
        />
        {altaAbierta && (
          <ColaboradorFormModal
            open={altaAbierta}
            onClose={() => setAltaAbierta(false)}
            nivel={nivel}
            onGuardado={() => { setAltaAbierta(false); recargar(); onCambioPersonal?.(); }}
          />
        )}
        {traerAbierta && (
          <TraerDesdeAdelantosModal
            open={traerAbierta}
            onClose={() => setTraerAbierta(false)}
            nivel={nivel}
            onCambio={() => { recargar(); onCambioPersonal?.(); }}
          />
        )}
      </>
    );
  }

  return (
    <div className="space-y-4">
      {/* Navegación de día */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => cambiarDia(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--rule-base)] hover:bg-[var(--surface-sunken)]"
          aria-label="Día anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-bold capitalize text-[var(--text-primary)]">{etiquetaDia(fecha, hoy)}{esHoy && <span className="ml-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">Hoy</span>}</p>
        <button
          type="button"
          onClick={() => cambiarDia(1)}
          disabled={esHoy}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--rule-base)] hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Día siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {!editable && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3 text-xs text-[var(--text-secondary)]">
          <Lock className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
          <span>{motivoFueraDeVentana(hoja.ventana)}. Se ve, no se puede corregir.</span>
        </div>
      )}

      {/* Contadores */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)]">
        {ORDEN_ESTADOS_ASISTENCIA.filter((e) => conteo[e] > 0).map((e) => (
          <span key={e} className={cn("font-semibold", ESTADO_ASISTENCIA_META[e].claseTexto)}>
            {conteo[e]} {ESTADO_ASISTENCIA_META[e].label.toLowerCase()}
          </span>
        ))}
        {sinMarcar.length > 0 && <span className="font-semibold text-[var(--text-tertiary)]">{sinMarcar.length} sin marcar</span>}
      </div>

      {/* Masivo */}
      {puedeGestionar && incluidos.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <input type="checkbox" checked={reemplazar} disabled={!editable} onChange={(e) => setReemplazar(e.target.checked)} className="h-4 w-4 rounded border-[var(--rule-base)]" />
            Reemplazar los ya marcados
          </label>
          <button
            type="button"
            onClick={ejecutarMasivo}
            disabled={!editable || guardando || (reemplazar ? marcadosIncluidos.length === 0 : sinMarcar.length === 0)}
            className={cn(
              "ml-auto rounded-lg px-3 py-1.5 text-xs font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              reemplazar ? "bg-[var(--data-error-700)] hover:brightness-110" : "bg-primary hover:brightness-110",
            )}
          >
            {reemplazar ? `Reemplazar ${marcadosIncluidos.length} marcas` : "Todos presentes"}
          </button>
        </div>
      )}

      {/* Filas */}
      <div className="space-y-2">
        {incluidos.map((c) => (
          <FilaMarcaDelDia
            key={c.id}
            colaborador={c}
            fecha={fecha}
            marca={marcasDelDia.find((m) => m.colaboradorId === c.id)}
            pendiente={pendientes.has(`${c.id}|${fecha}`)}
            errorMsg={erroresPorCelda.get(`${c.id}|${fecha}`)}
            soloLectura={!editable}
            onMarcar={(input) => marcar({ colaboradorId: c.id, fecha, ...input })}
            onVerHistorial={() => setHistorialDe(c)}
          />
        ))}
      </div>

      {/* No incluidos */}
      {noIncluidos.length > 0 && (
        <details className="rounded-xl border border-[var(--rule-soft)] p-3">
          <summary className="cursor-pointer text-xs font-bold text-[var(--text-secondary)]">No incluidos ({noIncluidos.length})</summary>
          <div className="mt-2 space-y-2">
            {noIncluidos.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-[var(--text-primary)]">{c.nombre} <span className="text-[var(--text-tertiary)]">— {motivoNoIncluido(c, fecha)}</span></span>
                {/* Sólo VACACIONES tiene un mapeo directo a un estado de asistencia
                    (ADR-414 §7). LICENCIA/SUSPENDIDO no tienen un 1:1 obvio — se
                    corrigen desde la ficha, no se inventa acá. */}
                {c.estado === "VACACIONES" && (
                  <button
                    type="button"
                    disabled={!editable}
                    onClick={() => marcar({ colaboradorId: c.id, fecha, estado: "VACACIONES" })}
                    className="shrink-0 font-bold text-primary hover:underline disabled:cursor-not-allowed disabled:text-[var(--text-tertiary)] disabled:no-underline"
                  >
                    Marcar vacaciones
                  </button>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {puedeGestionar && (
        <button
          type="button"
          onClick={() => setAltaAbierta(true)}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
        >
          <UserPlus className="h-3.5 w-3.5" /> Agregar persona
        </button>
      )}

      {historialDe && (
        <HistorialMarcaModal
          open
          onClose={() => setHistorialDe(null)}
          colaborador={historialDe}
          fecha={fecha}
        />
      )}
      {altaAbierta && (
        <ColaboradorFormModal
          open={altaAbierta}
          onClose={() => setAltaAbierta(false)}
          nivel={nivel}
          onGuardado={() => { setAltaAbierta(false); recargar(); onCambioPersonal?.(); }}
        />
      )}
    </div>
  );
}
