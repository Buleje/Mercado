/**
 * Cuentas de la ficha del salón (ADR-460), sin React ni servidor: qué producto
 * pide la URL y qué se muestra al lado. Las prueba `__tests__/salon-ficha.test.ts`.
 */
import { slugify } from "@/data/products";
import { CATEGORIA_SERVICIOS } from "./anuncios";
import type { ProductoSalon } from "./datos";

export const esServicio = (p: Pick<ProductoSalon, "categoria">) => p.categoria === CATEGORIA_SERVICIOS;

/**
 * El producto o servicio del salón cuya URL es `/tienda/<producto>` (el mismo
 * `slugify` del nombre con el que se arman los enlaces), o `null`: no existe,
 * está oculto en Mi Tienda o no es del salón (la bodega de prueba de `main`).
 */
export function productoDeLaUrl(todos: readonly ProductoSalon[], producto: string): ProductoSalon | null {
  const buscado = producto.trim().toLowerCase();
  if (!buscado) return null;
  return todos.find((p) => slugify(p.nombre) === buscado) ?? null;
}

/**
 * «Completa tu rutina»: primero la MISMA línea (marca) y, dentro de ella, lo de
 * OTRA categoría (al shampoo le sigue el acondicionador, no otro shampoo);
 * después lo parecido de la misma categoría. Nunca el mismo producto ni un servicio.
 */
export function rutinaDe(productos: readonly ProductoSalon[], p: ProductoSalon, max = 8): ProductoSalon[] {
  const otros = productos.filter((x) => x.id !== p.id && !esServicio(x));
  const deLaLinea = p.marca ? otros.filter((x) => x.marca === p.marca) : [];
  const ordenada = [...deLaLinea].sort((a, b) => Number(a.categoria === p.categoria) - Number(b.categoria === p.categoria));
  const parecidos = otros.filter((x) => x.categoria === p.categoria && !deLaLinea.includes(x));
  return [...ordenada, ...parecidos].slice(0, max);
}

/** Para «no lo encontramos»: lo rebajado primero (mayor % arriba), después los favoritos del salón. */
export function sugeridos(productos: readonly ProductoSalon[], max = 8): ProductoSalon[] {
  const rebajados = productos.filter((p) => p.descuento).sort((a, b) => (b.descuento ?? 0) - (a.descuento ?? 0));
  const resto = productos.filter((p) => !p.descuento && p.etiqueta);
  return [...rebajados, ...resto].slice(0, max);
}
