"use client";

/**
 * Centro de notificaciones: modal central, ordenado y clasificado (Brandon
 * 2026-10-10). Antes era un panel lateral de 420 px con pestañas que sólo
 * filtraban las alertas calculadas (Alertas / Vencimientos / Recordatorios):
 * los avisos guardados no se clasificaban y había 168 textos de menos de 14 px.
 *
 * Ahora:
 *  - `AdminModal` (Radix): centrado, Escape y clic afuera cierran, el foco
 *    queda adentro y vuelve a la campana. `aboveModals`: es un aviso global y
 *    puede abrirse con otro modal a la vista.
 *  - Pestañas por categoría real (`notificaciones-categorias.ts`) con su
 *    conteo, y «No leídas» (el mismo filtro `unread` del endpoint).
 *  - Arriba «Para atender ahora» (estado de hoy), abajo los avisos por día.
 *  - Cada aviso con su acción de 48 px; «Marcar todas leídas» en la cabecera.
 *  - Amplio (Brandon 10-10: «más amplio y grande»): hasta 72 rem × 88 % del
 *    alto en escritorio, pantalla completa en celular.
 *
 * Rediseño 18-10 (Brandon: «más minimalista y mejor elaborado»): dos columnas
 * (categorías · lista), sin tarjetas ni franjas. «Para atender ahora» va ARRIBA
 * de la lista en un bloque hundido (antes, una tercera columna al costado); los
 * avisos son filas de bandeja con su nivel (`avisos-juntos.ts`), lo urgente
 * primero dentro del día y los repetidos en una sola fila: en los 100 avisos
 * más recientes `main` tenía 19 distintos y Blas 7.
 */
import { useMemo, useState } from "react";
import { CheckCheck, RefreshCw, X } from "@buleje/design-system/icons";
import AdminModal, { CabeceraPropia, MODAL_GUTTER } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { juntarRepetidos, ordenarDelDia } from "./avisos-juntos";
import ListaDeAvisos from "./ListaDeAvisos";
import PestanasNotificaciones from "./PestanasNotificaciones";
import SeccionAhora from "./SeccionAhora";
import {
  agruparPorDia,
  categoriaDeTipo,
  etiquetaDeCategoria,
  type FiltroCategoria,
} from "./notificaciones-categorias";
import { useAlertasConsolidadas } from "./use-alertas-consolidadas";
import { useAccionesDeAvisos } from "./use-acciones-de-avisos";
import type {
  NotificationItem as NotificationItemType,
  NotificationFilter,
} from "./useNotificationCenter";

type Props = {
  open: boolean;
  onClose: () => void;
  notifications: NotificationItemType[];
  unreadCount: number;
  isLoading: boolean;
  /** La última lectura falló: se dice en vez de «Todo al día». */
  cargaFallida?: boolean;
  filter: NotificationFilter;
  setFilter: (f: NotificationFilter) => void;
  /** Puede devolver la promesa del guardado: los repetidos se marcan de a uno. */
  markAsRead: (id: string) => void | Promise<void>;
  markAllRead: () => void;
  refetch: () => void;
};

const BOTON_ICONO =
  "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";

