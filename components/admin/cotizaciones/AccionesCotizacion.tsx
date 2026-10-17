"use client";

/**
 * Lo que se puede hacer con la cotización abierta: el paso que sigue según su
 * estado (enviar, aceptada/rechazada, convertir en pedido) y lo de siempre
 * (WhatsApp, duplicar, PDF, guardarla como plantilla).
 */
import { useState } from "react";
import { Bookmark, Check, Copy, MessageCircle, Printer, Send, ShoppingCart, XCircle } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import type { DetalleCotizacion } from "./use-detalle-cotizacion";
import { useMembrete } from "@/hooks/use-membrete";
import { abrirWhatsApp, textoWhatsApp, type Cotizacion } from "./tipos";

interface Props {
  c: Cotizacion;
  detalle: DetalleCotizacion;
  onDuplicar: () => void;
  onImprimir: () => void;
  onGuardarPlantilla: (nombre: string) => boolean;
}

const PRINCIPAL = button({ variant: "primary", className: "gap-1.5 rounded-xl px-4" });
const SECUNDARIO = button({ variant: "secondary", className: "gap-1.5 rounded-xl px-4" });

export function AccionesCotizacion({ c, detalle, onDuplicar, onImprimir, onGuardarPlantilla }: Props) {
  const [guardando, setGuardando] = useState(false);
  const membrete = useMembrete();
  const [nombre, setNombre] = useState("");
  const { actionLoading, cambiarEstado, convertir, pedidoCreado, convertirError, estadoError } = detalle;

  const guardar = () => {
    if (onGuardarPlantilla(nombre)) {
      setGuardando(false);
      setNombre("");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {c.status === "BORRADOR" && (
          <button type="button" onClick={() => cambiarEstado("ENVIADA")} disabled={actionLoading} className={PRINCIPAL}>
            <Send className="h-4 w-4" aria-hidden /> Marcar enviada
          </button>
        )}
        {c.status === "ENVIADA" && (
          <>
            <button type="button" onClick={() => cambiarEstado("ACEPTADA")} disabled={actionLoading} className={PRINCIPAL}>
              <Check className="h-4 w-4" aria-hidden /> Aceptada
            </button>
            <button type="button" onClick={() => cambiarEstado("RECHAZADA")} disabled={actionLoading} className={button({ variant: "danger", className: "gap-1.5 rounded-xl px-4" })}>
              <XCircle className="h-4 w-4" aria-hidden /> Rechazada
            </button>
          </>
        )}
        {c.status === "ACEPTADA" && (
          <button type="button" onClick={convertir} disabled={actionLoading} className={PRINCIPAL}>
            <ShoppingCart className="h-4 w-4" aria-hidden /> Convertir en pedido
          </button>
        )}
        <button type="button" onClick={() => abrirWhatsApp(textoWhatsApp(c, membrete))} className={SECUNDARIO}>
          <MessageCircle className="h-4 w-4 text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]" aria-hidden /> WhatsApp
        </button>
        <button type="button" onClick={onDuplicar} className={SECUNDARIO}>
          <Copy className="h-4 w-4" aria-hidden /> Duplicar
        </button>
        <button type="button" onClick={onImprimir} className={SECUNDARIO}>
          <Printer className="h-4 w-4" aria-hidden /> Imprimir PDF
        </button>
        <button type="button" onClick={() => { setGuardando((v) => !v); setNombre(""); }} aria-expanded={guardando} className={SECUNDARIO}>
          <Bookmark className="h-4 w-4" aria-hidden /> Guardar como plantilla
        </button>
      </div>

      {/* Recién convertida: el enlace al pedido que se creó (antes había que buscarlo en Pedidos). */}
      {pedidoCreado?.cotizacionId === c.id && (
        <p role="status" className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
          <Check className="h-4 w-4 text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]" aria-hidden />
          Pedido creado: <EnlacePanel cosa="pedido" id={pedidoCreado.orderId}>ver el pedido #{pedidoCreado.orderId.slice(-6)}</EnlacePanel>
        </p>
      )}
      {((convertirError && c.status === "ACEPTADA") || estadoError) && (
        <p role="alert" className="text-sm text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">{estadoError ?? convertirError}</p>
      )}

      {guardando && (
        <div className="space-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
          <label className="block text-sm font-semibold text-[var(--text-primary)]">
            Nombre de la plantilla
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && guardar()}
              placeholder="Ej. Pedido mensual del colegio"
              maxLength={60}
              autoFocus
              className="mt-1 h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-normal text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
            />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setGuardando(false)} className={button({ variant: "ghost", className: "flex-1 rounded-xl" })}>Cancelar</button>
            <button type="button" onClick={guardar} disabled={!nombre.trim()} className={button({ variant: "primary", className: "flex-1 rounded-xl" })}>Guardar</button>
          </div>
        </div>
      )}
    </div>
  );
}
