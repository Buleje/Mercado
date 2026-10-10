"use client";

/**
 * useForecasting — carga y acciones de la Predicción de ventas.
 *
 * Salió de `ForecastingDashboard.tsx` sin cambiar nada: el tablero entero pide
 * los tres paneles juntos (como siempre), y un panel montado suelto pide sólo
 * lo suyo (`paneles`). Compras › Sugerencias monta el reorden solo: no tiene
 * por qué pedir el pronóstico ni los precios.
 *
 * Endpoints:
 *   pronóstico → GET /api/inventory/forecast?productId=… (primer producto activo como muestra)
 *   reorden    → GET /api/forecasting/reorder-suggestions · POST /api/forecasting/auto-reorder
 *   precios    → GET /api/forecasting/price-suggestions · PATCH /api/products/:id
 */

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  InventoryForecastSchema,
  PriceResponseSchema,
  ReorderResponseSchema,
  type DashboardState,
  type InventoryForecast,
  type PriceSuggestion,
  type ReorderSuggestion,
} from "./forecast-datos";

export type PanelForecast = "forecast" | "reorder" | "prices";

export const TODOS_LOS_PANELES: readonly PanelForecast[] = ["forecast", "reorder", "prices"];

export interface Forecasting {
  state: DashboardState;
  cargarDatos: () => Promise<void>;
  /** Auto-reorden (panel de reorden). */
  autoReordering: boolean;
  autoReorderMsg: string | null;
  ejecutarAutoReorder: () => Promise<void>;
  /** Aplicar un precio sugerido (panel de precios). */
  applyingPrice: number | null;
  appliedPrices: Set<number>;
  aplicarPrecio: (suggestion: PriceSuggestion) => Promise<void>;
}

/** GET que tira si la respuesta no es 2xx (lo atrapa `Promise.allSettled`). */
function pedirJson(url: string): Promise<unknown> {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });
}

