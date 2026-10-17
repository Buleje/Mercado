"use client";

/**
 * Lo que se puede hacer con la cotización abierta: el paso que sigue según su
 * estado (enviar, aceptada/rechazada, convertir en pedido) y lo de siempre
 * (WhatsApp, duplicar, PDF, guardarla como plantilla).
 */
import { useState } from "react";
import { AlertTriangle, Bookmark, Check, Copy, MessageCircle, Printer, Send, ShoppingCart, XCircle } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { cantidadConUnidad } from "@/lib/cotizaciones/disponibilidad";
import type { DetalleCotizacion } from "./use-detalle-cotizacion";
import { useMembrete } from "@/hooks/use-membrete";
import { GuardarPlantilla } from "./GuardarPlantilla";
import { abrirWhatsApp, textoWhatsApp, type Cotizacion } from "./tipos";
import type { DondePlantilla, ResultadoGuardar } from "./use-plantillas";

interface Props {
  c: Cotizacion;
  detalle: DetalleCotizacion;
  onDuplicar: () => void;
  onImprimir: () => void;
  onGuardarPlantilla: (nombre: string, donde: DondePlantilla, reemplazarId?: string) => Promise<ResultadoGuardar>;
}

const PRINCIPAL = button({ variant: "primary", className: "gap-1.5 rounded-xl px-4" });
const SECUNDARIO = button({ variant: "secondary", className: "gap-1.5 rounded-xl px-4" });

export function AccionesCotizacion({ c, detalle, onDuplicar, onImprimir, onGuardarPlantilla }: Props) {
  const [guardando, setGuardando] = useState(false);
  const [guardada, setGuardada] = useState<string | null>(null);
  const membrete = useMembrete();
  const { actionLoading, cambiarEstado, convertir, faltantes, descartarFaltantes, pedidoCreado, convertirError, estadoError } = detalle;

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
          <button type="button" onClick={() => void convertir()} disabled={actionLoading} className={PRINCIPAL}>
            <ShoppingCart className="h-4 w-4" aria-hidden /> Convertir en pedido
          </button>
        )}
        <button type="button" onClick={() => abrirWhatsApp(textoWhatsApp(c, membrete), c.customerId ?? "")} className={SECUNDARIO}>
          <MessageCircle className="h-4 w-4 text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]" aria-hidden /> WhatsApp
        </button>
        <button type="button" onClick={onDuplicar} className={SECUNDARIO}>
          <Copy className="h-4 w-4" aria-hidden /> Duplicar
        </button>
        <button type="button" onClick={onImprimir} className={SECUNDARIO}>
          <Printer className="h-4 w-4" aria-hidden /> Imprimir PDF
        </button>
        <button type="button" onClick={() => { setGuardando((v) => !v); setGuardada(null); }} aria-expanded={guardando} className={SECUNDARIO}>
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
      {faltantes && c.status === "ACEPTADA" && (
        <div role="alert" className="space-y-2 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] p-3 text-sm dark:bg-[var(--data-warning-500)]/10">
          <p className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
            <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]" aria-hidden />
            Hoy no alcanza el stock para todo lo cotizado
          </p>
          <ul className="space-y-0.5 text-[var(--text-primary)]">
            {faltantes.map((f) => (
              <li key={f.productoId}>{f.descripcion}: pide {cantidadConUnidad(f.pide, f.unidad)}, hay {cantidadConUnidad(f.hay, f.unidad)}</li>
            ))}
          </ul>
          <p className="text-[var(--text-secondary)]">Si conviertes igual, el pedido sale con todo y lo que falta queda por conseguir.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={descartarFaltantes} className={button({ variant: "ghost", className: "rounded-xl px-4" })}>No convertir</button>
            <button type="button" onClick={() => void convertir(true)} disabled={actionLoading} className={button({ variant: "secondary", className: "rounded-xl px-4" })}>Convertir igual</button>
          </div>
        </div>
      )}
      {guardada && <p role="status" className="text-sm text-[var(--text-secondary)]">{guardada}</p>}
      {((convertirError && c.status === "ACEPTADA") || estadoError) && (
        <p role="alert" className="text-sm text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">{estadoError ?? convertirError}</p>
      )}

      {guardando && (
        <GuardarPlantilla
          onGuardar={onGuardarPlantilla}
          onListo={(m) => { setGuardando(false); setGuardada(m); }}
          onCancelar={() => setGuardando(false)}
        />
      )}
    </div>
  );
}
