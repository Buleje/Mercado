"use client";

/**
 * HojaDelDia — la asistencia de UN día (ADR-414 §4/§7).
 *
 * Patrón del panel (noche 11-10; 23-10 todo en UNA fila): título ·
 * Día/Semana/Mes · ‹ fecha › · el resumen («2/6 marcados · 1 F») · «Todos
 * presentes (n)» · «⋯»; abajo la lista, una fila por persona. «Todos presentes»
 * sólo toca a quien NO tiene marca; reemplazar lo ya marcado está en «⋯» y
 * pide confirmar con el número (nunca pisa lo cargado sin avisar, ADR-412).
 */

import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import { CheckCheck, Lock, Plus, UserPlus, Users } from "@buleje/design-system/icons";
import { LoadingState, EmptyState } from "@buleje/design-system";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { avisarFallos, useRrhhAsistencia } from "@/hooks/use-rrhh-asistencia";
import { useRrhhDesdeAdelantos } from "@/hooks/use-rrhh-desde-adelantos";
import { useRrhhPuestos } from "@/hooks/use-rrhh-puestos";
import { etiquetaDia, mesDe, sumarDias } from "@/lib/rrhh/fechas";
import { limaDateKey } from "@/lib/utils";
import { AvisoRrhh, BOTON } from "../rrhh-form";
import { dentroDeVentana, motivoFueraDeVentana, pluralizar } from "../rrhh-ui";
import AvisoDiasAbiertos from "./AvisoDiasAbiertos";
import AvisoPasarLista from "./AvisoPasarLista";
import FilaMarcaDelDia from "./FilaMarcaDelDia";
import { useRetirarPersona } from "./use-retirar-persona";
import ListaDelDia from "./ListaDelDia";
import { useCuentasDelDia } from "./use-cuentas-del-dia";
import { editarColaborador } from "./editar-colaborador";
import { feriadoDe } from "@/lib/feriados-peru";
import { toast } from "sonner";

const CompletarFichaModal = dynamic(() => import("./CompletarFichaModal"), { ssr: false });
import { BarraFotoDeCamara, FotoDeLaMarca } from "./FotoDeCamara";
import { useFotosAsistencia } from "./use-fotos-asistencia";
import HistorialMarcaModal from "./HistorialMarcaModal";
import LeyendaEstados from "./LeyendaEstados";
import NavegadorPeriodo from "./NavegadorPeriodo";
import BotonTodosPresentes from "./BotonTodosPresentes";
import { propsPanelAsistencia } from "./panel-asistencia";
import ResumenDelDia from "./ResumenDelDia";
import EncabezadoDeVista from "../EncabezadoDeVista";
import ColaboradorFormModal from "../personal/ColaboradorFormModal";
import TraerDesdeAdelantosModal from "../personal/TraerDesdeAdelantosModal";
import type { ColaboradorMinDTO, NivelRrhh } from "@/lib/rrhh/tipos";
import { NotasDelDiaProvider } from "./notas-del-dia";

interface Props {
  fecha: string;
  onCambiarFecha: (f: string) => void;
  nivel: NivelRrhh;
  onCambioPersonal?: () => void;
  /** Día / Semana / Mes: va en la fila del título. */
  selectorModo?: ReactNode;
  /** Abre «Pasar lista de hoy» (vista del celular). */
  onPasarLista?: () => void;
}

