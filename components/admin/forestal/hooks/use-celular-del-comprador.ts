"use client";

/**
 * «Celular del comprador» (Cubicador, 24-10): si el comprador elegido del
 * Directorio no tiene celular, el modal «Guardar cubicación» lo pide y lo anota
 * en SU ficha (PATCH `{ id, telefono }` del Directorio: toca sólo el teléfono).
 * Sirve para «Mandar por WhatsApp». Opcional: vacío no pide ni guarda nada.
 */
import { useCallback, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { celularDeParte, celularPeru } from "@/lib/forestal/cubicacion-whatsapp";
import type { Parte } from "@/lib/forestal/directorio";

export interface CelularDelComprador {
  /** El comprador es una ficha del Directorio y no tiene celular. */
  visible: boolean;
  valor: string;
  setValor: (v: string) => void;
  /** Escribió algo que no es un celular peruano. */
  invalido: boolean;
  /** Anota el celular; devuelve el motivo si no se pudo, `null` si salió bien (o no había nada). */
  guardar: () => Promise<string | null>;
}

export function useCelularDelComprador(parte: Parte | null): CelularDelComprador {
  const [escrito, setEscrito] = useState<{ para: string; valor: string }>({ para: "", valor: "" });
  const visible = !!parte && !celularDeParte(parte);
  /* Lo escrito es de ESA parte: al cambiar de comprador no se lleva el número. */
  const valor = parte && escrito.para === parte.id ? escrito.valor : "";
  const limpio = valor.trim();
  const invalido = visible && limpio !== "" && !celularPeru(limpio);

  const guardar = useCallback(async (): Promise<string | null> => {
    if (!parte || !visible || !limpio) return null;
    try {
      const r = await fetch("/api/admin/forestal/directorio", {
        method: "PATCH",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id: parte.id, telefono: limpio }),
      });
      if (r.ok) return null;
      const j = (await r.json().catch(() => ({}))) as { message?: string };
      return j.message ?? `el servidor respondió ${r.status}`;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }, [parte, visible, limpio]);

  return {
    visible,
    valor,
    setValor: (v) => { if (parte) setEscrito({ para: parte.id, valor: v }); },
    invalido,
    guardar,
  };
}
