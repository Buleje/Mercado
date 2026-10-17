export interface ClienteConUbicacion {
  phone?: string | null;
  name: string;
  lat: number;
  lng: number;
  totalSpent: number;
  location: string;
}

export interface ClienteSinUbicacion {
  phone: string;
  name: string;
  /** La dirección escrita a mano, si la dejó. */
  location: string;
}

export type Nivel = "oro" | "plata" | "bronce";
export type ModoMapa = "marcadores" | "calor";

export const CENTRO_PUCALLPA: [number, number] = [-8.3791, -74.5539];

export function nivelDe(gastado: number): Nivel {
  if (gastado >= 1500) return "oro";
  if (gastado >= 500) return "plata";
  return "bronce";
}

export const ETIQUETA_NIVEL: Record<Nivel, string> = { oro: "Oro+ (S/ 1 500 o más)", plata: "Plata (S/ 500 a 1 499)", bronce: "Bronce (menos de S/ 500)" };
/** Color de cada nivel como variable CSS (sirve en el HTML del marcador y en las leyendas). */
export const COLOR_NIVEL: Record<Nivel, string> = { oro: "var(--accent)", plata: "var(--data-warning-500)", bronce: "var(--text-tertiary)" };

export function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

export function iniciales(nombre: string): string {
  return nombre.split(" ").filter(Boolean).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

/** Zonas por cuántos clientes tienen la misma dirección escrita (las 5 con más). */
export function zonasTop(clientes: ClienteConUbicacion[]): Array<{ zona: string; clientes: number; gastado: number }> {
  const porZona = new Map<string, { clientes: number; gastado: number }>();
  for (const c of clientes) {
    const zona = c.location?.trim() || "Sin dirección escrita";
    const z = porZona.get(zona) ?? { clientes: 0, gastado: 0 };
    z.clientes++;
    z.gastado += c.totalSpent;
    porZona.set(zona, z);
  }
  return [...porZona.entries()].map(([zona, v]) => ({ zona, ...v })).sort((a, b) => b.clientes - a.clientes).slice(0, 5);
}

/** El mensaje que le pide al cliente que comparta su ubicación por WhatsApp. */
export function mensajePedirUbicacion(nombre: string): string {
  return `Hola ${nombre}, para llevarte tus pedidos más rápido, ¿nos compartes tu ubicación? En WhatsApp toca el clip, elige «Ubicación» y envía «Ubicación actual». ¡Gracias!`;
}

export function enlacePedirUbicacion(c: ClienteSinUbicacion): string | null {
  const d = c.phone.replace(/\D/g, "");
  if (!d) return null;
  return `https://wa.me/${d.startsWith("51") ? d : `51${d}`}?text=${encodeURIComponent(mensajePedirUbicacion(c.name))}`;
}
