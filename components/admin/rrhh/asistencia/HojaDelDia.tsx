"use client";

/**
 * HojaDelDia — la asistencia de UN día (ADR-414 §4/§7).
 *
 * Fila por persona, resumen arriba, ‹ › para moverse de día (› apagado en
 * hoy: no se puede ir al futuro) y «Todos presentes» que sólo toca a quien NO
 * tiene marca — reemplazar exige el checkbox + confirma con el número en el
 * botón (nunca pisa lo cargado sin avisar, ADR-412).
 */

import { useMemo, useState, type ReactNode } from "react";
import { ChevronRight, Lock, Plus, UserPlus, Users } from "@buleje/design-system/icons";
import { LoadingState, EmptyState } from "@buleje/design-system";
import { avisarFallos, useRrhhAsistencia } from "@/hooks/use-rrhh-asistencia";
import { useRrhhDesdeAdelantos } from "@/hooks/use-rrhh-desde-adelantos";
import { etiquetaDia, sumarDias } from "@/lib/rrhh/fechas";
import { cn, limaDateKey } from "@/lib/utils";
import { AvisoRrhh, BOTON, CLASE_CHIP } from "../rrhh-form";
import { ESTADO_ASISTENCIA_META, ORDEN_ESTADOS_ASISTENCIA, contarEstado, dentroDeVentana, estaIncluidoEseDia, motivoFueraDeVentana, motivoNoIncluido, pluralizar } from "../rrhh-ui";
import FilaMarcaDelDia from "./FilaMarcaDelDia";
import HistorialMarcaModal from "./HistorialMarcaModal";
import LeyendaEstados from "./LeyendaEstados";
import NavegadorPeriodo from "./NavegadorPeriodo";
import ColaboradorFormModal from "../personal/ColaboradorFormModal";
import TraerDesdeAdelantosModal from "../personal/TraerDesdeAdelantosModal";
import type { ColaboradorMinDTO, EstadoAsistencia, NivelRrhh } from "@/lib/rrhh/tipos";

interface Props {
  fecha: string;
  onCambiarFecha: (f: string) => void;
  nivel: NivelRrhh;
  onCambioPersonal?: () => void;
  /** El switch Día/Mes, que va en la misma barra que el navegador. */
  selectorModo?: ReactNode;
}

