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
 *    alto en escritorio, pantalla completa en celular; desde 1280 px «Para
 *    atender ahora» pasa a su columna a la derecha (categorías · avisos · hoy).
 */
import { useMemo, useState } from "react";
import { Bell, CheckCheck, RefreshCw, WifiOff, X } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import AdminModal, { CabeceraPropia, MODAL_GUTTER } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import NotificationItem from "./NotificationItem";
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
  markAsRead: (id: string) => void;
  markAllRead: () => void;
  refetch: () => void;
};

const BOTON_ICONO =
  "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";

function Esqueleto() {
  return (
    <div className="space-y-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl bg-[var(--surface-sunken)]" />
      ))}
    </div>
  );
}

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
  const ahoraAlLado = useMediaQuery("(min-width: 1280px)");

  const conteos = useMemo(() => {
    const c: Record<string, number> = { todas: notifications.length + alertas.length };
    for (const n of notifications) {
      const id = categoriaDeTipo(n.type);
      c[id] = (c[id] ?? 0) + 1;
    }
    for (const a of alertas) c[a.categoria] = (c[a.categoria] ?? 0) + 1;
    return c;
  }, [notifications, alertas]);

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
  const grupos = useMemo(() => agruparPorDia(avisos), [avisos]);
  // M08: lo de ahora, agrupado por acción («Cobrar 3», «Reponer 5»).
  const porAccion = useAccionesDeAvisos({ abierto: open, recarga, alertas: ahora, avisos, categoria });
  const hayAhora = porAccion.grupos.length > 0 || porAccion.sueltas.length > 0;
  const nombreCategoria = categoria === "todas" ? null : etiquetaDeCategoria(categoria);
  const sinNada = !isLoading && !cargaFallida && avisos.length === 0 && !hayAhora;

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
          avisos, la fila de categorías no se va con el scroll). */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <CabeceraPropia
            className={cn("flex items-center justify-between gap-2 py-2", MODAL_GUTTER)}
            acciones={
              <>
                <button
                  type="button"
                  onClick={actualizar}
                  className={BOTON_ICONO}
                  aria-label="Actualizar"
                  title="Actualizar"
                >
                  <RefreshCw
                    className={cn("h-5 w-5", (isLoading || cargandoAlertas) && "animate-spin")}
                    aria-hidden
                  />
                </button>
                <button
                  type="button"
                  onClick={() => unreadCount > 0 && markAllRead()}
                  aria-disabled={unreadCount === 0}
                  aria-label="Marcar todas como leídas"
                  title="Marcar todas como leídas"
                  className={cn(
                    BOTON_ICONO,
                    "sm:w-auto sm:gap-2 sm:px-3 sm:text-sm sm:font-semibold aria-disabled:opacity-50",
                  )}
                >
                  <CheckCheck className="h-5 w-5" aria-hidden />
                  <span className="hidden sm:inline">Marcar todas leídas</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className={BOTON_ICONO}
                  aria-label="Cerrar"
                  title="Cerrar (Esc)"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </>
            }
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="hidden h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 sm:grid text-[var(--accent-ink)] dark:bg-primary/20 dark:text-[var(--accent)]">
                <Bell className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </span>
              <h2 className="truncate font-display text-lg font-semibold tracking-tight text-[var(--text-primary)]">
                Notificaciones
              </h2>
              {unreadCount > 0 && (
                <span className="shrink-0 rounded-full bg-[var(--data-error-500)]/10 px-2 py-0.5 text-sm font-bold tabular-nums text-[var(--data-error-ink)]">
                  {unreadCount > 999 ? "999+" : unreadCount}
                  <span className="sr-only"> sin leer</span>
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
                what="Arriba, lo que hay que atender hoy agrupado por lo que hay que hacer: cuadrar la caja, cobrar, pagar, revisar comprobantes, reponer, atender pedidos (lo que más plata pone en juego, primero). Abajo, los avisos que dejó el sistema, del más nuevo al más viejo."
                affects="El número rojo son los avisos sin leer de todo el negocio; las pestañas cuentan los 100 más recientes. «Marcar todas leídas» marca todos, no sólo los de la pestaña."
                example="Un aviso de adelantos vencidos: «Ver cobranza» lo marca leído y te lleva a Mi Plata › Adelantos."
                side="bottom"
              />
            }
          />

          <div className={cn("min-h-0 flex-1 space-y-5 overflow-y-auto py-4", MODAL_GUTTER)}>
            {!ahoraAlLado && <SeccionAhora {...porAccion} onNavegar={onClose} />}

            {cargaFallida && avisos.length === 0 ? (
              <div
                role="alert"
                className="flex items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3"
              >
                <WifiOff className="h-5 w-5 shrink-0 text-[var(--text-secondary)]" aria-hidden />
                <p className="flex-1 text-sm text-[var(--text-primary)]">
                  No se pudieron traer los avisos.
                </p>
                <button
                  type="button"
                  onClick={actualizar}
                  className="h-12 rounded-xl px-3 text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent)]/10 dark:text-[var(--accent)]"
                >
                  Reintentar
                </button>
              </div>
            ) : isLoading && avisos.length === 0 ? (
              <Esqueleto />
            ) : sinNada ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <span
                  className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--data-success-500)]/10"
                  aria-hidden
                >
                  <CheckCheck className="h-6 w-6 text-[var(--data-success-ink)]" />
                </span>
                <p className="text-base font-semibold text-[var(--text-primary)]">Todo al día</p>
                <p className="text-sm text-[var(--text-secondary)]">
                  {soloSinLeer ? "No te queda nada sin leer" : "No tienes avisos"}
                  {nombreCategoria ? ` en ${nombreCategoria}.` : "."}
                </p>
              </div>
            ) : (
              grupos.map((g) => (
                <section key={g.grupo} aria-label={g.grupo} className="space-y-2">
                  <CardTitle className="text-sm font-bold text-[var(--text-secondary)]">
                    {g.grupo}
                  </CardTitle>
                  {g.items.map((n) => (
                    <NotificationItem
                      key={n.id}
                      notification={n}
                      onMarkRead={markAsRead}
                      onNavegar={onClose}
                    />
                  ))}
                </section>
              ))
            )}
          </div>

          {ahoraAlLado && hayAhora && (
            <div className="w-80 shrink-0 overflow-y-auto border-l border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-4">
              <SeccionAhora {...porAccion} onNavegar={onClose} />
            </div>
          )}
        </div>
      </div>
    </AdminModal>
  );
}
