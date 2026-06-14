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
  Truck,
  Wallet,
  Clock,
  Bookmark,
  ChevronRight,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useMarketplaceCart, modifierHashOf, type CartItem } from "@/hooks/use-marketplace-cart";
import CheckoutSummary from "@/components/marketplace/checkout/CheckoutSummary";
import CheckoutMobileCtaBar from "@/components/marketplace/checkout/CheckoutMobileCtaBar";
import CartCouponSection from "@/components/marketplace/CartCouponSection";
import CartSuggestions from "@/components/marketplace/cart/CartSuggestions";
import FreeShippingProgress from "@/components/marketplace/cart/FreeShippingProgress";
import ComboSugerido from "@/components/marketplace/cart/ComboSugerido";
import { useSavedForLater, SavedForLaterSection } from "@/components/marketplace/cart/SavedForLater";
import CompartirListaWhatsApp from "@/components/marketplace/CompartirListaWhatsApp";
import QuantityStepper from "@/components/ui-system/QuantityStepper";
import { PaicheMascot } from "@/components/ui-system/illustrations";
import { useCustomer, isCustomerProfileComplete } from "@/contexts/customer-context";
import { AuthModal, useAuthModal } from "@/components/auth/AuthModal";
import { useConfirm } from "@/components/ui-system/ConfirmModal";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

