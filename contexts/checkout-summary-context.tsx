"use client";

/**
 * CheckoutSummaryContext — riel de resumen PERSISTENTE del checkout.
 *
 * Brandon 2026-07-06: el resumen (CheckoutSummary desktop + CheckoutMobileCtaBar
 * mobile) vive en el LAYOUT de /checkout (CheckoutShell), no dentro de cada paso.
 * Al navegar datos → entrega → confirmar solo se re-monta la SECCIÓN CENTRAL; ni
 * el top bar ni el riel de resumen se recargan (React preserva el subtree del
 * layout entre pasos que comparten `app/checkout/layout.tsx`).
 *
 * Cada paso REGISTRA su config (label del CTA, handler, disabled/loading,
 * descuentos, textos del bar mobile) vía `useRegisterCheckoutSummary`. El riel
 * lee esa config + el carrito (useMarketplaceCart, self-contained) y se dibuja.
 *
 * Diseño anti-loop: dos contextos separados.
 *   - SetterContext (valor = setConfig, ESTABLE) → lo consumen los PASOS. Como
 *     su valor nunca cambia, registrar config no re-renderiza al paso.
 *   - ConfigContext (valor = config, cambia) → lo consumen los HOSTS del riel.
 *   Si un solo contexto expusiera {config,setConfig}, cada setConfig cambiaría
 *   el value → re-render del paso → efecto → setConfig → loop infinito.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";

export interface CheckoutSummaryConfig {
  // ── CheckoutSummary (desktop) ──
  ctaLabel: string;
  ctaHref?: string;
  onCtaClick?: () => void;
  ctaDisabled?: boolean;
  ctaLoading?: boolean;
  couponDiscount?: number;
  loyaltyDiscount?: number;
  showItems?: boolean;
  helperText?: string;
  // ── CheckoutMobileCtaBar (mobile) — overrides opcionales; si faltan, hereda
  //    del CTA de desktop (ctaLabel/helperText). ──
  mobileTotal?: number;
  mobilePrimaryLabel?: string;
  mobileCtaLabel?: string;
  mobileHelperText?: string;
  mobileDisabledReason?: string;
}

const SetterContext = createContext<
  ((config: CheckoutSummaryConfig | null) => void) | null
>(null);
const ConfigContext = createContext<CheckoutSummaryConfig | null>(null);

export function CheckoutSummaryProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<CheckoutSummaryConfig | null>(null);
  return (
    <SetterContext.Provider value={setConfig}>
      <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>
    </SetterContext.Provider>
  );
}

/** Lo consumen los hosts del riel (CheckoutShell). */
export function useCheckoutSummaryConfig(): CheckoutSummaryConfig | null {
  return useContext(ConfigContext);
}

/**
 * Un paso del checkout registra su config del riel. Empuja la config MÁS
 * RECIENTE tras cada render (mantiene closures/labels/disabled frescos). No
 * limpia al desmontar: el siguiente paso sobreescribe → el riel nunca parpadea
 * en blanco entre pasos.
 */
export function useRegisterCheckoutSummary(config: CheckoutSummaryConfig): void {
  const setConfig = useContext(SetterContext);
  useEffect(() => {
    setConfig?.(config);
  });
}
