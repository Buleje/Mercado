"use client";

/**
 * DailyReportWACard — Reporte diario del día para bodeguero + envío WhatsApp.
 *
 * Caso de uso: al final del día el bodeguero quiere saber "como me fue hoy"
 * sin abrir dashboard. Este widget muestra:
 *   - Ventas totales
 *   - Tickets (pedidos)
 *   - Ticket promedio
 *   - Top 3 productos
 *   - Comparativa con ayer (arriba/abajo)
 *
 * CTA: "Mandame a mi WhatsApp" → abre WA con resumen formateado.
 *
 * Componente standalone. Props: data del día (cuando el admin lo conecte
 * al endpoint real de reportes) + phone del bodeguero.
 */

import { useCallback } from "react";
import { CardTitle } from "@buleje/design-system";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Send,
  Package,
  BarChart3,
  MessageCircle,
} from "@buleje/design-system/icons";

interface TopProduct {
  name: string;
  qty: number;
  revenue: number;
}

interface Props {
  /** Ventas totales del día en soles */
  ventasHoy: number;
  /** Número de pedidos (tickets) del día */
  ticketsHoy: number;
  /** Ventas de ayer para comparar */
  ventasAyer?: number;
  /** Top 3 productos más vendidos hoy */
  topProductos?: TopProduct[];
  /** WhatsApp del bodeguero (sin +51) */
  whatsappNumero?: string;
  /** Nombre del negocio (opcional, para encabezado del mensaje) */
  nombreNegocio?: string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

export default function DailyReportWACard({
  ventasHoy,
  ticketsHoy,
  ventasAyer = 0,
  topProductos = [],
  whatsappNumero,
  nombreNegocio,
}: Props) {
  const ticketPromedio = ticketsHoy > 0 ? ventasHoy / ticketsHoy : 0;
  const delta = ventasAyer > 0 ? ((ventasHoy - ventasAyer) / ventasAyer) * 100 : 0;
  const deltaLabel = delta === 0 ? "=" : delta > 0 ? `+${delta.toFixed(0)}%` : `${delta.toFixed(0)}%`;
  const trend = delta === 0 ? "flat" : delta > 0 ? "up" : "down";

  const buildMessage = useCallback(() => {
    const hora = new Date().toLocaleTimeString("es-PE", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const nombre = nombreNegocio ? `*${nombreNegocio}*\n` : "";
    const top = topProductos
      .map((p, i) => `${i + 1}. ${p.name} — ${p.qty} uds · ${fmt(p.revenue)}`)
      .join("\n");
    return (
      `${nombre}Reporte del dia al ${hora}\n` +
      `\n` +
      `Ventas: ${fmt(ventasHoy)} ${deltaLabel} vs ayer\n` +
      `Pedidos: ${ticketsHoy}\n` +
      `Ticket promedio: ${fmt(ticketPromedio)}\n` +
      `\n` +
      (top ? `Top productos:\n${top}\n\n` : "") +
      `— Buleje Admin`
    );
  }, [nombreNegocio, ventasHoy, ticketsHoy, ticketPromedio, deltaLabel, topProductos]);

  const handleSendWA = useCallback(() => {
    const msg = encodeURIComponent(buildMessage());
    const num = whatsappNumero?.replace(/\D/g, "") ?? "";
    const url = num
      ? `https://wa.me/51${num}?text=${msg}`
      : `https://wa.me/?text=${msg}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [buildMessage, whatsappNumero]);

  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor =
    trend === "up"
      ? "text-[var(--data-success,_#00b66a)]"
      : trend === "down"
      ? "text-[var(--data-error,_#e11d48)]"
      : "text-[var(--text-tertiary)]";

  return (
    <section
      aria-label="Reporte del día"
      className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 sm:px-6 border-b border-[var(--rule-soft)]">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
            <BarChart3 className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="flex-1">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Reporte del día
            </p>
            <CardTitle>¿Cómo te fue hoy?</CardTitle>
          </div>
        </div>
      </div>

      {/* KPIs — 3 columnas */}
      <div className="px-5 py-5 sm:px-6">
        <div className="grid grid-cols-3 gap-3 divide-x divide-[var(--rule-soft)]">
          {/* Ventas con trend */}
          <div className="pr-2">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
              Ventas
            </p>
            <p className="text-xl font-extrabold tabular-nums tracking-tight text-[var(--text-primary)]">
              {fmt(ventasHoy)}
            </p>
            {ventasAyer > 0 && (
              <p
                className={`mt-0.5 inline-flex items-center gap-0.5 text-[length:var(--ts-2xs)] font-bold ${trendColor}`}
              >
                <TrendIcon className="h-3 w-3" strokeWidth={2} aria-hidden />
                {deltaLabel} vs ayer
              </p>
            )}
          </div>
          {/* Pedidos */}
          <div className="px-2">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
              Pedidos
            </p>
            <p className="text-xl font-extrabold tabular-nums tracking-tight text-[var(--text-primary)]">
              {ticketsHoy}
            </p>
            <p className="mt-0.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
              entregados
            </p>
          </div>
          {/* Ticket promedio */}
          <div className="pl-2">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
              Ticket prom.
            </p>
            <p className="text-xl font-extrabold tabular-nums tracking-tight text-[var(--text-primary)]">
              {fmt(ticketPromedio)}
            </p>
            <p className="mt-0.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
              por pedido
            </p>
          </div>
        </div>
      </div>

      {/* Top productos */}
      {topProductos.length > 0 && (
        <div className="px-5 sm:px-6 pb-4 border-t border-[var(--rule-soft)] pt-4 bg-[var(--surface-sunken)]">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-3 inline-flex items-center gap-1">
            <Package className="h-3 w-3" strokeWidth={1.75} aria-hidden />
            Top productos hoy
          </p>
          <ul className="space-y-2">
            {topProductos.slice(0, 3).map((p, i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] px-3 py-2"
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] text-[length:var(--ts-2xs)] font-extrabold tabular-nums">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                    {p.name}
                  </p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                    {p.qty} unidades
                  </p>
                </div>
                <p className="text-sm font-extrabold tabular-nums text-[var(--text-primary)]">
                  {fmt(p.revenue)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* CTA WhatsApp */}
      <div className="px-5 sm:px-6 py-4 border-t border-[var(--rule-soft)]">
        <button
          type="button"
          onClick={handleSendWA}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] text-white py-3 text-sm font-bold hover:bg-[#1ea34d] transition-colors active:scale-[0.98]"
        >
          <MessageCircle className="h-4 w-4" strokeWidth={2} aria-hidden />
          Mandate el reporte a WhatsApp
        </button>
        <p className="mt-2 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] text-center">
          {whatsappNumero ? "Se abre con tu número precargado" : "Elegí el número al enviar"}
        </p>
      </div>
    </section>
  );
}
