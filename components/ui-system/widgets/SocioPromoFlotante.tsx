"use client";

/**
 * SocioPromoFlotante — Mini toast flotante promocional.
 *
 * Se muestra si:
 *   - El user NO es Socio activo
 *   - Hizo 2+ compras (localStorage)
 *   - No lo cerró hace <7 días
 *
 * Compacto, dismissible, bottom-right encima del bottom nav.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "@buleje/design-system/icons";
import {
  CardTitle,
  Caption,
  PrimaryButton,
} from "@buleje/design-system";
import { useSocioBuleje } from "@/contexts/socio-buleje-context";
import { useTenantSlug, tenantKey } from "@/contexts/tenant-context";

const MIN_ORDERS = 2;
const DISMISS_DAYS = 7;

export function SocioPromoFlotante() {
  const slug = useTenantSlug();
  const { isSocio } = useSocioBuleje();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isSocio) return;
    if (typeof window === "undefined") return;

    try {
      // 1. Check dismiss timestamp
      const dismissKey = tenantKey(slug, "socio-promo-dismissed");
      const dismissedAt = window.localStorage.getItem(dismissKey);
      if (dismissedAt) {
        const elapsed = Date.now() - Number(dismissedAt);
        if (elapsed < DISMISS_DAYS * 24 * 60 * 60 * 1000) return;
      }

      // 2. Check min orders — el proyecto usa un tracker de "selling fast"
      //    y también "recently viewed". Para simular "compras hechas" leemos
      //    localStorage buleje-selling-fast (total de items distintos con actividad).
      //    En prod: conectar con customer-orders.db.
      const raw = window.localStorage.getItem("buleje-selling-fast") ?? "{}";
      const data = JSON.parse(raw) as Record<string, number[]>;
      const uniqueCount = Object.keys(data).length;
      if (uniqueCount < MIN_ORDERS) return;

      // 3. Stagger — mostrar tras 4s, no apenas cargar la página.
      const timer = setTimeout(() => setVisible(true), 4000);
      return () => clearTimeout(timer);
    } catch {
      // silent
    }
  }, [isSocio, slug]);

  if (isSocio || !visible) return null;

  const handleDismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(
        tenantKey(slug, "socio-promo-dismissed"),
        String(Date.now()),
      );
    } catch {
      // silent
    }
  };

  return (
    <aside
      role="complementary"
      aria-label="Promoción Socio Buleje"
      className="fixed bottom-20 right-4 z-40 max-w-[320px] w-[calc(100vw-2rem)] sm:w-80 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-lg overflow-hidden"
      style={{
        boxShadow: "0 10px 30px -5px color-mix(in oklch, var(--text-primary) 18%, transparent)",
      }}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
              style={{
                backgroundColor: "color-mix(in oklch, var(--data-success) 18%, transparent)",
                color: "var(--data-success)",
              }}
            >
              <Sparkles className="h-4 w-4" aria-hidden />
            </div>
            <CardTitle className="text-[length:var(--ts-sm)]">
              ¿Hacés compras seguido?
            </CardTitle>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Cerrar promoción"
            className="shrink-0 p-1 rounded-md hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <X className="h-3.5 w-3.5 text-[var(--text-tertiary)]" aria-hidden />
          </button>
        </div>
        <Caption className="text-[var(--text-secondary)] leading-relaxed">
          Con Socio Buleje ahorrás hasta S/ 500 al año en delivery y cashback.
          30 días gratis para probarlo.
        </Caption>
        <div className="mt-3 flex items-center gap-2">
          <PrimaryButton size="sm" asChild>
            <Link href="/socio-buleje">Ver beneficios</Link>
          </PrimaryButton>
          <button
            type="button"
            onClick={handleDismiss}
            className="text-[length:var(--ts-xs)] font-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
          >
            Ahora no
          </button>
        </div>
      </div>
    </aside>
  );
}
