import "server-only";
/**
 * Categorías del catálogo: la lista que arma el comerciante (Settings →
 * `categoryOrder`) unida con las que USAN sus productos (`Product.category`,
 * texto libre).
 *
 * Por qué (10-10, bug medido en main): el editor leía SOLO `categoryOrder`.
 * En main esa columna es NULL y los productos usan 24 categorías → la pestaña
 * Categorías decía «Todavía no tienes categorías» mientras Productos y stock y
 * el POS mostraban Abarrotes 11, Bebidas 8… Las dos listas nunca se habían
 * cruzado: la de Settings es la del comerciante, la de los productos es la
 * real. Ahora el editor muestra la unión, con cuántos productos tiene cada una,
 * y renombrar una renombra la de sus productos.
 *
 * tenantId SIEMPRE 1er parámetro.
 */
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { SettingsDB } from "./settings.db";
import type { CategoryConfigItem } from "./misc.db";

/** Cuántos productos (no borrados) dicen exactamente `valor` en su categoría. */
export type UsoDeCategoria = { valor: string; productos: number; activos: number };

export type CategoriaConUso = CategoryConfigItem & {
  /** Productos no borrados de esta categoría (activos + inactivos). */
  productos: number;
  activos: number;
  /** Los textos tal cual están en `Product.category` que caen acá («Abarrotes», «abarrotes»). */
  valores: string[];
  /** Ya está en la lista guardada del comerciante; `false` = sale sólo de sus productos. */
  guardada: boolean;
};

export type Renombre = { valores: string[]; nuevo: string };

/**
 * La forma de comparar dos nombres de categoría: sin mayúsculas, sin tildes y
 * con guiones. «Servicios de salón», «servicios-de-salon» y «SERVICIOS DE
 * SALON» son la misma.
 */
