/**
 * recent-searches — historial de búsquedas del cliente en localStorage.
 *
 * Data REAL del usuario (no mock): se persisten las búsquedas que el cliente
 * efectivamente ejecuta. Lo consume el panel de búsqueda (mobile overlay +
 * autocomplete desktop) para mostrar "Búsquedas recientes" al abrir.
 *
 * Cap a 8, dedup case-insensitive, más recientes primero. SSR-safe.
 */

const KEY = "marketplace:recent-searches:v1";
const MAX = 8;

export function getRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function addRecentSearch(term: string): void {
  if (typeof window === "undefined") return;
  const q = term.trim();
  if (q.length < 2) return;
  try {
    const prev = getRecentSearches().filter(
      (x) => x.toLowerCase() !== q.toLowerCase(),
    );
    const next = [q, ...prev].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage lleno/bloqueado — silent */
  }
}

export function removeRecentSearch(term: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const next = getRecentSearches().filter(
      (x) => x.toLowerCase() !== term.toLowerCase(),
    );
    localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  } catch {
    return getRecentSearches();
  }
}

export function clearRecentSearches(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* silent */
  }
}
