/**
 * lib/recommendations/mock.ts
 *
 * Helpers stub client-side para el Recommendations Engine.
 * MVP: todos los datos vienen como props desde el Server Component.
 * No hay fetch, no hay backend nuevo.
 *
 * Algoritmos simples de seleccion que imitan logica real:
 *  - pickByCategory: filtra por categoria del producto visto
 *  - pickTopN: toma N items del inicio (los primeros = top sellers en el mock)
 *  - pickRandom: shuffle Fisher-Yates determinista por seed
 *  - pickNew: simula "nuevos" tomando los ultimos N de la lista
 *  - pickWithDiscount: items que tienen comparePrice > price
 */

export interface MockProduct {
  id: number;
  name: string;
  category: string;
  price: number;
  comparePrice?: number;
  image?: string;
  unit: string;
  badge?: string;
  rating?: number;
  reviewCount?: number;
  stock?: number;
}

export interface MockStore {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  category: string;
  zone: string | null;
  rating: number;
  reviewCount: number;
  description: string | null;
}

/** Shuffle determinista por seed (no random puro para SSR consistency) */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Seed del dia — cambia cada 24 h para rotar recomendaciones */
function dailySeed(): number {
  return Math.floor(Date.now() / 86_400_000);
}

/** Filtra por categoria y devuelve N productos */
export function pickByCategory(
  products: MockProduct[],
  category: string,
  n: number
): MockProduct[] {
  const cat = category.toLowerCase();
  const matches = products.filter((p) => p.category.toLowerCase().includes(cat));
  return seededShuffle(matches, dailySeed()).slice(0, n);
}

/** Top N — simula "mas vendidos" (los primeros de la lista tienen mas score) */
export function pickTopN(products: MockProduct[], n: number): MockProduct[] {
  return products.slice(0, n);
}

/** N aleatorios con seed diario (para "inspirado en historial" si no hay historial) */
export function pickRandom(products: MockProduct[], n: number): MockProduct[] {
  return seededShuffle(products, dailySeed()).slice(0, n);
}

/** Ultimos N — simula "recien llegados" */
export function pickNew(products: MockProduct[], n: number): MockProduct[] {
  return [...products].reverse().slice(0, n);
}

/** Solo items con descuento (comparePrice > price) o todos si no hay suficientes */
export function pickWithDiscount(products: MockProduct[], n: number): MockProduct[] {
  const discounted = products.filter(
    (p) => p.comparePrice != null && p.comparePrice > p.price
  );
  if (discounted.length >= n) return seededShuffle(discounted, dailySeed()).slice(0, n);
  // rellena con productos random si no hay suficientes con descuento
  const rest = products.filter(
    (p) => !(p.comparePrice != null && p.comparePrice > p.price)
  );
  return [...discounted, ...seededShuffle(rest, dailySeed())].slice(0, n);
}

/** Historial de productos vistos desde localStorage (solo en client) */
export function getViewedHistory(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw: { id: number }[] = JSON.parse(
      localStorage.getItem("buleje-recently-viewed") || "[]"
    );
    return raw.map((r) => r.id);
  } catch {
    return [];
  }
}

/** Categoria mas frecuente en el historial */
export function getDominantCategory(
  history: number[],
  products: MockProduct[]
): string | null {
  if (history.length === 0) return null;
  const freq: Record<string, number> = {};
  for (const id of history) {
    const p = products.find((x) => x.id === id);
    if (p) freq[p.category] = (freq[p.category] ?? 0) + 1;
  }
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : null;
}
