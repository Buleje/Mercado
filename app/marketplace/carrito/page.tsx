"use client";

/**
 * /marketplace/carrito — Step 1 del checkout multi-pagina.
 *
 * Layout 2 columnas editorial:
 *   - Izquierda: items agrupados por tienda en SectionBoxes con divide-y
 *   - Derecha: CheckoutSummary sticky con resumen + CTA "Continuar"
 *
 * Vive dentro del marketplace layout (navbar normal). El usuario aun puede
 * explorar productos. Al clickear "Continuar" entra al CheckoutShell en
 * /checkout/datos.
 */

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { m, AnimatePresence } from "framer-motion";
import {
  Trash2,
  Store,
  ShoppingCart,
  ArrowLeft,
  ShieldCheck,
  Truck,
  Wallet,
  Clock,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useMarketplaceCart, modifierHashOf, type CartItem } from "@/hooks/use-marketplace-cart";
import CheckoutStepper from "@/components/marketplace/checkout/CheckoutStepper";
import CheckoutSummary from "@/components/marketplace/checkout/CheckoutSummary";
import CheckoutMobileCtaBar from "@/components/marketplace/checkout/CheckoutMobileCtaBar";
import CartCouponSection from "@/components/marketplace/CartCouponSection";
import CompartirListaWhatsApp from "@/components/marketplace/CompartirListaWhatsApp";
import QuantityStepper from "@/components/ui-system/QuantityStepper";
import { PaicheMascot } from "@/components/ui-system/illustrations";
import { useCustomer } from "@/contexts/customer-context";
import { AuthModal, useAuthModal } from "@/components/auth/AuthModal";
import { useConfirm } from "@/components/ui-system/ConfirmModal";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

function ItemRow({
  item,
  onQty,
  onRemove,
}: {
  item: CartItem;
  onQty: (qty: number) => void;
  onRemove: () => void;
}) {
  return (
    <m.div
      layout
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16, height: 0, marginTop: 0, paddingTop: 0, paddingBottom: 0, borderWidth: 0 }}
      transition={{ duration: 0.25, ease: "easeInOut" }}
      className="flex gap-3 sm:gap-4 py-4 sm:py-5 border-b border-[var(--rule-soft)] last:border-b-0 overflow-hidden"
    >
      <Link
        href={`/marketplace/${item.storeSlug}/producto/${item.productId}`}
        className="relative h-20 w-20 sm:h-24 sm:w-24 shrink-0 rounded-2xl overflow-hidden bg-[var(--surface-sunken)] border border-[var(--rule-soft)] hover:border-[var(--accent)] transition-colors group/img"
      >
        {item.image ? (
          <Image
            src={item.image}
            alt={item.name}
            fill
            sizes="96px"
            className="object-cover transition-transform group-hover/img:scale-105"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-[var(--text-tertiary)] bg-linear-to-br from-[var(--surface-sunken)] to-[var(--accent-soft)]/40">
            <ShoppingCart className="h-7 w-7" strokeWidth={1.5} />
          </div>
        )}
        {item.quantity > 1 && (
          <span
            aria-hidden
            className="absolute top-1.5 left-1.5 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-black text-white shadow-md tabular-nums leading-none"
          >
            ×{item.quantity}
          </span>
        )}
      </Link>

      <div className="flex-1 min-w-0 flex flex-col">
        <Link
          href={`/marketplace/${item.storeSlug}/producto/${item.productId}`}
          className="text-[length:var(--ts-sm)] sm:text-base font-extrabold tracking-[var(--ls-tight)] text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors line-clamp-2 leading-snug"
        >
          {item.name}
        </Link>

        <p className="mt-1 text-[length:var(--ts-sm)] sm:text-base font-black text-[var(--text-primary)] tabular-nums tracking-[var(--ls-tight)]">
          {fmt(item.price)}
          {item.unit && (
            <span className="ml-1 text-[length:var(--ts-xs)] font-medium text-[var(--text-tertiary)]">
              / {item.unit}
            </span>
          )}
        </p>

        {item.modifiers && item.modifiers.length > 0 && (
          <p className="mt-0.5 text-[length:var(--ts-xs)] text-[var(--text-tertiary)] line-clamp-1">
            {item.modifiers.map((m) => m.optionName).join(" · ")}
          </p>
        )}

        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <QuantityStepper
            value={item.quantity}
            onChange={onQty}
            min={1}
            max={99}
            size="md"
            label={`Cantidad de ${item.name}`}
          />

          <button
            type="button"
            onClick={onRemove}
            aria-label="Eliminar producto del carrito"
            className="inline-flex items-center gap-1.5 min-h-[44px] px-2 -mx-2 text-[length:var(--ts-xs)] font-semibold text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition-colors"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            <span className="hidden sm:inline">Eliminar</span>
          </button>
        </div>
      </div>

      <div className="hidden sm:flex flex-col items-end shrink-0 self-start gap-0.5">
        <p className="text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] font-bold">
          Subtotal
        </p>
        <p className="text-xl font-black text-[var(--text-primary)] tabular-nums tracking-[var(--ls-tight)]">
          {fmt(item.price * item.quantity)}
        </p>
      </div>
    </m.div>
  );
}

