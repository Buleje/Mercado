"use client";

/**
 * HojaDelDia — la asistencia de UN día (ADR-414 §4/§7).
 *
 * Patrón del panel (noche 11-10): título · Día/Semana/Mes · «Todos presentes
 * (n)» · «⋯» en una fila; abajo ‹ fecha › con el resumen en una línea («2 de
 * 6 marcados · 1 falta») y la lista, una fila por persona. «Todos presentes»
 * sólo toca a quien NO tiene marca; reemplazar lo ya marcado está en «⋯» y
 * pide confirmar con el número (nunca pisa lo cargado sin avisar, ADR-412).
 */

import { useMemo, useState, type ReactNode } from "react";
import { CheckCheck, ChevronRight, Lock, Plus, UserPlus, Users } from "@buleje/design-system/icons";
import { LoadingState, EmptyState } from "@buleje/design-system";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { avisarFallos, useRrhhAsistencia } from "@/hooks/use-rrhh-asistencia";
import { useRrhhDesdeAdelantos } from "@/hooks/use-rrhh-desde-adelantos";
import { useRrhhPuestos } from "@/hooks/use-rrhh-puestos";
import { etiquetaDia, mesDe, sumarDias } from "@/lib/rrhh/fechas";
import { limaDateKey } from "@/lib/utils";
import { AvisoRrhh, BOTON } from "../rrhh-form";
import { dentroDeVentana, estaIncluidoEseDia, motivoFueraDeVentana, motivoNoIncluido, pluralizar } from "../rrhh-ui";
import AvisoDiasAbiertos from "./AvisoDiasAbiertos";
import FilaMarcaDelDia from "./FilaMarcaDelDia";
import { BarraFotoDeCamara, FotoDeLaMarca } from "./FotoDeCamara";
import { useFotosAsistencia } from "./use-fotos-asistencia";
import HistorialMarcaModal from "./HistorialMarcaModal";
import LeyendaEstados from "./LeyendaEstados";
import NavegadorPeriodo from "./NavegadorPeriodo";
import { propsPanelAsistencia } from "./panel-asistencia";
import ResumenDelDia from "./ResumenDelDia";
import EncabezadoDeVista from "../EncabezadoDeVista";
import ColaboradorFormModal from "../personal/ColaboradorFormModal";
import TraerDesdeAdelantosModal from "../personal/TraerDesdeAdelantosModal";
import type { ColaboradorMinDTO, EstadoAsistencia, NivelRrhh } from "@/lib/rrhh/tipos";

interface Props {
  fecha: string;
  onCambiarFecha: (f: string) => void;
  nivel: NivelRrhh;
  onCambioPersonal?: () => void;
  /** Día / Semana / Mes: va en la fila del título. */
  selectorModo?: ReactNode;
}

