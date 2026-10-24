/**
 * lib/tienda-cliente/contrato.ts — el contrato compartido de «cómo te piden» en
 * las tiendas individuales (/t/<negocio>/tienda), 2026-10-11.
 *
 * Cuatro cosas que cada negocio prende o apaga desde su panel
 * (Página de inicio › Apariencia › Pedidos):
 *   · entrar con Google en un toque (rellena el nombre solo),
 *   · pedir el celular,
 *   · pedir la ubicación en vivo (GPS del celular),
 *   · mandar el pedido por WhatsApp como IMAGEN (productos, precios y datos).
 *
 * Se guarda dentro de `Settings.storeThemeJson` bajo la clave `pedidosCliente`
 * (sin migración: el personalizador ya lee y guarda ese JSON entero).
 *
 * Quién implementa qué:
 *   · `lib/tienda-cliente/config.ts`        → `leerConfigPedidos` (Zod safeParse + defaults)
 *   · `lib/tienda-cliente/imagen-pedido.ts` → `dibujarImagenPedido` (canvas, sólo navegador)
 *   · `lib/tienda-cliente/compartir.ts`     → `enviarPedidoWhatsapp`
 *   · `lib/tienda-cliente/celular.ts`       → `normalizarCelularPe`
 *   · `components/store/cliente/use-cliente-tienda.ts` → `useClienteTienda`
 *   · `components/store/cliente/use-ubicacion-en-vivo.ts` → `useUbicacionEnVivo`
 *   · `components/store/cliente/BotonGoogle.tsx`, `CampoCelular.tsx`, `CampoUbicacion.tsx`
 */

export interface ConfigPedidosCliente {
  /** Botón «Continuar con Google»: al volver, el nombre se rellena solo. */
  loginGoogle: boolean;
  /** Pide el celular (9 dígitos, empieza con 9) antes de mandar el pedido. */
  pedirCelular: boolean;
  /** Pide la ubicación en vivo del celular (se manda como enlace de Google Maps). */
  pedirUbicacion: boolean;
  /** El pedido por WhatsApp va como imagen además del texto. */
  pedidoComoImagen: boolean;
}

export const CONFIG_PEDIDOS_POR_DEFECTO: ConfigPedidosCliente = {
  loginGoogle: true,
  pedirCelular: true,
  pedirUbicacion: true,
  pedidoComoImagen: true,
};

/** Clave dentro de `storeTheme` donde vive la config. */
export const CLAVE_CONFIG_PEDIDOS = "pedidosCliente" as const;

/** Lo que la tienda sabe del cliente que entró con Google (nunca del cuerpo de un pedido). */
export interface ClienteTienda {
  nombre: string;
  email: string | null;
  avatar: string | null;
  proveedor: "google";
}

export interface UbicacionEnVivo {
  lat: number;
  lng: number;
  /** Precisión en metros que da el GPS. */
  precision: number;
  /** `https://maps.google.com/?q=<lat>,<lng>` */
  enlaceMapa: string;
  /** Epoch ms de la última lectura. */
  leidaEn: number;
}

export type EstadoUbicacion = "inactiva" | "pidiendo" | "ok" | "denegada" | "no-soportada" | "error";

export interface LineaImagenPedido {
  nombre: string;
  codigo: string | null;
  cantidad: number;
  /** Precio unitario en soles. */
  precio: number;
  /** URL de la foto del producto (misma origen o data:). Opcional: sin foto, va un recuadro con la inicial. */
  imagen?: string | null;
  nota?: string | null;
}

export interface DatosImagenPedido {
  negocio: {
    nombre: string;
    /** Color de acento del negocio (CSS válido: var(--x) NO sirve en canvas → pasar el color resuelto). */
    colorAcento: string;
    logo?: string | null;
  };
  lineas: readonly LineaImagenPedido[];
  /** Total en soles (vista previa: el negocio confirma por WhatsApp). */
  total: number;
  cliente: {
    nombre: string;
    celular?: string | null;
    /** Pueblo / distrito elegido. */
    entrega?: string | null;
    ubicacion?: UbicacionEnVivo | null;
    pago?: string | null;
  };
  /** Renglones extra cortos (p. ej. «Envío gratis»). */
  notas?: readonly string[];
  /** Fecha del pedido; por defecto ahora (hora de Lima). */
  fecha?: Date;
}

export type ResultadoEnvio =
  /** Celular con Web Share: se abrió el menú de compartir con la imagen (el cliente elige WhatsApp). */
  | { via: "compartir" }
  /** Computadora: imagen copiada al portapapeles + chat abierto con el texto; el cliente pega (Ctrl+V). */
  | { via: "portapapeles" }
  /** Sin imagen posible: se abrió el chat sólo con el texto (y se descargó la imagen si se pudo). */
  | { via: "texto"; descargada: boolean }
  | { via: "cancelado" };