export default function NotificationHub({
  open,
  onClose,
  notifications,
  unreadCount,
  isLoading,
  cargaFallida = false,
  filter,
  setFilter,
  markAsRead,
  markAllRead,
  refetch,
}: Props) {
  const [categoria, setCategoria] = useState<FiltroCategoria>("todas");
  const [recarga, setRecarga] = useState(0);
  const { alertas, cargando: cargandoAlertas } = useAlertasConsolidadas(open, recarga);
  const soloSinLeer = filter === "unread";

  // Una fila por aviso distinto (los repetidos juntos): las pestañas cuentan filas.
  const juntos = useMemo(() => juntarRepetidos(notifications), [notifications]);
  const conteos = useMemo(() => {
    const c: Record<string, number> = { todas: juntos.length + alertas.length };
    for (const j of juntos) {
      const id = categoriaDeTipo(j.aviso.type);
      c[id] = (c[id] ?? 0) + 1;
    }
    for (const a of alertas) c[a.categoria] = (c[a.categoria] ?? 0) + 1;
    return c;
  }, [juntos, alertas]);

  const enCategoria = useMemo(
    () => (categoria === "todas" ? juntos : juntos.filter((j) => categoriaDeTipo(j.aviso.type) === categoria)),
    [juntos, categoria],
  );
  // «Para atender ahora» sigue leyendo los avisos tal cual llegaron (M08 cuenta sus copias).
  const avisos = useMemo(
    () =>
      categoria === "todas"
        ? notifications
        : notifications.filter((n) => categoriaDeTipo(n.type) === categoria),
    [notifications, categoria],
  );
  const ahora = useMemo(
    () => (categoria === "todas" ? alertas : alertas.filter((a) => a.categoria === categoria)),
    [alertas, categoria],
  );
  const grupos = useMemo(
    () => agruparPorDia(enCategoria).map((g) => ({ grupo: g.grupo, items: ordenarDelDia(g.items) })),
    [enCategoria],
  );
  // M08: lo de ahora, agrupado por acción («Cobrar 3», «Reponer 5»).
  const porAccion = useAccionesDeAvisos({ abierto: open, recarga, alertas: ahora, avisos, categoria });
  const hayAhora = porAccion.grupos.length > 0 || porAccion.sueltas.length > 0;
  const nombreCategoria = categoria === "todas" ? null : etiquetaDeCategoria(categoria);
  const estado =
    cargaFallida && enCategoria.length === 0
      ? "fallo"
      : isLoading && enCategoria.length === 0
        ? "cargando"
        : enCategoria.length === 0 && !hayAhora
          ? "vacio"
          : "lista";

  const actualizar = () => {
    refetch();
    setRecarga((k) => k + 1);
  };

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      variant="wide"
      className="h-[100dvh] max-h-[100dvh] rounded-none sm:h-[88vh] sm:max-h-[88vh] sm:max-w-[min(72rem,94vw)] sm:rounded-2xl"
      hideCloseButton
      aboveModals
      claveVentana="centro-de-notificaciones"
    >
      {/* Alto fijo del modal (88 % / pantalla completa): la cabecera y las
          categorías quedan fijas y sólo la lista se desliza (a 400 px y con 100
          avisos, la fila de categorías no se va con el scroll). `h-full`: el
          cuerpo de AdminModal no es flex, y con `flex-1` solo el bloque crecía
          con la lista y se deslizaba entero, cabecera incluida (medido 18-10). */}
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)]">
          <CabeceraPropia
            className={cn("flex items-center justify-between gap-2 py-2", MODAL_GUTTER)}
            acciones={
              <>
                <button type="button" onClick={actualizar} className={BOTON_ICONO} aria-label="Actualizar" title="Actualizar">
                  <RefreshCw className={cn("h-5 w-5", (isLoading || cargandoAlertas) && "animate-spin")} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => unreadCount > 0 && markAllRead()}
                  aria-disabled={unreadCount === 0}
                  aria-label="Marcar todas como leídas"
                  title="Marcar todas como leídas"
                  className={cn(BOTON_ICONO, "sm:w-auto sm:gap-2 sm:px-3 sm:text-sm sm:font-semibold aria-disabled:opacity-50")}
                >
                  <CheckCheck className="h-5 w-5" aria-hidden />
                  <span className="hidden sm:inline">Marcar todas leídas</span>
                </button>
                <button type="button" onClick={onClose} className={BOTON_ICONO} aria-label="Cerrar" title="Cerrar (Esc)">
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </>
            }
          >
            <div className="flex min-w-0 items-baseline gap-2">
              <h2 className="truncate font-display text-base font-semibold tracking-tight text-[var(--text-primary)] sm:text-lg">
                Notificaciones
              </h2>
              {unreadCount > 0 && (
                <span className="shrink-0 text-sm tabular-nums text-[var(--text-tertiary)]">
                  {unreadCount > 999 ? "999+" : unreadCount} sin leer
                </span>
              )}
            </div>
          </CabeceraPropia>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <PestanasNotificaciones
            categoria={categoria}
            onCategoria={setCategoria}
            conteos={conteos}
            soloSinLeer={soloSinLeer}
            onSoloSinLeer={(v) => setFilter(v ? "unread" : "all")}
            ayuda={
              /* Al final de la fila, no al lado del título: el foco inicial del
               modal va al primer control, y un ⓘ primero se abría solo al
               entrar con teclado (tecla N). */
              <InfoTip
                title="Notificaciones"
                what="Arriba, lo que hay que atender hoy agrupado por lo que hay que hacer: cuadrar la caja, cobrar, pagar, revisar comprobantes, reponer, atender pedidos (lo que más plata pone en juego, primero). Abajo, los avisos que dejó el sistema por día: lo urgente y sin leer primero, y un aviso que se repite cada día va en una sola fila."
                affects="El número de la campana son los avisos sin leer de todo el negocio, con sus repeticiones; las pestañas cuentan avisos distintos entre los 100 más recientes. «Marcar todas leídas» marca todos, no sólo los de la pestaña."
                example="Un aviso de adelantos vencidos que llegó 5 días: una fila «5 veces · desde lunes 13/10». «Ver cobranza» la marca leída y te lleva a Mi Plata › Adelantos."
                side="bottom"
              />
            }
          />

          <div className={cn("min-h-0 flex-1 space-y-5 overflow-y-auto pb-6 pt-4", MODAL_GUTTER)}>
            <SeccionAhora {...porAccion} onNavegar={onClose} />
            <ListaDeAvisos
              grupos={grupos}
              estado={estado}
              soloSinLeer={soloSinLeer}
              nombreCategoria={nombreCategoria}
              onReintentar={actualizar}
              onQuitarFiltros={() => {
                setCategoria("todas");
                setFilter("all");
              }}
              onMarkRead={markAsRead}
              onNavegar={onClose}
            />
          </div>
        </div>
      </div>
    </AdminModal>
  );
}
