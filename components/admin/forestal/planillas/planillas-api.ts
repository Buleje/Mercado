/**
 * Llamadas de la pantalla Planillas de campo a sus endpoints
 * (`/api/admin/forestal/planillas/*`). Error = texto para la persona.
 */
import { csrfHeaders } from "@/lib/csrf-client";
import type { LecturaPlanilla, PlanillaId, PromptGuardado } from "@/lib/forestal/planillas/tipos";

const BASE = "/api/admin/forestal/planillas";

async function errorDe(r: Response): Promise<Error> {
  const j = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
  if (r.status === 403) return new Error("Tu usuario no tiene permiso para esto.");
  return new Error(j.message ?? j.error ?? `No se pudo (código ${r.status}). Prueba de nuevo.`);
}

/** Los prompts que el negocio guardó (los que no están, van de fábrica). */
export async function traerPromptsGuardados(signal?: AbortSignal): Promise<PromptGuardado[]> {
  const r = await fetch(`${BASE}/prompts`, { credentials: "include", signal });
  if (!r.ok) throw await errorDe(r);
  const j = (await r.json()) as { guardados?: Partial<Record<PlanillaId, PromptGuardado>> };
  return Object.values(j.guardados ?? {}).filter((g): g is PromptGuardado => g != null);
}

/** Guarda el prompt del negocio. `null` = el texto es igual al de fábrica: no se guarda copia. */
export async function guardarPrompt(planillaId: PlanillaId, texto: string): Promise<PromptGuardado | null> {
  const r = await fetch(`${BASE}/prompts`, {
    method: "PUT",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    credentials: "include",
    body: JSON.stringify({ planillaId, texto }),
  });
  if (!r.ok) throw await errorDe(r);
  const j = (await r.json()) as { guardado?: PromptGuardado | null };
  return j.guardado ?? null;
}

export async function borrarPrompt(planillaId: PlanillaId): Promise<void> {
  const r = await fetch(`${BASE}/prompts?planillaId=${encodeURIComponent(planillaId)}`, {
    method: "DELETE",
    headers: csrfHeaders(),
    credentials: "include",
  });
  if (!r.ok) throw await errorDe(r);
}

export async function leerFotoDePlanilla(planillaId: PlanillaId, imagen: string): Promise<LecturaPlanilla> {
  const r = await fetch(`${BASE}/leer`, {
    method: "POST",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    credentials: "include",
    body: JSON.stringify({ planillaId, imagen }),
  });
  if (!r.ok) throw await errorDe(r);
  return (await r.json()) as LecturaPlanilla;
}

function nombreDelArchivo(r: Response, porDefecto: string): string {
  const cd = r.headers.get("content-disposition") ?? "";
  const m = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(cd);
  const nombre = m?.[1] ? decodeURIComponent(m[1]) : m?.[2];
  return nombre || porDefecto;
}

function descargar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function bajarExcelDePlanilla(planillaId: PlanillaId): Promise<void> {
  const r = await fetch(`${BASE}/${encodeURIComponent(planillaId)}/excel`, { credentials: "include" });
  if (!r.ok) throw await errorDe(r);
  descargar(await r.blob(), nombreDelArchivo(r, `planilla-${planillaId}.xlsx`));
}
