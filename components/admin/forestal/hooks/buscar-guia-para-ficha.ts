/**
 * La búsqueda de la guía emitida por su N° (GET `gtf?gtfNumber=&ficha=1`): la
 * comparten la ficha de «Guardar cubicación» y el viaje de Salidas.
 */
import type { GuiaParaFicha } from "@/lib/forestal/cubicacion-desde-guia";

export type RespuestaDeGuia = { estado: "ok"; guia: GuiaParaFicha } | { estado: "no-esta" } | { estado: "error" };

export async function buscarGuiaParaFicha(numero: string): Promise<RespuestaDeGuia> {
  const r = await fetch(`/api/admin/forestal/gtf?gtfNumber=${encodeURIComponent(numero)}&ficha=1`, { credentials: "same-origin" });
  if (r.status === 404) return { estado: "no-esta" };
  if (!r.ok) return { estado: "error" };
  const guia = ((await r.json()) as { guia?: GuiaParaFicha }).guia;
  return guia ? { estado: "ok", guia } : { estado: "no-esta" };
}
