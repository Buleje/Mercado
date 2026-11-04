/**
 * Pedir precio por WhatsApp (Compras › Sugerencias, 04-11): el dueño marca lo que
 * le falta y le escribe a 3 distribuidores en 3 toques. Esto solo ARMA el mensaje
 * y el enlace `wa.me` de cada proveedor; no envía nada ni toca la base. Lo que
 * contesten se compara después en Compras › Proveedores › Comparar proveedores.
 * Puro: lo usa el modal y lo prueba `__tests__/pedir-precio.test.ts`.
 */
import { telefonoWhatsAppPE, waLink } from "@/lib/whatsapp-link";

/** Un producto marcado en Sugerencias, tal como va en el mensaje. */
export type ProductoAPedir = {
  productId: number;
  nombre: string;
  cantidad: number;
  /** «und», «kg», «pt»… Sin dato va «und». */
  unidad?: string | null;
  /** Su proveedor sugerido: arranca marcado en la ventana. */
  proveedorId?: string | null;
};

/** Lo mínimo que se necesita de un proveedor (`GET /api/suppliers`). */
export type ProveedorContacto = {
  id: string;
  name: string;
  phone?: string | null;
  whatsappSecundario?: string | null;
};

/**
 * Celular peruano: 9 dígitos que empiezan con 9 → «51» + 9; ya con 51 se deja.
 * Un fijo («061 575757»), un dato a medias o vacío no sirven para WhatsApp → null.
 */
function numeroUsable(texto?: string | null): string | null {
  const n = telefonoWhatsAppPE(texto);
  return n && /^519\d{8}$/.test(n) ? n : null;
}

/**
 * El número al que se le escribe: el teléfono del proveedor y, si ese no sirve
 * (un fijo), su WhatsApp secundario. `null` = sin teléfono usable.
 */
export function telefonoParaWhatsApp(p: Pick<ProveedorContacto, "phone" | "whatsappSecundario">): string | null {
  return numeroUsable(p.phone) ?? numeroUsable(p.whatsappSecundario);
}

/** «51987654321» → «987 654 321» (lo que se lee en la lista). Otros países quedan tal cual. */
export function telefonoLegible(numero: string): string {
  const m = /^51(\d{3})(\d{3})(\d{3})$/.exec(numero);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : `+${numero}`;
}

/** «12», «2,5», nunca «2.5000000001»: dos decimales como mucho. */
export function formatearCantidad(n: number): string {
  if (!Number.isFinite(n)) return "";
  const r = Math.round(n * 100) / 100;
  return String(r).replace(".", ",");
}

const limpiar = (t?: string | null) => (t ?? "").replace(/\s+/g, " ").trim();

/** «- 12 und Arroz Costeño 5 kg». Sin cantidad válida va solo el nombre. */
export function lineaDeProducto(p: ProductoAPedir): string {
  const nombre = limpiar(p.nombre);
  const cantidad = p.cantidad > 0 ? formatearCantidad(p.cantidad) : "";
  if (!cantidad) return `- ${nombre}`;
  return `- ${cantidad} ${limpiar(p.unidad) || "und"} ${nombre}`;
}

/** El texto que se le manda a UN proveedor. */
export function mensajePedirPrecio(args: {
  proveedor: string;
  productos: readonly ProductoAPedir[];
  /** Nombre del negocio (membrete). Sin dato, el mensaje sale sin firma. */
  negocio?: string | null;
}): string {
  const proveedor = limpiar(args.proveedor);
  const negocio = limpiar(args.negocio);
  return [
    `Hola ${proveedor}, ¿cómo estás? Quisiera tu precio de:`,
    "",
    ...args.productos.map(lineaDeProducto),
    "",
    "¿A cuánto me lo dejas y para cuándo lo traes?",
    "",
    negocio ? `Gracias.\n${negocio}` : "Gracias.",
  ].join("\n");
}

/** El enlace `wa.me` con el mensaje armado, o `null` si el proveedor no tiene teléfono usable. */
export function enlacePedirPrecio(args: {
  proveedor: ProveedorContacto;
  productos: readonly ProductoAPedir[];
  negocio?: string | null;
}): string | null {
  const numero = telefonoParaWhatsApp(args.proveedor);
  if (!numero) return null;
  return waLink(numero, mensajePedirPrecio({ proveedor: args.proveedor.name, productos: args.productos, negocio: args.negocio }));
}

/**
 * Quién arranca marcado: el proveedor sugerido de cada producto, si existe en
 * la lista y se le puede escribir. Mantiene el orden de la lista.
 */
export function proveedoresPorDefecto(
  productos: readonly ProductoAPedir[],
  proveedores: readonly ProveedorContacto[],
): string[] {
  const sugeridos = new Set(productos.map((p) => p.proveedorId).filter((id): id is string => !!id));
  return proveedores.filter((p) => sugeridos.has(p.id) && telefonoParaWhatsApp(p)).map((p) => p.id);
}

/**
 * Orden de la lista: primero los que se pueden marcar (los sugeridos arriba),
 * al final los «sin teléfono»; dentro de cada grupo, por nombre.
 */
export function ordenarProveedores<T extends ProveedorContacto>(proveedores: readonly T[], sugeridos: ReadonlySet<string>): T[] {
  const peso = (p: T) => (telefonoParaWhatsApp(p) ? (sugeridos.has(p.id) ? 0 : 1) : 2);
  return [...proveedores].sort((a, b) => peso(a) - peso(b) || a.name.localeCompare(b.name, "es"));
}
