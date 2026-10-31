"use client";

/**
 * «Mi cuenta › Mis datos»: quién eres y adónde te llevamos, con un solo botón
 * para editar; debajo, el resto de lo tuyo (direcciones, pagos, cupones,
 * tarjetas de regalo, avisos, preferencias) como filas, no como mosaico.
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Bell,
  ChevronRight,
  CreditCard,
  Gift,
  LogOut,
  MapPin,
  Settings,
  Ticket,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { useCustomer } from "@/contexts/customer-context";
import { rutaCuenta } from "./cuenta-rutas";

// El editor de datos del cliente; en «Mi cuenta» no lo monta nadie más.
const CustomerModal = dynamic(() => import("@/components/CustomerModal"));

const LO_TUYO: Array<{ href: string; texto: string; Icono: LucideIcon }> = [
  { href: "/cuenta/direcciones", texto: "Mis direcciones", Icono: MapPin },
  { href: "/cuenta/pagos", texto: "Métodos de pago", Icono: CreditCard },
  { href: "/cuenta/cupones", texto: "Cupones", Icono: Ticket },
  { href: "/cuenta/gift-cards", texto: "Tarjetas de regalo", Icono: Gift },
  { href: "/cuenta/notificaciones", texto: "Avisos", Icono: Bell },
  { href: "/cuenta/preferencias", texto: "Preferencias", Icono: Settings },
];

const FILA =
  "flex min-h-12 items-center gap-3 px-4 text-base text-[var(--text-primary)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--surface-sunken)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]";

function celularLegible(tel: string | undefined): string | null {
  const d = (tel ?? "").replace(/\D/g, "").slice(-9);
  return d.length === 9 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : tel || null;
}

export function SeccionDatos({ base }: { base: string }) {
  const { customer, openModal, salir } = useCustomer();
  const activa = customer?.locations?.find((l) => l.id === customer.activeLocationId) ?? customer?.locations?.[0];
  const direccion = activa?.location || customer?.addressLine || customer?.location || null;

  return (
    <div className="flex flex-col gap-4">
      {customer && (
        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <CardTitle className="truncate">{customer.name}</CardTitle>
              {celularLegible(customer.phone) && (
                <p className="text-base tabular-nums text-[var(--text-secondary)]">{celularLegible(customer.phone)}</p>
              )}
              <p className="flex items-start gap-1.5 text-base text-[var(--text-secondary)]">
                <MapPin className="mt-1 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                <span className="line-clamp-2">{direccion || "Aún sin dirección de entrega"}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => openModal("profile")}
              className="inline-flex h-12 shrink-0 items-center rounded-xl border border-[var(--rule-base)] px-4 text-base font-semibold text-[var(--text-primary)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--surface-sunken)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              Editar
            </button>
          </div>
        </div>
      )}

      <nav aria-label="Lo demás de tu cuenta">
        <ul className="divide-y divide-[var(--rule-soft)] overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
          {LO_TUYO.map(({ href, texto, Icono }) => (
            <li key={href}>
              <Link href={rutaCuenta(base, href)} className={FILA}>
                <Icono className="h-5 w-5 shrink-0 text-[var(--accent)]" strokeWidth={1.9} aria-hidden="true" />
                <span className="flex-1">{texto}</span>
                <ChevronRight className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {customer && (
        <button
          type="button"
          onClick={() => {
            void salir().then(() => window.location.reload());
          }}
          className="inline-flex h-12 items-center gap-2 self-start rounded-xl px-1 text-base font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <LogOut className="h-5 w-5" aria-hidden="true" />
          Salir de mi cuenta
        </button>
      )}
      <CustomerModal />
    </div>
  );
}
