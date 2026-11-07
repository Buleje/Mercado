/**
 * Guardar, borrar y pausar repartidores desde Reparto › Equipo.
 *
 * 17-10 (P22): antes cualquier respuesta mala terminaba en «Error al guardar»
 * sin decir qué; ahora el mensaje del servidor llega entero y, si es de un
 * campo (teléfono repetido, mal escrito), va al lado de ese campo.
 */
import { tenantFetch } from "@/lib/tenant-fetch";
import { toNum, type DeliveryPartner } from "@/components/admin/delivery-partners/shared";

export class ErrorRepartidor extends Error {
  constructor(
    message: string,
    readonly campos: Record<string, string> = {},
    /** Borrar negado porque tiene entregas o retiros: se ofrece pausarlo. */
    readonly conHistorial = false,
  ) {
    super(message);
  }
}

async function errorDe(res: Response, porDefecto: string): Promise<ErrorRepartidor> {
  const body = (await res.json().catch(() => null)) as
    | { error?: string; campos?: Record<string, string>; conHistorial?: unknown }
    | null;
  if (res.status === 403) return new ErrorRepartidor("Sólo el dueño, el administrador o el encargado pueden cambiar el equipo.");
  return new ErrorRepartidor(body?.error ?? porDefecto, body?.campos ?? {}, Boolean(body?.conHistorial));
}

export type DatosRepartidor = Omit<DeliveryPartner, "id" | "createdAt">;

/** Alta (sin id) o edición. La calificación no se manda: la ponen los clientes. */
export async function guardarRepartidor(id: string | undefined, data: DatosRepartidor): Promise<DeliveryPartner> {
  const cuerpo = {
    name: data.name.trim(),
    phone: data.phone.trim(),
    zone: data.zone,
    vehicleType: data.vehicleType,
    fee: toNum(data.fee),
    isActive: data.isActive,
  };
  const res = await tenantFetch(id ? `/api/delivery/partners/${id}` : "/api/delivery/partners", {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  if (!res.ok) throw await errorDe(res, "No se pudo guardar. Revisa tu conexión e intenta otra vez.");
  return (await res.json()) as DeliveryPartner;
}

export async function borrarRepartidor(id: string): Promise<void> {
  const res = await tenantFetch(`/api/delivery/partners/${id}`, { method: "DELETE" });
  if (!res.ok) throw await errorDe(res, "No se pudo eliminar. Intenta otra vez.");
}

/** Pausar o activar varios: cada uno por su lado; devuelve cuáles quedaron y cuáles no. */
export async function cambiarRecibePedidos(
  ids: string[],
  activo: boolean,
): Promise<{ hechos: string[]; fallidos: { id: string; error: string }[] }> {
  const resultados = await Promise.allSettled(
    ids.map(async (id) => {
      const res = await tenantFetch(`/api/delivery/partners/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: activo }),
      });
      if (!res.ok) throw await errorDe(res, "No se pudo cambiar.");
      return id;
    }),
  );
  const hechos: string[] = [];
  const fallidos: { id: string; error: string }[] = [];
  resultados.forEach((r, i) => {
    if (r.status === "fulfilled") hechos.push(r.value);
    else fallidos.push({ id: ids[i], error: r.reason instanceof Error ? r.reason.message : "No se pudo cambiar." });
  });
  return { hechos, fallidos };
}