export function useForecasting(paneles: readonly PanelForecast[] = TODOS_LOS_PANELES): Forecasting {
  /* En texto: quien llama suele pasar un array literal nuevo en cada render. */
  const clave = paneles.join("|");

  const [state, setState] = useState<DashboardState>({
    forecast: null,
    reorder: [],
    prices: [],
    loading: false,
    errors: { forecast: null, reorder: null, prices: null },
  });

  // Estado de auto-reorder (Panel B)
  const [autoReordering, setAutoReordering] = useState(false);
  const [autoReorderMsg, setAutoReorderMsg] = useState<string | null>(null);

  // Estado de aplicar precio (Panel C)
  const [applyingPrice, setApplyingPrice] = useState<number | null>(null);
  const [appliedPrices, setAppliedPrices] = useState<Set<number>>(new Set());

  /**
   * Carga los paneles pedidos en paralelo.
   * Cada fetch falla independientemente para no bloquear los demás paneles.
   */
  const cargarDatos = useCallback(async () => {
    const pide = new Set(clave.split("|"));
    setState((prev) => ({
      ...prev,
      loading: true,
      errors: { forecast: null, reorder: null, prices: null },
    }));

    /* Resolver el productId del primer producto activo del tenant.
       Antes hardcodeábamos productId=1 que devolvía 404 si el tenant no
       tenía un producto con id 1 (ej: tenant nuevo, IDs auto-incrementales
       arrancan en 1252382). Ahora el ID se descubre dinámicamente. */
    let sampleProductId: number | null = null;
    if (pide.has("forecast")) {
      try {
        const r = await fetch("/api/products?limit=1");
        if (r.ok) {
          const products = await r.json();
          if (Array.isArray(products) && products.length > 0 && typeof products[0]?.id === "number") {
            sampleProductId = products[0].id;
          }
        }
      } catch { /* sigue como null — forecast quedará en empty */ }
    }

    // Lanzar los fetches en paralelo (forecast solo si hay producto)
    const [forecastRes, reorderRes, pricesRes] = await Promise.allSettled([
      !pide.has("forecast")
        ? Promise.resolve(null)
        : sampleProductId
          ? pedirJson(`/api/inventory/forecast?productId=${sampleProductId}`)
          : Promise.reject(new Error("no-products")),
      pide.has("reorder") ? pedirJson("/api/forecasting/reorder-suggestions") : Promise.resolve(null),
      pide.has("prices") ? pedirJson("/api/forecasting/price-suggestions") : Promise.resolve(null),
    ]);

    // Procesar forecast con safeParse
    let forecast: InventoryForecast | null = null;
    let errorForecast: string | null = null;
    if (!pide.has("forecast")) {
      // Panel no pedido: ni dato ni error.
    } else if (forecastRes.status === "fulfilled") {
      const parsed = InventoryForecastSchema.safeParse(forecastRes.value);
      if (parsed.success) {
        forecast = parsed.data;
      } else {
        errorForecast = "Datos de pronóstico inválidos";
      }
    } else if (sampleProductId === null) {
      // No hay productos en el tenant — empty state, no error
      errorForecast = null;
    } else {
      errorForecast = "No se pudo cargar el pronóstico";
    }

    // Procesar reorder con safeParse
    let reorder: ReorderSuggestion[] = [];
    let errorReorder: string | null = null;
    if (!pide.has("reorder")) {
      // Panel no pedido.
    } else if (reorderRes.status === "fulfilled") {
      const parsed = ReorderResponseSchema.safeParse(reorderRes.value);
      if (parsed.success) {
        reorder = parsed.data.suggestions;
      } else {
        errorReorder = "Datos de reorden inválidos";
      }
    } else {
      errorReorder = "No se pudieron cargar sugerencias de reorden";
    }

    // Procesar precios con safeParse
    let prices: PriceSuggestion[] = [];
    let errorPrices: string | null = null;
    if (!pide.has("prices")) {
      // Panel no pedido.
    } else if (pricesRes.status === "fulfilled") {
      const parsed = PriceResponseSchema.safeParse(pricesRes.value);
      if (parsed.success) {
        prices = parsed.data.suggestions;
      } else {
        errorPrices = "Datos de precios inválidos";
      }
    } else {
      errorPrices = "No se pudieron cargar sugerencias de precios";
    }

    setState({
      forecast,
      reorder,
      prices,
      loading: false,
      errors: {
        forecast: errorForecast,
        reorder: errorReorder,
        prices: errorPrices,
      },
    });

    // Limpiar mensajes previos al actualizar
    setAutoReorderMsg(null);
    setAppliedPrices(new Set());
  }, [clave]);

  /** Ejecuta auto-reorder (Panel B) */
  const ejecutarAutoReorder = async () => {
    setAutoReordering(true);
    setAutoReorderMsg(null);
    try {
      const res = await fetch("/api/forecasting/auto-reorder", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ usePrecalculated: false }),
      });
      const data = await res.json() as { message?: string; error?: string };
      setAutoReorderMsg(data.message ?? data.error ?? "Reorden ejecutado");
    } catch {
      setAutoReorderMsg("Error al ejecutar la reorden automática");
    } finally {
      setAutoReordering(false);
    }
  };

  /**
   * Aplica un precio sugerido (Panel C).
   * Llama al endpoint PATCH /api/products/[id] para actualizar el precio.
   */
  const aplicarPrecio = async (suggestion: PriceSuggestion) => {
    setApplyingPrice(suggestion.productId);
    try {
      const res = await fetch(`/api/products/${suggestion.productId}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ price: suggestion.suggestedPrice }),
      });
      if (res.ok) {
        setAppliedPrices((prev) => new Set([...prev, suggestion.productId]));
      }
    } catch {
      // Fallo silencioso — el usuario puede volver a intentarlo
    } finally {
      setApplyingPrice(null);
    }
  };

  // Auto-cargar al montar (no esperar click manual — UX inmediata)
  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  return {
    state,
    cargarDatos,
    autoReordering,
    autoReorderMsg,
    ejecutarAutoReorder,
    applyingPrice,
    appliedPrices,
    aplicarPrecio,
  };
}