export default function HojaDelDia({ fecha, onCambiarFecha, nivel, onCambioPersonal, selectorModo, onPasarLista }: Props) {
  const { hoja, loading, error, guardando, pendientes, erroresPorCelda, marcar, masivo, guardarAhora, recargar, guardarNota } = useRrhhAsistencia(fecha, fecha);
  const { confirm } = useConfirm();
  const [historialDe, setHistorialDe] = useState<ColaboradorMinDTO | null>(null);
  const [completarDe, setCompletarDe] = useState<ColaboradorMinDTO | null>(null);
  const retirar = useRetirarPersona(nivel, () => {
    recargar();
    onCambioPersonal?.();
  });
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

  const { incluidos, noIncluidos, eventualesSinMarca, marcasDelDia, marcadosIncluidos, sinMarcar, conteo, horarioPorPuesto } = useCuentasDelDia(hoja, fecha, puestos);

  const feriado = feriadoDe(fecha);
  const fijos = incluidos;

  const fila = (c: ColaboradorMinDTO) => {
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
        onRetirar={retirar.abrir ? () => retirar.abrir?.(c, fecha) : undefined}
        onCompletar={puedeGestionar ? () => setCompletarDe(c) : undefined}
        onEventual={puedeGestionar ? (v) => void cambiarEventual(c, v) : undefined}
      />
    );
  };

  const cambiarEventual = async (c: ColaboradorMinDTO, eventual: boolean) => {
    const ok = await editarColaborador(c.id, { eventual });
    if (!ok) return;
    toast.success(eventual ? `${c.nombre} es eventual: sale sólo el día que viene` : `${c.nombre} sale todos los días`);
    recargar();
  };

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
        ...(onPasarLista && esHoy && editable && sinMarcar.length > 0
          ? [{ id: "pasar-lista", label: "Pasar lista de hoy", meta: String(sinMarcar.length), hint: "Vista para el celular: todos Presente, tocas a quien faltó", icon: CheckCheck, onSelect: onPasarLista }]
          : []),
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

        <ListaDelDia
          fecha={fecha}
          esHoy={esHoy}
          feriado={feriado}
          fijos={fijos}
          eventualesSinMarca={eventualesSinMarca}
          noIncluidos={noIncluidos}
          ultimaVino={hoja.ultimaVino}
          editable={editable}
          fila={fila}
          onMarcarVacaciones={(c) => marcar({ colaboradorId: c.id, fecha, estado: "VACACIONES" })}
          onRetirar={retirar.abrir}
        />

        <LeyendaEstados />
      </>
    );
  }

  const n = sinMarcar.length;
  const listo = Boolean(hoja && !loading && incluidos.length > 0);
  return (
    <NotasDelDiaProvider notas={hoja?.notas} guardarNota={guardarNota}>
    <div className="@container space-y-3">
      <EncabezadoDeVista
        vista="asistencia"
        secciones={selectorModo}
        periodo={
          <>
            <NavegadorPeriodo
              etiqueta={etiquetaDia(fecha, hoy)}
              etiquetaCorta={etiquetaDia(fecha, hoy).replace(/^(\S{3})\S*/, "$1")}
              esActual={esHoy}
              textoActual="Hoy"
              chipSiempre
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
          </>
        }
        menu={menu}
        acciones={
          puedeGestionar && listo && n > 0 ? <BotonTodosPresentes n={n} disabled={!editable || guardando} onClick={() => void ejecutarMasivo(false)} /> : null
        }
      />

      <div {...(selectorModo ? propsPanelAsistencia("dia") : {})} className="space-y-3">
      {/* Los días del mes que nadie marcó (ADR-417): sigue al mes que se está
          mirando, no siempre al actual, y no pinta nada si no hay ninguno. */}
      {hoja && onPasarLista && editable && <AvisoPasarLista hoja={hoja} fecha={fecha} onPasar={onPasarLista} />}
      <AvisoDiasAbiertos mes={mesDe(fecha)} onIrAlDia={(destino) => void irAFecha(destino)} />

      {contenido}
      </div>

      {historialDe && <HistorialMarcaModal open onClose={() => setHistorialDe(null)} colaborador={historialDe} fecha={fecha} />}
      {retirar.modal}
      {completarDe && (
        <CompletarFichaModal
          colaborador={completarDe}
          puestos={puestos}
          onClose={() => setCompletarDe(null)}
          onGuardado={() => {
            setCompletarDe(null);
            recargar();
            onCambioPersonal?.();
          }}
        />
      )}
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
    </NotasDelDiaProvider>
  );
}