export function normalizarCategoria(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * La clave con la que Productos y stock agrupa y rotula (`claveCategoria` de
 * inventario-compartido: minúsculas + trim, vacío = «otros»). Una categoría que
 * nace de los productos se guarda con ESTE id para que el inventario encuentre
 * su nombre.
 */
function claveInventario(valor: string): string {
  return (valor || "otros").toLowerCase().trim();
}

/** «madera-aserrada» → «Madera aserrada»; «Abarrotes» queda igual. */
function nombreLegible(valor: string): string {
  const v = valor.trim();
  if (!v) return "Sin categoría";
  if (/[A-ZÁÉÍÓÚÑ]/.test(v)) return v;
  const conEspacios = v.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return conEspacios.charAt(0).toUpperCase() + conEspacios.slice(1);
}

type Grupo = { norma: string; valores: UsoDeCategoria[]; productos: number; activos: number };

/**
 * Une la lista guardada con los usos. Orden: primero las guardadas (por su
 * `order`), después las que salen sólo de los productos (más productos activos
 * primero). Nada se pierde: una guardada sin productos sigue con 0.
 */
export function unirCategorias(guardadas: CategoryConfigItem[], usos: UsoDeCategoria[]): CategoriaConUso[] {
  const grupos = new Map<string, Grupo>();
  for (const u of usos) {
    const norma = normalizarCategoria(u.valor) || "otros";
    const g = grupos.get(norma) ?? { norma, valores: [], productos: 0, activos: 0 };
    g.valores.push(u);
    g.productos += u.productos;
    g.activos += u.activos;
    grupos.set(norma, g);
  }

  const usados = new Set<string>();
  const ordenadas = [...guardadas].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const filas: CategoriaConUso[] = ordenadas.map((c) => {
    const candidatas = [normalizarCategoria(c.id), normalizarCategoria(c.label ?? "")];
    let productos = 0;
    let activos = 0;
    const valores: string[] = [];
    for (const norma of candidatas) {
      const g = grupos.get(norma);
      if (!g || usados.has(norma)) continue;
      usados.add(norma);
      productos += g.productos;
      activos += g.activos;
      valores.push(...g.valores.map((v) => v.valor));
    }
    return { ...c, emoji: c.emoji ?? "", visible: c.visible !== false, productos, activos, valores, guardada: true };
  });

  const sueltas = [...grupos.values()]
    .filter((g) => !usados.has(g.norma))
    .map((g): CategoriaConUso => {
      // El texto más usado da el nombre; a igualdad, el que trae mayúsculas.
      const principal = [...g.valores].sort(
        (a, b) => b.productos - a.productos || Number(/[A-Z]/.test(b.valor)) - Number(/[A-Z]/.test(a.valor)),
      )[0];
      return {
        id: claveInventario(principal.valor),
        label: nombreLegible(principal.valor),
        emoji: "",
        visible: true,
        order: 0,
        productos: g.productos,
        activos: g.activos,
        valores: g.valores.map((v) => v.valor),
        guardada: false,
      };
    })
    .sort((a, b) => b.activos - a.activos || b.productos - a.productos || a.label.localeCompare(b.label, "es"));

  return [...filas, ...sueltas].map((c, i) => ({ ...c, order: i }));
}

/**
 * Renombrar a un nombre que ya existe escrito de otra forma JUNTA, no crea un
 * gemelo (reviewer 10-10: «Gaseosas» → «bebidas» con «Bebidas» ya en uso
 * dejaba dos textos aunque el aviso prometía «quedan en una sola»). El destino
 * es el texto existente más usado que se escribe igual sin mayúsculas ni
 * tildes; sus otras variantes se suman al `desde`. Dos renombres al mismo
 * nombre van al mismo texto. Un cambio sólo de mayúsculas de la misma
 * categoría se respeta (sus valores no cuentan como «existente»).
 */
export function resolverDestinos(renombres: Renombre[], usos: UsoDeCategoria[]): Renombre[] {
  const renombrados = new Set(renombres.flatMap((r) => r.valores));
  const destinoPorNorma = new Map<string, string>();
  return renombres.map((r) => {
    const norma = normalizarCategoria(r.nuevo);
    if (!norma) return r;
    const variantes = usos
      .filter((u) => !renombrados.has(u.valor) && normalizarCategoria(u.valor) === norma)
      .sort((a, b) => b.productos - a.productos || Number(/[A-Z]/.test(b.valor)) - Number(/[A-Z]/.test(a.valor)));
    const destino = destinoPorNorma.get(norma) ?? variantes[0]?.valor ?? r.nuevo;
    destinoPorNorma.set(norma, destino);
    const extra = variantes.map((v) => v.valor).filter((v) => v !== destino && !r.valores.includes(v));
    return { valores: [...r.valores, ...extra], nuevo: destino };
  });
}

export const CategoriasCatalogoDB = {
  /** Cuántos productos no borrados usan cada texto de categoría. */
  async usos(tenantId: string): Promise<UsoDeCategoria[]> {
    const filas = await prisma.product.groupBy({
      by: ["category", "active"],
      where: { tenantId, deletedAt: null },
      _count: { _all: true },
    });
    const porValor = new Map<string, UsoDeCategoria>();
    for (const f of filas) {
      const u = porValor.get(f.category) ?? { valor: f.category, productos: 0, activos: 0 };
      u.productos += f._count._all;
      if (f.active) u.activos += f._count._all;
      porValor.set(f.category, u);
    }
    return [...porValor.values()];
  },

  /** La lista que ve el editor: guardadas + las que usan los productos, con su cuenta. */
  async listar(tenantId: string): Promise<CategoriaConUso[]> {
    const [settings, usos] = await Promise.all([SettingsDB.get(tenantId), CategoriasCatalogoDB.usos(tenantId)]);
    return unirCategorias(settings.categoryOrder ?? [], usos);
  },

  /**
   * Renombra la categoría de los productos y de sus lotes (`Batch.productCategory`
   * es la copia que se toma al recibir): los que dicen alguno de `valores`
   * pasan al destino que arma `resolverDestinos`. Incluye los borrados (si se
   * restauran, vuelven a la categoría con su nombre nuevo).
   *
   * Con varios renombres se pasa por un nombre temporal: un intercambio
   * (A→B y B→A) en un solo paso juntaría todo en A.
   */
  async renombrar(tenantId: string, renombres: Renombre[]): Promise<number> {
    if (renombres.length === 0) return 0;
    const resueltos = resolverDestinos(renombres, await CategoriasCatalogoDB.usos(tenantId));
    const sello = `__renombrando_${Date.now()}_`;
    const pasos =
      resueltos.length === 1
        ? [{ desde: resueltos[0].valores, hacia: resueltos[0].nuevo }]
        : [
            ...resueltos.map((r, i) => ({ desde: r.valores, hacia: `${sello}${i}` })),
            ...resueltos.map((r, i) => ({ desde: [`${sello}${i}`], hacia: r.nuevo })),
          ];
    const resultados = await prisma.$transaction(
      pasos.flatMap((p) => [
        prisma.product.updateMany({ where: { tenantId, category: { in: p.desde } }, data: { category: p.hacia } }),
        prisma.batch.updateMany({ where: { tenantId, productCategory: { in: p.desde } }, data: { productCategory: p.hacia } }),
      ]),
    );
    revalidateTag(`tenant:${tenantId}:products`, { expire: 0 });
    // Pares [producto, lote] por paso. Con dos fases, la segunda mitad cuenta lo mismo que la primera.
    const productos = resultados.filter((_, i) => i % 2 === 0).map((r) => r.count);
    return resueltos.length === 1 ? productos[0] : productos.slice(resueltos.length).reduce((s, n) => s + n, 0);
  },
};
