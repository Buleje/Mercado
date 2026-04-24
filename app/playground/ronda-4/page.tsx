"use client";

/**
 * /playground/ronda-4 — Catalogo visual de todos los primitives creados
 * en la Ronda 4 de mejoras.
 *
 * Esta pagina no aparece en navegacion publica; sirve como documentacion
 * vivo para el equipo y QA visual.
 */

import { useState } from "react";
import { ShoppingCart, TrendingUp } from "@buleje/design-system/icons";
import AnimatedPrice from "@/components/ui-system/AnimatedPrice";
import CountUp from "@/components/ui-system/CountUp";
import {
  DiscountBadge,
  NewBadge,
  BestSellerBadge,
  LocalBadge,
  OrganicBadge,
  FreeShippingBadge,
  ExclusiveBadge,
  PreOrderBadge,
  LimitedStockBadge,
} from "@/components/ui-system/ProductBadges";
import CouponInput, { type AppliedCoupon } from "@/components/ui-system/CouponInput";
import OrderSummaryCard from "@/components/ui-system/OrderSummaryCard";
import PaymentMethodPicker, {
  type PaymentMethod,
} from "@/components/ui-system/PaymentMethodPicker";
import QuantityStepper from "@/components/ui-system/QuantityStepper";
import PriceRangeSlider from "@/components/ui-system/PriceRangeSlider";
import RatingStars from "@/components/ui-system/RatingStars";
import ReviewSummary from "@/components/ui-system/ReviewSummary";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import SegmentedProgress from "@/components/ui-system/SegmentedProgress";
import DeliveryProgressTracker from "@/components/ui-system/DeliveryProgressTracker";
import StatsWidget from "@/components/ui-system/StatsWidget";
import StoreCard from "@/components/ui-system/StoreCard";
import ValidatedInput from "@/components/ui-system/ValidatedInput";
import AddressAutocomplete from "@/components/ui-system/AddressAutocomplete";
import Tooltip from "@/components/ui-system/Tooltip";
import LiveOrderBanner from "@/components/ui-system/LiveOrderBanner";
import SmartSearchBar from "@/components/ui-system/SmartSearchBar";
import CompactFilterBar from "@/components/ui-system/CompactFilterBar";
import LoyaltyPointsWidget from "@/components/ui-system/LoyaltyPointsWidget";
import ComparisonBar, { type CompareItem } from "@/components/ui-system/ComparisonBar";
import BottomSheet from "@/components/ui-system/BottomSheet";
import { UndoToastProvider, useUndoToast } from "@/components/ui-system/UndoToast";
import SuccessCelebration from "@/components/ui-system/SuccessCelebration";
import ConfettiBurst, { confettiBurst } from "@/components/ui-system/ConfettiBurst";
import FeatureSpotlight from "@/components/ui-system/FeatureSpotlight";
import { Shimmer, ShimmerText, ShimmerCard } from "@/components/ui-system/Shimmer";
import MotoDeliveryLoader from "@/components/ui-system/MotoDeliveryLoader";

// ── Section wrapper ────────────────────────────────────────────────

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-[var(--rule-base)] py-10">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <header className="mb-6">
          <h2 className="text-2xl font-extrabold text-[var(--text-primary)] tracking-tight">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-[var(--text-tertiary)]">{subtitle}</p>}
        </header>
        <div>{children}</div>
      </div>
    </section>
  );
}

function Demo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 space-y-3">
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </p>
      <div>{children}</div>
    </div>
  );
}

// ── Demos concretas ────────────────────────────────────────────────

function UndoToastDemo() {
  const { showUndo } = useUndoToast();
  return (
    <button
      type="button"
      onClick={() =>
        showUndo({
          message: "Item eliminado del carrito",
          onUndo: () => alert("Deshecho"),
          duration: 4000,
        })
      }
      className="inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-4 py-2 text-xs font-bold hover:bg-[var(--accent)] transition-colors"
    >
      Mostrar UndoToast
    </button>
  );
}

