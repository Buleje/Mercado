"use client";

/**
 * Un aviso del centro de notificaciones (rediseño 10-10, modal central).
 *
 * Antes la fila entera era un botón que marcaba leído y navegaba con
 * `window.location.href` (recargaba el panel; un enlace de WhatsApp se llevaba
 * el panel entero). Ahora la fila se lee y las acciones son botones propios
 * de 48 px: «Ir a…» (marca leído y navega sin recargar, o abre WhatsApp en
 * otra pestaña) y «Marcar como leída».
 *
 * Rediseño 18-10 («más minimalista»): sin tarjeta, franja ni borde. Una fila
 * de bandeja separada por una línea fina: punto turquesa = sin leer, el color
 * del ícono = el nivel (rojo urgente, coral importante, turquesa informativo;
 * leve y lo leído, gris), la hora arriba a la derecha y los repetidos en una
 * sola fila («46 veces · desde jueves 08/10»). Los botones siguen de 48 px con
 * margen negativo: el toque no cambia, la fila no se estira.
 */
import { useState } from "react";
import {
  AlertTriangle,
  BellRing,
  Repeat,
  Camera,
  Check,
  ChevronRight,
  Clock,
  CreditCard,
  ExternalLink,
  FileText,
  Package,
  ShoppingBag,
  Target,
  TrendingUp,
  Trees,
  Truck,
  UserMinus,
  UserPlus,
  Wallet,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { useMiRol } from "@/hooks/use-mi-rol";
import { cn } from "@/lib/utils";
import { NIVEL_ETIQUETA } from "@/lib/superadmin/nivel-aviso";
import { nivelDeAviso, TOPE_MARCAR_JUNTOS, type AvisoJunto, type Nivel } from "./avisos-juntos";
import CobroExpressFiado from "./CobroExpressFiado";
import {
  abrirAccionDeAviso,
  categoriaDeTipo,
  cuandoFue,
  esEnlaceExterno,
  etiquetaDeCategoria,
} from "./notificaciones-categorias";
import type { NotificationItem as NotificationItemType } from "./useNotificationCenter";

const ICONO_DE_TIPO: Record<string, LucideIcon> = {
  FIADO_VENCIDO: CreditCard,
  FIADO_REMINDER: CreditCard,
  ADELANTO_VENCIDO: Wallet,
  STOCK_CRITICO: Package,
  forecast_daily: TrendingUp,
  VENTA_ALTA: TrendingUp,
  TURNO_SIN_CERRAR: Clock,
  DIFERENCIA_CAJA: AlertTriangle,
  PROVEEDOR_VENCIDO: Truck,
  META_ALCANZADA: Target,
  CLIENTE_INACTIVO: UserMinus,
  CLIENTE_NUEVO: UserPlus,
  marketplace_order: ShoppingBag,
  CARRITO_ABANDONADO: ShoppingBag,
  DRIVER_APPLICATION: Truck,
  camaras: Camera,
  DOCUMENTO_VENCIMIENTO: FileText,
  DOCUMENTO_APROBACION: FileText,
  PLAN_LICENCIA: FileText,
  PLAN_OBJETIVO: Target,
  PLAN_POLITICA: FileText,
  CTP_PLAZO_SERFOR: Trees,
  LOTH_PLAZO_SERFOR: Trees,
  CACAO_BENEFICIO_ATENCION: Trees,
};

/** El ícono por nivel, sólo sin leer: lo leído ya se atendió y queda gris. */
const NEUTRO = {
  chip: "bg-[var(--surface-sunken)] group-hover:bg-[var(--surface-raised)]",
  icono: "text-[var(--text-secondary)]",
};
const TONO: Record<Nivel, { chip: string; icono: string }> = {
  urgente: { chip: "bg-[var(--data-error-500)]/12", icono: "text-[var(--data-error-ink)]" },
  importante: { chip: "bg-[var(--data-warning-500)]/12", icono: "text-[var(--data-warning-ink)]" },
  informativo: {
    chip: "bg-[var(--accent)]/10",
    icono: "text-[var(--accent-ink)] dark:text-[var(--accent)]",
  },
  leve: NEUTRO,
};

const BOTON =
  "inline-flex h-12 items-center justify-center gap-1 rounded-xl px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";

type Props = {
  notification: NotificationItemType;
  /** Puede devolver la promesa del guardado: las copias se marcan de a una. */
  onMarkRead: (id: string) => void | Promise<void>;
  /** Se llamó cuando la acción navegó DENTRO del panel (el modal se cierra). */
  onNavegar?: () => void;
  /** El aviso con sus repetidos (18-10). Sin esto, la fila es sólo `notification`. */
  junto?: Pick<AvisoJunto<NotificationItemType>, "veces" | "desde" | "sinLeer" | "idsSinLeer" | "nivel">;
};

/** De a una (no en paralelo): cada «leído» relee la lista y la API cuenta 60 por minuto. */
async function marcarEnFila(ids: readonly string[], marcar: Props["onMarkRead"]) {
  for (const id of ids.slice(0, TOPE_MARCAR_JUNTOS)) await marcar(id);
}

export default function NotificationItem({ notification: n, onMarkRead, onNavegar, junto }: Props) {
  const sinLeer = junto?.sinLeer ?? !n.readAt;
  const veces = junto?.veces ?? 1;
  const nivel = junto?.nivel ?? nivelDeAviso(n);
  const Icono = ICONO_DE_TIPO[n.type] ?? BellRing;
  const tono = sinLeer ? TONO[nivel] : NEUTRO;
  const externo = n.actionUrl ? esEnlaceExterno(n.actionUrl) : false;
  const idsSinLeer = junto?.idsSinLeer ?? (n.readAt ? [] : [n.id]);
  const marcarLeida = () => void marcarEnFila(idsSinLeer, onMarkRead);

  // /api/fiados/[id]/pagar pide admin o cajero (owner y manager pasan como admin): el resto no ve «Cobrar».
  const rol = useMiRol();
  const puedeCobrar = rol === "admin" || rol === "cajero" || rol === "owner" || rol === "manager";
  const conCobro = n.type === "FIADO_VENCIDO" && puedeCobrar && Boolean(n.entityId);
  const [cobrando, setCobrando] = useState(false);
  const [cobrado, setCobrado] = useState(false);

  const irALaAccion = () => {
    if (!n.actionUrl) return;
    if (idsSinLeer.length > 0) marcarLeida();
    if (abrirAccionDeAviso(n.actionUrl)) onNavegar?.();
  };

  return (
    <article
      data-notificacion={n.id}
      className="group relative flex gap-3 rounded-xl py-3 pl-5 pr-3 transition-colors hover:bg-[var(--surface-sunken)]"
    >
      {sinLeer && (
        <span aria-hidden className="absolute left-1.5 top-[1.6rem] h-2 w-2 rounded-full bg-[var(--accent)]" />
      )}
      <span aria-hidden className={cn("mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors", tono.chip)}>
        <Icono className={cn("h-[1.125rem] w-[1.125rem]", tono.icono)} strokeWidth={2} />
      </span>
      <div className="flex-1">
        <div className="flex items-baseline gap-3">
          <p
            className={cn(
              "flex-1 text-sm leading-5",
              sinLeer ? "font-semibold text-[var(--text-primary)]" : "font-medium text-[var(--text-secondary)]",
            )}
          >
            <span className="sr-only">
              {sinLeer ? "Sin leer, " : ""}
              {NIVEL_ETIQUETA[nivel].toLowerCase()}:{" "}
            </span>
            {n.title}
          </p>
          <time dateTime={n.createdAt} className="shrink-0 text-xs tabular-nums text-[var(--text-tertiary)]">
            {cuandoFue(n.createdAt)}
          </time>
        </div>
        {n.body && (
          <p className="mt-0.5 line-clamp-2 text-sm leading-5 text-[var(--text-secondary)]">{n.body}</p>
        )}
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3">
          <p className="flex flex-wrap items-center gap-x-1.5 py-1 text-xs text-[var(--text-tertiary)]">
            {sinLeer && nivel === "urgente" && (
              <span aria-hidden className="font-semibold text-[var(--data-error-ink)]">
                {NIVEL_ETIQUETA.urgente} ·
              </span>
            )}
            <span>{etiquetaDeCategoria(categoriaDeTipo(n.type))}</span>
            {veces > 1 && junto && (
              <span className="inline-flex items-center gap-1">
                · <Repeat className="h-3.5 w-3.5" aria-hidden />
                {veces} veces · desde {cuandoFue(junto.desde)}
              </span>
            )}
          </p>
          <div className="-my-1.5 -mr-2 ml-auto flex flex-wrap items-center justify-end">
            {cobrado && (
              <span className="px-3 text-sm font-semibold text-[var(--data-success-ink)]">Pago registrado</span>
            )}
            {conCobro && !cobrado && !cobrando && (
              <button
                type="button"
                onClick={() => setCobrando(true)}
                className={cn(BOTON, "text-[var(--data-success-ink)] hover:bg-[var(--data-success-500)]/10")}
              >
                Cobrar
              </button>
            )}
            {n.actionUrl && (
              <button
                type="button"
                onClick={irALaAccion}
                className={cn(BOTON, "text-[var(--accent-ink)] hover:bg-[var(--accent)]/10 dark:text-[var(--accent)]")}
              >
                {n.actionLabel || (externo ? "Abrir" : "Ver")}
                {externo ? (
                  <ExternalLink className="h-4 w-4" aria-hidden />
                ) : (
                  <ChevronRight className="h-4 w-4" aria-hidden />
                )}
                {externo && <span className="sr-only"> (se abre en otra pestaña)</span>}
              </button>
            )}
            {idsSinLeer.length > 0 && (
              <button
                type="button"
                onClick={marcarLeida}
                aria-label={`Marcar como leída: ${n.title}${veces > 1 ? ` (y sus repeticiones)` : ""}`}
                title={veces > 1 ? "Marcar como leída (con sus repeticiones)" : "Marcar como leída"}
                className={cn(
                  BOTON,
                  "w-12 px-0 text-[var(--text-tertiary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]",
                )}
              >
                <Check className="h-5 w-5" aria-hidden />
              </button>
            )}
          </div>
        </div>
        {cobrando && n.entityId && (
          <CobroExpressFiado
            fiadoId={n.entityId}
            onCancelar={() => setCobrando(false)}
            onPagado={() => {
              setCobrando(false);
              setCobrado(true);
              marcarLeida();
            }}
          />
        )}
      </div>
    </article>
  );
}
