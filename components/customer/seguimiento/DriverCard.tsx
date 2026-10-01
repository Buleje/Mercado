"use client";

/**
 * DriverCard — Card del repartidor estilo Amazon Flex / UberEats.
 *
 * Avatar (iniciales), nombre, teléfono (botón WhatsApp + llamada),
 * vehículo (tipo + placa), rating y total de entregas.
 */
import { Phone, MessageCircle, Star, Bike } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { TrackingDriver } from "@/lib/db/order-tracking.db";

interface Props {
  driver: TrackingDriver | null;
  className?: string;
  /** En vista pública ocultamos el phone. */
  hidePhone?: boolean;
}

function formatPhone(phone: string): string {
  // Normalizar +51 987 654 321
  return phone.replace(/\s+/g, " ").trim();
}

function phoneDigitsForWa(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  // +51987654321 → 51987654321
  return digits.startsWith("51") ? digits : `51${digits}`;
}

export function DriverCard({ driver, hidePhone = false, className }: Props) {
  if (!driver) {
    return (
      <section
        className={cn(
          "border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 text-base text-muted",
          className,
        )}
      >
        Aún no asignamos un repartidor. Te avisaremos cuando salga con tu pedido.
      </section>
    );
  }

  const phoneLabel = formatPhone(driver.phone);
  const waPhone = phoneDigitsForWa(driver.phone);

  return (
    <section
      aria-labelledby="tracking-driver-heading"
      className={cn(
        "border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-6",
        className,
      )}
    >
      <div className="mb-4">
        <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-muted">
          Tu repartidor
        </span>
        <h2
          id="tracking-driver-heading"
          className="text-base sm:text-lg font-extrabold tracking-tight text-[var(--text-primary)] mt-0.5"
        >
          {driver.name}
        </h2>
      </div>

      <div className="flex items-center gap-4">
        <div
          className="relative h-14 w-14 sm:h-16 sm:w-16 shrink-0 bg-primary/10 border-2 border-primary/20 flex items-center justify-center"
          aria-hidden
        >
          <span className="text-lg sm:text-xl font-extrabold text-primary tracking-tight">
            {driver.avatarInitials}
          </span>
          <span className="absolute -bottom-1 -right-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-raised)] border border-[var(--rule-base)]">
            <Bike className="h-3 w-3 text-[var(--text-primary)]" strokeWidth={2} />
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
            {driver.vehicle}
          </p>
          <div className="flex items-center gap-3 mt-1 text-[length:var(--ts-2xs)] text-muted">
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Star className="h-3 w-3 text-[var(--data-warning-500)] fill-[var(--data-warning-500)]" />
              <strong className="text-[var(--text-primary)]">{Number(driver.rating).toFixed(1)}</strong>
              <span>de {driver.totalDeliveries} entregas</span>
            </span>
          </div>
        </div>
      </div>

      {!hidePhone && (
        <div className="mt-5 grid grid-cols-2 gap-2">
          <a
            href={`tel:${driver.phone.replace(/\s+/g, "")}`}
            className="inline-flex items-center justify-center gap-2 h-11 border-2 border-[var(--rule-base)] hover:border-[var(--accent)] text-sm font-bold text-[var(--text-primary)] transition-colors"
          >
            <Phone className="h-4 w-4" strokeWidth={1.75} />
            Llamar
          </a>
          <a
            href={`https://wa.me/${waPhone}?text=${encodeURIComponent("Hola, soy del pedido que estás entregando.")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 h-11 bg-[#25D366] hover:bg-[#1ebe5a] text-sm font-bold text-white transition-colors"
          >
            <MessageCircle className="h-4 w-4" strokeWidth={1.75} />
            WhatsApp
          </a>
        </div>
      )}

      {!hidePhone && (
        <p className="mt-3 text-[length:var(--ts-2xs)] text-muted">
          Puedes contactarlo al{" "}
          <span className="tabular-nums font-semibold text-[var(--text-primary)]">
            {phoneLabel}
          </span>
        </p>
      )}
    </section>
  );
}
