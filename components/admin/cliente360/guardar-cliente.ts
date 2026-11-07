import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf-client";

/**
 * Guarda un campo de la ficha del cliente y avisa si NO entró.
 *
 * Los cinco guardados de esta pantalla —etiquetas, límite de crédito,
 * observaciones y notas— hacían `await fetch(...)` sin mirar la respuesta, con
 * optimistic update y un «Guardado ✓» que salía siempre. Un 400, un 402 por
 * plan vencido o un 503 se veían exactamente igual que un guardado exitoso.
 *
 * Devuelve `true` sólo si el servidor lo aceptó, para que quien llame decida
 * si deja el cambio en pantalla o lo revierte.
 */
export async function guardarCliente(
  phone: string,
  patch: Record<string, unknown>,
  queHacia: string,
): Promise<boolean> {
  try {
    const res = await fetch(`/api/customers/${encodeURIComponent(phone)}`, {
      method: "PATCH",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(
        typeof body?.error === "string" ? body.error : `No se pudo ${queHacia} (error ${res.status})`,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[Customer360Tab] PATCH cliente falló", err);
    toast.error(`Sin conexión — no se pudo ${queHacia}.`);
    return false;
  }
}
