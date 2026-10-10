"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf-client";
import type { FilaDiferencia, PoliticaLista, Redondeo } from "@/lib/admin/comandos-ia/precios";

/** Lo que devuelve POST /api/admin/comandos-ia/precios/plan con estado "plan". */
export interface PlanPrecios {
  origen: "reglas" | "ia" | "lista";
  interpretacion: string;
  filas: FilaDiferencia[];
  noAplica: Array<{ nombre: string; motivo: string }>;
  sinCambio: number;
  costoIaUsd: number;
}
export interface Rechazada {
  productId: number;
  motivo: "cambio" | "no-existe";
  precioActual: number | null;
  costoActual: number | null;
}
export interface FilaAplicar {
  productId: number;
  precioEsperado: number;
  costoEsperado: number | null;
  precioNuevo: number;
  costoNuevo?: number;
}
export type CuerpoPlan = { orden: string } | { lista: Array<{ nombre: string; costo: number }>; politica: PoliticaLista; redondeo: Redondeo };

/** Pasarela desde «Lee un papel» (sessionStorage, se lee una vez y se borra). */
const CLAVE_PAPEL = "comandos-ia:lista-precios";

function leerPasarela(): { origen: string; filas: Array<{ nombre: string; costo: number }> } | null {
  try {
    const crudo = sessionStorage.getItem(CLAVE_PAPEL);
    if (!crudo) return null;
    sessionStorage.removeItem(CLAVE_PAPEL);
    const d = JSON.parse(crudo) as { origen?: unknown; filas?: unknown };
    if (!Array.isArray(d.filas)) return null;
    const filas = d.filas.flatMap((f: { nombre?: unknown; costo?: unknown }) =>
      typeof f?.nombre === "string" && typeof f?.costo === "number" && f.costo > 0 ? [{ nombre: f.nombre, costo: f.costo }] : [],
    );
    return filas.length ? { origen: typeof d.origen === "string" ? d.origen : "papel", filas } : null;
  } catch {
    return null;
  }
}

async function postJson<T>(url: string, body: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(url, { method: "POST", headers: csrfHeaders({ "content-type": "application/json" }), body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, data };
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

type NoDeshecha = { productId: number; nombre: string };
/** «Arroz, Azúcar y 3 más»: el aviso no crece con la lista. */
const nombres = (xs: NoDeshecha[]) => xs.slice(0, 3).map((x) => x.nombre).join(", ") + (xs.length > 3 ? ` y ${xs.length - 3} más` : "");

type Respuesta = Partial<PlanPrecios> & { estado?: string; dudas?: string[]; opciones?: string[]; error?: string; mensaje?: string };

export function usePreciosEnBloque() {
  const [pasarela, setPasarela] = useState<ReturnType<typeof leerPasarela>>(null);
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dudas, setDudas] = useState<{ dudas: string[]; opciones: string[] } | null>(null);
  const [plan, setPlan] = useState<PlanPrecios | null>(null);
  const [aplicando, setAplicando] = useState(false);

  // Sólo si había algo: en dev (StrictMode) el efecto corre dos veces y la
  // segunda lectura ya encuentra la clave borrada — no debe pisar la primera.
  useEffect(() => {
    const llegada = leerPasarela();
    if (llegada) setPasarela(llegada);
  }, []);

  const pedirPlan = useCallback(async (cuerpo: CuerpoPlan) => {
    setPensando(true);
    setError(null);
    setDudas(null);
    try {
      const { status, data } = await postJson<Respuesta>("/api/admin/comandos-ia/precios/plan", cuerpo);
      if (status >= 400) setError(data.mensaje ?? data.error ?? "No pude armar la diferencia");
      else if (data.estado === "dudas") setDudas({ dudas: data.dudas ?? [], opciones: data.opciones ?? [] });
      // Sólo tachadas («todo menos bebidas» sin nada más) = nada que aplicar: sin modal de «Aplicar 0».
      else if (!data.filas?.some((f) => f.aviso !== "excluido")) {
        setError(
          data.noAplica?.length
            ? `Nada que cambiar: ${data.noAplica[0].nombre} — ${data.noAplica[0].motivo}`
            : data.filas?.length
              ? "Nada que cambiar: tu «menos …» saca todo lo que toca la orden."
              : "Nada que cambiar: ya están así.",
        );
      }
      else setPlan(data as PlanPrecios);
    } catch {
      setError("Sin conexión: vuelve a intentar.");
    } finally {
      setPensando(false);
    }
  }, []);

  const deshacer = useCallback(async (reciboId: string) => {
    try {
      const { status, data } = await postJson<{ deshechas?: number; noDeshechas?: NoDeshecha[]; mensaje?: string; error?: string }>(
        "/api/admin/comandos-ia/precios/deshacer",
        { reciboId },
      );
      const quedan = data.noDeshechas ?? [];
      // Parcial: los que alguien cambió después se quedan como están — se nombran.
      const detalle = quedan.length ? `${plural(quedan.length, "no volvió", "no volvieron")}: ${nombres(quedan)}` : undefined;
      if (status >= 400) toast.error(data.mensaje ?? data.error ?? "No pude deshacer", detalle ? { description: detalle } : undefined);
      else if (quedan.length) toast.warning(`${plural(data.deshechas ?? 0, "precio volvió", "precios volvieron")} a como estaban`, { description: detalle, duration: 10_000 });
      else toast.success(`Listo: ${plural(data.deshechas ?? 0, "precio volvió", "precios volvieron")} a como estaban`);
    } catch {
      toast.error("Sin conexión: no se deshizo nada. Vuelve a intentar desde Recibos.");
    }
  }, []);

  /** Aplica; con 409 devuelve las filas que cambiaron desde la vista previa (el modal las marca). */
  const aplicar = useCallback(
    async (filas: FilaAplicar[], resumen: string): Promise<{ ok: true } | { ok: false; error: string; rechazadas: Rechazada[] }> => {
      setAplicando(true);
      try {
        const { status, data } = await postJson<{ aplicadas?: number; reciboId?: string | null; rechazadas?: Rechazada[]; mensaje?: string; error?: string }>(
          "/api/admin/comandos-ia/precios/aplicar",
          { filas, resumen, costoIaUsd: plan?.costoIaUsd ?? 0 },
        );
        if (status >= 400) return { ok: false, error: data.mensaje ?? data.error ?? "No pude cambiar los precios", rechazadas: data.rechazadas ?? [] };
        const reciboId = data.reciboId;
        toast.success(plural(data.aplicadas ?? 0, "precio cambiado", "precios cambiados"), {
          duration: 10_000,
          ...(reciboId ? { action: { label: "Deshacer", onClick: () => void deshacer(reciboId) } } : {}),
        });
        setPlan(null);
        return { ok: true };
      } catch {
        return { ok: false, error: "Sin conexión: no se aplicó nada.", rechazadas: [] };
      } finally {
        setAplicando(false);
      }
    },
    [plan?.costoIaUsd, deshacer],
  );

  return {
    pasarela,
    pensando,
    error,
    dudas,
    plan,
    aplicando,
    pedirPlan,
    cerrarPlan: () => setPlan(null),
    aplicar,
  };
}
