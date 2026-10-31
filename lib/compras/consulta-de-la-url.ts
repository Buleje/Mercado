/**
 * El texto con que llega una vista de Compras desde «Buscar en Compras»
 * (`?q=`): Por pagar y Devoluciones lo ponen en su filtro al abrir, para que el
 * enlace muestre la fila buscada y no la lista entera. Vacío en el servidor.
 */
export function consultaDeLaUrl(): string {
  if (typeof window === "undefined") return "";
  return (new URLSearchParams(window.location.search).get("q") ?? "").trim().slice(0, 80);
}
