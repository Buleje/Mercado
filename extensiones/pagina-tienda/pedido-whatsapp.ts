/**
 * El pedido por WhatsApp de la tienda de CUALQUIER negocio (ADR-511), cuando el
 * dueño eligió `pedido: "whatsapp"` en la plantilla. Nació de
 * `pagina-musa/pedido-whatsapp.ts` sin nada fijo de Musa: el saludo lleva el
 * nombre del negocio, las entregas son SUS zonas de reparto (Ajustes › Envío) y
 * los pagos, los medios que prendió (Ajustes › Pagos). Ningún pueblo ni
 * asesora escritos acá.
 *
 * La bolsa NO crea un pedido en el sistema: arma el mensaje y abre el chat del
 * negocio. El total es una VISTA PREVIA del mensaje; el negocio confirma
 * precio, envío y pago por WhatsApp (regla 6: los totales reales, en el servidor).
 *
 * Puras (sin React ni navegador): las usan `PedirPorWhatsapp.tsx`, el cajón y
 * `__tests__/tienda-pedido-whatsapp.test.ts`.
 *
 * Formato:
 *   Hola Pizza Pucallpa, quiero:
 *   • 2 × Pizza americana familiar S/ 70
 *   Envío (Centro): S/ 5
 *   Total: S/ 75
 *   Nombre: …
 *   Celular: …
 *   Entrega: Centro
 *   Ubicación: https://maps.google.com/…
 *   Pago: Yape
 */
import type { MedioDePago, NegocioTienda } from "./contenido";
import { solesCortos } from "./ui";

/** Lo que elige quien compra cuando su lugar no está en la lista de zonas. */
export const OTRO_LUGAR = "Otro lugar";
/** Pasa a recoger (sólo si el negocio tiene dirección): sin costo ni línea de envío. */
export const RECOJO = "Recojo en el local";

export interface LineaPedido {
  nombre: string;
  /** Código interno del negocio (AB-12, MU001…). Un código de barras (sólo dígitos) no se manda: no le dice nada al que atiende. */
  codigo: string | null;
  cantidad: number;
  /** Precio unitario en soles. */
  precio: number;
}

export interface DatosPedido {
  lineas: readonly LineaPedido[];
  nombre: string;
  /** La zona elegida («Centro», «Otro lugar») o lo que escribió; vacío = sin línea «Entrega:». */
  entrega: string;
  /** Vacío cuando el negocio no prendió ningún medio de pago. */
  pago: MedioDePago | "";
  /** Costo del envío ya decidido (`costoEnvio`): 0 = gratis, null = no se sabe (no va la línea). */
  envio?: number | null;
  /** Celular del cliente, ya legible («987 654 321»); sin él no va la línea «Celular:». */
  celular?: string | null;
  /** Enlace de Google Maps de su ubicación en vivo; sin él no va la línea «Ubicación:». */
  ubicacion?: string | null;
}

export type ResultadoPedido =
  | { ok: true; mensaje: string; url: string; total: number }
  | { ok: false; motivo: "bolsa_vacia" | "falta_nombre" | "sin_whatsapp" };

const centimos = (n: number) => Math.round(n * 100);

/** «S/ 258» sin céntimos; «S/ 49.90» con céntimos: el mismo formato que las tarjetas (`solesCortos`). */
export const solesPedido = (n: number): string => solesCortos(centimos(n) / 100);

/** Un código interno con alguna letra (AB-12) se manda; un código de barras (7751234567890) no. */
export const codigoLegible = (codigo: string | null | undefined): string | null => {
  const c = codigo?.trim() ?? "";
  return c && /\p{L}/u.test(c) && c.length <= 16 ? c : null;
};

/**
 * Las entregas que se ofrecen: las zonas del negocio y «Otro lugar», más
 * «Recojo en el local» si tiene dirección. Sin zonas ni dirección, ninguna
 * (quien compra escribe dónde, a mano).
 */
