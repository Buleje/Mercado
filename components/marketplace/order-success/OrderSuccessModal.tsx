"use client";

/**
 * OrderSuccessModal — modal de confirmación de pedido realizado.
 *
 * Contenido:
 *   1. Hero con animación paiche celebración y total.
 *   2. Mapa Leaflet centrado en la dirección de entrega.
 *   3. Lista de items con imágenes, cantidades y subtotales.
 *   4. Datos del cliente (nombre + WhatsApp) y dirección.
 *   5. CTAs: "Seguir comprando" (cierra modal) y "Llamar al repartidor".
 *   6. Botón minimizar — esconde el modal pero mantiene el badge en el nav.
 *
 * Animación de entrada: fade + slide-up del card. Hero con bounce paiche.
 */

import { useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import {
  X,
  Minus,
  ShoppingBag,
  Phone,
} from "@buleje/design-system/icons";
import {
  CheckBadge,
  PinIcon,
  CashIcon,
  WhatsAppIcon,
  PhoneRing,
  PackageIcon,
  HeroDeliveryIllustration,
} from "@/components/delivery/icons";
import { useLastOrder } from "@/contexts/last-order-context";

const OrderLocationMap = dynamic(() => import("./OrderLocationMap"), {
  ssr: false,
});

export default function OrderSuccessModal() {
  const { order, modalOpen, closeModal, clear } = useLastOrder();

  // ESC para cerrar
  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen, closeModal]);

  // Bloquear scroll body cuando abierto
  useEffect(() => {
    if (!modalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [modalOpen]);

  if (!modalOpen || !order) return null;

  const itemsCount = order.items.reduce((acc, i) => acc + i.quantity, 0);
  const cleanPhone = order.customer.phone.replace(/\D/g, "");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-success-title"
      className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-8"
    >
      {/* Backdrop */}
      <button
        type="button"
        onClick={closeModal}
        aria-label="Minimizar"
        className="absolute inset-0 bg-black/55 backdrop-blur-sm animate-in fade-in duration-300"
      />

      {/* Card */}
      <div
        className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl bg-[var(--surface-canvas)] shadow-2xl border border-[var(--rule-base)] animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-300"
      >
        {/* ── Hero celebración ────────────────────────────── */}
        <header className="relative overflow-hidden rounded-t-3xl bg-gradient-to-br from-[var(--accent)] to-[var(--brand-primary-light)] text-white px-6 py-7 sm:px-8">
          <div className="absolute -top-16 -right-12 h-64 w-64 rounded-full bg-white/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-white/5 blur-3xl pointer-events-none" />

          <div className="relative flex items-start justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-2 h-7 px-2.5 rounded-full bg-white/20 backdrop-blur text-xs font-extrabold uppercase tracking-wider">
                Pedido confirmado
              </span>
              <h2
                id="order-success-title"
                className="mt-3 text-2xl sm:text-3xl font-extrabold leading-tight"
              >
                ¡Listo, {order.customer.name.split(" ")[0]}!
              </h2>
              <p className="mt-1 text-sm sm:text-base text-white/90 max-w-md">
                {order.storeNames.length === 1
                  ? `${order.storeNames[0]} te contacta por WhatsApp en minutos.`
                  : `${order.storeNames.length} tiendas te contactan por WhatsApp en minutos.`}
              </p>
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              <button
                type="button"
                onClick={closeModal}
                aria-label="Minimizar y volver al ícono del nav"
                title="Minimizar"
                className="h-9 w-9 rounded-xl bg-white/15 backdrop-blur text-white flex items-center justify-center hover:bg-white/25 transition-colors"
              >
                <Minus className="h-4 w-4" strokeWidth={2.5} />
              </button>
              <button
                type="button"
                onClick={clear}
                aria-label="Cerrar y descartar"
                title="Cerrar"
                className="h-9 w-9 rounded-xl bg-white/10 backdrop-blur text-white/80 flex items-center justify-center hover:bg-white/20 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>
          </div>

          <div className="relative mt-5 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wider text-white/80">
                Total pagado
              </p>
              <p className="text-3xl sm:text-4xl font-extrabold tabular-nums leading-none">
                S/ {Number(order.total).toFixed(2)}
              </p>
              <p className="mt-1 text-sm font-semibold text-white/85">
                {itemsCount} producto{itemsCount === 1 ? "" : "s"} ·{" "}
                {order.orderIds.length === 1 ? "Pedido" : `${order.orderIds.length} pedidos`}{" "}
                #{order.orderIds[0]?.toString().slice(-6) ?? "—"}
              </p>
            </div>
            <div className="hidden sm:block text-white/85 -mb-2">
              <HeroDeliveryIllustration className="h-24 w-auto" />
            </div>
          </div>
        </header>

        {/* ── Mapa ────────────────────────────────────────── */}
        <section className="px-5 py-5 sm:px-7 border-b border-[var(--rule-base)]">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-8 w-8 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center">
              <PinIcon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                Dirección de entrega
              </p>
              <p className="text-sm font-bold text-[var(--text-primary)]">
                {order.address.line}
                {order.address.district && (
                  <span className="font-normal text-[var(--text-secondary)]">
                    {" · "}
                    {order.address.district}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="h-56 w-full rounded-2xl overflow-hidden border border-[var(--rule-base)]">
            <OrderLocationMap
              address={order.address.line}
              district={order.address.district}
              className="h-full w-full"
            />
          </div>
          {order.address.notes && (
            <p className="mt-2 text-xs text-[var(--text-tertiary)]">
              <span className="font-bold text-[var(--text-secondary)]">Referencia:</span>{" "}
              {order.address.notes}
            </p>
          )}
        </section>

        {/* ── Items ───────────────────────────────────────── */}
        <section className="px-5 py-5 sm:px-7 border-b border-[var(--rule-base)]">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-8 w-8 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center">
              <PackageIcon className="h-4 w-4" />
            </div>
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
              Tu pedido ({itemsCount} producto{itemsCount === 1 ? "" : "s"})
            </h3>
          </div>
          <ul className="space-y-2.5">
            {order.items.map((item, idx) => (
              <li
                key={`${item.productId}-${idx}`}
                className="flex items-center gap-3 rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-base)] p-2.5 sm:p-3"
              >
                <div className="h-14 w-14 rounded-xl bg-[var(--surface-sunken)] overflow-hidden flex items-center justify-center shrink-0 relative">
                  {item.imageUrl ? (
                    <Image
                      src={item.imageUrl}
                      alt={item.name}
                      fill
                      className="object-cover"
                      sizes="56px"
                      unoptimized
                    />
                  ) : (
                    <ShoppingBag className="h-6 w-6 text-[var(--text-tertiary)]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm sm:text-base font-extrabold text-[var(--text-primary)] truncate">
                    {item.name}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    {item.storeName} · {item.quantity} × S/ {Number(item.price).toFixed(2)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm sm:text-base font-extrabold text-[var(--text-primary)] tabular-nums">
                    S/ {(item.quantity * item.price).toFixed(2)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Cliente + footer ────────────────────────────── */}
        <section className="px-5 py-5 sm:px-7">
          <div className="rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/30 p-4 mb-4">
            <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--accent)] mb-1">
              Datos de contacto
            </p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-base font-extrabold text-[var(--text-primary)]">
                  {order.customer.name}
                </p>
                <p className="text-sm text-[var(--text-secondary)] flex items-center gap-1.5">
                  <PhoneRing className="h-3.5 w-3.5" />
                  {order.customer.phone}
                </p>
              </div>
              <div className="flex gap-1.5">
                <a
                  href={`tel:${order.customer.phone}`}
                  className="h-9 w-9 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
                  aria-label="Llamar"
                >
                  <Phone className="h-4 w-4" />
                </a>
                <a
                  href={`https://wa.me/51${cleanPhone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 px-3 rounded-lg bg-[var(--data-success-500)] text-white flex items-center gap-1.5 text-sm font-bold"
                >
                  <WhatsAppIcon className="h-4 w-4" />
                  WhatsApp
                </a>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={closeModal}
              className="flex-1 h-12 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-extrabold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] inline-flex items-center justify-center gap-2"
            >
              <Minus className="h-4 w-4" strokeWidth={2.5} />
              Minimizar
            </button>
            <Link
              href="/tiendas"
              onClick={closeModal}
              className="flex-1 h-12 rounded-2xl bg-[var(--accent)] text-base font-extrabold text-white hover:opacity-90 inline-flex items-center justify-center gap-2 shadow-lg shadow-[var(--accent)]/25"
            >
              <ShoppingBag className="h-4 w-4" />
              Seguir comprando
            </Link>
          </div>
          <p className="mt-3 text-center text-xs text-[var(--text-tertiary)]">
            Total con IGV. Tu repartidor te contacta vía WhatsApp para coordinar la entrega.
          </p>
        </section>
      </div>
    </div>
  );
}
