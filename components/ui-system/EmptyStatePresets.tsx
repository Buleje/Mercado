"use client";

/**
 * EmptyStatePresets — Empty states pre-armados para casos comunes del
 * marketplace con ilustraciones peruanas del DS (canasta, lupa, cuaderno,
 * olla, etc).
 *
 * Uso:
 *   <EmptyCart onExplore={() => router.push("/marketplace/explorar")} />
 *   <EmptyFavorites />
 *   <EmptySearch query="arroz cusqueno" onClear={...} />
 *   <EmptyOrders />
 *
 * Todos aprovechan <EmptyState /> del DS como primitivo. Nunca emojis.
 */

import Link from "next/link";
import { EmptyState } from "@/components/ui-system/EmptyState";
import {
  CanastaVacia,
  PedidoLlegando,
  LupaConfundida,
  CuadernoAbierto,
  OllaVacia,
  EstanteVacio,
  FrascoEstrellas,
  BalanzaVacia,
  MensajeronBuscando,
  ConexionCortada,
} from "@/components/ui-system/illustrations/empty-states";

// ── Presets ────────────────────────────────────────────────────────────────

interface CartProps {
  onExplore?: () => void;
}

export function EmptyCart({ onExplore }: CartProps = {}) {
  return (
    <EmptyState
      illustration={<CanastaVacia size={160} />}
      eyebrow="Tu carrito"
      title="Está vacío por ahora"
      description="Encontrá productos de bodegas cercanas y empezá a armar tu pedido."
      action={
        onExplore ? (
          <button
            type="button"
            onClick={onExplore}
            className="rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-6 py-3 text-sm font-bold hover:bg-[var(--accent)] transition-colors"
          >
            Explorar bodegas
          </button>
        ) : (
          <Link
            href="/marketplace/explorar"
            className="rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-6 py-3 text-sm font-bold hover:bg-[var(--accent)] transition-colors"
          >
            Explorar bodegas
          </Link>
        )
      }
    />
  );
}

interface SearchProps {
  query?: string;
  onClear?: () => void;
}

export function EmptySearch({ query, onClear }: SearchProps = {}) {
  return (
    <EmptyState
      illustration={<LupaConfundida size={140} />}
      eyebrow="Sin resultados"
      title={query ? `No encontramos “${query}”` : "No hay coincidencias"}
      description="Probá con otra palabra más simple, o revisá si está escrita diferente. Las bodegas locales suelen usar nombres cortos."
      action={
        onClear && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-full border border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-primary)] px-5 py-2.5 text-sm font-bold hover:border-[var(--accent)] transition-colors"
          >
            Limpiar búsqueda
          </button>
        )
      }
      secondaryAction={
        <Link
          href="/marketplace/explorar"
          className="text-sm font-bold text-[var(--accent)] hover:underline"
        >
          Explorar categorías
        </Link>
      }
    />
  );
}

export function EmptyFavorites() {
  return (
    <EmptyState
      illustration={<FrascoEstrellas size={140} />}
      eyebrow="Tus favoritos"
      title="Todavía no guardaste nada"
      description="Tocá el corazón en cualquier producto para tenerlo a mano para la próxima compra."
      action={
        <Link
          href="/marketplace/explorar"
          className="rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-6 py-3 text-sm font-bold hover:bg-[var(--accent)] transition-colors"
        >
          Descubrir productos
        </Link>
      }
    />
  );
}

export function EmptyOrders() {
  return (
    <EmptyState
      illustration={<PedidoLlegando size={160} />}
      eyebrow="Tus pedidos"
      title="Aún no hiciste ningún pedido"
      description="Cuando hagas tu primer pedido, aparecerá acá con el estado en vivo y el comprobante."
      action={
        <Link
          href="/marketplace/explorar"
          className="rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-6 py-3 text-sm font-bold hover:bg-[var(--accent)] transition-colors"
        >
          Hacer mi primer pedido
        </Link>
      }
    />
  );
}

export function EmptyRecipes() {
  return (
    <EmptyState
      illustration={<OllaVacia size={140} />}
      eyebrow="Recetario"
      title="Sin recetas guardadas"
      description="Explorá nuestras recetas peruanas con ingredientes de bodega. Cada una te arma el carrito en 1 tap."
      action={
        <Link
          href="/marketplace/recetas"
          className="rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-6 py-3 text-sm font-bold hover:bg-[var(--accent)] transition-colors"
        >
          Ver recetas
        </Link>
      }
    />
  );
}

export function EmptyStore({ storeName }: { storeName?: string } = {}) {
  return (
    <EmptyState
      illustration={<EstanteVacio size={140} />}
      eyebrow="Bodega"
      title={storeName ? `${storeName} aún no tiene productos` : "Bodega sin productos"}
      description="Probá más tarde — el bodeguero está armando su catálogo. Mientras tanto, hay otras opciones cerca tuyo."
      action={
        <Link
          href="/tiendas"
          className="rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-6 py-3 text-sm font-bold hover:bg-[var(--accent)] transition-colors"
        >
          Otras bodegas cerca
        </Link>
      }
    />
  );
}

export function EmptyReviews() {
  return (
    <EmptyState
      illustration={<CuadernoAbierto size={140} />}
      eyebrow="Reseñas"
      title="Todavía sin reseñas"
      description="Sé el primero en compartir tu experiencia con este producto. Las opiniones con foto ayudan más a otros vecinos."
      size="sm"
    />
  );
}

export function EmptyCoupons() {
  return (
    <EmptyState
      illustration={<BalanzaVacia size={140} />}
      eyebrow="Cupones"
      title="No tenés cupones activos"
      description="Cada bodega puede darte códigos de descuento. Escribilos en el checkout o revisá si hay ofertas en las bodegas que sigas."
      action={
        <Link
          href="/marketplace/ofertas"
          className="rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-6 py-3 text-sm font-bold hover:bg-[var(--accent)] transition-colors"
        >
          Ver ofertas del día
        </Link>
      }
    />
  );
}

export function EmptyNotifications() {
  return (
    <EmptyState
      illustration={<MensajeronBuscando size={140} />}
      eyebrow="Notificaciones"
      title="Todo tranquilo por acá"
      description="Te avisaremos cuando tu pedido esté en camino, haya ofertas en tus bodegas favoritas o tengas un cupón nuevo."
      size="sm"
    />
  );
}

interface ConnectionProps {
  onRetry?: () => void;
}

export function EmptyNoConnection({ onRetry }: ConnectionProps = {}) {
  return (
    <EmptyState
      illustration={<ConexionCortada size={140} />}
      eyebrow="Sin conexión"
      title="No pudimos conectar"
      description="Revisá tu internet y reintentá. Tu carrito está guardado — no se pierde nada."
      action={
        onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-6 py-3 text-sm font-bold hover:bg-[var(--accent)] transition-colors"
          >
            Reintentar
          </button>
        )
      }
    />
  );
}
