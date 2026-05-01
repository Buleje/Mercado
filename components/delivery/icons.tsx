/**
 * Iconos SVG branded para el flujo Delivery (Buleje).
 *
 * Reemplaza los Lucide genéricos (Bike, Truck, MapPin, Wifi…) en zonas hero/badges.
 * Para microcopy (12-16px) seguimos usando @buleje/design-system/icons.
 *
 * Reglas:
 *   - Geometría redondeada (rx=2, stroke-linejoin=round)
 *   - 2-tone (currentColor para outline, fill con --accent-soft)
 *   - Sin viewBox custom raros — todos 24x24 salvo ilustraciones grandes (96x96+)
 *   - className passthrough para tamaño/color
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

// ─────────────────────────────────────────────────────────────────────────
// Iconos pequeños (24×24) — usar en cards, headers, CTAs
// ─────────────────────────────────────────────────────────────────────────

export function MotoIcon({ className = "h-6 w-6", ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden {...rest}>
      <circle cx="5.5" cy="17" r="3.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="18.5" cy="17" r="3.5" stroke="currentColor" strokeWidth="2" />
      <path
        d="M9 17h6l-2-7h-3l-1-3h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M16 10l2.5 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="5.5" cy="17" r="1.2" fill="currentColor" />
      <circle cx="18.5" cy="17" r="1.2" fill="currentColor" />
    </svg>
  );
}

export function LiveSignal({ className = "h-3 w-3", active = true }: IconProps & { active?: boolean }) {
  return (
    <span className={`relative inline-flex ${className}`} aria-hidden>
      <span
        className={`absolute inset-0 rounded-full ${
          active ? "bg-[var(--data-success)]/40 animate-ping" : "bg-[var(--text-tertiary)]/0"
        }`}
      />
      <span
        className={`relative inline-block w-full h-full rounded-full ${
          active ? "bg-[var(--data-success)]" : "bg-[var(--text-tertiary)]"
        }`}
      />
    </span>
  );
}

export function PinIcon({ className = "h-6 w-6", ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden {...rest}>
      <path
        d="M12 2c-4.5 0-8 3.4-8 7.7 0 5.6 8 12.3 8 12.3s8-6.7 8-12.3C20 5.4 16.5 2 12 2z"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="9.5" r="2.5" fill="currentColor" />
    </svg>
  );
}

export function RouteIcon({ className = "h-6 w-6", ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden {...rest}>
      <circle cx="6" cy="5" r="2.5" fill="currentColor" />
      <circle cx="18" cy="19" r="2.5" stroke="currentColor" strokeWidth="2" />
      <path
        d="M6 7.5v3a3 3 0 003 3h6a3 3 0 013 3V16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="2 2.5"
      />
    </svg>
  );
}

export function CashIcon({ className = "h-6 w-6", ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden {...rest}>
      <rect
        x="2.5"
        y="6"
        width="19"
        height="12"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="2"
        fill="currentColor"
        fillOpacity="0.08"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path d="M5.5 9.5v.01M18.5 14.5v.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function TipIcon({ className = "h-6 w-6", ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden {...rest}>
      <path
        d="M12 3l2.5 5 5.5.8-4 4 1 5.5L12 15.7 6 18.3l1-5.5-4-4 5.5-.8L12 3z"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PackageIcon({ className = "h-6 w-6", ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden {...rest}>
      <path
        d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5v-9z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.08"
      />
      <path d="M3.5 7.5L12 12m0 0l8.5-4.5M12 12v9" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function CheckBadge({ className = "h-6 w-6", ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden {...rest}>
      <path
        d="M12 2l2.4 1.7 2.9-.5 1.4 2.6 2.6 1.4-.5 2.9L22 12l-1.7 2.4.5 2.9-2.6 1.4-1.4 2.6-2.9-.5L12 22l-2.4-1.7-2.9.5-1.4-2.6-2.6-1.4.5-2.9L2 12l1.7-2.4-.5-2.9 2.6-1.4 1.4-2.6 2.9.5L12 2z"
        fill="currentColor"
        fillOpacity="0.12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StarBadge({ className = "h-5 w-5", ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden {...rest}>
      <path d="M12 2.5l3 6.1 6.7 1-4.9 4.7 1.2 6.7L12 17.8l-6 3.2 1.2-6.7L2.3 9.6l6.7-1L12 2.5z" />
    </svg>
  );
}

export function TimerIcon({ className = "h-6 w-6", ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden {...rest}>
      <circle cx="12" cy="13" r="8" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.08" />
      <path d="M12 9v4l2.5 2.5M9 3h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function PhoneRing({ className = "h-5 w-5", ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden {...rest}>
      <path
        d="M5.5 4.5h3l1.5 4-2 1.5a11 11 0 005.5 5.5l1.5-2 4 1.5v3a2 2 0 01-2 2A14 14 0 013.5 6.5a2 2 0 012-2z"
        fill="currentColor"
        fillOpacity="0.12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function WhatsAppIcon({ className = "h-5 w-5", ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden {...rest}>
      <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9s-.5-.1-.7.2-.8.9-1 1.1c-.2.2-.4.2-.7.1a8.2 8.2 0 01-2.4-1.5 9 9 0 01-1.7-2c-.2-.3 0-.5.1-.6l.5-.6.3-.5c.1-.2 0-.4 0-.5l-1-2.3c-.2-.5-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1.1 1-1.1 2.6s1.2 3 1.3 3.2A9.5 9.5 0 0012.6 17c.7.3 1.3.5 1.8.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.2-.6.2-1.2.2-1.4-.1-.1-.3-.2-.6-.4zM12 2.5a9.5 9.5 0 00-8.2 14.3l-1.3 4.7 4.8-1.2A9.5 9.5 0 1012 2.5z" />
    </svg>
  );
}

export function MapBadge({ className = "h-6 w-6", ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden {...rest}>
      <path
        d="M3 6.5L9 4l6 2.5 6-2.5v13L15 19.5 9 17l-6 2.5v-13z"
        fill="currentColor"
        fillOpacity="0.12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M9 4v13M15 6.5v13" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function BiciIcon({ className = "h-6 w-6", ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden {...rest}>
      <circle cx="5" cy="17" r="3.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="19" cy="17" r="3.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="17" r="1.2" fill="currentColor" />
      <path
        d="M5 17l4-7h6l4 7M9 10L7 6h-2M15 10h-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CarIcon({ className = "h-6 w-6", ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden {...rest}>
      <path
        d="M4 13l1.6-4.5A2 2 0 017.5 7h9a2 2 0 011.9 1.5L20 13v5a1 1 0 01-1 1h-1.5a1 1 0 01-1-1v-1H7.5v1a1 1 0 01-1 1H5a1 1 0 01-1-1v-5z"
        fill="currentColor"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="7.5" cy="14.5" r="1.2" fill="currentColor" />
      <circle cx="16.5" cy="14.5" r="1.2" fill="currentColor" />
      <path d="M5.5 13h13" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function WalkIcon({ className = "h-6 w-6", ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden {...rest}>
      <circle cx="13" cy="4.5" r="2" fill="currentColor" />
      <path
        d="M11 9l-2 5 2.5 1.5L13 21M13 9l3 4-1 4M9 12l-2 4M16 12l3 1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ClockBadge({ className = "h-6 w-6", ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden {...rest}>
      <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ShieldBadge({ className = "h-6 w-6", ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden {...rest}>
      <path
        d="M12 2.5l8 3v6c0 5-3.5 9.5-8 10.5-4.5-1-8-5.5-8-10.5v-6l8-3z"
        fill="currentColor"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M8.5 12l2.5 2.5L16 9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CalendarIcon({ className = "h-6 w-6", ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden {...rest}>
      <rect x="3" y="5" width="18" height="16" rx="2.5" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeWidth="2" />
      <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="8" cy="14.5" r="1.2" fill="currentColor" />
      <circle cx="12" cy="14.5" r="1.2" fill="currentColor" />
      <circle cx="16" cy="14.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

export function TrendIcon({ className = "h-6 w-6", ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden {...rest}>
      <path
        d="M3 17l5-5 4 4 8-8"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 8h6v6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Ilustraciones grandes (hero/empty states)
// ─────────────────────────────────────────────────────────────────────────

export function EmptyRoadIllustration({ className = "h-40 w-40" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 160" fill="none" className={className} aria-hidden>
      {/* Suelo */}
      <ellipse cx="100" cy="140" rx="80" ry="8" fill="currentColor" opacity="0.08" />
      {/* Camino */}
      <path
        d="M40 130 Q80 80 100 90 Q120 100 160 60"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="4 6"
        opacity="0.4"
      />
      {/* Pin destino */}
      <g transform="translate(150 30)">
        <path
          d="M10 0c-6 0-10 4.5-10 10 0 7 10 16 10 16s10-9 10-16c0-5.5-4-10-10-10z"
          fill="currentColor"
        />
        <circle cx="10" cy="10" r="4" fill="white" />
      </g>
      {/* Moto stylized */}
      <g transform="translate(50 90)">
        <circle cx="10" cy="30" r="10" stroke="currentColor" strokeWidth="3" />
        <circle cx="40" cy="30" r="10" stroke="currentColor" strokeWidth="3" />
        <path
          d="M16 30h12l-3-12h-5l-2-5h6"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="10" cy="30" r="3" fill="currentColor" />
        <circle cx="40" cy="30" r="3" fill="currentColor" />
      </g>
    </svg>
  );
}

