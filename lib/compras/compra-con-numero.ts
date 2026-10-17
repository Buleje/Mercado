/**
 * ¿Ya hay una compra (no cancelada) con ese N.º de comprobante? Para avisar
 * antes de duplicarla (Comandos IA › Lee un papel y la canasta de Comprar, C60).
 * Un GET por número: una fila, sin bajar todas las compras. Cliente.
 */
export interface CompraYaCargada {
  id: string;
  total: number;
  fecha: string;
  proveedor: string;
}

export async function buscarCompraConNumero(numero: string, signal?: AbortSignal): Promise<CompraYaCargada | null> {
  const n = numero.trim();
  if (n.length < 3) return null;
  const res = await fetch(`/api/purchases?numero=${encodeURIComponent(n.slice(0, 60))}`, { credentials: "include", signal });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { compra?: { id: string; total: number; createdAt: string; supplierName?: string } | null } | null;
  const c = data?.compra;
  return c ? { id: c.id, total: Number(c.total) || 0, fecha: c.createdAt, proveedor: c.supplierName ?? "" } : null;
}
