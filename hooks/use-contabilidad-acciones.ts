"use client";

/**
 * Lo que ESCRIBE la Contabilidad: POST/PUT/PATCH/DELETE al contrato de
 * `lib/contabilidad/tipos.ts`, y la descarga del Excel de un libro. Los errores
 * del servidor ya vienen en español simple (`{ error }`): se muestran tal cual.
 */
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { BASE_CONTABILIDAD, type LibroExportable } from "@/lib/contabilidad/tipos";
import { textoDeError } from "./use-contabilidad-datos";

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

export async function llamarContabilidad<T>(
  metodo: "POST" | "PUT" | "PATCH" | "DELETE",
  ruta: string,
  cuerpo?: unknown,
): Promise<Resultado<T>> {
  try {
    const r = await fetch(`${BASE_CONTABILIDAD}/${ruta}`, {
      method: metodo,
      headers: cuerpo === undefined ? undefined : { "Content-Type": "application/json" },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const json: unknown = await r.json().catch(() => null);
    if (!r.ok) return { ok: false, error: textoDeError(json, "No se pudo guardar. Inténtalo otra vez.") };
    return { ok: true, datos: json as T };
  } catch {
    return { ok: false, error: "No se pudo conectar. Revisa tu internet e inténtalo otra vez." };
  }
}

/** Una acción a la vez: `enviando` apaga los botones y `error` se muestra en el pie de la ventana. */
export function useAccionContable() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ejecutar = useCallback(
    async <T,>(metodo: "POST" | "PUT" | "PATCH" | "DELETE", ruta: string, cuerpo?: unknown): Promise<Resultado<T>> => {
      setEnviando(true);
      setError(null);
      const res = await llamarContabilidad<T>(metodo, ruta, cuerpo);
      setEnviando(false);
      if (!res.ok) setError(res.error);
      return res;
    },
    [],
  );
  const limpiar = useCallback(() => setError(null), []);
  return { ejecutar, enviando, error, limpiar };
}

/** Baja el .xlsx de un libro; si el servidor responde con error, lo avisa en vez de navegar al JSON. */
export async function descargarExcelContable(mes: string, libro: LibroExportable): Promise<void> {
  try {
    const r = await fetch(`${BASE_CONTABILIDAD}/exportar?mes=${mes}&libro=${libro}`, { cache: "no-store" });
    if (!r.ok) {
      const json: unknown = await r.json().catch(() => null);
      toast.error(textoDeError(json, "No se pudo armar el Excel."));
      return;
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contabilidad-${libro}-${mes}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    toast.error("No se pudo bajar el Excel. Revisa tu internet.");
  }
}
