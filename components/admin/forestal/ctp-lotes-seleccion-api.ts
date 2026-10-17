/**
 * Las llamadas de la barra de lotes elegidos: traer lo disponible, marcar lo
 * que salió sin guía y cerrar lotes. Sin React: los modales y la barra las
 * llaman y manejan su propio «cargando».
 */

import { csrfHeaders } from "@/lib/csrf-client";
import { ctpGet, invalidarCtp } from "@/lib/forestal/ctp-fetch";
import type { CorridaConSaldo } from "@/lib/forestal/productos-de-lote";

/** La foto del depósito: la misma URL que «Despachar desde lotes», así `ctpGet` la comparte. */
export async function traerDisponibles<T = CorridaConSaldo>(): Promise<T[]> {
  const r = await ctpGet<{ corridas?: T[] }>("/api/admin/forestal/ctp?disponibles=1", {
    ttlMs: 15_000,
  });
  return r.corridas ?? [];
}

export type MotivoSaltado = "sin_produccion" | "sin_saldo" | "ya_marcado" | "apartado" | "no_existe";

export interface RespuestaMarcarUsado {
  dryRun: boolean;
  totalPt: number;
  totalM3: number;
  marcadas: { corridaId: string; lineNo: number | null; loteCode: string; producto: string | null; m3: number; pt: number }[];
  saltados: { loteId: string; code: string; motivo: MotivoSaltado }[];
  compartidas: { corridaId: string; lineNo: number | null; otrosLotes: string[] }[];
}

/** El error del servidor en palabras, con su código para decidir (`MOTIVO_REQUERIDO`). */
export class ErrorDeLotes extends Error {
  constructor(
    message: string,
    readonly codigo: string | null,
  ) {
    super(message);
    this.name = "ErrorDeLotes";
  }
}

async function enviar<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "PATCH",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    credentials: "include",
    body: JSON.stringify(body),
  });
  const json = (await r.json().catch(() => null)) as (Record<string, unknown> & { message?: string; error?: string }) | null;
  if (!r.ok) {
    const codigo = typeof json?.error === "string" ? json.error : null;
    const texto =
      codigo === "MOTIVO_REQUERIDO"
        ? "Escribe el motivo: queda en el libro junto a la marca."
        : (json?.message ?? codigo ?? `El servidor respondió ${r.status}`);
    throw new ErrorDeLotes(texto, codigo);
  }
  return json as T;
}

/**
 * «Ya salió sin guía» (o el reverso) para varios lotes. Con `dryRun` el
 * servidor sólo cuenta qué marcaría; sin él, escribe y se tira el caché.
 */
export async function marcarUsadoLotes(input: {
  loteIds: string[];
  usado: boolean;
  motivo?: string;
  dryRun: boolean;
}): Promise<RespuestaMarcarUsado> {
  const motivo = input.motivo?.trim();
  const r = await enviar<RespuestaMarcarUsado>("/api/admin/forestal/ctp", {
    action: "marcar_usado_lotes",
    loteIds: input.loteIds,
    usado: input.usado,
    dryRun: input.dryRun,
    ...(motivo ? { motivo } : {}),
  });
  if (!input.dryRun) invalidarCtp("/forestal/");
  return {
    ...r,
    marcadas: r.marcadas ?? [],
    saltados: r.saltados ?? [],
    compartidas: r.compartidas ?? [],
  };
}

/** Cerrar UN lote (la misma acción que su ficha). El que llama recorre la lista. */
export async function cerrarLote(loteId: string, motivo: string): Promise<{ code: string; liberadas: number }> {
  return enviar("/api/admin/forestal/lotes-aserrio", { accion: "cerrar", loteId, motivo });
}

/** Tras cerrar varios: un solo invalidar, no uno por lote. */
export function despuesDeCerrar(): void {
  invalidarCtp("/forestal/");
}
