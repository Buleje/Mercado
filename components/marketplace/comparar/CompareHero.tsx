"use client";

/**
 * CompareHero — Hero migrado a <UnifiedHero> pattern.
 *
 * Variant: 1col-center cuando esta vacio; 2col-right cuando hay productos
 * (CanastaVacia como ilustracion de intro).
 * Theme: canvas.
 *
 * Mantiene el boton "Vaciar comparacion" cuando count > 0 como overlay
 * sobre la misma seccion (absolute top-right).
 */

import { UnifiedHero } from "@/components/ui-system/UnifiedHero";
import { CanastaVacia } from "@/components/ui-system/illustrations/empty-states";
import { PrimaryButton } from "@buleje/design-system";
import { Trash2 } from "@buleje/design-system/icons";

interface CompareHeroProps {
  count: number;
  max: number;
  onClear: () => void;
}

export default function CompareHero({ count, max, onClear }: CompareHeroProps) {
  const isEmpty = count === 0;

  return (
    <div className="relative">
      <UnifiedHero
        kicker="Comparador"
        title="Compará productos lado a lado"
        description={`Revisa precio, stock, tienda y características de hasta ${max} productos al mismo tiempo. Así eliges con confianza antes de llevar al carrito.`}
        trustChips={
          count > 0
            ? [`Comparando ${count} de ${max} productos`]
            : [`Hasta ${max} productos`, "Sin registro", "Vista responsive"]
        }
        illustration={isEmpty ? CanastaVacia : undefined}
        illustrationSize={240}
        variant={isEmpty ? "1col-center" : "2col-right"}
        theme="canvas"
      >
        {count > 0 ? (
          <div className="flex pt-2">
            <PrimaryButton
              size="md"
              variant="secondary"
              onClick={onClear}
              leftIcon={<Trash2 className="h-4 w-4" aria-hidden />}
              aria-label="Vaciar comparación"
            >
              Vaciar comparación
            </PrimaryButton>
          </div>
        ) : null}
      </UnifiedHero>
    </div>
  );
}
