/**
 * Rutas y datos chicos que comparten el menú de cuenta y la página «Mi cuenta»
 * de TODAS las tiendas de negocios (la general y las páginas propias).
 *
 * Sin React: funciones puras para que el menú no pida nada al abrir.
 */
import { telefonoWhatsAppPE } from "@/lib/whatsapp-link";
import { formatDateNumeric, formatWeekday } from "@/lib/format";

/** `/t/<negocio>` cuando la tienda va por ruta; "" en subdominio o dominio propio. */
export function baseDeTienda(pathname: string | null | undefined): string {
  return pathname?.match(/^\/t\/[^/]+/)?.[0] ?? "";
}

/** El negocio de la ruta (`/t/<negocio>/…`); `null` fuera de ella. */
export function negocioDeRuta(pathname: string | null | undefined): string | null {
  const m = pathname?.match(/^\/t\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Las secciones de «Mi cuenta» (`/cuenta?sub=`). El orden es el de la pregunta
 * del cliente: ¿dónde está lo que pedí? → ¿cuánto ahorro? → mis datos → ayuda.
 */
export const SECCIONES_CUENTA = ["pedidos", "puntos", "datos", "ayuda"] as const;
export type SeccionCuenta = (typeof SECCIONES_CUENTA)[number];

export function esSeccionCuenta(v: string | null | undefined): v is SeccionCuenta {
  return !!v && (SECCIONES_CUENTA as readonly string[]).includes(v);
}

/** Destinos del cliente (sin la base del negocio: se la pone `rutaCuenta`). */
export const DESTINOS = {
  cuenta: "/cuenta",
  pedidos: "/mis-pedidos",
  puntos: "/puntos",
  datos: "/cuenta?sub=datos",
  ayuda: "/cuenta?sub=ayuda",
  favoritos: "/favoritos",
  catalogo: "/tienda",
} as const;

export function rutaCuenta(base: string, destino: string): string {
  return `${base}${destino}`;
}

/** Entrar de verdad (celular + código): la página de ingreso vuelve a donde estabas. */
export function rutaEntrar(volverA: string): string {
  return `/login?next=${encodeURIComponent(volverA || "/")}`;
}

export function primerNombre(nombre: string | null | undefined): string | null {
  const n = nombre?.trim().split(/\s+/)[0];
  return n ? n : null;
}

/** WhatsApp del negocio con un saludo listo. `null` si el negocio no dejó número. */
export function enlaceAyuda(numero: string | null | undefined, nombreCliente?: string | null): string | null {
  const tel = telefonoWhatsAppPE(numero);
  if (!tel) return null;
  const quien = primerNombre(nombreCliente);
  const texto = quien ? `Hola, soy ${quien}. Necesito ayuda con mi compra.` : "Hola, necesito ayuda con mi compra.";
  return `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`;
}

/**
 * ¿Quien mira es dueño o encargado de ESTA tienda? El ingreso al panel deja
 * `active-tenant-slug` (cookie visible, 7 días) y la salida la borra. Ojo:
 * `active-tenant` NO sirve — el proxy la pone a todo visitante de `/t/<negocio>`.
 * Es sólo una pista para mostrar el atajo: el panel pide su propia sesión.
 */
export function esDuenoDe(negocio: string | null): boolean {
  if (!negocio || typeof document === "undefined") return false;
  const m = document.cookie.match(/(?:^|;\s*)active-tenant-slug=([^;]+)/);
  return !!m && decodeURIComponent(m[1]) === negocio;
}

/** «jueves 10/09» — la fecha corta de la casa. */
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return "";
  const dia = formatWeekday(iso, { largo: true });
  const numero = formatDateNumeric(iso).slice(0, 5);
  return dia && numero ? `${dia} ${numero}` : "";
}
