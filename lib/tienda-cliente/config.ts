/**
 * lib/tienda-cliente/config.ts — lee «cómo te piden» de un negocio desde su
 * `storeTheme` (clave `pedidosCliente`). Lo usan la tienda (servidor) y el panel.
 * Contrato y defaults en `./contrato.ts`.
 */
import { z } from "zod";
import {
  CLAVE_CONFIG_PEDIDOS,
  CONFIG_PEDIDOS_POR_DEFECTO,
  type ConfigPedidosCliente,
} from "./contrato";

const configSchema = z
  .object({
    loginGoogle: z.boolean(),
    pedirCelular: z.boolean(),
    pedirUbicacion: z.boolean(),
    pedidoComoImagen: z.boolean(),
  })
  .partial();

/** Lo guardado encima de los defaults; un valor roto cae al default (nunca rompe la tienda). */
export function leerConfigPedidos(storeTheme: unknown): ConfigPedidosCliente {
  const crudo =
    storeTheme && typeof storeTheme === "object"
      ? (storeTheme as Record<string, unknown>)[CLAVE_CONFIG_PEDIDOS]
      : undefined;
  const r = configSchema.safeParse(crudo ?? {});
  return { ...CONFIG_PEDIDOS_POR_DEFECTO, ...(r.success ? r.data : {}) };
}

/** El `storeTheme` con la config nueva adentro (el resto del tema intacto). */
export function conConfigPedidos(
  storeTheme: Record<string, unknown> | null | undefined,
  config: ConfigPedidosCliente,
): Record<string, unknown> {
  return { ...(storeTheme ?? {}), [CLAVE_CONFIG_PEDIDOS]: config };
}
