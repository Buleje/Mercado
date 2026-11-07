/**
 * El armado PURO de `DatosTienda` (ADR-511): sin servidor ni base, para probarlo
 * con datos que faltan. `datos.ts` lee de la base y le pasa esto.
 *
 * Regla de oro: nada se inventa. Si un dato no existe, esa promesa / bloque /
 * franja no se muestra (o cae a un texto neutro con el nombre del negocio).
 */
import type { ContenidoTienda, MedioDePago, NegocioTienda } from "./contenido";

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Deja sólo dígitos y antepone 51 a un celular peruano de 9 dígitos; `null` si no es un número creíble. */
export function normalizarWhatsapp(crudo: unknown): string | null {
  if (typeof crudo !== "string") return null;
  const d = crudo.replace(/\D/g, "");
  if (d.length === 9 && d.startsWith("9")) return `51${d}`;
  return d.length >= 10 && d.length <= 15 ? d : null;
}

/** Medios de pago prendidos en Ajustes, en el orden de la tienda. */
export function pagosDe(a: {
  yapeEnabled?: boolean;
  plinEnabled?: boolean;
  cashEnabled?: boolean;
  transferEnabled?: boolean;
}): MedioDePago[] {
  const m: MedioDePago[] = [];
  if (a.yapeEnabled) m.push("Yape");
  if (a.plinEnabled) m.push("Plin");
  if (a.cashEnabled !== false) m.push("Efectivo");
  if (a.transferEnabled) m.push("Transferencia");
  return m;
}

/** «a», «a y b», «a, b y c». */
export function listaY(xs: readonly string[]): string {
  return xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}

const soles = (n: number) => `S/ ${Number.isInteger(n) ? n : n.toFixed(2)}`;

/** Las promesas de «Compra tranquila»: las del editor (`trustChips`) o las armadas con los datos reales; una que no existe, no se muestra. */
export function armarConfianza(
  n: Pick<NegocioTienda, "pagos" | "envio" | "devolucionDias">,
  chips?: unknown,
): ContenidoTienda["confianza"] {
  if (Array.isArray(chips)) {
    const propios = chips
      .map((c) => {
        if (typeof c === "string") return texto(c) ? { titulo: texto(c) as string, texto: "" } : null;
        if (c && typeof c === "object") {
          const o = c as Record<string, unknown>;
          const titulo = texto(o.titulo) ?? texto(o.title) ?? texto(o.label);
          return titulo ? { titulo, texto: texto(o.texto) ?? texto(o.text) ?? texto(o.description) ?? "" } : null;
        }
        return null;
      })
      .filter((c): c is { titulo: string; texto: string } => c !== null)
      .slice(0, 4);
    if (propios.length > 0) return propios;
  }
  const out: ContenidoTienda["confianza"] = [];
  if (n.envio.gratisDesde && n.envio.gratisDesde > 0) out.push({ titulo: "Envío gratis", texto: `En pedidos desde ${soles(n.envio.gratisDesde)}` });
  if (n.pagos.length > 0) out.push({ titulo: "Paga como te acomode", texto: listaY(n.pagos.map((p) => (p === "Efectivo" ? "efectivo" : p))).replace(/^./, (c) => c.toUpperCase()) });
  if (n.devolucionDias && n.devolucionDias > 0) out.push({ titulo: "Cambios y devoluciones", texto: `Hasta ${n.devolucionDias} ${n.devolucionDias === 1 ? "día" : "días"} después de tu compra` });
  return out;
}

/** Las categorías con productos, en el orden que usa el negocio (Mi Tienda › categorías); las que no están ahí, por cantidad. */
export function ordenarCategorias(
  productos: readonly { categoria: string }[],
  orden?: readonly { id?: string; label?: string; visible?: boolean; order?: number }[] | null,
): string[] {
  const cuenta = new Map<string, number>();
  for (const p of productos) if (p.categoria.trim()) cuenta.set(p.categoria, (cuenta.get(p.categoria) ?? 0) + 1);
  const ocultas = new Set<string>();
  const posicion = new Map<string, number>();
  for (const o of orden ?? []) {
    for (const nombre of [o.label, o.id]) {
      if (!nombre) continue;
      if (o.visible === false) ocultas.add(nombre);
      else if (typeof o.order === "number" && !posicion.has(nombre)) posicion.set(nombre, o.order);
    }
  }
  return [...cuenta.keys()]
    .filter((c) => !ocultas.has(c))
    .sort((a, b) => {
      const pa = posicion.get(a);
      const pb = posicion.get(b);
      if (pa !== undefined && pb !== undefined) return pa - pb;
      if (pa !== undefined) return -1;
      if (pb !== undefined) return 1;
      return (cuenta.get(b) ?? 0) - (cuenta.get(a) ?? 0) || a.localeCompare(b, "es");
    });
}

/** Cómo se lee una categoría: el nombre que le puso el dueño (Mi Tienda › categorías) o, si no, su clave en tipo oración («pollo-brasa» → «Pollo brasa»). */
export function nombreDeCategoria(clave: string, orden?: readonly { id?: string; label?: string }[] | null): string {
  const propio = orden?.find((o) => o.id === clave || o.label === clave)?.label?.trim();
  if (propio) return propio;
  const t = clave.replace(/[-_]+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : clave;
}

/** Los círculos de la portada: el banner que el dueño puso a la categoría o, si no, la foto de su primer producto. */
export function armarCirculos(
  categorias: readonly string[],
  productos: readonly { categoria: string; imagen: string }[],
  banners?: unknown,
  orden?: readonly { id?: string; label?: string }[] | null,
): ContenidoTienda["circulos"] {
  const b = banners && typeof banners === "object" && !Array.isArray(banners) ? (banners as Record<string, unknown>) : {};
  return categorias.map((categoria) => ({
    nombre: nombreDeCategoria(categoria, orden),
    categoria,
    imagen: texto(b[categoria]) ?? productos.find((p) => p.categoria === categoria && p.imagen)?.imagen ?? null,
  }));
}

/** El héroe: lo del editor de la portada; si falta, texto neutro con el nombre y el lema del negocio. */
export function armarHeroe(
  pagina: { heroTitle?: string | null; heroSubtitle?: string | null; heroImageUrl?: string | null; heroCtaLabel?: string | null } | null | undefined,
  negocio: Pick<NegocioTienda, "nombre" | "lema" | "descripcion">,
): ContenidoTienda["heroe"] {
  return {
    titulo: texto(pagina?.heroTitle) ?? negocio.nombre,
    subtitulo: texto(pagina?.heroSubtitle) ?? negocio.lema ?? negocio.descripcion ?? undefined,
    boton: texto(pagina?.heroCtaLabel) ?? "Ver productos",
    imagen: texto(pagina?.heroImageUrl),
  };
}

/** Frases de la franja de arriba: sólo las `announcements` del editor. */
export function armarFranja(anuncios: unknown): string[] {
  return Array.isArray(anuncios) ? anuncios.map(texto).filter((x): x is string => x !== null).slice(0, 6) : [];
}

/** «Antes» = el último cambio del historial que dejó el precio de hoy, si era más alto; sin ese registro no hay «antes» ni %. */
export function antesDe(precio: number, historial?: readonly { oldPrice: number; newPrice: number }[]): { antes: number | null; descuento: number | null } {
  const cambio = historial?.find((h) => Math.abs(h.newPrice - precio) < 0.005);
  const antes = cambio && cambio.oldPrice > precio ? cambio.oldPrice : null;
  return { antes, descuento: antes ? Math.round(((antes - precio) / antes) * 100) : null };
}
