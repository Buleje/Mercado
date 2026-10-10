"use client";

import UnifiedProductCard, {
  type UnifiedProductCardProduct,
} from "@/components/marketplace/UnifiedProductCard";

export interface HomeProductCardProps {
  product: UnifiedProductCardProduct;
  href?: string;
  index?: number;
  aboveFold?: boolean;
  /** Oculta el avatar de la tienda (carril de una sola tienda). */
  ocultarTienda?: boolean;
  /** Puesto de ranking 1-6 («Lo más pedido»): numeral grande sobre la foto. */
  puesto?: number;
  /** "denso" = carriles y grilla (default) · "fila" = ticket horizontal (urgencia). */
  forma?: "denso" | "fila";
}

/** STUB de la Fase 0. El carril C lo reemplaza SIN cambiar estas props. */
export default function HomeProductCard({
  product,
  href,
  index,
  aboveFold,
  ocultarTienda,
  puesto,
}: HomeProductCardProps) {
  return (
    <UnifiedProductCard
      product={product}
      href={href}
      index={index}
      aboveFold={aboveFold}
      hideStore={ocultarTienda}
      rank={puesto}
      variant={puesto ? "top" : "default"}
      layout="compact"
    />
  );
}