export default function HojaDelDia({ fecha, onCambiarFecha, nivel, onCambioPersonal, selectorModo }: Props) {
  const { hoja, loading, error, guardando, pendientes, erroresPorCelda, marcar, masivo, guardarAhora, recargar } = useRrhhAsistencia(fecha, fecha);
  const [reemplazar, setReemplazar] = useState(false);
  const [historialDe, setHistorialDe] = useState<ColaboradorMinDTO | null>(null);
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [traerAbierta, setTraerAbierta] = useState(false);
  // «Estrenar RRHH con tu gente» (Brandon 2026-09-14) — mismo criterio de nivel que en PersonalView.
  const { candidatos: candidatosAdelantos } = useRrhhDesdeAdelantos();

  const puedeGestionar = nivel === "gestion" || nivel === "completo";
  const hoy = hoja?.hoy ?? limaDateKey();
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

  const irAFecha = async (destino: string) => {
    if (destino === fecha || destino > hoy) return;
    const resultado = await guardarAhora();
    // Si falló, avisarlo ACÁ — el GET del día nuevo borra `erroresPorCelda`
    // antes de que el error de este día alcance a mostrarse (ALTO 5).
    if (!resultado.ok) avisarFallos(resultado.fallos);
    setReemplazar(false);
    onCambiarFecha(destino);
  };

  const ejecutarMasivo = async () => {
    const res = await masivo({ fecha, estado: "PRESENTE", sobrescribir: reemplazar });
    if (res.ok) {
      setReemplazar(false);
      onCambioPersonal?.();
    }
  };

  const alAgregar = () => {
    setAltaAbierta(false);
    recargar();
    onCambioPersonal?.();
  };

  const botonesAlta = (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {nivel === "completo" && candidatosAdelantos.length > 0 && (
        <button type="button" onClick={() => setTraerAbierta(true)} className={BOTON.secundario}>
          <UserPlus className="h-4 w-4" /> Traer de Adelantos ({candidatosAdelantos.length})
        </button>
      )}
      <button type="button" onClick={() => setAltaAbierta(true)} className={BOTON.primario}>
        <Plus className="h-4 w-4" /> Agregar persona
      </button>
    </div>
  );

  const porcentaje = incluidos.length > 0 ? Math.round((marcadosIncluidos.length / incluidos.length) * 100) : 0;
  const n = reemplazar ? marcadosIncluidos.length : sinMarcar.length;

  let contenido: ReactNode;
  if (loading) {
    contenido = <LoadingState message="Cargando la hoja del día..." />;
  } else if (error || !hoja) {
    contenido = (
      <AvisoRrhh tono="error" accion={<button type="button" onClick={recargar} className={BOTON.chico}>Reintentar</button>}>
        {error ?? "No se pudo cargar la hoja."}
      </AvisoRrhh>
    );
  } else if (hoja.colaboradores.length === 0) {
    contenido = (
      <EmptyState
        icon={Users}
        title="Agrega a tu primera persona"
        description="Nombre, puesto y desde cuándo trabaja contigo — el resto se completa después."
        action={puedeGestionar ? { label: "Agregar persona", node: botonesAlta } : undefined}
      />
    );
  } else {
    contenido = (
      <>
        {!editable && (
          <AvisoRrhh tono="neutro" icono={Lock}>
            {motivoFueraDeVentana(hoja.ventana)}. Se puede ver, pero no corregir.
          </AvisoRrhh>
        )}

        <section aria-label="Resumen del día" className="flex flex-col gap-4 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 @min-[48rem]:flex-row @min-[48rem]:items-center @min-[48rem]:p-5">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">
                {marcadosIncluidos.length}
                <span className="text-base font-semibold text-[var(--text-tertiary)]"> de {incluidos.length}</span>
              </p>
              <p className="text-sm text-[var(--text-secondary)]">
                {incluidos.length === 0 ? "Nadie trabaja este día" : sinMarcar.length === 0 ? "Todos marcados" : `${pluralizar(sinMarcar.length, "persona", "personas")} sin marcar`}
              </p>
            </div>
            <div
              role="progressbar"
              aria-label="Marcados del día"
              aria-valuemin={0}
              aria-valuemax={incluidos.length}
              aria-valuenow={marcadosIncluidos.length}
              className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
            >
              <div className="h-full rounded-full bg-primary transition-[width] duration-[var(--dur-base)]" style={{ width: `${porcentaje}%` }} />
            </div>
            {marcadosIncluidos.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {ORDEN_ESTADOS_ASISTENCIA.filter((e) => conteo[e] > 0).map((e) => (
                  <span key={e} className={cn(CLASE_CHIP, ESTADO_ASISTENCIA_META[e].claseChip)}>
                    {contarEstado(conteo[e], e)}
                  </span>
                ))}
              </div>
            )}
          </div>

          {puedeGestionar && incluidos.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-t border-[var(--rule-soft)] pt-4 @min-[48rem]:border-l @min-[48rem]:border-t-0 @min-[48rem]:pl-5 @min-[48rem]:pt-0">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-secondary)]">
                <input type="checkbox" checked={reemplazar} disabled={!editable} onChange={(e) => setReemplazar(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                Reemplazar los ya marcados
              </label>
              {(reemplazar || n > 0) && (
                <button type="button" onClick={ejecutarMasivo} disabled={!editable || guardando || n === 0} className={reemplazar ? BOTON.peligro : BOTON.primario}>
                  {reemplazar ? `Poner presentes a ${pluralizar(n, "persona", "personas")}` : `Todos presentes (${n})`}
                </button>
              )}
            </div>
          )}
        </section>

        <LeyendaEstados />

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

        {noIncluidos.length > 0 && (
          <details className="group rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-[var(--text-secondary)] [&::-webkit-details-marker]:hidden">
              <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
              No trabajan este día ({noIncluidos.length})
            </summary>
            <ul className="space-y-1 border-t border-[var(--rule-soft)] px-4 py-2">
              {noIncluidos.map((c) => (
                <li key={c.id} className="flex min-h-10 flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-[var(--text-primary)]">
                    {c.nombre} <span className="text-[var(--text-tertiary)]">— {motivoNoIncluido(c, fecha)}</span>
                  </span>
                  {/* Sólo VACACIONES tiene un mapeo directo a un estado de asistencia
                      (ADR-414 §7). LICENCIA/SUSPENDIDO se corrigen desde la ficha. */}
                  {c.estado === "VACACIONES" && (
                    <button type="button" disabled={!editable} onClick={() => marcar({ colaboradorId: c.id, fecha, estado: "VACACIONES" })} className={BOTON.chico}>
                      Marcar vacaciones
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}

        {puedeGestionar && (
          <button type="button" onClick={() => setAltaAbierta(true)} className={BOTON.chicoFantasma}>
            <UserPlus className="h-4 w-4" /> Agregar persona
          </button>
        )}
      </>
    );
  }

  return (
    <div className="@container space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {selectorModo}
        <NavegadorPeriodo
          etiqueta={etiquetaDia(fecha, hoy)}
          esActual={esHoy}
          textoActual="Hoy"
          textoVolver="Ir a hoy"
          puedeAvanzar={!esHoy}
          etiquetaAnterior="Día anterior"
          etiquetaSiguiente="Día siguiente"
          onAnterior={() => irAFecha(sumarDias(fecha, -1))}
          onSiguiente={() => irAFecha(sumarDias(fecha, 1))}
          onVolver={() => irAFecha(hoy)}
          selector={{ tipo: "date", valor: fecha, max: hoy, onElegir: irAFecha }}
        />
      </div>

      {contenido}

      {historialDe && <HistorialMarcaModal open onClose={() => setHistorialDe(null)} colaborador={historialDe} fecha={fecha} />}
      {altaAbierta && <ColaboradorFormModal open={altaAbierta} onClose={() => setAltaAbierta(false)} nivel={nivel} onGuardado={alAgregar} />}
      {traerAbierta && (
        <TraerDesdeAdelantosModal
          open={traerAbierta}
          onClose={() => setTraerAbierta(false)}
          nivel={nivel}
          onCambio={() => {
            recargar();
            onCambioPersonal?.();
          }}
        />
      )}
    </div>
  );
}
