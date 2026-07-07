/**
 * StoreInfoPanel — card lateral rica con TODA la info que el cliente
 * necesita para decidir comprar: ubicación con mini-mapa, horario actual
 * (abierto/cerrado), métodos de pago, tiempo de delivery, contacto rápido,
 * sello "delivery gratis" cuando aplica.
 *
 * Reemplaza tanto la ilustración del hero como la columna lateral
 * StoreInfoCard del bloque "Sobre la tienda" — el cliente entra y ve
 * todo lo importante en una sola vista.
 *
 * Sin emojis, sin saturación. Estilo Holded/Buleje.
 */

import Link from "next/link";
import {
  MapPin,
  Clock,
  MessageCircle,
  Truck,
  Star,
  CheckCircle2,
  Wallet,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { PaymentMethodIcon } from "@/components/marketplace/PaymentIcons";

interface StoreInfoPanelProps {
  name: string;
  zone?: string | null;
  address?: string | null;
  scheduleLabel?: string;
  isOpen?: boolean;
  rating: number;
  reviewCount: number;
  deliveryMin: number;
  freeDelivery?: boolean;
  whatsappNumber?: string | null;
  paymentMethods?: string[]; // ["yape", "efectivo", "plin", ...]
  /** Fiado Digital — la tienda acepta "compra ahora, paga después". Diferenciador
   *  Buleje; se muestra igual que el badge de /tiendas para que sea consistente. */
  acceptsFiado?: boolean;
}

const PAYMENT_LABELS: Record<string, string> = {
  yape: "Yape",
  plin: "Plin",
  efectivo: "Efectivo",
  card: "Tarjeta",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
};

export default function StoreInfoPanel({
  name,
  zone,
  address,
  scheduleLabel = "Lun a Dom · 6am – 11pm",
  isOpen = true,
  rating,
  reviewCount,
  deliveryMin,
  freeDelivery = true,
  whatsappNumber,
  paymentMethods = ["yape", "efectivo"],
  acceptsFiado = false,
}: StoreInfoPanelProps) {
  const ratingLabel = rating > 0 ? rating.toFixed(1) : null;
  const mapsHref = `https://www.google.com/maps/search/${encodeURIComponent(
    address ?? `${name} ${zone ?? "Ciudad Constitución"}`,
  )}`;
  const waLink = whatsappNumber
    ? `https://wa.me/51${whatsappNumber.replace(/\D/g, "")}`
    : null;

  return (
    <aside
      aria-label={`Información de ${name}`}
      className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden flex flex-col"
    >
      {/* ── Mini mapa SVG decorativo + status ────────────────────────────── */}
      <Link
        href={mapsHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Ver ubicación de ${name} en Google Maps`}
        className="relative block h-32 group/map overflow-hidden"
      >
        <MapPattern />
        {/* Pin con accent */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-600,var(--accent))] text-white shadow-lg ring-4 ring-white/85 dark:ring-gray-950/85 transition-transform duration-300 group-hover/map:scale-110">
            <MapPin className="h-5 w-5" strokeWidth={2.25} aria-hidden />
          </span>
        </div>
        {/* Status pill */}
        <div className="absolute top-3 left-3">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-black uppercase tracking-[var(--ls-wider)] backdrop-blur-sm border",
              isOpen
                ? "bg-[var(--data-success-500)]/95 border-emerald-300/40 text-white"
                : "bg-gray-900/80 border-white/20 text-white",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                isOpen ? "bg-white animate-pulse" : "bg-gray-400",
              )}
            />
            {isOpen ? "Abierto ahora" : "Cerrado"}
          </span>
        </div>
        {/* "Ver mapa" hint bottom-right */}
        <div className="absolute bottom-2 right-3 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)] inline-flex items-center gap-1 opacity-0 group-hover/map:opacity-100 transition-opacity">
          Ver mapa
        </div>
      </Link>

      {/* ── Datos compactos en grid 2 col ─────────────────────────────────── */}
      <div className="p-4 space-y-3">
        {/* Rating + Reseñas */}
        {ratingLabel && (
          <div className="flex items-center justify-between border-b border-[var(--rule-soft)] pb-3">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Calificación
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5 fill-[var(--accent)] text-[var(--accent)]" aria-hidden />
              <span className="text-base font-black tabular-nums text-[var(--text-primary)]">
                {ratingLabel}
              </span>
              <span className="text-[length:var(--ts-2xs)] font-medium text-[var(--text-tertiary)]">
                ({reviewCount} reseñas)
              </span>
            </span>
          </div>
        )}

        {/* Delivery + Tiempo */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1 inline-flex items-center gap-1">
              <Truck className="h-3 w-3" aria-hidden />
              Delivery
            </p>
            <p className="text-sm font-bold text-[var(--text-primary)] tabular-nums">
              {Math.max(15, deliveryMin - 10)}–{deliveryMin + 5} min
            </p>
            {freeDelivery && (
              <span className="inline-flex items-center gap-1 mt-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-600)] dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" aria-hidden />
                Gratis
              </span>
            )}
          </div>
          <div>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1 inline-flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden />
              Horario
            </p>
            <p className="text-sm font-bold text-[var(--text-primary)] leading-tight">
              {scheduleLabel}
            </p>
          </div>
        </div>

        {/* Ubicación */}
        <div className="border-t border-[var(--rule-soft)] pt-3">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1 inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" aria-hidden />
            Ubicación
          </p>
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {address ?? zone ?? "Ciudad Constitución, Pasco"}
          </p>
          <Link
            href={mapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-1 text-[length:var(--ts-xs)] font-bold text-[var(--accent)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]"
          >
            Ver en Google Maps →
          </Link>
        </div>

        {/* Métodos de pago */}
        <div className="border-t border-[var(--rule-soft)] pt-3">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2 inline-flex items-center gap-1">
            <Wallet className="h-3 w-3" aria-hidden />
            Métodos de pago
          </p>
          <div className="flex flex-wrap gap-1.5">
            {paymentMethods.map((m) => (
              <span
                key={m}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rule-base)] bg-[var(--surface-canvas)] py-0.5 pl-1 pr-2.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]"
              >
                <PaymentMethodIcon method={m} size={18} title={PAYMENT_LABELS[m] ?? m} />
                {PAYMENT_LABELS[m] ?? m}
              </span>
            ))}
          </div>
        </div>

        {/* Fiado Digital — diferenciador Buleje. Se muestra igual que en /tiendas
            (chip teal "compra ahora, paga después") para que el cliente lo vea
            también en la página de la tienda, no solo en el directorio. */}
        {acceptsFiado && (
          <div className="border-t border-[var(--rule-soft)] pt-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[length:var(--ts-xs)] font-bold text-[var(--accent)]">
              <Wallet className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
              Acepta fiado
            </span>
            <p className="mt-1.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
              Compra ahora y paga después con crédito de barrio.
            </p>
          </div>
        )}
      </div>

      {/* ── CTA contacto ────────────────────────────────────────────────── */}
      {waLink && (
        <Link
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 bg-[var(--text-primary)] text-[var(--surface-canvas)] py-3 text-sm font-bold hover:bg-[var(--accent)] active:scale-[0.99] transition-colors"
        >
          <MessageCircle className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          Escribir por WhatsApp
        </Link>
      )}
    </aside>
  );
}

/**
 * MapPattern — fondo SVG decorativo simulando calles. Sin imágenes,
 * carga instantánea, escala al container.
 */
function MapPattern() {
  return (
    <div
      className="absolute inset-0"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in oklch, var(--accent) 10%, var(--surface-canvas)) 0%, var(--surface-sunken) 100%)",
      }}
      aria-hidden
    >
      <svg className="absolute inset-0 h-full w-full opacity-40">
        <defs>
          <pattern id="store-info-streets" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
            <path
              d="M 0 20 L 40 20 M 20 0 L 20 40"
              stroke="currentColor"
              strokeOpacity="0.15"
              strokeWidth="1"
              fill="none"
            />
            <path
              d="M 0 8 L 40 8 M 8 0 L 8 40"
              stroke="currentColor"
              strokeOpacity="0.08"
              strokeWidth="0.5"
              fill="none"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#store-info-streets)" className="text-[var(--text-secondary)]" />
        {/* Diagonal accent rivers */}
        <path
          d="M 0 100 Q 80 60 200 80 T 400 60"
          stroke="var(--accent)"
          strokeOpacity="0.25"
          strokeWidth="2"
          fill="none"
        />
      </svg>
    </div>
  );
}
