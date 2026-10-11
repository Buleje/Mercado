/**
 * «Dar de baja» un lote vencido: registrar la pérdida «Vencimiento» y quitar
 * el lote, en ese orden. Fuera del componente para poder probarlo
 * (`__tests__/inventario-movimientos-cuentas.test.ts`).
 *
 * Dos pedidos que no son una transacción: si la pérdida se registra y quitar
 * el lote falla, el reintento NO vuelve a registrar la pérdida (bajaría el
 * stock dos veces). `yaRegistradas` recuerda esos lotes mientras la pantalla
 * esté abierta.
 */
import type { LoteConDias } from "./vencimientos";

type Respuesta = { ok: boolean; status: number; json: () => Promise<unknown> };
/** `fetch` con credenciales y CSRF ya puestos por quien llama. */
export type Pedir = (url: string, init: { method: string; body?: string }) => Promise<Respuesta>;

export type ResultadoBaja = { ok: boolean; mensaje: string };

async function errorDe(r: Respuesta): Promise<string> {
  const body = (await r.json().catch(() => null)) as { error?: unknown } | null;
  return typeof body?.error === "string" ? body.error : `error ${r.status}`;
}

export async function darDeBajaLote(b: LoteConDias, yaRegistradas: Set<string>, pedir: Pedir): Promise<ResultadoBaja> {
  if (b.productId && !yaRegistradas.has(b.id)) {
    // El stock es entero (`InventoryMovement.quantity Int`): 2,5 kg no se puede descontar solo.
    if (!Number.isInteger(b.quantity)) {
      return { ok: false, mensaje: `El lote tiene ${b.quantity} ${b.unit} y el stock se cuenta en enteros: registra la pérdida a mano en Entradas y salidas › Pérdidas.` };
    }
    const mov = await pedir("/api/inventory-movements", {
      method: "POST",
      body: JSON.stringify({ productId: b.productId, type: "merma", lossType: "expiry", quantity: b.quantity, notes: `Baja por vencimiento del lote ${b.lote}` }),
    });
    if (!mov.ok) return { ok: false, mensaje: `No se registró la pérdida, el lote sigue: ${await errorDe(mov)}` };
    yaRegistradas.add(b.id);
  }
  const res = await pedir(`/api/batches?id=${encodeURIComponent(b.id)}`, { method: "DELETE" });
  if (!res.ok) {
    return {
      ok: false,
      mensaje: yaRegistradas.has(b.id)
        ? "La pérdida ya quedó registrada pero el lote no se quitó. Vuelve a «Dar de baja»: esta vez sólo se quita el lote."
        : `No se pudo quitar el lote: ${await errorDe(res)}`,
    };
  }
  const habiaPerdida = yaRegistradas.delete(b.id);
  return { ok: true, mensaje: habiaPerdida ? `Baja registrada: pérdida de ${b.quantity} ${b.unit} por vencimiento` : "Lote quitado (no estaba ligado a un producto)" };
}
