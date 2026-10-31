"use client";

/**
 * usePedidosTienda — lo que el checkout necesita saber del negocio para «cómo
 * te piden» (2026-10-11): sus interruptores (`storeTheme.pedidosCliente`, ya
 * leídos con `leerConfigPedidos` en el contexto de settings) y su WhatsApp.
 *
 * Sin fetch propio: todo viaja en `/api/settings`, que el layout (store) ya
 * pide una vez (`SettingsProvider`). Mientras carga, los defaults del contrato.
 */

import { useSettings } from "@/contexts/settings-context";
import { CONFIG_PEDIDOS_POR_DEFECTO, type ConfigPedidosCliente } from "@/lib/tienda-cliente/contrato";

export interface PedidosTienda {
  config: ConfigPedidosCliente;
  /** WhatsApp del negocio (dígitos); `null` si no configuró ninguno. */
  numeroWhatsapp: string | null;
  nombreNegocio: string;
  logo: string | null;
}

/** El mismo orden que el pie de la tienda (`TenantFooter`): WhatsApp y, si no, teléfono. */
export function numeroWhatsappDe(theme: { whatsapp?: string; phone?: string } | null | undefined): string | null {
  const digitos = (theme?.whatsapp || theme?.phone || "").replace(/\D/g, "");
  return digitos.length >= 9 ? digitos : null;
}

export function usePedidosTienda(): PedidosTienda {
  const { storeTheme, businessName } = useSettings();
  return {
    config: storeTheme?.pedidosCliente ?? CONFIG_PEDIDOS_POR_DEFECTO,
    numeroWhatsapp: numeroWhatsappDe(storeTheme),
    nombreNegocio: (businessName || storeTheme?.name || "").trim() || "la tienda",
    logo: storeTheme?.logo || null,
  };
}
