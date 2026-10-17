/**
 * Lo que comparten la tabla de licencias, el Resumen y el plan impreso
 * (ADR-497): la pastilla de cada estado, el orden por urgencia y la subida
 * de la foto del papel.
 */
import type { BadgeStatusVariant } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { estadoLicencia, type EstadoLicencia } from "@/lib/planificacion/calculos";
import type { DatosSeccion } from "@/lib/planificacion/secciones";

export type Licencia = DatosSeccion<"licencias">["items"][number];

function dias(n: number): string {
  return `${n} ${n === 1 ? "día" : "días"}`;
}

/** «Vencida hace 3 días», «Vence en 12 días», «Vigente»… */
export function chipLicencia(estado: EstadoLicencia, d: number | null): { variant: BadgeStatusVariant; label: string } {
  switch (estado) {
    case "pendiente":
      return { variant: "neutral", label: "Por tramitar" };
    case "vencida":
      return { variant: "error", label: `Vencida hace ${dias(Math.abs(d ?? 0))}` };
    case "por-vencer":
      return { variant: "warning", label: d === 0 ? "Vence hoy" : `Vence en ${dias(d ?? 0)}` };
    case "vigente":
      return { variant: "success", label: "Vigente" };
    case "sin-vencimiento":
      return { variant: "info", label: "No vence" };
  }
}

const URGENCIA: Record<EstadoLicencia, number> = { vencida: 0, "por-vencer": 1, pendiente: 2, vigente: 3, "sin-vencimiento": 4 };

/** Primero lo vencido y lo que vence; dentro de cada estado, la que vence antes. */
export function ordenarLicencias(items: readonly Licencia[], hoy: string): Licencia[] {
  return [...items].sort((a, b) => {
    const u = URGENCIA[estadoLicencia(a, hoy).estado] - URGENCIA[estadoLicencia(b, hoy).estado];
    if (u !== 0) return u;
    return (a.vence || "9999").localeCompare(b.vence || "9999") || a.nombre.localeCompare(b.nombre, "es");
  });
}

/** Sube una foto a `/api/upload` (carpeta del plan) y devuelve su URL pública. */
export async function subirArchivoPlan(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("folder", "planificacion");
  const res = await fetch("/api/upload", { method: "POST", headers: csrfHeaders({}), credentials: "include", body: fd });
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !body.url) throw new Error(body.error ?? `No se pudo subir la foto (error ${res.status}).`);
  return body.url;
}
