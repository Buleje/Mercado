/**
 * lib/payments/registry.ts
 *
 * Factory y registry de PaymentProvider.
 *
 * - Lazy init: los adapters se instancian solo cuando se piden.
 * - Singleton: misma instancia durante todo el ciclo del proceso.
 * - getPaymentProvider()     → proveedor por id, lanza si no existe.
 * - listAvailableProviders() → proveedores que soportan una moneda dada.
 */

import type { PaymentProvider, PaymentProviderId, Currency } from "@/lib/payments/provider";
import { CulqiProvider } from "@/lib/payments/adapters/culqi-adapter";
import { IzipayProvider } from "@/lib/payments/adapters/izipay-adapter";
import { MercadopagoProvider } from "@/lib/payments/adapters/mercadopago-adapter";
import { PagoefectivoProvider } from "@/lib/payments/adapters/pagoefectivo-adapter";

// ─── Singleton store ──────────────────────────────────────────────────────────

const _registry = new Map<PaymentProviderId, PaymentProvider>();

type ProviderFactory = () => PaymentProvider;

/** Factories registradas. Agregar nuevos proveedores aquí. */
const FACTORIES: Record<PaymentProviderId, ProviderFactory> = {
  culqi: () => new CulqiProvider(),
  izipay: () => new IzipayProvider(),
  mercadopago: () => new MercadopagoProvider(),
  pagoefectivo: () => new PagoefectivoProvider(),
};

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Retorna la instancia singleton del proveedor pedido.
 * Lanza un error claro si el id no existe (falla rápido en tiempo de desarrollo).
 *
 * Ejemplo:
 *   const mp = getPaymentProvider("mercadopago");
 *   const result = await mp.charge(input);
 */
export function getPaymentProvider(id: PaymentProviderId): PaymentProvider {
  let instance = _registry.get(id);

  if (!instance) {
    const factory = FACTORIES[id];
    // factory siempre existe para los 4 ids del enum — pero TypeScript no lo sabe
    // sin un exhaustive check, así que lo hacemos explícito.
    if (!factory) {
      throw new Error(
        `[payments/registry] Proveedor desconocido: "${id}". ` +
        `IDs válidos: ${Object.keys(FACTORIES).join(", ")}`,
      );
    }

    instance = factory();
    _registry.set(id, instance);
  }

  return instance;
}

/**
 * Lista los proveedores disponibles que soportan una moneda dada.
 * Útil para renderizar el selector de método de pago en el checkout.
 *
 * Ejemplo:
 *   const providers = listAvailableProviders("PEN");
 *   // → [CulqiProvider, IzipayProvider, MercadopagoProvider, PagoefectivoProvider]
 */
export function listAvailableProviders(currency: Currency): PaymentProvider[] {
  return (Object.keys(FACTORIES) as PaymentProviderId[])
    .map((id) => getPaymentProvider(id))
    .filter((p) => (p.supportsCurrencies as readonly string[]).includes(currency));
}

/**
 * Borra todas las instancias del registry.
 * Solo para tests — no llamar en producción.
 */
export function _resetRegistryForTests(): void {
  _registry.clear();
}
