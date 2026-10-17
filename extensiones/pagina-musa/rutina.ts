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

/** Un paso de «Tu rutina en 3 pasos» (la ficha): el verbo, una línea de cómo y el producto de Musa que va ahí. */
export interface PasoRutina {
  numero: 1 | 2 | 3;
  titulo: string;
  texto: string;
  producto: ProductoSalon;
  /** Es el producto de la ficha (va resaltado). */
  esEste: boolean;
}

/**
 * La rutina de cada categoría, con los códigos del catálogo (manual de Musa,
 * «Qué vendemos»). En cada paso, el primer código es el que se sugiere si el
 * producto de la ficha es de otro paso: Rostro = KT02 (limpiador, niacinamida,
 * FPS 50); Cabello = KT01 (shampoo, acondicionador, argán); Cuerpo = exfoliante,
 * crema y FPS 50 corporal. Voz del manual: «ayuda a», nunca «cura».
 */
const RUTINAS: Record<string, readonly { titulo: string; texto: string; codigos: readonly string[] }[]> = {
  Rostro: [
    { titulo: "Limpia", texto: "Mañana y noche, sin resecar tu piel.", codigos: ["MU009"] },
    { titulo: "Trata", texto: "El sérum o el cuidado que tu piel necesita.", codigos: ["MU011", "MU010", "MU012", "MU014", "MU015", "MU016"] },
    { titulo: "Protege", texto: "De día, siempre FPS 50 (más si usas vitamina C).", codigos: ["MU013"] },
  ],
  Cabello: [
    { titulo: "Lava", texto: "Sin sal, para cuidar tu alisado o tu tinte.", codigos: ["MU001", "MU008"] },
    { titulo: "Nutre", texto: "Acondiciona o hidrata a fondo, según tu cabello.", codigos: ["MU002", "MU003", "MU004", "MU007"] },
    { titulo: "Sella", texto: "Puntas suaves y con brillo, y lejos del calor.", codigos: ["MU005", "MU006"] },
  ],
  Cuerpo: [
    { titulo: "Exfolia", texto: "Una o dos veces por semana, en la ducha.", codigos: ["MU018"] },
    { titulo: "Hidrata", texto: "Después de bañarte, con la piel aún húmeda.", codigos: ["MU017", "MU019"] },
    { titulo: "Protege", texto: "Antes de salir al sol de la selva.", codigos: ["MU020"] },
  ],
};

/**
 * «Tu rutina en 3 pasos» para la ficha de `p`: `p` ocupa su paso y los otros dos
 * llevan el producto sugerido de la base (precio, foto y enlace reales). Si `p`
 * no está en ninguna rutina (un kit, un dúo, un producto nuevo) o falta algún
 * paso en la tienda (oculto, borrado), devuelve [] y la ficha no muestra la rutina.
 */
export function rutinaEnTresPasos(productos: readonly ProductoSalon[], p: ProductoSalon): PasoRutina[] {
  const pasos = RUTINAS[p.categoria];
  if (!pasos || !p.codigo || !pasos.some((s) => s.codigos.includes(p.codigo ?? ""))) return [];
  const porCodigo = new Map(productos.filter((x) => x.codigo).map((x) => [x.codigo, x]));
  const salida: PasoRutina[] = [];
  for (const [i, s] of pasos.entries()) {
    const esEste = s.codigos.includes(p.codigo);
    const producto = esEste ? p : s.codigos.map((c) => porCodigo.get(c)).find((x): x is ProductoSalon => x !== undefined);
    if (!producto) return [];
    salida.push({ numero: (i + 1) as 1 | 2 | 3, titulo: s.titulo, texto: s.texto, producto, esEste });
  }
  return salida;
}
