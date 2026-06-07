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
  WhatsAppIcon,
  PhoneRing,
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

  // Stores únicas del pedido (slug + name) — para el marker de origen del mapa.
  const uniqueStores = Array.from(
    new Map(order.items.map((i) => [i.storeSlug, { slug: i.storeSlug, name: i.storeName }])).values(),
  );

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
        aria-label="Minimizar"
        className="absolute inset-0 bg-black/55 backdrop-blur-sm animate-in fade-in duration-300"
      />

      {/* Card — Brandon 2026-05-31 rediseño mobile minimalista:
          bottom-sheet con grab handle + hero compacto (sin gradiente saturado)
          + secciones aireadas con divisores finos + CTA sticky abajo. En sm+
          vuelve a card centrada. */}
      <div className="relative w-full sm:max-w-2xl max-h-[94vh] sm:max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[var(--surface-canvas)] shadow-2xl sm:border sm:border-[var(--rule-base)] animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
        {/* Grab handle — solo mobile */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <span aria-hidden className="h-1.5 w-10 rounded-full bg-[var(--rule-base)]" />
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {/* ── Hero compacto ──────────────────────────────
              Antes: gradiente accent full-bleed + 2 blur blobs + ilustración +
              total gigante invertido. Ahora: check badge + título + total en una
              fila limpia sobre surface. Acciones (minimizar/cerrar) flotan. */}
          <header className="relative px-5 sm:px-7 pt-4 pb-4">
            {/* Acciones flotantes top-right */}
            <div className="absolute right-3.5 top-3 flex items-center gap-1.5">
              <button
                type="button"
                onClick={closeModal}
                aria-label="Minimizar y volver al ícono del nav"
                title="Minimizar"
                className="h-9 w-9 rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] flex items-center justify-center hover:bg-[var(--rule-base)] active:scale-95 transition-all"
              >
                <Minus className="h-4 w-4" strokeWidth={2.5} />
              </button>
              <button
                type="button"
                onClick={clear}
                aria-label="Cerrar y descartar"
                title="Cerrar"
                className="h-9 w-9 rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] flex items-center justify-center hover:bg-[var(--rule-base)] active:scale-95 transition-all"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>

            <div className="flex items-start gap-3.5 pr-20">
              <span className="relative inline-flex shrink-0 mt-0.5">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                  <CheckBadge className="h-7 w-7" />
                </span>
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

            {/* Total + nº pedido — fila resaltada bajo el hero */}
            <div className="mt-3.5 flex items-center justify-between gap-3 rounded-2xl bg-[var(--accent-soft)] px-4 py-3">
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
          </header>

          {/* ── Mapa ──────────────────────────────────────── */}
          <section className="px-5 sm:px-7 pb-4">
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
            <div className="h-44 sm:h-56 w-full rounded-2xl overflow-hidden ring-1 ring-[var(--rule-soft)]">
              <OrderLocationMap
                address={{
                  line: order.address.line,
                  district: order.address.district,
                  province: order.address.province,
                  department: order.address.department,
                }}
                stores={uniqueStores}
                className="h-full w-full"
              />
            </div>
            {order.address.notes && (
              <p className="mt-2 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                <span className="font-bold text-[var(--text-secondary)]">Referencia:</span>{" "}
                {order.address.notes}
              </p>
            )}
          </section>

          {/* ── Items ─────────────────────────────────────── */}
          <section className="px-5 sm:px-7 pb-4">
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
          </section>

          {/* ── Contacto ──────────────────────────────────── */}
          <section className="px-5 sm:px-7 pb-4">
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

        {/* ── CTAs sticky abajo ─────────────────────────────
            pb extra para safe-area (notch/home indicator en mobile). */}
        <div className="shrink-0 bg-[var(--surface-canvas)] border-t border-[var(--rule-soft)] px-5 sm:px-7 pt-3 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
          <div className="flex flex-col-reverse sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={closeModal}
              className="flex-1 h-12 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[length:var(--ts-sm)] font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] active:scale-[0.98] transition-all inline-flex items-center justify-center gap-2"
            >
              <Minus className="h-4 w-4" strokeWidth={2.5} />
              Minimizar
            </button>
            <Link
              href="/tiendas"
              onClick={closeModal}
              className="flex-1 h-12 rounded-2xl bg-[var(--accent)] text-[length:var(--ts-sm)] font-extrabold text-white hover:bg-[var(--accent)]/90 active:scale-[0.98] inline-flex items-center justify-center gap-2 shadow-lg transition-all"
            >
              <ShoppingBag className="h-4 w-4" />
              Seguir comprando
            </Link>
          </div>
          <p className="mt-2.5 text-center text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
            Total con IGV · El repartidor coordina la entrega por WhatsApp.
          </p>
        </div>
      </div>
    </div>
  );
}
