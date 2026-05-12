"use client";

import React, { useState } from "react";
import {
  CreditCard,
  Package,
  TrendingUp,
  Clock,
  AlertTriangle,
  Truck,
  Target,
  UserMinus,
  BellRing,
  Loader2,
} from "lucide-react";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";
import type { NotificationItem as NotificationItemType } from "./useNotificationCenter";

const SEVERITY_BORDER: Record<string, string> = {
  HIGH: "border-l-red-500",
  MEDIUM: "border-l-amber-400",
  LOW: "border-l-emerald-400",
};

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  FIADO_VENCIDO: CreditCard,
  STOCK_CRITICO: Package,
  VENTA_ALTA: TrendingUp,
  TURNO_SIN_CERRAR: Clock,
  DIFERENCIA_CAJA: AlertTriangle,
  PROVEEDOR_VENCIDO: Truck,
  META_ALCANZADA: Target,
  CLIENTE_INACTIVO: UserMinus,
};

const SEVERITY_ICON_COLOR: Record<string, string> = {
  HIGH: "text-[var(--data-error-500)]",
  MEDIUM: "text-[var(--data-warning-500)]",
  LOW: "text-[var(--data-success-500)]",
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffH = Math.floor(diffMs / 3_600_000);
  const diffD = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${diffMin} min`;
  if (diffH < 24) return `hace ${diffH}h`;
  if (diffD === 1) return "ayer";
  if (diffD < 7) return `hace ${diffD} días`;
  return new Date(dateStr).toLocaleDateString("es-PE", { day: "numeric", month: "short" });
}

type Props = {
  notification: NotificationItemType;
  onMarkRead: (id: string) => void;
};

export default function NotificationItem({ notification, onMarkRead }: Props) {
  const isUnread = !notification.readAt;
  const Icon = TYPE_ICON[notification.type] || BellRing;
  const borderColor = SEVERITY_BORDER[notification.severity] || "border-l-gray-300";
  const iconColor = SEVERITY_ICON_COLOR[notification.severity] || "text-gray-400";

  // Mejora M-8: Cobro express inline
  const [showCobroExpress, setShowCobroExpress] = useState(false);
  const [cobroMonto, setCobroMonto] = useState("");
  const [cobroLoading, setCobroLoading] = useState(false);
  const [cobroDone, setCobroDone] = useState(false);

  const handleClick = () => {
    if (isUnread) onMarkRead(notification.id);
    if (notification.actionUrl) {
      window.location.href = notification.actionUrl;
    }
  };

  const isFiadoVencido = notification.type === "FIADO_VENCIDO";

  return (
    <div className="w-full">
      <button
        onClick={handleClick}
        className={cn(
          "w-full text-left px-4 py-3 border-l-4 transition-colors duration-150 hover:bg-gray-50 dark:hover:bg-accent/50 flex items-start gap-3 group",
          borderColor,
          isUnread ? "bg-emerald-50/50 dark:bg-emerald-950/10" : "bg-transparent"
        )}
      >
        {/* Icon */}
        <div
          className={cn(
            "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5",
            isUnread ? "bg-[var(--surface-raised)] shadow-sm" : "bg-gray-100 dark:bg-surface"
          )}
        >
          <Icon className={cn("h-4 w-4", iconColor)} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-sm leading-tight",
              isUnread
                ? "font-semibold text-gray-900 dark:text-[var(--text-primary)]"
                : "font-normal text-gray-600 dark:text-muted"
            )}
          >
            {notification.title}
          </p>
          <p className="text-xs text-gray-500 dark:text-muted mt-0.5 line-clamp-2">
            {notification.body}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[length:var(--ts-2xs)] text-gray-400 dark:text-muted">
              {timeAgo(notification.createdAt)}
            </span>
            {notification.actionLabel && notification.actionUrl && (
              <span className="text-[length:var(--ts-2xs)] font-medium text-primary hover:underline">
                {notification.actionLabel}
              </span>
            )}
            {/* Mejora M-8: Boton cobrar para FIADO_VENCIDO */}
            {isFiadoVencido && !cobroDone && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCobroExpress(!showCobroExpress);
                }}
                className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-600)] hover:text-[var(--data-success-700)] hover:underline"
              >
                Cobrar
              </button>
            )}
            {cobroDone && (
              <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-600)]">Pago registrado</span>
            )}
          </div>
        </div>

        {/* Unread dot */}
        {isUnread && (
          <div className="shrink-0 mt-2">
            <div className="w-2 h-2 rounded-full bg-primary" />
          </div>
        )}
      </button>

      {/* Mejora M-8: Cobro express inline panel */}
      {showCobroExpress && isFiadoVencido && (
        <div className="px-4 py-2 bg-gray-50 dark:bg-surface border-l-4 border-l-emerald-400">
          <p className="text-[length:var(--ts-2xs)] font-bold text-gray-600 dark:text-[var(--text-primary)] mb-1.5">
            Registrar pago
          </p>
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-[length:var(--ts-2xs)] font-bold">S/</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.10"
                value={cobroMonto}
                onChange={(e) => setCobroMonto(e.target.value)}
                placeholder="Monto"
                onClick={(e) => e.stopPropagation()}
                className="w-full pl-6 pr-2 py-1.5 rounded-lg border border-[var(--rule-base)] text-xs font-bold text-gray-900 dark:text-[var(--text-primary)] outline-none focus:border-primary"
              />
            </div>
            <button
              onClick={async (e) => {
                e.stopPropagation();
                const monto = Number(cobroMonto);
                if (!monto || monto <= 0) return;
                setCobroLoading(true);
                try {
                  const entityId = (notification as unknown as { entityId?: string }).entityId;
                  if (entityId) {
                    const res = await fetch(`/api/fiados/${entityId}/pagar`, {
                      method: "POST",
                      headers: csrfHeaders({ "Content-Type": "application/json" }),
                      body: JSON.stringify({ monto }),
                    });
                    if (res.ok) {
                      setCobroDone(true);
                      setShowCobroExpress(false);
                      onMarkRead(notification.id);
                    }
                  }
                } catch { /* silent */ }
                setCobroLoading(false);
              }}
              disabled={cobroLoading || !cobroMonto || Number(cobroMonto) <= 0}
              className="px-2.5 py-1.5 rounded-lg bg-[var(--accent-600,var(--accent))] text-white text-[length:var(--ts-2xs)] font-bold hover:bg-[var(--accent-dark)] transition-colors disabled:opacity-50"
            >
              {cobroLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Confirmar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