export default function Ronda4Playground() {
  const [qty, setQty] = useState(1);
  const [priceRange, setPriceRange] = useState<[number, number]>([5, 85]);
  const [rating, setRating] = useState(0);
  const [view, setView] = useState<"list" | "grid" | "map">("grid");
  const [payment, setPayment] = useState<PaymentMethod | null>("yape");
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const [compareItems, setCompareItems] = useState<CompareItem[]>([
    { id: "1", name: "Arroz Paisana 750g", price: 4.9, storeName: "Bodega Elsa" },
    { id: "2", name: "Arroz Costeño 5kg", price: 22.5, storeName: "Minimarket Don Carlos" },
  ]);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  return (
    <UndoToastProvider>
      <div className="min-h-screen bg-[var(--surface-canvas)]">
        <header className="border-b border-[var(--rule-base)] bg-[var(--surface-raised)] sticky top-0 z-20">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)]">
              Design system · Ronda 4
            </p>
            <h1 className="mt-1 text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
              Playground de primitives
            </h1>
            <p className="mt-2 text-sm text-[var(--text-tertiary)] max-w-2xl">
              Catalogo visual de los 31 components + 13 hooks creados en la ronda 4. Usar esta
              pagina para QA visual, documentacion y referencia al integrar en pantallas reales.
            </p>
          </div>
        </header>

        {/* ── Price & counters ──────────────────────────────────── */}
        <Section title="Precios, números y animación" subtitle="AnimatedPrice + CountUp + confetti CSS">
          <div className="grid sm:grid-cols-3 gap-4">
            <Demo label="AnimatedPrice">
              <AnimatedPrice value={29.9} size="lg" />
            </Demo>
            <Demo label="CountUp">
              <p className="text-3xl font-extrabold text-[var(--text-primary)] tabular-nums">
                <CountUp to={1250} duration={1200} suffix=" pts" />
              </p>
            </Demo>
            <Demo label="ConfettiBurst">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfetti((c) => !c)}
                  className="rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-4 py-2 text-xs font-bold"
                >
                  Burst declarativo
                </button>
                <button
                  type="button"
                  onClick={() => confettiBurst()}
                  className="rounded-full border border-[var(--rule-base)] px-4 py-2 text-xs font-bold"
                >
                  Burst imperativo
                </button>
              </div>
              <ConfettiBurst trigger={confetti} />
            </Demo>
          </div>
        </Section>

        {/* ── Badges de producto ────────────────────────────────── */}
        <Section title="Badges de producto" subtitle="9 badges tokenizados para cards de producto">
          <Demo label="Coleccion completa">
            <div className="flex flex-wrap gap-2">
              <DiscountBadge percent={25} />
              <NewBadge />
              <BestSellerBadge />
              <LocalBadge location="Yarinacocha" />
              <OrganicBadge />
              <FreeShippingBadge />
              <ExclusiveBadge />
              <PreOrderBadge days={3} />
              <LimitedStockBadge count={2} />
              <LimitedStockBadge count={15} />
            </div>
          </Demo>
        </Section>

        {/* ── Rating & review ───────────────────────────────────── */}
        <Section title="Rating y reseñas" subtitle="RatingStars + ReviewSummary">
          <div className="grid md:grid-cols-2 gap-4">
            <Demo label="RatingStars display + sizes">
              <div className="space-y-2">
                <RatingStars value={4.5} count={128} size="xs" />
                <RatingStars value={4.5} count={128} size="sm" />
                <RatingStars value={4.5} count={128} size="md" />
                <RatingStars value={4.5} count={128} size="lg" />
              </div>
            </Demo>
            <Demo label="RatingStars input">
              <RatingStars value={rating} onChange={setRating} mode="input" size="lg" />
              <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                Seleccionado: {rating || "—"}
              </p>
            </Demo>
          </div>
          <div className="mt-4">
            <Demo label="ReviewSummary completo">
              <ReviewSummary
                average={4.6}
                total={342}
                distribution={{ 5: 252, 4: 62, 3: 18, 2: 8, 1: 2 }}
                onWriteReview={() => alert("Abrir modal de review")}
              />
            </Demo>
          </div>
        </Section>

        {/* ── Forms ─────────────────────────────────────────────── */}
        <Section title="Controles de formulario" subtitle="ValidatedInput + QuantityStepper + PriceRangeSlider + AddressAutocomplete">
          <div className="grid md:grid-cols-2 gap-4">
            <Demo label="ValidatedInput con async">
              <ValidatedInput
                label="Email"
                hint="Te enviamos el comprobante acá"
                value={email}
                onChange={setEmail}
                validate={async (v) => {
                  await new Promise((r) => setTimeout(r, 400));
                  return v.includes("@")
                    ? { valid: true }
                    : { valid: false, message: "Formato de email inválido" };
                }}
                required
              />
            </Demo>
            <Demo label="QuantityStepper 3 sizes">
              <div className="flex flex-col gap-3">
                <QuantityStepper value={qty} onChange={setQty} size="sm" />
                <QuantityStepper value={qty} onChange={setQty} size="md" max={10} unit="kg" />
                <QuantityStepper value={qty} onChange={setQty} size="lg" />
              </div>
            </Demo>
            <Demo label="PriceRangeSlider">
              <PriceRangeSlider
                min={0}
                max={200}
                step={5}
                value={priceRange}
                onChange={setPriceRange}
              />
            </Demo>
            <Demo label="AddressAutocomplete">
              <AddressAutocomplete
                value={address}
                onChange={(v) => setAddress(v)}
                referencesSuggestions={[
                  "Mercado Agropecuario",
                  "Parque San Martín",
                  "Plaza de Armas Pucallpa",
                  "Av. Centenario",
                  "Jr. Ucayali 245",
                ]}
              />
            </Demo>
          </div>
        </Section>

        {/* ── Navigation / selection ────────────────────────────── */}
        <Section title="Selección y navegación" subtitle="SegmentedControl + SegmentedProgress">
          <div className="grid md:grid-cols-2 gap-4">
            <Demo label="SegmentedControl">
              <SegmentedControl
                value={view}
                onChange={setView}
                options={[
                  { value: "list", label: "Lista" },
                  { value: "grid", label: "Grilla" },
                  { value: "map", label: "Mapa", badge: 12 },
                ]}
              />
            </Demo>
            <Demo label="SegmentedProgress">
              <SegmentedProgress
                steps={["Datos", "Entrega", "Pago", "Confirmar"]}
                currentStep={2}
              />
            </Demo>
          </div>
        </Section>

        {/* ── Order trackers ───────────────────────────────────── */}
        <Section title="Seguimiento de pedido" subtitle="DeliveryProgressTracker + LiveOrderBanner">
          <div className="space-y-4">
            <Demo label="DeliveryProgressTracker horizontal">
              <DeliveryProgressTracker
                currentStep="en_camino"
                steps={[
                  { id: "recibido", label: "Recibido", at: "14:23" },
                  { id: "preparando", label: "Preparando", at: "14:28" },
                  { id: "en_camino", label: "En camino", at: "14:45" },
                  { id: "entregado", label: "Entregado" },
                ]}
              />
            </Demo>
            <Demo label="DeliveryProgressTracker vertical">
              <DeliveryProgressTracker
                orientation="vertical"
                currentStep="preparando"
                steps={[
                  { id: "recibido", label: "Pedido recibido", at: "14:23", description: "El bodeguero ya lo vio" },
                  { id: "preparando", label: "Preparando", at: "14:28", description: "Armando tu canasta" },
                  { id: "en_camino", label: "En camino" },
                  { id: "entregado", label: "Entregado" },
                ]}
              />
            </Demo>
            <Demo label="LiveOrderBanner">
              <LiveOrderBanner
                order={{
                  id: "BJ-1234",
                  orderNumber: "1234",
                  status: "en_camino",
                  etaMinutes: 12,
                  storeName: "Bodega Elsa",
                }}
              />
            </Demo>
          </div>
        </Section>

        {/* ── Commerce primitives ───────────────────────────────── */}
        <Section title="Commerce" subtitle="PaymentMethodPicker + CouponInput + OrderSummaryCard + LoyaltyPointsWidget">
          <div className="grid md:grid-cols-2 gap-4">
            <Demo label="PaymentMethodPicker">
              <PaymentMethodPicker
                value={payment}
                onChange={setPayment}
                available={["yape", "plin", "cash", "card"]}
              />
            </Demo>
            <Demo label="CouponInput">
              <CouponInput
                applied={appliedCoupon}
                onApply={async (code) => {
                  await new Promise((r) => setTimeout(r, 400));
                  if (code === "PROMO10") {
                    const c: AppliedCoupon = { code, description: "10% off", amount: 10 };
                    setAppliedCoupon(c);
                    return { valid: true, coupon: c };
                  }
                  return { valid: false, error: "Probá con PROMO10" };
                }}
                onRemove={() => setAppliedCoupon(null)}
                availableCoupons={[
                  { code: "PROMO10", description: "10% descuento", amount: 10 },
                  { code: "GRATIS", description: "Envío gratis", amount: 5, isFixed: true },
                ]}
              />
            </Demo>
            <Demo label="OrderSummaryCard full">
              <OrderSummaryCard
                itemCount={7}
                savings={4.58}
                lines={[
                  { label: "Subtotal", value: 45.8 },
                  { label: "Delivery", value: 5.0 },
                  { label: "Cupón BIENVENIDO10", value: -4.58, tone: "accent" },
                  { label: "IGV incluido", value: 0, muted: true, hint: "(ya incluido)" },
                ]}
                total={46.22}
              />
            </Demo>
            <Demo label="LoyaltyPointsWidget full">
              <LoyaltyPointsWidget
                points={1250}
                tier="oro"
                pointsToNextTier={750}
                nextTierName="Diamante"
                variant="full"
              />
            </Demo>
          </div>
        </Section>

        {/* ── Stats & data ──────────────────────────────────────── */}
        <Section title="Dashboards y stats" subtitle="StatsWidget en 3 variantes">
          <div className="grid md:grid-cols-3 gap-4">
            <StatsWidget
              label="Ventas hoy"
              value={1250}
              previousValue={1100}
              format="currency"
              icon={<TrendingUp className="h-4 w-4" strokeWidth={2} />}
              subtitle="vs ayer"
              trend={[80, 100, 90, 120, 110, 125, 130]}
            />
            <StatsWidget
              label="Pedidos"
              value={42}
              previousValue={38}
              icon={<ShoppingCart className="h-4 w-4" strokeWidth={2} />}
              subtitle="últimas 24h"
              variant="featured"
            />
            <StatsWidget
              label="Tasa de conversión"
              value={3.4}
              previousValue={3.8}
              format="percent"
              icon={<TrendingUp className="h-4 w-4" strokeWidth={2} />}
              subtitle="vs semana pasada"
              positiveTrendIsGood
            />
            <StatsWidget label="Clientes nuevos" value={18} variant="compact" previousValue={22} />
            <StatsWidget
              label="Ingresos mes"
              value={48250}
              variant="compact"
              previousValue={42100}
              format="currency"
            />
            <StatsWidget
              label="Tienda mejor valorada"
              value={4.8}
              variant="compact"
              previousValue={4.7}
            />
          </div>
        </Section>

        {/* ── Feedback / overlays ───────────────────────────────── */}
        <Section title="Feedback y overlays" subtitle="UndoToast + SuccessCelebration + BottomSheet + Tooltip + FeatureSpotlight">
          <div className="flex flex-wrap gap-3">
            <Demo label="UndoToast">
              <UndoToastDemo />
            </Demo>
            <Demo label="SuccessCelebration">
              <button
                type="button"
                onClick={() => setCelebrate(true)}
                data-spotlight="celebrate-btn"
                className="rounded-full bg-[var(--accent)] text-[var(--surface-canvas)] px-4 py-2 text-xs font-bold"
              >
                Abrir modal
              </button>
              <SuccessCelebration
                open={celebrate}
                onClose={() => setCelebrate(false)}
                title="¡Tu pedido está en camino!"
                message="La moto está saliendo de la bodega. Tiempo estimado: 12 min."
                mascot="paiche"
                primaryAction={{ label: "Ver seguimiento", onClick: () => setCelebrate(false) }}
              />
              <FeatureSpotlight
                id="playground-celebrate-demo"
                target="[data-spotlight='celebrate-btn']"
                title="Probá la celebración"
                description="Ese botón abre un modal con confetti + mascota Paiche."
                placement="bottom"
                badge="Demo"
              />
            </Demo>
            <Demo label="BottomSheet">
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-4 py-2 text-xs font-bold"
              >
                Abrir sheet
              </button>
              <BottomSheet
                open={sheetOpen}
                onClose={() => setSheetOpen(false)}
                title="Filtrá por categoría"
                description="Elegí las categorías que te interesan."
                footer={
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSheetOpen(false)}
                      className="flex-1 rounded-full border border-[var(--rule-base)] py-2 text-xs font-bold"
                    >
                      Cerrar
                    </button>
                    <button
                      type="button"
                      onClick={() => setSheetOpen(false)}
                      className="flex-1 rounded-full bg-[var(--accent)] text-[var(--surface-canvas)] py-2 text-xs font-bold"
                    >
                      Aplicar
                    </button>
                  </div>
                }
              >
                <ul className="space-y-2">
                  {["Frutas y verduras", "Abarrotes", "Carnes", "Lácteos", "Bebidas", "Limpieza"].map(
                    (c) => (
                      <li key={c}>
                        <label className="flex items-center gap-3 py-2">
                          <input type="checkbox" className="h-4 w-4" />
                          <span className="text-sm text-[var(--text-primary)]">{c}</span>
                        </label>
                      </li>
                    ),
                  )}
                </ul>
              </BottomSheet>
            </Demo>
            <Demo label="Tooltip">
              <div className="flex items-center gap-3">
                <Tooltip content="IGV incluido">
                  <span className="underline decoration-dotted cursor-help text-sm">Precio total</span>
                </Tooltip>
                <Tooltip content="Tu calificación ayuda a otros vecinos" placement="right">
                  <span className="underline decoration-dotted cursor-help text-sm">¿Para qué?</span>
                </Tooltip>
              </div>
            </Demo>
          </div>
        </Section>

        {/* ── Loaders & skeletons ───────────────────────────────── */}
        <Section title="Loaders y skeletons" subtitle="Shimmer + MotoDeliveryLoader">
          <div className="grid md:grid-cols-2 gap-4">
            <Demo label="Shimmer skeleton">
              <div className="space-y-3">
                <Shimmer className="h-6 w-40 rounded" />
                <ShimmerText lines={3} />
                <ShimmerCard />
              </div>
            </Demo>
            <Demo label="MotoDeliveryLoader">
              <MotoDeliveryLoader label="Tu pedido está por salir…" />
            </Demo>
          </div>
        </Section>

        {/* ── Search & filters ──────────────────────────────────── */}
        <Section title="Búsqueda y filtros" subtitle="SmartSearchBar + CompactFilterBar">
          <div className="space-y-4">
            <Demo label="SmartSearchBar con historial y trending">
              <SmartSearchBar
                onSearch={(q) => alert(`Buscando: ${q}`)}
                trendingSuggestions={[
                  { id: "t1", label: "Arroz Paisana 750g", type: "trending", href: "#" },
                  { id: "t2", label: "Detergente Ariel 1kg", type: "trending", href: "#" },
                ]}
                quickCategories={[
                  { label: "Frutas", href: "#" },
                  { label: "Abarrotes", href: "#" },
                  { label: "Bebidas", href: "#" },
                ]}
              />
            </Demo>
            <Demo label="CompactFilterBar">
              <CompactFilterBar
                activeCount={2}
                onClearAll={() => setActiveFilter(null)}
                onOpenAllFilters={() => alert("Abrir sheet filtros")}
                filters={[
                  {
                    id: "precio",
                    label: "Precio",
                    count: 1,
                    onClick: () => setActiveFilter("precio"),
                  },
                  {
                    id: "tienda",
                    label: "Tienda",
                    count: 3,
                    onClick: () => setActiveFilter("tienda"),
                  },
                  {
                    id: "oferta",
                    label: "En oferta",
                    active: activeFilter === "oferta",
                    hideCaret: true,
                    onClick: () => setActiveFilter(activeFilter === "oferta" ? null : "oferta"),
                  },
                ]}
              />
            </Demo>
          </div>
        </Section>

        {/* ── Store cards ────────────────────────────────────────── */}
        <Section title="Cards de tienda" subtitle="StoreCard grid + list">
          <div className="grid md:grid-cols-3 gap-4 mb-4">
            {[
              {
                slug: "bodega-elsa",
                name: "Bodega Elsa",
                rating: 4.7,
                reviewCount: 124,
                distanceKm: 0.4,
                deliveryMinutes: 18,
                categories: ["Frutas", "Abarrotes"],
                status: "open" as const,
                badge: "Favorita",
                isFavorite: true,
              },
              {
                slug: "minimarket-carlos",
                name: "Minimarket Don Carlos",
                rating: 4.4,
                reviewCount: 82,
                distanceKm: 1.2,
                deliveryMinutes: 25,
                categories: ["Bebidas", "Snacks", "Lácteos"],
                status: "closing_soon" as const,
              },
              {
                slug: "tienda-doña-maria",
                name: "Tienda Doña María",
                rating: 4.9,
                reviewCount: 45,
                distanceKm: 0.8,
                deliveryMinutes: 15,
                categories: ["Carnes"],
                status: "closed" as const,
              },
            ].map((store) => (
              <StoreCard key={store.slug} store={store} onToggleFavorite={() => {}} />
            ))}
          </div>
          <Demo label="Variante list">
            <div className="space-y-2">
              <StoreCard
                variant="list"
                store={{
                  slug: "bodega-elsa",
                  name: "Bodega Elsa",
                  rating: 4.7,
                  reviewCount: 124,
                  distanceKm: 0.4,
                  deliveryMinutes: 18,
                  status: "open",
                  badge: "Favorita",
                }}
              />
            </div>
          </Demo>
        </Section>

        {/* ── Comparison bar ─────────────────────────────────────── */}
        <Section title="Comparador de productos" subtitle="ComparisonBar">
          <Demo label="Con 2 items (sticky bottom)">
            <p className="text-xs text-[var(--text-tertiary)] mb-3">
              Scroll hasta el final — el comparador aparece sticky abajo.
            </p>
            <ComparisonBar
              items={compareItems}
              onRemove={(id) => setCompareItems((items) => items.filter((i) => i.id !== id))}
              onClear={() => setCompareItems([])}
              onCompare={() => alert("Abrir /comparar")}
            />
          </Demo>
        </Section>

        <div className="py-20 text-center text-xs text-[var(--text-tertiary)]">
          Fin del playground · 31 components · 13 hooks
        </div>
      </div>
    </UndoToastProvider>
  );
}