export function HeroDeliveryIllustration({ className = "h-48 w-48" }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 200" fill="none" className={className} aria-hidden>
      {/* Glow / fondo radial */}
      <circle cx="120" cy="100" r="80" fill="currentColor" opacity="0.06" />
      <circle cx="120" cy="100" r="55" fill="currentColor" opacity="0.1" />
      {/* Casco */}
      <g transform="translate(80 35)">
        <path
          d="M0 30 Q0 0 40 0 Q80 0 80 30 L80 50 L0 50 Z"
          fill="currentColor"
          opacity="0.85"
        />
        <rect x="14" y="25" width="52" height="14" rx="3" fill="white" opacity="0.85" />
        <path d="M0 50 L80 50" stroke="white" strokeWidth="2" />
      </g>
      {/* Moto base */}
      <g transform="translate(45 110)">
        <circle cx="20" cy="40" r="18" stroke="currentColor" strokeWidth="4" fill="white" fillOpacity="0.6" />
        <circle cx="120" cy="40" r="18" stroke="currentColor" strokeWidth="4" fill="white" fillOpacity="0.6" />
        <circle cx="20" cy="40" r="6" fill="currentColor" />
        <circle cx="120" cy="40" r="6" fill="currentColor" />
        <path
          d="M35 40h60l-12-22h-18l-6-10h12"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="currentColor"
          fillOpacity="0.15"
        />
        <rect x="80" y="6" width="24" height="20" rx="3" fill="currentColor" />
        <rect x="84" y="10" width="16" height="3" fill="white" opacity="0.6" />
      </g>
    </svg>
  );
}
