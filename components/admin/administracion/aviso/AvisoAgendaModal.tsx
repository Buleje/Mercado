"use client";

/**
 * AvisoAgendaModal — el centro ÚNICO de «lo que falta hacer» + notificaciones
 * (Brandon 20-10: «que se combine con el modal de notificaciones, tanto en
 * lateral como central, todo en uno, priorizando lo que falta hacer y
 * clasificando cada uno»). Lo abre el aviso que sale solo, la campana y el
 * atajo N (`centro-unificado.ts`).
 *
 * - Pestañas: «Por hacer» (la agenda) PRIMERO, «Todas» y cada categoría de
 *   notificaciones con su conteo (`PestanasNotificaciones`).
 * - «Todas»: arriba lo que falta hacer (filas bajas), después «Para atender
 *   ahora» y los avisos por día (`useAvisosDelCentro`, lo mismo que la campana).
 * - Ventana al centro (`AdminModal`) o barra al costado, suelta o fija
 *   (`PanelLateralAviso`: no bloquea, la página se achica, el ancho se arrastra).
 * Trae su propio `AgendaProvider`: se abre desde cualquier pestaña del panel.
 */
import { useEffect, useState } from "react";
import { AlarmClock, BellOff, BellRing, ListChecks, ClipboardList, Settings } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import AdminModal, { CabeceraPropia, MODAL_GUTTER } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { AvisosDeLaFranja } from "@/components/admin/avisos-de-la-franja";
import ListaDeAvisos from "@/components/notifications/ListaDeAvisos";
import PestanasNotificaciones from "@/components/notifications/PestanasNotificaciones";
import SeccionAhora from "@/components/notifications/SeccionAhora";
import type { VistaCentro } from "@/components/notifications/centro-unificado";
import type { FiltroCategoria } from "@/components/notifications/notificaciones-categorias";
import { useAvisosDelCentro } from "@/components/notifications/use-avisos-del-centro";
import { useNotificationCenter } from "@/components/notifications/useNotificationCenter";
import { button } from "@/components/ui-system/button-variants";
import { AgendaProvider, useAgenda } from "@/hooks/use-agenda";
import { useTareas } from "@/hooks/use-tareas";
import { cuandoVuelve, loQueFalta, proximoAviso, textoCada, type AvisoPantalla, type ModoAviso } from "@/lib/agenda/aviso-pantalla";
import { cn } from "@/lib/utils";
import { fechaLarga } from "../comun/fechas";
import { AccionesDeLaVentana, PieDelCostado, VolverALaLista } from "./BotonesDelCentro";
import { CuerpoAviso } from "./CuerpoAviso";
import { PanelLateralAviso } from "./PanelLateralAviso";
import { esAbierta, TareasDelCentro } from "./TareasDelCentro";
import { useVentanasDelCentro } from "./ventanas-del-centro";

/** Al costado queda abierto horas: lo que marcó la fuente (la asistencia, un gasto) se vuelve a mirar cada 5 min. */
const REFRESCO_AL_COSTADO_MS = 5 * 60_000;
/* «Por hacer» (la agenda) y «Tareas» (las del equipo, con todo: agregar, editar, eliminar) van antes de «Todas». */
const PESTANAS_PRIMERAS = [
  { id: "por-hacer", label: "Por hacer", icon: ClipboardList },
  { id: "tareas", label: "Tareas", icon: ListChecks },
] as const;

interface Props {
  config: AvisoPantalla;
  modo: ModoAviso;
  vista: VistaCentro;
  onVista: (v: VistaCentro) => void;
  /** ms del próximo aviso según el reloj (puede estar vencido si se abrió a mano). */
  proximo: number;
  minimizado: boolean;
  onMinimizar: (v: boolean) => void;
  /** Ancho de la barra del costado en px (`null` = de fábrica). */
  ancho: number | null;
  onAncho: (px: number | null) => void;
  onCambiarModo: (m: ModoAviso) => void;
  onCerrar: () => void;
  onRecordarEn: (min: number) => void;
  onNoMasHoy: () => void;
  onConfigurar: () => void;
}

export default function AvisoAgendaModal(props: Props) {
  return (
    <AgendaProvider>
      <Centro {...props} />
    </AgendaProvider>
  );
}