function ItemRow({
  item,
  onQty,
  onRemove,
  onSave,
}: {
  item: CartItem;
  onQty: (qty: number) => void;
  onRemove: () => void;
  onSave: () => void;
}) {
  // Stock bajo → badge tipo AliExpress ("Quedan N" / "Último") sobre la imagen.
  const lowStock = typeof item.stock === "number" && item.stock > 0 && item.stock <= 5;
  return (
    <m.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 16, height: 0, marginTop: 0, paddingTop: 0, paddingBottom: 0, borderWidth: 0 }}
      transition={{ duration: 0.22, ease: "easeInOut" }}
      className="flex gap-3 sm:gap-4 px-3.5 sm:px-4 py-3.5 sm:py-4 border-b border-[var(--rule-soft)] last:border-b-0 overflow-hidden"
    >
      {/* Imagen grande redondeada + badge de stock (estilo AliExpress) */}
      <Link
        href={`/marketplace/${item.storeSlug}/producto/${item.productId}`}
        className="relative h-[72px] w-[72px] sm:h-20 sm:w-20 shrink-0 rounded-xl overflow-hidden bg-[var(--surface-sunken)] border border-[var(--rule-soft)] hover:border-[var(--accent)] transition-colors group/img"
      >
        {item.image ? (
          <Image
            src={item.image}
            alt={item.name}
            fill
            sizes="80px"
            className="object-cover transition-transform group-hover/img:scale-105"
          />
        ) : (
          // Brandon 2026-05-18: fallback con INICIAL del producto + gradient accent.
          <div className="h-full w-full flex items-center justify-center bg-linear-to-br from-[var(--accent-soft)] via-[var(--surface-sunken)] to-[var(--accent-soft)]/60">
            <span className="text-2xl font-black text-[var(--accent)] uppercase">
              {item.name.trim().charAt(0)}
            </span>
          </div>
        )}
        {lowStock && (
          <span className="absolute inset-x-0 bottom-0 bg-black/65 px-1 py-0.5 text-center text-[10px] font-semibold text-white leading-tight">
            {item.stock === 1 ? "Último" : `Quedan ${item.stock}`}
          </span>
        )}
      </Link>

      {/* Columna de detalle: título suave + acciones, variante, precio + stepper */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/marketplace/${item.storeSlug}/producto/${item.productId}`}
            className="text-[length:var(--ts-sm)] font-medium text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors line-clamp-2 leading-snug"
          >
            {item.name}
          </Link>
          <div className="flex items-center gap-0.5 shrink-0 -mt-1 -mr-1.5">
            <button
              type="button"
              onClick={onSave}
              aria-label="Guardar para después"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors"
            >
              <Bookmark className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </button>
            <button
              type="button"
              onClick={onRemove}
              aria-label="Eliminar producto del carrito"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50,#fef2f2)]/50 transition-colors"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        </div>

        {/* Variantes / modifiers como chip suave (estilo selector AliExpress) */}
        {item.modifiers && item.modifiers.length > 0 && (
          <span className="inline-flex w-fit max-w-full items-center rounded-full bg-[var(--surface-sunken)] px-2.5 py-0.5 text-[length:var(--ts-xs)] text-[var(--text-secondary)] truncate">
            {item.modifiers.map((m) => m.optionName).join(" · ")}
          </span>
        )}

        {/* Precio unitario bold + subtotal (izq) · stepper redondeado (der) */}
        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <div className="min-w-0">
            <p className="text-base sm:text-lg font-bold text-[var(--text-primary)] tabular-nums tracking-[var(--ls-tight)] leading-none">
              {fmt(item.price)}
              <span className="ml-1 text-[length:var(--ts-xs)] font-medium text-[var(--text-tertiary)]">
                {item.unit ? `/ ${item.unit}` : "c/u"}
              </span>
            </p>
            {item.quantity > 1 && (
              <p className="mt-1 text-[length:var(--ts-xs)] text-[var(--text-tertiary)] tabular-nums truncate">
                Subtotal {fmt(item.price * item.quantity)}
              </p>
            )}
          </div>
          <QuantityStepper
            value={item.quantity}
            onChange={onQty}
            min={1}
            max={99}
            size="sm"
            label={`Cantidad de ${item.name}`}
          />
        </div>
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
  const { byStore, totalByStore, grandTotal, itemCount, updateQuantity, removeItem, clearAll, addItem } =
    useMarketplaceCart();
  // Guardar para después (localStorage). saveItem mueve el item fuera del carrito.
  const { saved, saveItem, unsaveItem } = useSavedForLater();
  const { customer: loggedCustomer } = useCustomer();
  const router = useRouter();
  const { confirm, ConfirmDialog } = useConfirm();
  const storeIds = Object.keys(byStore);
  const isEmpty = storeIds.length === 0;
  const [couponDiscount, setCouponDiscount] = useState(0);

  // Logos de tienda por slug (Brandon 2026-06-13): el CartItem no guarda el
  // logo, así que lo resolvemos una vez desde /api/marketplace/stores y lo
  // mostramos circular en el header de cada grupo. Fetch único, cacheado.
  const [storeLogos, setStoreLogos] = useState<Record<string, string | null>>({});
  useEffect(() => {
    if (isEmpty) return;
    let cancelled = false;
    fetch("/api/marketplace/stores?limit=50", { headers: { "x-tenant-id": "main" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("stores failed"))))
      .then((j) => {
        if (cancelled) return;
        const list = (j?.data ?? j?.stores ?? []) as Array<{ slug: string; logo: string | null }>;
        const map: Record<string, string | null> = {};
        for (const s of list) if (s.slug) map[s.slug] = s.logo ?? null;
        setStoreLogos(map);
      })
      .catch(() => {/* no crítico: fallback a la inicial */});
    return () => { cancelled = true; };
  }, [isEmpty]);

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
  // Checkout invitado (Brandon 2026-05-30): el cliente puede continuar SIN
  // login. El login queda opcional (para puntos/seguimiento) vía el modal. El
  // form de datos (nombre + WhatsApp) se completa en /checkout/datos.
  //
  // Brandon 2026-06-08 — flujo de 2 pasos: si el cliente está logueado con
  // dirección guardada (perfil completo), saltamos datos+entrega y vamos DIRECTO
  // a /checkout/confirmar (finalizar). Así no se ve la página de datos y "atrás"
  // desde confirmar vuelve al carrito (no a datos, que antes re-saltaba → loop).
  // Fast-flow cross-tenant (Brandon 2026-06-13): la dirección+ubigeo se guarda
  // POR-TENANT en localStorage (buleje-<tenant>-customer). En el marketplace el
  // tenant activo (cookie active-tenant) puede ser un shard de TIENDA sin
  // dirección, aunque el mismo cliente la tenga completa en otro shard (ej. main).
  // Eso hacía que un logueado con dirección igual pasara por datos+entrega.
  // Fix: si el customer activo está incompleto, buscamos POR TELÉFONO el shard
  // que SÍ tenga perfil completo (read-only, mismo teléfono = misma persona).
  const [resolvedCustomer, setResolvedCustomer] = useState<typeof loggedCustomer>(loggedCustomer);
  useEffect(() => {
    if (!loggedCustomer) { setResolvedCustomer(null); return; }
    if (isCustomerProfileComplete(loggedCustomer)) { setResolvedCustomer(loggedCustomer); return; }
    try {
      const phone = (loggedCustomer.phone || "").replace(/\D/g, "").slice(-9);
      let best = loggedCustomer;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !(k.endsWith("-customer") || k.endsWith("-accounts-list"))) continue;
        let parsed: unknown;
        try { parsed = JSON.parse(localStorage.getItem(k) || "null"); } catch { continue; }
        const candidates = Array.isArray(parsed) ? parsed : [parsed];
        for (const c of candidates) {
          const cphone = ((c as { phone?: string } | null)?.phone || "").replace(/\D/g, "").slice(-9);
          if (c && typeof c === "object" && cphone === phone && phone &&
              isCustomerProfileComplete(c as typeof loggedCustomer)) {
            best = c as typeof loggedCustomer;
            break;
          }
        }
        if (isCustomerProfileComplete(best)) break;
      }
      setResolvedCustomer(best);
    } catch {
      setResolvedCustomer(loggedCustomer);
    }
  }, [loggedCustomer]);

  const fastFlow = isCustomerProfileComplete(resolvedCustomer);
  const continueHref = fastFlow ? "/checkout/confirmar" : "/checkout/datos";
  const handleContinueWithoutAuth = useCallback(() => openAuthModal(), [openAuthModal]);

  // Pre-siembra de checkout-data en localStorage cuando el perfil está completo.
  // El CheckoutDataProvider de /checkout lee estas keys al montar, así confirmar
  // ya tiene customer+dirección válidos y su guard NO rebota a entrega. (El
  // carrito vive fuera del CheckoutDataProvider, por eso escribimos las keys
  // directo — es el mecanismo de persistencia documentado del context.)
  useEffect(() => {
    if (!fastFlow || !resolvedCustomer) return;
    const c = resolvedCustomer;
    try {
      localStorage.setItem(
        "marketplace-checkout-customer",
        JSON.stringify({ name: c.name || "", phone: c.phone || "", email: c.email || "" }),
      );
      // No clobbear una dirección que el cliente ya esté editando en checkout:
      // solo sembramos si la actual está vacía/inválida (<5 chars).
      let cur: { address?: string } = {};
      try {
        cur = JSON.parse(localStorage.getItem("marketplace-checkout-address") || "{}");
      } catch {}
      if (!(cur.address && cur.address.trim().length >= 5)) {
        localStorage.setItem(
          "marketplace-checkout-address",
          JSON.stringify({
            address: c.addressLine || "",
            notes: c.reference || "",
            departmentCode: c.departmentCode || "",
            departmentName: c.departmentName || "",
            provinceCode: c.provinceCode || "",
            provinceName: c.provinceName || "",
            districtCode: c.districtCode || "",
            districtName: c.districtName || "",
            zone: [c.districtName, c.provinceName, c.departmentName].filter(Boolean).join(", "),
          }),
        );
      }
    } catch {
      /* localStorage no disponible — confirmar caerá a su sync/guard normal */
    }
  }, [fastFlow, resolvedCustomer]);

  // Prefetch del próximo paso para que la transición sea instantánea
  useEffect(() => {
    if (!isEmpty) {
      router.prefetch(continueHref);
    }
  }, [isEmpty, router, continueHref]);

  // Si el usuario se loggea con el modal abierto, redirigir automáticamente al
  // destino correcto (confirmar si quedó con perfil completo, datos si no).
  useEffect(() => {
    if (loggedCustomer && authModalOpen) {
      closeAuthModal();
      router.push(
        isCustomerProfileComplete(loggedCustomer) ? "/checkout/confirmar" : "/checkout/datos",
      );
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
  // Guardar para después = sacar del carrito + persistir en la lista de guardados.
  const handleSave = useCallback(
    (item: CartItem) => {
      saveItem(item);
      handleRemove(item);
    },
    [saveItem, handleRemove],
  );
  // Volver al carrito desde "Guardados".
  const handleMoveToCart = useCallback(
    (item: CartItem) => {
      addItem({ ...item, quantity: item.quantity || 1 });
      unsaveItem(item);
    },
    [addItem, unsaveItem],
  );

  return (
    <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 py-4 sm:py-8 pb-32 lg:pb-10">
      {/* ── Hero header v3 (Brandon 2026-05-18 rediseño) ──
           Cambios vs v4:
           - "Compartir lista WhatsApp" full-width verde ELIMINADO del hero
             (competía con el CTA primario). Ahora vive como ícono entre
             las acciones secundarias del header.
           - Trust pills ELIMINADOS — redundantes con el summary final
             y agregan ruido visual mobile.
           - Stepper en mobile ahora compacto + integrado al header
             (antes ocupaba toda una fila).
           - Header más limpio: título + count + 3 íconos action (compartir,
             vaciar). Foco en los productos, no en chrome. */}
      <div className="mb-4 sm:mb-5">
        <Link
          href={seguirComprandoHref}
          className="inline-flex items-center gap-1.5 text-[length:var(--ts-sm)] font-bold text-[var(--text-secondary)] hover:text-[var(--accent)] hover:gap-2 transition-all mb-2"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          Seguir comprando
        </Link>

        <div className="flex items-center justify-between gap-3">
          {/* Título + conteo INLINE (compacto). Antes: h1 text-4xl + count debajo. */}
          <div className="flex items-baseline gap-2 sm:gap-2.5 min-w-0 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-black tracking-[-0.025em] text-[var(--text-primary)] leading-none shrink-0">
              Tu carrito
            </h1>
            {itemCount > 0 ? (
              <p className="text-[length:var(--ts-sm)] text-[var(--text-secondary)] leading-snug">
                <span className="font-extrabold text-[var(--text-primary)] tabular-nums">{itemCount}</span>
                {" "}{itemCount === 1 ? "producto" : "productos"}
                <span className="mx-1 text-[var(--text-tertiary)]">·</span>
                <span className="font-extrabold text-[var(--text-primary)] tabular-nums">{storeIds.length}</span>
                {" "}{storeIds.length === 1 ? "tienda" : "tiendas"}
              </p>
            ) : (
              <p className="text-[length:var(--ts-sm)] text-[var(--text-secondary)] leading-snug">
                Agrega productos para empezar
              </p>
            )}
          </div>
          {!isEmpty && (
            <div className="flex items-center gap-3 lg:gap-5 shrink-0">
              {/* Stepper movido al top bar unificado (CheckoutTopBar) — mismo
                  header que finalizar. Brandon 2026-06-08. */}
              <div className="flex items-center gap-1.5">
                {/* Compartir — ícono sutil, no botón full-width verde */}
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
                  compact
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
                  className="inline-flex items-center justify-center h-9 w-9 rounded-full border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-tertiary)] hover:border-[var(--data-error-500)] hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50,#fef2f2)]/50 active:scale-95 transition-all"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Contenido ─────────────────────────────────────────────── */}
      {isEmpty ? (
        <div
          className={cn(
            "rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)]",
            "px-6 py-10 sm:py-14 text-center flex flex-col items-center gap-4 sm:gap-5",
          )}
        >
          <div className="text-[var(--accent)]">
            <PaicheMascot size={140} animated />
          </div>
          <div className="max-w-md">
            <p className="text-2xl sm:text-3xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)]">
              Tu carrito está <span className="text-[var(--accent)]">vacío</span>
            </p>
            <p className="mt-2 text-[length:var(--ts-sm)] sm:text-base text-[var(--text-secondary)] leading-relaxed">
              Empezá a descubrir las bodegas, restaurantes y tiendas reales de tu barrio.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2.5 mt-1 w-full max-w-md">
            <Link
              href="/tiendas"
              className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-7 h-12 text-[length:var(--ts-sm)] font-extrabold text-white hover:opacity-90 active:scale-[0.98] transition-all"
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
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3 sm:gap-4 lg:gap-5 items-start pb-8">
          <section aria-label="Productos en tu carrito" className="space-y-3 sm:space-y-4">
            {/* Progreso hacia envío gratis */}
            <FreeShippingProgress />

            {/* Estilo AliExpress (Brandon 2026-06-13): cada vendedor = su propia
                tarjeta blanca con sombra suave y aire. Cabecera de tienda con
                chevron, filas espaciosas, footer con subtotal. */}
            {storeIds.map((sid) => {
              const group = byStore[sid];
              const subtotal = totalByStore[sid]?.total ?? 0;
              const itemCountStore = group.items.length;
              return (
                <article
                  key={sid}
                  className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] shadow-sm overflow-hidden"
                >
                  {/* Cabecera de vendedor: logo + nombre + nº ítems + chevron */}
                  <Link
                    href={`/marketplace/${group.storeSlug}`}
                    className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--rule-soft)] group/store hover:bg-[var(--surface-sunken)]/60 transition-colors"
                  >
                    <span className="relative inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-[var(--accent-soft)] text-[var(--accent)] text-[length:var(--ts-xs)] font-bold uppercase shrink-0 ring-1 ring-[var(--rule-soft)]">
                      {storeLogos[group.storeSlug] ? (
                        <Image
                          src={storeLogos[group.storeSlug]!}
                          alt={group.storeName}
                          fill
                          sizes="28px"
                          className="object-cover"
                        />
                      ) : (
                        group.storeName?.charAt(0) ?? <Store className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)] group-hover/store:text-[var(--accent)] transition-colors">
                      {group.storeName}
                    </span>
                    <span className="shrink-0 text-[length:var(--ts-xs)] font-medium text-[var(--text-tertiary)]">
                      {itemCountStore} {itemCountStore === 1 ? "ítem" : "ítems"}
                    </span>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-[var(--text-tertiary)] group-hover/store:translate-x-0.5 transition-transform"
                      strokeWidth={2}
                      aria-hidden
                    />
                  </Link>

                  <div>
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
                          onSave={() => handleSave(item)}
                        />
                      );
                    })}
                    </AnimatePresence>
                  </div>

                  {/* Footer suave: subtotal del vendedor */}
                  <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-[var(--surface-sunken)]/40 border-t border-[var(--rule-soft)]">
                    <span className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                      Subtotal · {itemCountStore} {itemCountStore === 1 ? "producto" : "productos"}
                    </span>
                    <span className="text-[length:var(--ts-sm)] font-bold text-[var(--text-primary)] tabular-nums">
                      {fmt(subtotal)}
                    </span>
                  </div>
                </article>
              );
            })}

            {/* Completá tu combo (sugiere bebida si llevás comida sin bebida) */}
            <ComboSugerido />

            {/* Guardados para después */}
            <SavedForLaterSection
              saved={saved}
              onMoveToCart={handleMoveToCart}
              onRemoveSaved={unsaveItem}
            />
          </section>

          {/* CheckoutSummary oculto en mobile (Brandon, mayo 14 2026): el
              CheckoutMobileCtaBar sticky bottom ya muestra total + CTA, no
              hace falta duplicar resumen abajo del listado en celular. */}
          <div className="hidden lg:block">
            <CheckoutSummary
              ctaLabel="Continuar al checkout"
              ctaHref={continueHref}
              onCtaClick={undefined}
              showItems={false}
              couponDiscount={couponDiscount}
              helperText={
                loggedCustomer
                  ? "Pago al recibir o por Yape · sin sorpresas"
                  : "Sin cuenta — solo tus datos. Pago al recibir o Yape."
              }
              beforeBreakdown={
                <CartCouponSection subtotal={grandTotal} onDiscountChange={setCouponDiscount} />
              }
            />
            {!loggedCustomer && (
              <p className="mt-3 text-center text-[length:var(--ts-sm)] text-[var(--text-tertiary)]">
                ¿Ya tenés cuenta?{" "}
                <button type="button" onClick={handleContinueWithoutAuth} className="font-bold text-[var(--accent)] underline underline-offset-2">
                  Iniciá sesión
                </button>{" "}
                para acumular puntos y seguir tu pedido.
              </p>
            )}
          </div>

          {/* Cupón solo accesible mobile (el desktop lo muestra dentro del summary) */}
          <div className="lg:hidden">
            <CartCouponSection subtotal={grandTotal} onDiscountChange={setCouponDiscount} />
          </div>
        </div>
      )}

      {/* Descubrimiento al pie del carrito: último antojo + cross-sell por
          categoría. Solo con productos en el carrito. */}
      {!isEmpty && <CartSuggestions />}

      <AuthModal open={authModalOpen} onClose={closeAuthModal} />
      <ConfirmDialog />

      {/* Sticky bottom CTA mobile — el cliente no necesita scrollear hasta
          el final del listado para encontrar el boton continuar */}
      {!isEmpty && (
        <CheckoutMobileCtaBar
          primaryLabel="Total"
          total={Math.max(0, grandTotal - couponDiscount)}
          ctaLabel="Continuar al checkout"
          ctaHref={continueHref}
          ctaOnClick={undefined}
          helperText={loggedCustomer ? "Pago al recibir o por Yape" : "Sin cuenta · pago al recibir o Yape"}
        />
      )}
    </div>
  );
}
