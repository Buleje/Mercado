/**
 * Unir (o soltar) a una persona de Adelantos con su ficha del Directorio
 * forestal desde el navegador: el PATCH `vincular_parte` de siempre (ADR-412 §5,
 * ADR-449; sólo admin o dueño). Lo usan la ficha de la persona, el aviso de la
 * guía y «¿De quién es la madera?» de la cubicación: un solo camino y un solo
 * juego de mensajes.
 */
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";

export type ResultadoUnir = { ok: true } | { ok: false; mensaje: string };

export async function unirConFicha(beneficiarioId: string, forestPartyId: string | null): Promise<ResultadoUnir> {
  try {
    const r = await fetch(`/api/adelantos/beneficiarios/${encodeURIComponent(beneficiarioId)}`, {
      method: "PATCH",
      credentials: "include",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ action: "vincular_parte", forestPartyId }),
    });
    if (r.ok) return { ok: true };
    const j = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
    if (r.status === 403) return { ok: false, mensaje: "Sólo el administrador o el dueño unen o sueltan una persona de su ficha." };
    return { ok: false, mensaje: j.error ?? j.message ?? "No se pudo guardar." };
  } catch (err) {
    logger.error("[adelantos] unir con la ficha del directorio falló", { error: String(err) });
    return { ok: false, mensaje: "Sin conexión: no se guardó." };
  }
}