export default function HojaDelDia({ fecha, onCambiarFecha, nivel, onCambioPersonal, selectorModo }: Props) {
  const { hoja, loading, error, guardando, pendientes, erroresPorCelda, marcar, masivo, guardarAhora, recargar } = useRrhhAsistencia(fecha, fecha);
  const { confirm } = useConfirm();
  const [historialDe, setHistorialDe] = useState<ColaboradorMinDTO | null>(null);
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [traerAbierta, setTraerAbierta] = useState(false);
  // «Estrenar RRHH con tu gente» (Brandon 2026-09-14) — mismo criterio de nivel que en PersonalView.
  const { candidatos: candidatosAdelantos } = useRrhhDesdeAdelantos(nivel === "completo");
  // El horario vive en el puesto (ADR-417) y la hoja sólo trae `{ id, nombre }`
  // del puesto de cada persona: sin este catálogo la fila no tiene contra qué
  // comparar la hora que se tipea. Si el catálogo no carga, nadie queda con
  // tardanza sugerida — se sigue marcando a mano, como antes.
  const { puestos } = useRrhhPuestos();

  const puedeGestionar = nivel === "gestion" || nivel === "completo";
  const hoy = hoja?.hoy ?? limaDateKey();
  const esHoy = fecha === hoy;
  // Ventana de corrección del rol (§4): almacenero/cajero sólo hoy-2..hoy. Vista
  // previa — el servidor la revalida siempre (403 `fuera_de_ventana`).
  const editable = hoja ? dentroDeVentana(fecha, hoja.ventana) : true;
  const fotosCam = useFotosAsistencia(fecha, esHoy && editable);

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

  const horarioPorPuesto = useMemo(() => {
    const mapa = new Map<string, { horaEntrada: string; toleranciaMin: number }>();
    for (const p of puestos) {
      if (p.horaEntrada) mapa.set(p.id, { horaEntrada: p.horaEntrada, toleranciaMin: p.toleranciaMin });
    }
    return mapa;
  }, [puestos]);

  const irAFecha = async (destino: string) => {
    if (destino === fecha || destino > hoy) return;
    const resultado = await guardarAhora();
    // Si falló, avisarlo ACÁ — el GET del día nuevo borra `erroresPorCelda`
    // antes de que el error de este día alcance a mostrarse (ALTO 5).
    if (!resultado.ok) avisarFallos(resultado.fallos);
    onCambiarFecha(destino);
  };

  const ejecutarMasivo = async (sobrescribir: boolean) => {
    const res = await masivo({ fecha, estado: "PRESENTE", sobrescribir });
    if (res.ok) onCambioPersonal?.();
  };

  /** Antes era la casilla «Reemplazar los ya marcados»: ahora una opción de «⋯» que confirma con el número. */
  const reemplazarMarcados = async () => {
    const ok = await confirm({
      title: `¿Poner presente también a ${pluralizar(marcadosIncluidos.length, "la persona ya marcada", "las personas ya marcadas")}?`,
      description: "Su marca de hoy (tardanza, falta, permiso…) se cambia por Presente.",
      intent: "danger",
      confirmLabel: `Sí, cambiar ${pluralizar(marcadosIncluidos.length, "marca", "marcas")}`,
    });
    if (ok) await ejecutarMasivo(true);
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

  const menu: MenuAccion[] = !puedeGestionar
    ? []
    : [
        ...(marcadosIncluidos.length > 0
          ? [{ id: "reemplazar", label: "Presentes también los ya marcados", meta: String(marcadosIncluidos.length), hint: "Cambia por Presente lo ya marcado hoy; pide confirmar", icon: CheckCheck, tone: "danger" as const, disabled: !editable || guardando, onSelect: () => void reemplazarMarcados() }]
          : []),
        { id: "agregar", label: "Agregar persona", icon: UserPlus, onSelect: () => setAltaAbierta(true) },
        ...(nivel === "completo" && candidatosAdelantos.length > 0
          ? [{ id: "traer", label: "Traer de Adelantos", meta: String(candidatosAdelantos.length), hint: "Personas que ya tienen cuenta de Adelantos", icon: UserPlus, onSelect: () => setTraerAbierta(true) }]
          : []),
      ];

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

        <BarraFotoDeCamara f={fotosCam} />

        {/* Una lista, no una tarjeta por persona: filas separadas por una raya. */}
        <div className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
          {incluidos.map((c) => {
            const marca = marcasDelDia.find((m) => m.colaboradorId === c.id);
            return (
              <FilaMarcaDelDia
                key={c.id}
                colaborador={c}
                fecha={fecha}
                marca={marca}
                pendiente={pendientes.has(`${c.id}|${fecha}`)}
                errorMsg={erroresPorCelda.get(`${c.id}|${fecha}`)}
                soloLectura={!editable}
                horario={c.puesto ? (horarioPorPuesto.get(c.puesto.id) ?? null) : null}
                onMarcar={(input) => {
                  marcar({ colaboradorId: c.id, fecha, ...input });
                  void fotosCam.alMarcar(c.id, marca?.estado ?? null, input.estado);
                }}
                onVerHistorial={() => setHistorialDe(c)}
                foto={<FotoDeLaMarca fotos={fotosCam.fotosDe(c.id)} />}
              />
            );
          })}
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

        <LeyendaEstados />
      </>
    );
  }

  const n = sinMarcar.length;
  const listo = Boolean(hoja && !loading && incluidos.length > 0);
  return (
    <div className="@container space-y-3">
      <EncabezadoDeVista
        vista="asistencia"
        secciones={selectorModo}
        menu={menu}
        acciones={
          puedeGestionar && listo && n > 0 ? (
            <button type="button" onClick={() => void ejecutarMasivo(false)} disabled={!editable || guardando} className={BOTON.primario} title="Marca Presente a quien todavía no tiene marca hoy">
              <CheckCheck className="h-4 w-4" aria-hidden /> Todos presentes ({n})
            </button>
          ) : null
        }
      />

      <div {...(selectorModo ? propsPanelAsistencia("dia") : {})} className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
        {listo && <ResumenDelDia marcados={marcadosIncluidos.length} total={incluidos.length} conteo={conteo} />}
      </div>

      {/* Los días del mes que nadie marcó (ADR-417): sigue al mes que se está
          mirando, no siempre al actual, y no pinta nada si no hay ninguno. */}
      <AvisoDiasAbiertos mes={mesDe(fecha)} onIrAlDia={(destino) => void irAFecha(destino)} />

      {contenido}
      </div>

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