/**
 * TrustPill — pequeño chip de confianza para reducir ansiedad de checkout.
 * Brandon mayo 15 v4: aparece en la barra superior del carrito; comunica
 * delivery rápido, pago seguro, pago al recibir, sin compromiso.
 */
function TrustPill({ icon: Icon, label }: { icon: typeof Truck; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rule-soft)] bg-[var(--surface-raised)] pl-1.5 pr-3 h-8 text-[length:var(--ts-xs)] font-bold text-[var(--text-secondary)] shadow-sm shrink-0">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
        <Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
      </span>
      <span className="whitespace-nowrap">{label}</span>
    </span>
  );
}

export default function CarritoPage() {
  const { byStore, totalByStore, grandTotal, itemCount, updateQuantity, removeItem, clearAll } =
    useMarketplaceCart();
  const { customer: loggedCustomer } = useCustomer();
  const router = useRouter();
  const { confirm, ConfirmDialog } = useConfirm();
  const storeIds = Object.keys(byStore);
  const isEmpty = storeIds.length === 0;
  const [couponDiscount, setCouponDiscount] = useState(0);

  // "Seguir comprando" — destino inteligente (Brandon, mayo 14 2026):
  //  - 1 sola tienda: vuelve al storefront de esa tienda.
  //  - 2+ tiendas: directorio /tiendas (no /marketplace generico).
  //  - Carrito vacio: directorio /tiendas tambien.
  const seguirComprandoHref = (() => {
    if (storeIds.length === 1) {
      const only = byStore[storeIds[0]];
      if (only?.storeSlug) return `/marketplace/${only.storeSlug}`;
    }
    return "/tiendas";
  })();
  // Mayo 2026 (designer audit P0): si no hay sesión, abrimos el AuthModal
  // in-place en vez de navegar a /checkout/auth — el botón antes mostraba
  // "Te pedimos iniciar sesión" pero no abría nada.
  const { authModalOpen, openAuthModal, closeAuthModal } = useAuthModal();
  const continueHref = loggedCustomer ? "/checkout/datos" : undefined;
  const handleContinueWithoutAuth = useCallback(() => openAuthModal(), [openAuthModal]);

  // Prefetch del próximo paso para que la transición sea instantánea
  useEffect(() => {
    if (!isEmpty && loggedCustomer) {
      router.prefetch("/checkout/datos");
    }
  }, [isEmpty, loggedCustomer, router]);

  // Si el usuario se loggea con el modal abierto, redirigir automáticamente
  useEffect(() => {
    if (loggedCustomer && authModalOpen) {
      closeAuthModal();
      router.push("/checkout/datos");
    }
  }, [loggedCustomer, authModalOpen, closeAuthModal, router]);

  const handleQty = useCallback(
    (item: CartItem, qty: number) =>
      updateQuantity(
        item.storeId,
        item.productId,
        qty,
        item.modifierHash ?? modifierHashOf(item.modifiers),
      ),
    [updateQuantity],
  );
  const handleRemove = useCallback(
    (item: CartItem) =>
      removeItem(
        item.storeId,
        item.productId,
        item.modifierHash ?? modifierHashOf(item.modifiers),
      ),
    [removeItem],
  );

  return (
    <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 py-5 sm:py-10 pb-32 lg:pb-10">
      {/* ── Hero header (rediseñado Brandon mayo 15 v4) ──
           - Link "Seguir comprando" más sutil
           - Título XL con conteo embebido
           - Trust pills strip: entrega rápida + pago seguro + pago al recibir + multi-tienda
           - Acciones: Compartir + Vaciar (cuando hay items) */}
      <div className="mb-6 sm:mb-8">
        <Link
          href={seguirComprandoHref}
          className="inline-flex items-center gap-1.5 text-[length:var(--ts-sm)] font-bold text-[var(--text-secondary)] hover:text-[var(--accent)] hover:gap-2 transition-all mb-3"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          Seguir comprando
        </Link>

        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-3xl sm:text-4xl font-black tracking-[-0.025em] text-[var(--text-primary)] leading-none">
              Tu carrito
            </h1>
            {itemCount > 0 ? (
              <p className="mt-2 text-[length:var(--ts-sm)] sm:text-base text-[var(--text-secondary)] leading-snug">
                <span className="font-extrabold text-[var(--text-primary)] tabular-nums">{itemCount}</span>
                {" "}{itemCount === 1 ? "producto" : "productos"}
                <span className="mx-1.5 text-[var(--text-tertiary)]">·</span>
                <span className="font-extrabold text-[var(--text-primary)] tabular-nums">{storeIds.length}</span>
                {" "}{storeIds.length === 1 ? "tienda" : "tiendas"}
                <span className="mx-1.5 text-[var(--text-tertiary)]">·</span>
                <span className="font-semibold text-[var(--accent)]">listo en minutos</span>
              </p>
            ) : (
              <p className="mt-2 text-[length:var(--ts-sm)] sm:text-base text-[var(--text-secondary)] leading-snug">
                Agrega productos para empezar
              </p>
            )}
          </div>
          {!isEmpty && (
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <CompartirListaWhatsApp
                items={Object.values(byStore).flatMap((s) =>
                  s.items.map((it) => ({
                    name: it.name,
                    quantity: it.quantity,
                    price: it.price,
                    storeName: s.storeName,
                  })),
                )}
                heading="Mi carrito Buleje"
              />
              <button
                type="button"
                onClick={async () => {
                  const ok = await confirm({
                    title: "¿Vaciar todo el carrito?",
                    description: "Vas a perder todos los productos guardados. Esta acción no se puede deshacer.",
                    intent: "danger",
                    confirmLabel: "Sí, vaciar",
                    cancelLabel: "Cancelar",
                  });
                  if (ok) clearAll();
                }}
                aria-label="Vaciar carrito"
                className="inline-flex items-center gap-1.5 h-10 px-3 rounded-full border border-[var(--data-error-500)]/20 bg-[var(--data-error-50,#fef2f2)]/50 text-[length:var(--ts-xs)] font-bold text-[var(--data-error-600,#dc2626)] hover:bg-[var(--data-error-50,#fef2f2)] hover:border-[var(--data-error-500)]/40 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                <span className="hidden sm:inline">Vaciar</span>
              </button>
            </div>
          )}
        </div>

        {/* Trust strip — chips con scroll horizontal en mobile */}
        {!isEmpty && (
          <div className="mt-4 flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
            <TrustPill icon={Truck} label="Entrega rápida" />
            <TrustPill icon={ShieldCheck} label="Pago seguro" />
            <TrustPill icon={Wallet} label="Pago al recibir" />
            <TrustPill icon={Clock} label="Sin compromiso" />
          </div>
        )}
      </div>

      {/* ── Stepper solo con items ────────────────────────────────── */}
      {!isEmpty && (
        <div className="mb-6 sm:mb-8 overflow-x-auto">
          <CheckoutStepper current="carrito" />
        </div>
      )}

      {/* ── Contenido ─────────────────────────────────────────────── */}
      {isEmpty ? (
        <div
          className={cn(
            "rounded-3xl border border-[var(--rule-soft)] bg-[var(--surface-raised)]",
            "px-6 py-12 sm:py-20 text-center flex flex-col items-center gap-5 sm:gap-6",
            "relative overflow-hidden",
          )}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -top-20 -right-20 h-[280px] w-[280px] rounded-full bg-[var(--accent)]/[0.08] blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-24 -left-12 h-[220px] w-[220px] rounded-full bg-[var(--accent)]/[0.05] blur-3xl"
          />
          <div className="relative text-[var(--accent)]">
            <PaicheMascot size={160} animated />
          </div>
          <div className="relative max-w-md">
            <p className="text-2xl sm:text-3xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)]">
              Tu carrito está{" "}
              <span className="italic font-serif text-[var(--accent)]">vacío.</span>
            </p>
            <p className="mt-2 text-[length:var(--ts-sm)] sm:text-base text-[var(--text-secondary)] leading-relaxed">
              Empezá a descubrir las bodegas, restaurantes y tiendas reales de tu barrio.
            </p>
          </div>
          <div className="relative flex flex-col sm:flex-row items-center gap-2.5 mt-1 w-full max-w-md">
            <Link
              href="/tiendas"
              className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-7 h-12 text-[length:var(--ts-sm)] font-extrabold text-white hover:bg-[var(--accent)]/90 shadow-[0_6px_20px_-10px_var(--accent)] hover:shadow-[0_10px_28px_-10px_var(--accent)] active:scale-[0.98] transition-all duration-200"
            >
              <Store className="h-4 w-4" strokeWidth={2.25} aria-hidden />
              Explorar tiendas
            </Link>
            <Link
              href="/marketplace/ofertas"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-5 h-12 text-[length:var(--ts-sm)] font-extrabold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] active:scale-[0.98] transition-all"
            >
              Ver ofertas
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 sm:gap-6 lg:gap-8 items-start pb-8">
          <section aria-label="Productos en tu carrito" className="space-y-4 sm:space-y-5">
            {storeIds.map((sid) => {
              const group = byStore[sid];
              const subtotal = totalByStore[sid]?.total ?? 0;
              const itemCountStore = group.items.length;
              return (
                <article
                  key={sid}
                  className="rounded-2xl sm:rounded-3xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* Store header — gradient sutil + avatar inicial + ver tienda */}
                  <header className="relative flex items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-linear-to-r from-[var(--surface-sunken)]/60 to-[var(--accent-soft)]/30 px-4 sm:px-6 py-3.5 sm:py-4">
                    <Link
                      href={`/marketplace/${group.storeSlug}`}
                      className="flex items-center gap-3 min-w-0 group/store"
                    >
                      <span
                        aria-hidden
                        className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent)] text-white text-base font-black uppercase shadow-sm shrink-0"
                      >
                        {group.storeName?.charAt(0) ?? <Store className="h-5 w-5" />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] leading-tight">
                          Tienda
                        </p>
                        <p className="text-[length:var(--ts-sm)] sm:text-base font-extrabold tracking-[var(--ls-tight)] text-[var(--text-primary)] group-hover/store:text-[var(--accent)] transition-colors truncate leading-tight">
                          {group.storeName}
                        </p>
                        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] font-medium leading-tight mt-0.5">
                          {itemCountStore} {itemCountStore === 1 ? "producto" : "productos"}
                        </p>
                      </div>
                    </Link>
                    <div className="text-right shrink-0">
                      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] leading-tight">
                        Subtotal
                      </p>
                      <p className="text-base sm:text-lg font-black text-[var(--text-primary)] tabular-nums leading-tight mt-0.5">
                        {fmt(subtotal)}
                      </p>
                    </div>
                  </header>
                  <div className="px-4 sm:px-6">
                    <AnimatePresence initial={false} mode="popLayout">
                    {group.items.map((item) => {
                      // Mismo producto con modifiers distintos = línea
                      // distinta. La key debe incluir el hash o el cliente
                      // ve "Encountered two children with the same key".
                      const hash = item.modifierHash ?? modifierHashOf(item.modifiers);
                      return (
                        <ItemRow
                          key={`${item.storeId}-${item.productId}-${hash}`}
                          item={item}
                          onQty={(qty) => handleQty(item, qty)}
                          onRemove={() => handleRemove(item)}
                        />
                      );
                    })}
                    </AnimatePresence>
                  </div>
                </article>
              );
            })}

            <div className="flex items-start gap-2.5 rounded-2xl border border-[var(--accent)]/20 bg-[var(--accent-soft)]/40 px-4 py-3">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-white shrink-0 mt-0.5">
                <Truck className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
              </span>
              <p className="text-[length:var(--ts-xs)] sm:text-[length:var(--ts-sm)] text-[var(--text-secondary)] leading-relaxed">
                Se crea un pedido por cada tienda. Cada una te contacta por WhatsApp con el detalle y el tiempo estimado de entrega.
              </p>
            </div>
          </section>

          {/* CheckoutSummary oculto en mobile (Brandon, mayo 14 2026): el
              CheckoutMobileCtaBar sticky bottom ya muestra total + CTA, no
              hace falta duplicar resumen abajo del listado en celular. */}
          <div className="hidden lg:block">
            <CheckoutSummary
              ctaLabel={loggedCustomer ? "Continuar al checkout" : "Iniciar sesión y continuar"}
              ctaHref={continueHref}
              onCtaClick={loggedCustomer ? undefined : handleContinueWithoutAuth}
              showItems={false}
              couponDiscount={couponDiscount}
              helperText={
                loggedCustomer
                  ? "Pago al recibir o por Yape · sin sorpresas"
                  : "Te pedimos iniciar sesión para continuar"
              }
              beforeBreakdown={
                <CartCouponSection subtotal={grandTotal} onDiscountChange={setCouponDiscount} />
              }
            />
          </div>

          {/* Cupón solo accesible mobile (el desktop lo muestra dentro del summary) */}
          <div className="lg:hidden">
            <CartCouponSection subtotal={grandTotal} onDiscountChange={setCouponDiscount} />
          </div>
        </div>
      )}
      <AuthModal open={authModalOpen} onClose={closeAuthModal} />
      <ConfirmDialog />

      {/* Sticky bottom CTA mobile — el cliente no necesita scrollear hasta
          el final del listado para encontrar el boton continuar */}
      {!isEmpty && (
        <CheckoutMobileCtaBar
          primaryLabel="Total"
          total={Math.max(0, grandTotal - couponDiscount)}
          ctaLabel={loggedCustomer ? "Continuar al checkout" : "Iniciar sesión"}
          ctaHref={loggedCustomer ? continueHref : undefined}
          ctaOnClick={loggedCustomer ? undefined : handleContinueWithoutAuth}
          helperText={loggedCustomer ? "Pago al recibir o por Yape" : "Te pedimos iniciar sesión"}
        />
      )}
    </div>
  );
}
