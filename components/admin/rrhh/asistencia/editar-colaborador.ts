/**
 * Un cambio chico a la ficha desde Asistencia (eventual, puesto, ingreso):
 * `PATCH /api/rrhh/colaboradores/[id]` con `action: "editar"`. Avisa el error
 * con un toast y devuelve si salió.
 */
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf-client";

export async function editarColaborador(id: string, cambios: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`/api/rrhh/colaboradores/${id}`, {
      method: "PATCH",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ action: "editar", ...cambios }),
      credentials: "include",
    });
    if (res.ok) return true;
    const cuerpo = (await res.json().catch(() => ({}))) as { message?: string };
    toast.error(cuerpo.message ?? (res.status === 403 ? "Tu usuario no puede editar la ficha." : "No se pudo guardar. Intenta de nuevo."));
    return false;
  } catch {
    toast.error("Sin conexión: revisa tu internet e intenta de nuevo.");
    return false;
  }
}
