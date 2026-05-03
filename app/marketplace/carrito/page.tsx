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
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useMarketplaceCart, modifierHashOf, type CartItem } from "@/hooks/use-marketplace-cart";
import CheckoutStepper from "@/components/marketplace/checkout/CheckoutStepper";
import CheckoutSummary from "@/components/marketplace/checkout/CheckoutSummary";
import CartCouponSection from "@/components/marketplace/CartCouponSection";
import CompartirListaWhatsApp from "@/components/marketplace/CompartirListaWhatsApp";
import QuantityStepper from "@/components/ui-system/QuantityStepper";
import { PaicheMascot } from "@/components/ui-system/illustrations";
import { useCustomer } from "@/contexts/customer-context";
import { AuthModal, useAuthModal } from "@/components/auth/AuthModal";

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
      className="flex gap-4 py-5 border-b border-[var(--rule-soft)] last:border-b-0 overflow-hidden"
    >
      <Link
        href={`/marketplace/${item.storeSlug}/producto/${item.productId}`}
        className="relative h-20 w-20 sm:h-24 sm:w-24 shrink-0 rounded-xl overflow-hidden bg-[var(--surface-sunken)] border border-[var(--rule-soft)]"
      >
        {item.image ? (
          <Image
            src={item.image}
            alt={item.name}
            fill
            sizes="96px"
            className="object-cover"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-[var(--text-tertiary)]">
            <ShoppingCart className="h-6 w-6" strokeWidth={1.5} />
          </div>
        )}
      </Link>

      <div className="flex-1 min-w-0 flex flex-col">
        <Link
          href={`/marketplace/${item.storeSlug}/producto/${item.productId}`}
          className="text-[length:var(--ts-sm)] sm:text-base font-bold tracking-[var(--ls-tight)] text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors line-clamp-2"
        >
          {item.name}
        </Link>

        <p className="mt-1 text-[length:var(--ts-sm)] font-black text-[var(--text-primary)] tabular-nums tracking-[var(--ls-tight)]">
          {fmt(item.price)}
          {item.unit && (
            <span className="ml-1 text-[length:var(--ts-xs)] font-normal text-[var(--text-tertiary)]">
              / {item.unit}
            </span>
          )}
        </p>

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
            className="inline-flex items-center gap-1.5 min-h-[44px] px-2 -mx-2 text-[length:var(--ts-xs)] font-semibold text-[var(--text-tertiary)] hover:text-[var(--data-error)] transition-colors"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            Eliminar
          </button>
        </div>
      </div>

      <div className="hidden sm:block text-right shrink-0 self-start">
        <p className="text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] font-bold">
          Subtotal
        </p>
        <p className="mt-1 text-lg font-black text-[var(--text-primary)] tabular-nums tracking-[var(--ls-tight)]">
          {fmt(item.price * item.quantity)}
        </p>
      </div>
    </m.div>
  );
}

export default function CarritoPage() {
  const { byStore, totalByStore, grandTotal, itemCount, updateQuantity, removeItem, clearAll } =
    useMarketplaceCart();
  const { customer: loggedCustomer } = useCustomer();
  const router = useRouter();
  const storeIds = Object.keys(byStore);
  const isEmpty = storeIds.length === 0;
  const [couponDiscount, setCouponDiscount] = useState(0);
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
    <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      {/* ── Header simple ──────────────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            Seguir comprando
          </Link>
          <h1 className="mt-2 text-2xl sm:text-3xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)]">
            Tu carrito
          </h1>
          {itemCount > 0 && (
            <p className="mt-1 text-[length:var(--ts-sm)] text-[var(--text-tertiary)]">
              {itemCount} {itemCount === 1 ? "producto" : "productos"} de {storeIds.length}{" "}
              {storeIds.length === 1 ? "tienda" : "tiendas"}
            </p>
          )}
        </div>
        {!isEmpty && (
          <div className="flex items-center gap-3">
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
              onClick={clearAll}
              className="text-[length:var(--ts-xs)] font-semibold text-[var(--text-tertiary)] hover:text-[var(--data-error)] underline-offset-2 hover:underline transition-colors"
            >
              Vaciar carrito
            </button>
          </div>
        )}
      </div>

      {/* ── Stepper solo con items ────────────────────────────────── */}
      {!isEmpty && (
        <div className="mb-8 overflow-x-auto">
          <CheckoutStepper current="carrito" />
        </div>
      )}

      {/* ── Contenido ─────────────────────────────────────────────── */}
      {isEmpty ? (
        <div
          className={cn(
            "rounded-3xl border border-[var(--rule-soft)] bg-[var(--surface-raised)]",
            "px-6 py-16 sm:py-20 text-center flex flex-col items-center gap-6",
            "relative overflow-hidden",
          )}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -top-20 -right-20 h-[280px] w-[280px] rounded-full bg-[var(--accent)]/[0.06] blur-3xl"
          />
          <div className="relative text-[var(--accent)]">
            <PaicheMascot size={160} animated />
          </div>
          <div className="relative max-w-md">
            <p className="text-2xl sm:text-3xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)]">
              Tu carrito está{" "}
              <span className="italic font-serif text-[var(--accent)]">vacío.</span>
            </p>
            <p className="mt-2 text-[length:var(--ts-sm)] text-[var(--text-tertiary)]">
              Los paiches del Ucayali esperan que elijas algo rico.
            </p>
          </div>
          <Link
            href="/marketplace"
            className="relative mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-7 h-12 text-[length:var(--ts-sm)] font-bold text-white hover:bg-[var(--accent)]/90 shadow-[0_6px_20px_-10px_var(--accent)] hover:shadow-[0_10px_28px_-10px_var(--accent)] hover:gap-3 transition-all duration-200"
          >
            Explorar productos
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 sm:gap-8 items-start pb-16">
          <section aria-label="Productos en tu carrito" className="space-y-6">
            {storeIds.map((sid) => {
              const group = byStore[sid];
              const subtotal = totalByStore[sid]?.total ?? 0;
              return (
                <article
                  key={sid}
                  className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden"
                >
                  <header className="flex items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-6 py-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-raised)] border border-[var(--rule-soft)] text-[var(--accent)] shrink-0">
                        <Store className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                          Tienda
                        </p>
                        <Link
                          href={`/marketplace/${group.storeSlug}`}
                          className="text-[length:var(--ts-sm)] font-bold tracking-[var(--ls-tight)] text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors truncate block"
                        >
                          {group.storeName}
                        </Link>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                        {group.items.length} {group.items.length === 1 ? "producto" : "productos"}
                      </p>
                      <p className="text-[length:var(--ts-sm)] font-black text-[var(--text-primary)] tabular-nums">
                        {fmt(subtotal)}
                      </p>
                    </div>
                  </header>
                  <div className="px-6">
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

            <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] px-1 leading-relaxed">
              Se crea un pedido separado por cada tienda. Cada bodega te contacta por WhatsApp
              con el detalle y el tiempo estimado de entrega.
            </p>
          </section>

          <CheckoutSummary
            ctaLabel={loggedCustomer ? "Continuar" : "Iniciar sesión y continuar"}
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
      )}
      <AuthModal open={authModalOpen} onClose={closeAuthModal} />
    </div>
  );
}