export function opcionesEntrega(zonas: NegocioTienda["envio"]["zonas"], conRecojo = false): string[] {
  const nombres = [...new Set(zonas.map((z) => z.nombre.trim()).filter(Boolean))];
  const lista = nombres.length > 0 ? [...nombres, OTRO_LUGAR] : [];
  return conRecojo && lista.length > 0 ? [...lista, RECOJO] : lista;
}

/**
 * Cuánto cuesta el envío a esa entrega, según lo que el negocio cargó: 0 si ya
 * llegó al «envío gratis desde»; el costo de la zona si es una de las suyas;
 * null si no se sabe (otro lugar, sin zonas): el negocio lo dice por WhatsApp.
 */
export function costoEnvio(entrega: string, envio: NegocioTienda["envio"], subtotal: number): number | null {
  if (entrega.trim() === RECOJO) return null;
  if (envio.gratisDesde !== null && centimos(subtotal) >= centimos(envio.gratisDesde)) return 0;
  const zona = envio.zonas.find((z) => z.nombre.trim() === entrega.trim());
  return zona ? Math.max(0, zona.costo) : null;
}

export function armarMensajePedido(d: DatosPedido, negocio: Pick<NegocioTienda, "nombre" | "whatsapp">): ResultadoPedido {
  if (!negocio.whatsapp) return { ok: false, motivo: "sin_whatsapp" };
  const lineas = d.lineas.filter((l) => l.cantidad > 0);
  if (lineas.length === 0) return { ok: false, motivo: "bolsa_vacia" };
  const nombre = d.nombre.trim().replace(/\s+/g, " ");
  if (!nombre) return { ok: false, motivo: "falta_nombre" };

  // En céntimos enteros: 0,1 + 0,2 no suma 0,30000000000000004 en el mensaje.
  const productos = lineas.reduce((s, l) => s + centimos(l.precio) * l.cantidad, 0);
  const envio = typeof d.envio === "number" ? centimos(d.envio) : null;
  const renglones = [`Hola ${negocio.nombre.trim()}, quiero:`];
  for (const l of lineas) {
    const codigo = codigoLegible(l.codigo);
    renglones.push(`• ${l.cantidad} × ${l.nombre.trim()}${codigo ? ` (${codigo})` : ""} ${solesPedido((centimos(l.precio) * l.cantidad) / 100)}`);
  }
  const entrega = d.entrega.trim();
  if (envio !== null) renglones.push(`Envío${entrega ? ` (${entrega})` : ""}: ${envio === 0 ? "gratis" : solesPedido(envio / 100)}`);
  const total = (productos + (envio ?? 0)) / 100;
  renglones.push(`Total: ${solesPedido(total)}`, `Nombre: ${nombre}`);
  const celular = d.celular?.trim();
  if (celular) renglones.push(`Celular: ${celular}`);
  if (entrega) renglones.push(`Entrega: ${entrega}`);
  const ubicacion = d.ubicacion?.trim();
  if (ubicacion) renglones.push(`Ubicación: ${ubicacion}`);
  if (d.pago) renglones.push(`Pago: ${d.pago}`);
  const mensaje = renglones.join("\n");
  return { ok: true, mensaje, url: `https://wa.me/${negocio.whatsapp}?text=${encodeURIComponent(mensaje)}`, total };
}

/* ── Cuánto falta para el envío gratis ────────────────────────────────────── */

export interface Avance {
  /** De 0 a 1: cuánto se llena la barra. */
  fraccion: number;
  /** Soles que faltan para la meta (0 si ya llegó). */
  falta: number;
  logrado: boolean;
}

/** Hacia el «envío gratis desde» del negocio; sin ese monto en Ajustes, null (no se dibuja barra). */
export function avanceEnvio(subtotal: number, gratisDesde: number | null): Avance | null {
  if (gratisDesde === null || gratisDesde <= 0) return null;
  const falta = Math.max(0, centimos(gratisDesde) - centimos(subtotal)) / 100;
  return { fraccion: Math.min(1, Math.max(0, subtotal / gratisDesde)), falta, logrado: falta === 0 };
}
