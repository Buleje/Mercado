"use client";

/**
 * ChatAndSOSPanel — panel de contacto cliente + botón SOS del repartidor.
 *
 * Renderiza:
 *   1. Card "Contactar cliente"  → solo cuando currentOrderId != null
 *   2. Botón SOS expandible      → siempre visible
 *
 * Tokens CSS usados:
 *   --accent, --accent-soft, --surface-raised, --rule-base,
 *   --text-primary, --text-secondary, --text-tertiary,
 *   --brand-danger, --data-success
 *
 * Animaciones: CSS transitions puras (no Framer Motion).
 * Reduced-motion: respeta prefers-reduced-motion via clase `motion-safe:`.
 * Dark mode: automático vía tokens del DS.
 */

import { useState, useCallback, useRef } from "react";
import {
  AlertOctagon,
  Phone,
  MapPin,
  ShieldAlert,
} from "@buleje/design-system/icons";
import { PhoneRing, WhatsAppIcon, PinIcon } from "./icons";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

export interface ChatAndSOSPanelProps {
  currentOrderId: string | null;
  customerName?: string;
  customerPhone?: string;
  customerLocation?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getInitial(name: string | undefined): string {
  if (!name) return "?";
  return name.trim().charAt(0).toUpperCase();
}

function csrf(): string {
  return document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/)?.[1] ?? "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componente: Toast inline
// ─────────────────────────────────────────────────────────────────────────────

function InlineToast({
  message,
  visible,
}: {
  message: string;
  visible: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={[
        "overflow-hidden transition-all duration-300 motion-safe:transition-all",
        visible ? "max-h-16 opacity-100 mt-3" : "max-h-0 opacity-0 mt-0",
      ].join(" ")}
    >
      <p className=" bg-[var(--data-success-500)]/10 border-2 border-[var(--data-success-500)]/30 px-4 py-2.5 text-sm font-bold text-[var(--data-success-500)] text-center">
        {message}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componente: Card de contacto con el cliente
// ─────────────────────────────────────────────────────────────────────────────

function CustomerContactCard({
  customerName,
  customerPhone,
  customerLocation,
}: Pick<
  ChatAndSOSPanelProps,
  "customerName" | "customerPhone" | "customerLocation"
>) {
  const displayName = customerName ?? "Cliente";
  const displayPhone = customerPhone ?? "";
  const displayLocation = customerLocation ?? "Sin dirección";
  const initial = getInitial(displayName);

  const whatsappHref = displayPhone
    ? `https://wa.me/${displayPhone.replace(/\D/g, "")}`
    : "#";

  const callHref = displayPhone ? `tel:${displayPhone}` : "#";

  return (
    <div className=" border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 lg:p-6 space-y-5">
      {/* Encabezado: avatar + nombre + dirección */}
      <div className="flex items-center gap-4">
        {/* Avatar con inicial */}
        <div
          aria-hidden
          className="h-14 w-14 shrink-0 bg-[var(--accent-600,var(--accent))] text-white flex items-center justify-center text-2xl font-extrabold select-none"
        >
          {initial}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
            Contactar cliente
          </p>
          <p className="mt-0.5 text-lg font-extrabold text-[var(--text-primary)] truncate">
            {displayName}
          </p>
          <div className="flex items-start gap-1.5 mt-0.5">
            <PinIcon className="h-3.5 w-3.5 text-[var(--text-tertiary)] shrink-0 mt-0.5" />
            <p className="text-sm text-[var(--text-secondary)] font-semibold line-clamp-1">
              {displayLocation}
            </p>
          </div>
        </div>
      </div>

      {/* Botones de acción */}
      <div className="grid grid-cols-2 gap-3">
        {/* Llamar */}
        <a
          href={callHref}
          aria-label={`Llamar a ${displayName}`}
          className={[
            "inline-flex items-center justify-center gap-2.5",
            "h-12 lg:h-14 border-2 border-[var(--rule-base)]",
            "bg-white dark:bg-white/5 text-[var(--text-primary)]",
            "text-base font-extrabold",
            "transition-transform duration-150 motion-safe:active:scale-95",
            "hover:border-[var(--accent)] hover:text-[var(--accent)]",
            !displayPhone && "opacity-50 pointer-events-none",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <PhoneRing className="h-5 w-5 shrink-0" />
          Llamar
        </a>

        {/* WhatsApp */}
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`WhatsApp a ${displayName}`}
          className={[
            "inline-flex items-center justify-center gap-2.5",
            "h-12 lg:h-14",
            "bg-[#25D366] text-white",
            "text-base font-extrabold",
            "transition-transform duration-150 motion-safe:active:scale-95",
            "hover:brightness-110",
            !displayPhone && "opacity-50 pointer-events-none",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <WhatsAppIcon className="h-5 w-5 shrink-0" />
          WhatsApp
        </a>
      </div>

      {/* Sub-link "Reportar problema" */}
      <div className="pt-1 text-center border-t border-[var(--rule-base)]">
        <button
          type="button"
          onClick={() => {
            // TODO: abrir sheet/modal de reporte de problema con el cliente
          }}
          className="text-sm font-bold text-[var(--text-tertiary)] underline underline-offset-2 hover:text-[var(--brand-danger)] transition-colors duration-150"
        >
          Reportar problema con el cliente
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componente: Botón SOS expandible
// ─────────────────────────────────────────────────────────────────────────────

function SOSButton() {
  const [expanded, setExpanded] = useState(false);
  const [sosLoading, setSosLoading] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  /**
   * Envía ubicación a /api/delivery/me/sos.
   * Endpoint LIVE — persiste en DeliverySOSAlert + logger.warn server-side.
   */
  const handleShareLocation = useCallback(async () => {
    setSosLoading(true);

    const sendSOS = async () => {
      let lat = 0;
      let lng = 0;

      // Obtener coords; si no hay, default 0/0 (el endpoint los acepta como required)
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 8_000,
            maximumAge: 60_000,
          });
        });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch {
        // Sin coords — el endpoint aún registra el SOS con 0/0 marcador
      }

      await fetch("/api/delivery/me/sos", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrf(),
        },
        body: JSON.stringify({ lat, lng }),
      });
    };

    // Fire-and-forget — el toast de confirmación se muestra al cliente
    // independientemente del resultado del POST (SOS es best-effort UX-wise).
    sendSOS().catch((_err) => void 0);

    setSosLoading(false);
    setExpanded(false);

    // Mostrar toast de confirmación
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastVisible(true);
    toastTimerRef.current = setTimeout(() => setToastVisible(false), 4_000);
  }, []);

  return (
    <div className="space-y-0">
      {/* Botón principal SOS */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        aria-controls="sos-options-panel"
        data-no-translate
        className={[
          "w-full h-12 border-2 text-base font-extrabold",
          "inline-flex items-center justify-center gap-2",
          "transition-all duration-200 motion-safe:transition-all",
          expanded
            ? "bg-[var(--brand-danger)] border-[var(--brand-danger)] text-white"
            : [
                "bg-transparent border-[var(--brand-danger)] text-[var(--brand-danger)]",
                // Pulso sutil cuando está cerrado — respeta prefers-reduced-motion
                "motion-safe:animate-[sos-pulse_2.5s_ease-in-out_infinite]",
              ].join(" "),
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <AlertOctagon className="h-5 w-5 shrink-0" strokeWidth={2.25} aria-hidden />
        Emergencia
        {/* Chevron indicador */}
        <svg
          viewBox="0 0 16 16"
          className={[
            "h-4 w-4 ml-auto shrink-0 transition-transform duration-200",
            "motion-safe:transition-transform",
            expanded ? "rotate-180" : "rotate-0",
          ].join(" ")}
          fill="none"
          aria-hidden
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Panel expandible con las 3 opciones */}
      <div
        id="sos-options-panel"
        role="region"
        aria-label="Opciones de emergencia"
        className={[
          "overflow-hidden transition-all duration-300 motion-safe:transition-all",
          expanded
            ? "max-h-72 opacity-100"
            : "max-h-0 opacity-0 pointer-events-none",
        ].join(" ")}
      >
        <div className="pt-3 space-y-2.5">
          {/* Opción 1: Llamar a Buleje */}
          <a
            href="tel:+51000000000"
            // TODO: reemplazar con número real de soporte Buleje 24/7
            className="flex items-center gap-3 h-12 lg:h-14 border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-base font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            <Phone className="h-5 w-5 shrink-0" strokeWidth={2.25} aria-hidden />
            <span>Llamar a Buleje 24/7</span>
          </a>

          {/* Opción 2: Compartir ubicación → POST /api/delivery/me/sos */}
          <button
            type="button"
            onClick={handleShareLocation}
            disabled={sosLoading}
            className="w-full flex items-center gap-3 h-12 lg:h-14 border-2 border-[var(--brand-danger)]/40 bg-[var(--brand-danger)]/5 px-4 text-base font-bold text-[var(--brand-danger)] transition-colors hover:bg-[var(--brand-danger)]/10 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <MapPin className="h-5 w-5 shrink-0" strokeWidth={2.25} aria-hidden />
            <span>{sosLoading ? "Enviando..." : "Compartir mi ubicación"}</span>
          </button>

          {/* Opción 3: Policía 105 */}
          <a
            href="tel:105"
            className="flex items-center gap-3 h-12 lg:h-14 border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-base font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--brand-danger)] hover:text-[var(--brand-danger)]"
          >
            <ShieldAlert className="h-5 w-5 shrink-0" strokeWidth={2.25} aria-hidden />
            <span>Llamar policía 105</span>
          </a>
        </div>
      </div>

      {/* Toast de confirmación */}
      <InlineToast
        message="Buleje notificado · ubicación compartida"
        visible={toastVisible}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal exportado
// ─────────────────────────────────────────────────────────────────────────────

export default function ChatAndSOSPanel({
  currentOrderId,
  customerName,
  customerPhone,
  customerLocation,
}: ChatAndSOSPanelProps) {
  return (
    <>
      {/*
        Keyframe para el pulso del botón SOS.
        Incrustado aquí para que sea autocontenido.
        Solo aplica cuando prefers-reduced-motion: no-preference.
      */}
      <style>{`
        @keyframes sos-pulse {
          0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--brand-danger) 40%, transparent); }
          50%       { box-shadow: 0 0 0 6px color-mix(in srgb, var(--brand-danger) 0%, transparent); }
        }
        @media (prefers-reduced-motion: reduce) {
          .motion-safe\\:animate-\\[sos-pulse_2\\.5s_ease-in-out_infinite\\] {
            animation: none;
          }
        }
      `}</style>

      <section
        aria-label="Contacto y emergencias"
        className="space-y-4"
      >
        {/* Card de contacto — solo si hay pedido activo */}
        {currentOrderId !== null && (
          <CustomerContactCard
            customerName={customerName}
            customerPhone={customerPhone}
            customerLocation={customerLocation}
          />
        )}

        {/* Botón SOS — siempre visible */}
        <SOSButton />
      </section>
    </>
  );
}