function Centro(p: Props) {
  const { config, modo, vista, onVista, proximo, minimizado, onCerrar } = p;
  const { hoy, refrescar } = useAgenda();
  const [alDia, setAlDia] = useState(false);
  /* El centro muestra todo lo que falta (con lo atrasado); la config sólo decide cuándo sale solo. */
  const falta = loQueFalta(hoy, { atrasadas: true });
  const porHacer = falta.hoy.length + falta.atrasadas.length;
  const enVentana = modo === "ventana";
  const alIr = enVentana ? onCerrar : undefined;

  const centro = useNotificationCenter(!minimizado);
  const tareas = useTareas(!minimizado);
  const { abrirTarea, agregar, ventanas } = useVentanasDelCentro(tareas, { alCrearTarea: () => onVista("tareas") });
  const categoria: FiltroCategoria = vista === "por-hacer" || vista === "tareas" ? "todas" : (vista as FiltroCategoria);
  const avisos = useAvisosDelCentro({
    abierto: !minimizado,
    categoria,
    notifications: centro.notifications,
    filter: centro.filter,
    isLoading: centro.isLoading,
    cargaFallida: centro.cargaFallida,
    refetch: centro.refetch,
    sinAgenda: true,
  });

  useEffect(() => {
    if (enVentana) return;
    const t = setInterval(refrescar, REFRESCO_AL_COSTADO_MS);
    return () => clearInterval(t);
  }, [enVentana, refrescar]);

  const ahora = Date.now();
  const vuelve = config.activo
    ? `Vuelve ${cuandoVuelve(proximo > ahora ? proximo : proximoAviso(config, ahora, falta.hoy), ahora)}`
    : "El aviso automático está apagado";
  const titulo = alDia ? "Ponerme al día" : "Pendientes y avisos";
  const sinLeer = centro.unreadCount > 0 ? ` · ${centro.unreadCount > 999 ? "999+" : centro.unreadCount} sin leer` : "";
  const descripcion = alDia ? "Lo atrasado, de una en una" : `${fechaLarga(hoy.fecha)} · ${hoy.cuenta.hechas} de ${hoy.cuenta.total} hechas${sinLeer}`;
  const actualizar = () => {
    refrescar();
    avisos.actualizar();
    void tareas.recargar();
  };
  const marcarLeidas = () => centro.unreadCount > 0 && centro.markAllRead();

  const recordar: MenuAccion[] = [
    ...[15, 30, 60, 120].map((min) => ({ id: `en-${min}`, label: `En ${textoCada(min)}`, icon: AlarmClock, onSelect: () => p.onRecordarEn(min) })),
    { id: "hoy-no", label: "No más por hoy", hint: "Vuelve mañana al empezar tu horario", icon: BellOff, onSelect: p.onNoMasHoy },
  ];

  const pestanas = alDia ? null : (
    <PestanasNotificaciones
      primeras={PESTANAS_PRIMERAS}
      categoria={vista}
      onCategoria={onVista}
      conteos={{ ...avisos.conteos, "por-hacer": porHacer, tareas: tareas.tareas.filter(esAbierta).length }}
      soloSinLeer={avisos.soloSinLeer}
      onSoloSinLeer={(v) => centro.setFilter(v ? "unread" : "all")}
      enFila={!enVentana}
    />
  );

  const porHacerDensa = <CuerpoAviso falta={falta} densa={!enVentana || vista === "todas"} alDia={alDia} onAlDia={setAlDia} alIr={alIr} />;
  const listaAvisos = (
    <>
      <SeccionAhora {...avisos.porAccion} onNavegar={() => alIr?.()} />
      <ListaDeAvisos
        grupos={avisos.grupos}
        estado={avisos.estado}
        soloSinLeer={avisos.soloSinLeer}
        nombreCategoria={avisos.nombreCategoria}
        onReintentar={avisos.actualizar}
        onQuitarFiltros={() => {
          onVista("todas");
          centro.setFilter("all");
        }}
        onMarkRead={centro.markAsRead}
        onNavegar={() => alIr?.()}
      />
    </>
  );
  const contenido =
    alDia || vista === "por-hacer" ? (
      porHacerDensa
    ) : vista === "tareas" ? (
      <TareasDelCentro api={tareas} onNueva={() => abrirTarea(null)} onEditar={abrirTarea} />
    ) : vista === "todas" ? (
      <div className="space-y-5">
        {/* «Escribir a clientes» (ADR-508) va dentro de porHacerDensa aunque no falte nada. */}
        {(porHacer > 0 || (hoy.seguimientos?.length ?? 0) > 0) && porHacerDensa}
        <AvisosDeLaFranja alIr={() => alIr?.()} />
        {listaAvisos}
      </div>
    ) : (
      listaAvisos
    );

  if (!enVentana) {
    return (
      <>
        <PanelLateralAviso
          modo={modo}
          titulo={titulo}
          descripcion={descripcion}
          burbuja={porHacer > 0 ? `Te faltan ${porHacer}${sinLeer}` : centro.unreadCount > 0 ? `${centro.unreadCount} sin leer` : "Al día"}
          minimizado={minimizado}
          onMinimizar={p.onMinimizar}
          ancho={p.ancho}
          onAncho={p.onAncho}
          onCambiarModo={p.onCambiarModo}
          onCerrar={onCerrar}
          arriba={pestanas}
          pie={
            alDia ? (
              <VolverALaLista onVolver={() => setAlDia(false)} />
            ) : (
              <PieDelCostado
                agregar={agregar}
                recordar={recordar}
                vuelve={vuelve}
                actualizando={centro.isLoading}
                onActualizar={actualizar}
                onMarcarLeidas={marcarLeidas}
                onCerrar={onCerrar}
                onConfigurar={p.onConfigurar}
              />
            )
          }
        >
          {contenido}
        </PanelLateralAviso>
        {ventanas}
      </>
    );
  }

  return (
    <>
      <AdminModal
        open
        onClose={onCerrar}
        variant="wide"
        className="h-[100dvh] max-h-[100dvh] rounded-none sm:h-[88vh] sm:max-h-[88vh] sm:max-w-[min(72rem,94vw)] sm:rounded-2xl"
        hideCloseButton
        /* Sin los botones de ventana (agrandar/fijar): el alfiler de acá es «fijar al costado». */
        ventana={false}
        footer={
          alDia ? (
            <ModalFooter>
              <VolverALaLista onVolver={() => setAlDia(false)} />
            </ModalFooter>
          ) : (
            <ModalFooter nota={vuelve}>
              <button type="button" className={button({ variant: "ghost", className: "max-sm:w-12 max-sm:px-0" })} onClick={p.onConfigurar} title="Configurar los recordatorios">
                <Settings className="size-4" aria-hidden="true" />
                <span className="max-sm:sr-only">Configurar</span>
              </button>
              <ActionMenu label="Recordarme" icon={AlarmClock} actions={recordar} compactoEnMovil title="Volver a avisarme más tarde" />
              <button type="button" data-qa="aviso-agenda-entendido" className={button({ variant: "primary" })} onClick={onCerrar}>
                Entendido
              </button>
            </ModalFooter>
          )
        }
      >
        <div className="flex h-full min-h-0 flex-col">
          <CabeceraPropia
            /* A 400 px los 6 botones no dejan lugar al título: baja la fila de botones a su propia línea, a la derecha. */
            className={cn("flex shrink-0 items-center justify-between gap-2 border-b border-[var(--rule-soft)] py-2 max-sm:flex-wrap max-sm:[&>div:last-child]:ml-auto", MODAL_GUTTER)}
            acciones={
              <AccionesDeLaVentana
                agregar={agregar}
                sinLeer={centro.unreadCount}
                actualizando={centro.isLoading || avisos.cargandoAlertas}
                onActualizar={actualizar}
                onMarcarLeidas={marcarLeidas}
                onCambiarModo={p.onCambiarModo}
                onCerrar={onCerrar}
              />
            }
          >
            <div className="flex min-w-0 items-center gap-2">
              {alDia ? <ListChecks className="size-5 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden="true" /> : <BellRing className="size-5 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden="true" />}
              <div className="min-w-0">
                <h2 className="truncate font-display text-base font-semibold tracking-tight text-[var(--text-primary)] sm:text-lg">{titulo}</h2>
                <p className="truncate text-sm text-[var(--text-tertiary)]">{descripcion}</p>
              </div>
            </div>
          </CabeceraPropia>
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            {pestanas}
            <div className={cn("min-h-0 flex-1 overflow-y-auto pb-6 pt-4", MODAL_GUTTER)} data-lenis-prevent>
              {contenido}
            </div>
          </div>
        </div>
      </AdminModal>
    {ventanas}
    </>
  );
}
