/**
 * Plantilla de tienda para TODOS los negocios (ADR-511, Brandon 20-10: «que sea
 * como base el formato, diseño, estructura como la de Musa en general para
 * todos»). Nació de `extensiones/pagina-musa/`: misma portada, catálogo, ficha
 * y bolsa, pero cada negocio con SUS datos (nada escrito para Musa).
 *
 * CONTRATO entre carriles: tipos puros, sin servidor. `datos.ts` arma
 * `DatosTienda`; las piezas sólo leen esto.
 */
import type { ConfigPedidosCliente } from "@/lib/tienda-cliente/contrato";
import type { FilaFicha } from "../pagina-musa/presentacion";

export type { FilaFicha };

export type MedioDePago = "Yape" | "Plin" | "Efectivo" | "Tarjeta" | "Transferencia";

export interface NegocioTienda {
  tenantId: string;
  slug: string;
  nombre: string;
  lema: string | null;
  descripcion: string | null;
  /** URL del logo; `null` = monograma con la inicial. */
  logo: string | null;
  /** Sólo dígitos con código de país (51…): `null` = sin botón de WhatsApp. */
  whatsapp: string | null;
  horario: string | null;
  direccion: string | null;
  redes: { facebook?: string; instagram?: string; tiktok?: string };
  pagos: MedioDePago[];
  envio: { gratisDesde: number | null; zonas: { nombre: string; costo: number }[] };
  devolucionDias: number | null;
  pedidosCliente: ConfigPedidosCliente;
}

export const LETRAS_TIENDA = ["jakarta", "inter", "manrope"] as const;
export const RADIOS_TIENDA = ["suave", "redondo", "pildora"] as const;

export interface TemaTienda {
  /** Color de acento con contraste ≥ 4,5:1 sobre blanco; el de fábrica del sistema → casi negro (regla minimalista de Musa). */
  acento: string;
  letra: (typeof LETRAS_TIENDA)[number];
  radio: (typeof RADIOS_TIENDA)[number];
}

export const BLOQUES_TIENDA = ["franja", "heroe", "circulos", "porPrecio", "destacados", "confianza", "politicas"] as const;
export type BloqueId = (typeof BLOQUES_TIENDA)[number];

export interface ContenidoTienda {
  /** Frases de la franja de arriba (rotan). */
  franja: string[];
  heroe: { titulo: string; acento?: string; subtitulo?: string; boton: string; imagen: string | null };
  /** Los círculos de categorías de la portada. */
  circulos: { nombre: string; categoria: string; imagen: string | null }[];
  /** «Compra tranquila»: 3-4 promesas del negocio (envío, pago, cambios). */
  confianza: { titulo: string; texto: string }[];
  /** Cómo se pide: el checkout del negocio (por defecto) o un mensaje de WhatsApp. */
  pedido: "checkout" | "whatsapp";
  /** Qué bloques de la portada y en qué orden. */
  bloques: BloqueId[];
}

export interface ProductoTienda {
  id: number;
  nombre: string;
  marca: string | null;
  categoria: string;
  precio: number;
  /** Precio de antes (historial) si bajó; `null` si no. */
  antes: number | null;
  /** % de descuento redondeado si hay `antes`. */
  descuento: number | null;
  imagen: string;
  descripcion: string | null;
  /** `null` = no se sabe (no se muestra «agotado»). */
  stock: number | null;
  unidad: string;
  etiqueta: string | null;
  codigo: string | null;
  href: string;
  presentacion: string | null;
  ficha: FilaFicha[];
}

export interface DatosTienda {
  negocio: NegocioTienda;
  tema: TemaTienda;
  contenido: ContenidoTienda;
  productos: ProductoTienda[];
  categorias: string[];
  mayorDescuento: number | null;
}
