"use client";

/**
 * Un aviso del centro de notificaciones (rediseño 10-10, modal central).
 *
 * Antes la fila entera era un botón que marcaba leído y navegaba con
 * `window.location.href` (recargaba el panel; un enlace de WhatsApp se llevaba
 * el panel entero). Ahora la fila se lee y las acciones son botones propios
 * de 48 px: «Ir a…» (marca leído y navega sin recargar, o abre WhatsApp en
 * otra pestaña) y «Marcar como leída».
 */
import { useState } from "react";
import {
  AlertTriangle,
  BellRing,
  Camera,
  Check,
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

/** Franja e ícono por gravedad. Ícono en `-ink`: el -500 del aviso medio da 2:1 sobre blanco. */
const TONO: Record<string, { franja: string; icono: string; chip: string }> = {
  HIGH: {
    franja: "border-l-[var(--data-error-500)]",
    icono: "text-[var(--data-error-ink)]",
    chip: "bg-[var(--data-error-500)]/10",
  },
  MEDIUM: {
    franja: "border-l-[var(--data-warning-500)]",
    icono: "text-[var(--data-warning-ink)]",
    chip: "bg-[var(--data-warning-500)]/10",
  },
  LOW: {
    franja: "border-l-[var(--data-success-500)]",
    icono: "text-[var(--data-success-ink)]",
    chip: "bg-[var(--data-success-500)]/10",
  },
};

const BOTON =
  "inline-flex h-12 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";

type Props = {
  notification: NotificationItemType;
  onMarkRead: (id: string) => void;
  /** Se llamó cuando la acción navegó DENTRO del panel (el modal se cierra). */
  onNavegar?: () => void;
};

export default function NotificationItem({ notification: n, onMarkRead, onNavegar }: Props) {
  const sinLeer = !n.readAt;
  const Icono = ICONO_DE_TIPO[n.type] ?? BellRing;
  const tono = TONO[n.severity] ?? TONO.LOW;
  const externo = n.actionUrl ? esEnlaceExterno(n.actionUrl) : false;

  // /api/fiados/[id]/pagar pide admin o cajero (owner y manager pasan como admin): el resto no ve «Cobrar».
  const rol = useMiRol();
  const puedeCobrar = rol === "admin" || rol === "cajero" || rol === "owner" || rol === "manager";
  const conCobro = n.type === "FIADO_VENCIDO" && puedeCobrar && Boolean(n.entityId);
  const [cobrando, setCobrando] = useState(false);
  const [cobrado, setCobrado] = useState(false);

  const irALaAccion = () => {
    if (!n.actionUrl) return;
    if (sinLeer) onMarkRead(n.id);
    if (abrirAccionDeAviso(n.actionUrl)) onNavegar?.();
  };

  return (
    <article
      data-notificacion={n.id}
      className={cn(
        "rounded-xl border border-l-4 border-[var(--rule-base)] px-3 py-3 transition-colors",
        tono.franja,
        sinLeer ? "bg-[var(--surface-raised)]" : "bg-[var(--surface-sunken)]",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", tono.chip)}
          aria-hidden
        >
          <Icono className={cn("h-5 w-5", tono.icono)} />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm leading-snug text-[var(--text-primary)]",
              sinLeer ? "font-bold" : "font-medium",
            )}
          >
            {sinLeer && <span className="sr-only">Sin leer: </span>}
            {n.title}
          </p>
          {n.body && (
            <p className="mt-0.5 line-clamp-2 text-sm text-[var(--text-secondary)]">{n.body}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="text-sm text-[var(--text-secondary)]">
              {cuandoFue(n.createdAt)} · {etiquetaDeCategoria(categoriaDeTipo(n.type))}
            </span>
            <div className="flex flex-wrap items-center gap-1">
              {cobrado && (
                <span className="text-sm font-semibold text-[var(--data-success-ink)]">
                  Pago registrado
                </span>
              )}
              {conCobro && !cobrado && !cobrando && (
                <button
                  type="button"
                  onClick={() => setCobrando(true)}
                  className={cn(
                    BOTON,
                    "text-[var(--data-success-ink)] hover:bg-[var(--data-success-500)]/10",
                  )}
                >
                  Cobrar
                </button>
              )}
              {n.actionUrl && (
                <button
                  type="button"
                  onClick={irALaAccion}
                  className={cn(
                    BOTON,
                    "text-[var(--accent-ink)] hover:bg-[var(--accent)]/10 dark:text-[var(--accent)]",
                  )}
                >
                  {n.actionLabel || (externo ? "Abrir" : "Ver")}
                  {externo ? (
                    <ExternalLink className="h-4 w-4" aria-hidden />
                  ) : (
                    <span aria-hidden>→</span>
                  )}
                  {externo && <span className="sr-only"> (se abre en otra pestaña)</span>}
                </button>
              )}
              {sinLeer && (
                <button
                  type="button"
                  onClick={() => onMarkRead(n.id)}
                  aria-label={`Marcar como leída: ${n.title}`}
                  title="Marcar como leída"
                  className={cn(
                    BOTON,
                    "w-12 px-0 text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
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
                onMarkRead(n.id);
              }}
            />
          )}
        </div>
      </div>
    </article>
  );
}
