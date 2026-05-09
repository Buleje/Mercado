/**
 * StoreInfoCard — card lateral con datos de contacto y ubicación.
 *
 * Kicker "INFORMACIÓN" + filas de datos con iconos Lucide grises.
 * Mapa placeholder con ilustración MapaUcayaliAutentico.
 * Sin saturación, sin emojis, dark-mode completo.
 */

import { MapPin, Clock, MessageCircle, Phone, Instagram } from "lucide-react";
import { MapaUcayaliAutentico } from "@/components/ui-system/illustrations";

interface StoreInfoCardProps {
  address?: string | null;
  schedule?: string | null;
  whatsappNumber?: string | null;
  phone?: string | null;
  instagram?: string | null;
  zone?: string | null;
}

interface InfoRowProps {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}

function InfoRow({ icon, label, children }: InfoRowProps) {
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden
        className="mt-0.5 flex-shrink-0 text-[var(--text-tertiary)] dark:text-gray-500"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-widest text-[var(--text-tertiary)] dark:text-gray-500 mb-0.5">
          {label}
        </p>
        <div className="text-sm text-[var(--text-primary)] dark:text-gray-300">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function StoreInfoCard({
  address,
  schedule,
  whatsappNumber,
  phone,
  instagram,
  zone,
}: StoreInfoCardProps) {
  const waLink = whatsappNumber
    ? `https://wa.me/51${whatsappNumber.replace(/\D/g, "")}`
    : null;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 space-y-6">
      {/* Kicker */}
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] dark:text-gray-500">
        Información
      </p>

      {/* Data rows */}
      <div className="space-y-5">
        {address && (
          <InfoRow
            icon={<MapPin className="h-4 w-4" />}
            label="Dirección"
          >
            {address}
          </InfoRow>
        )}

        {schedule && (
          <InfoRow
            icon={<Clock className="h-4 w-4" />}
            label="Horarios"
          >
            {schedule}
          </InfoRow>
        )}

        {whatsappNumber && waLink && (
          <InfoRow
            icon={<MessageCircle className="h-4 w-4" />}
            label="WhatsApp"
          >
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[var(--text-primary)] dark:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gray-400"
            >
              {whatsappNumber}
            </a>
          </InfoRow>
        )}

        {phone && (
          <InfoRow
            icon={<Phone className="h-4 w-4" />}
            label="Teléfono"
          >
            <a
              href={`tel:${phone.replace(/\D/g, "")}`}
              className="font-medium text-[var(--text-primary)] dark:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gray-400"
            >
              {phone}
            </a>
          </InfoRow>
        )}

        {instagram && (
          <InfoRow
            icon={<Instagram className="h-4 w-4" />}
            label="Instagram"
          >
            <a
              href={`https://instagram.com/${instagram.replace("@", "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[var(--text-primary)] dark:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gray-400"
            >
              {instagram.startsWith("@") ? instagram : `@${instagram}`}
            </a>
          </InfoRow>
        )}
      </div>

      {/* Mapa placeholder */}
      <div className="mt-2 rounded-lg border border-gray-100 dark:border-gray-800 bg-[var(--surface-alt)] dark:bg-gray-800/60 p-4 flex flex-col items-center gap-3">
        <div className="text-[var(--text-secondary)] dark:text-gray-400">
          <MapaUcayaliAutentico size={100} strokeWidth={1.5} />
        </div>
        <p className="text-xs text-[var(--text-secondary)] dark:text-gray-400 text-center">
          {zone ?? "Pucallpa"}, Ucayali
        </p>
        <a
          href={`https://www.google.com/maps/search/${encodeURIComponent(address ?? zone ?? "Pucallpa")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-[var(--text-secondary)] dark:text-gray-400 underline underline-offset-2 hover:text-[var(--text-primary)] dark:hover:text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gray-400"
        >
          Ver en mapa
        </a>
      </div>
    </div>
  );
}
