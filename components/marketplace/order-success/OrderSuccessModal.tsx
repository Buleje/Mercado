"use client";

/**
 * OrderSuccessModal — modal de confirmación de pedido realizado.
 *
 * Rediseño Brandon 2026-06-08: más ancho (max-w-4xl) y compacto en 2 columnas
 * en desktop (mapa | resumen). Sin botones de "minimizar" (ni el "-" de arriba
 * ni el de abajo): solo X para cerrar. El mapa tiene un botón "Ampliar" que lo
 * abre a pantalla completa.
 *
 * Contenido:
 *   1. Hero compacto: check badge + título + subtítulo.
 *   2. Columna izquierda: mapa Leaflet (con "Ampliar") + dirección + referencia.
 *   3. Columna derecha: total, items y contacto (llamar / WhatsApp).
 *   4. CTA único abajo: "Seguir comprando".
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import {
  X,
  Maximize2,
  ShoppingBag,
  Phone,
} from "@buleje/design-system/icons";
import {
  CheckBadge,
  PinIcon,
  WhatsAppIcon,
  PhoneRing,
} from "@/components/delivery/icons";
import { useLastOrder } from "@/contexts/last-order-context";

const OrderLocationMap = dynamic(() => import("./OrderLocationMap"), {
  ssr: false,
});

export default function OrderSuccessModal() {
  const { order, modalOpen, closeModal, clear } = useLastOrder();
  const [mapExpanded, setMapExpanded] = useState(false);

  // ESC: cierra primero el mapa ampliado; si no, cierra el modal.
  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (mapExpanded) setMapExpanded(false);
      else closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen, mapExpanded, closeModal]);

  // Cerrar el mapa ampliado cuando el modal se cierra.
  useEffect(() => {
    if (!modalOpen) setMapExpanded(false);
  }, [modalOpen]);

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

  // Stores únicas del pedido (slug + name) — para el marker de origen del mapa.
  const uniqueStores = Array.from(
    new Map(order.items.map((i) => [i.storeSlug, { slug: i.storeSlug, name: i.storeName }])).values(),
  );

  const mapAddress = {
    line: order.address.line,
    district: order.address.district,
    province: order.address.province,
    department: order.address.department,
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-success-title"
      className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:px-4 sm:py-8"
    >
      {/* Backdrop */}
      <button
        type="button"
        onClick={closeModal}
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/55 animate-in fade-in duration-300"
      />

      {/* Card — más ancha (max-w-4xl) + 2 columnas en desktop. */}
      <div className="relative w-full sm:max-w-4xl max-h-[94vh] sm:max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-[var(--surface-canvas)] shadow-[var(--shadow-lg)] sm:border sm:border-[var(--rule-base)] overflow-hidden animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
        {/* Grab handle — solo mobile */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <span aria-hidden className="h-1.5 w-10 rounded-full bg-[var(--rule-base)]" />
        </div>

        {/* ── Hero compacto + X (única acción) ────────────────── */}
        <header className="relative shrink-0 px-5 sm:px-7 pt-4 pb-4 border-b border-[var(--rule-soft)]">
          <button
            type="button"
            onClick={closeModal}
            aria-label="Cerrar"
            title="Cerrar"
            className="absolute right-3.5 top-3 h-9 w-9 rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] flex items-center justify-center hover:bg-[var(--rule-base)] active:scale-95 transition-all"
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
          </button>

          <div className="flex items-start gap-3.5 pr-12">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
              <CheckBadge className="h-7 w-7" />
            </span>
            <div className="min-w-0">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] leading-tight">
                Pedido confirmado
              </p>
              <h2
                id="order-success-title"
                className="text-xl sm:text-2xl font-black tracking-tight text-[var(--text-primary)] leading-tight mt-0.5"
              >
                ¡Listo, {order.customer.name.split(" ")[0]}!
              </h2>
              <p className="mt-1 text-[length:var(--ts-sm)] text-[var(--text-secondary)] leading-snug">
                {order.storeNames.length === 1
                  ? `${order.storeNames[0]} te escribe por WhatsApp en minutos.`
                  : `${order.storeNames.length} tiendas te escriben por WhatsApp en minutos.`}
              </p>
            </div>
          </div>
        </header>

        {/* ── Cuerpo: 2 columnas en sm+ (mapa | resumen) ───────── */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="sm:grid sm:grid-cols-[1.05fr_1fr] sm:divide-x sm:divide-[var(--rule-soft)]">
            {/* ── Columna izquierda: mapa + dirección ──────────── */}
            <section className="px-5 sm:px-6 py-4 sm:py-5">
              <div className="flex items-center gap-2 mb-2.5">
                <PinIcon className="h-4 w-4 text-[var(--accent)] shrink-0" />
                <p className="text-[length:var(--ts-sm)] font-bold text-[var(--text-primary)] leading-tight truncate">
                  {order.address.line}
                  {order.address.district && (
                    <span className="font-normal text-[var(--text-secondary)]">
                      {" · "}
                      {order.address.district}
                    </span>
                  )}
                </p>
              </div>
              <div className="relative h-48 sm:h-72 w-full rounded-2xl overflow-hidden ring-1 ring-[var(--rule-soft)]">
                <OrderLocationMap
                  address={mapAddress}
                  stores={uniqueStores}
                  className="h-full w-full"
                />
                {/* Botón AMPLIAR mapa → pantalla completa */}
                <button
                  type="button"
                  onClick={() => setMapExpanded(true)}
                  aria-label="Ampliar mapa"
                  className="absolute right-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-canvas)]/90 backdrop-blur px-2.5 h-8 text-[length:var(--ts-xs)] font-bold text-[var(--text-primary)] ring-1 ring-[var(--rule-soft)] shadow-sm hover:bg-[var(--surface-canvas)] active:scale-95 transition-all"
                >
                  <Maximize2 className="h-3.5 w-3.5" strokeWidth={2.25} />
                  Ampliar
                </button>
              </div>
              {order.address.notes && (
                <p className="mt-2 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                  <span className="font-bold text-[var(--text-secondary)]">Referencia:</span>{" "}
                  {order.address.notes}
                </p>
              )}
            </section>

            {/* ── Columna derecha: total + items + contacto ────── */}
            <section className="px-5 sm:px-6 py-4 sm:py-5 space-y-4">
              {/* Total + nº pedido */}
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-primary/10 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)] leading-tight">
                    Total
                  </p>
                  <p className="text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)] leading-tight mt-0.5 truncate">
                    {itemsCount} producto{itemsCount === 1 ? "" : "s"} ·{" "}
                    {order.orderIds.length === 1 ? "Pedido" : `${order.orderIds.length} pedidos`}{" "}
                    #{order.orderIds[0]?.toString().slice(-6) ?? "—"}
                  </p>
                </div>
                <span className="text-2xl font-black tabular-nums text-[var(--text-primary)] shrink-0">
                  S/ {Number(order.total).toFixed(2)}
                </span>
              </div>

              {/* Items */}
              <div>
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                  Tu pedido · {itemsCount} producto{itemsCount === 1 ? "" : "s"}
                </p>
                <ul className="rounded-2xl bg-[var(--surface-raised)] ring-1 ring-[var(--rule-soft)] divide-y divide-[var(--rule-soft)] overflow-hidden">
                  {order.items.map((item, idx) => (
                    <li
                      key={`${item.productId}-${idx}`}
                      className="flex items-center gap-3 px-3 py-2.5"
                    >
                      <div className="h-11 w-11 rounded-xl bg-[var(--surface-sunken)] overflow-hidden flex items-center justify-center shrink-0 relative">
                        {item.imageUrl ? (
                          <Image
                            src={item.imageUrl}
                            alt={item.name}
                            fill
                            className="object-cover"
                            sizes="44px"
                            unoptimized
                          />
                        ) : (
                          <ShoppingBag className="h-5 w-5 text-[var(--text-tertiary)]" />
                        )}
                        <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--text-primary)] px-1 text-[10px] font-black leading-none text-[var(--surface-canvas)] tabular-nums">
                          {item.quantity}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[length:var(--ts-sm)] font-bold text-[var(--text-primary)] truncate">
                          {item.name}
                        </p>
                        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate">
                          {item.storeName}
                        </p>
                      </div>
                      <span className="text-[length:var(--ts-sm)] font-bold text-[var(--text-primary)] tabular-nums shrink-0">
                        S/ {(item.quantity * item.price).toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Contacto */}
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--surface-raised)] ring-1 ring-[var(--rule-soft)] px-3.5 py-3">
                <div className="min-w-0">
                  <p className="text-[length:var(--ts-sm)] font-extrabold text-[var(--text-primary)] truncate">
                    {order.customer.name}
                  </p>
                  <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)] flex items-center gap-1 tabular-nums">
                    <PhoneRing className="h-3 w-3 shrink-0" />
                    {order.customer.phone}
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <a
                    href={`tel:${order.customer.phone}`}
                    className="h-9 w-9 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] active:scale-95 transition-all"
                    aria-label="Llamar"
                  >
                    <Phone className="h-4 w-4" />
                  </a>
                  <a
                    href={`https://wa.me/51${cleanPhone}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-9 px-3 rounded-xl bg-[#25D366] text-white flex items-center gap-1.5 text-[length:var(--ts-sm)] font-bold active:scale-95 transition-all"
                  >
                    <WhatsAppIcon className="h-4 w-4" />
                    WhatsApp
                  </a>
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* ── CTA único abajo ─────────────────────────────────── */}
        <div className="shrink-0 bg-[var(--surface-canvas)] border-t border-[var(--rule-soft)] px-5 sm:px-7 pt-3 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
          <Link
            href="/tiendas"
            onClick={closeModal}
            className="w-full h-12 rounded-2xl bg-[var(--accent)] text-[length:var(--ts-sm)] font-extrabold text-white hover:bg-[var(--accent)]/90 active:scale-[0.98] inline-flex items-center justify-center gap-2 shadow-lg transition-all"
          >
            <ShoppingBag className="h-4 w-4" />
            Seguir comprando
          </Link>
          <p className="mt-2.5 text-center text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
            Total con IGV · El repartidor coordina la entrega por WhatsApp.
          </p>
        </div>
      </div>

      {/* ── Mapa a pantalla completa ─────────────────────────── */}
      {mapExpanded && (
        <div className="fixed inset-0 z-[90] flex flex-col bg-[var(--surface-canvas)] animate-in fade-in duration-200">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 h-14 border-b border-[var(--rule-soft)] shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <PinIcon className="h-4 w-4 text-[var(--accent)] shrink-0" />
              <p className="text-[length:var(--ts-sm)] font-bold text-[var(--text-primary)] truncate">
                {order.address.line}
                {order.address.district && (
                  <span className="font-normal text-[var(--text-secondary)]">
                    {" · "}
                    {order.address.district}
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMapExpanded(false)}
              aria-label="Cerrar mapa"
              className="h-9 w-9 rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] flex items-center justify-center hover:bg-[var(--rule-base)] active:scale-95 transition-all shrink-0"
            >
              <X className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <OrderLocationMap
              address={mapAddress}
              stores={uniqueStores}
              className="h-full w-full"
            />
          </div>
        </div>
      )}
    </div>
  );
}
