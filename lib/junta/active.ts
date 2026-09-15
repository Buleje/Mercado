/**
 * "Junta activa" — el cliente está comprando para una junta. Se guarda en una
 * cookie (legible por el checkout para taggear el pedido con `juntaCode`).
 * Solo se usa client-side; los guards `typeof document` evitan crashes en SSR.
 */
const COOKIE = "junta-activa";
const MAX_AGE_DAYS = 7;

export function getActiveJunta(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)junta-activa=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function setActiveJunta(code: string): void {
  if (typeof document === "undefined") return;
  const maxAge = MAX_AGE_DAYS * 24 * 3600;
  document.cookie = `${COOKIE}=${encodeURIComponent(code)}; path=/; max-age=${maxAge}; samesite=lax`;
}

export function clearActiveJunta(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE}=; path=/; max-age=0`;
}
