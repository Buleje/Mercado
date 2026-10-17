"use client";

/**
 * Los enlaces de firma de un adelanto (ADR-491, D7): leerlos, generar uno,
 * revocarlo y enterarse cuando la persona firmó.
 *
 * El enlace con el token llega UNA vez, en la respuesta del POST: la base sólo
 * guarda su sha256, así que al volver a abrir la ficha el pendiente se ve sin
 * URL y la salida es «Generar otro» (que revoca el anterior en el servidor).
 *
 * Mientras haya uno pendiente y la pestaña esté a la vista, se vuelve a leer
 * cada 20 s: cuando pasa a «usado», avisa (`onFirmado`) para que la ficha lea
 * el registro de firmas sin que nadie apriete nada.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { EnlaceFirmaAdmin, EnlaceFirmaCreado } from "@/lib/adelantos/entregar-tipos";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { logger } from "@/lib/logger";

const CADA_MS = 20_000;

type ErrorRuta = { error?: string; message?: string; code?: string };
const frase = (j: ErrorRuta | null, porDefecto: string) => [j?.message, j?.error].find((t) => !!t && /\s/.test(t)) ?? porDefecto;

export function useEnlaceFirma(adelantoId: string, onFirmado?: () => void) {
  const [enlaces, setEnlaces] = useState<EnlaceFirmaAdmin[] | null>(null);
  const [fallo, setFallo] = useState(false);
  const [creado, setCreado] = useState<EnlaceFirmaCreado | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendientesAntes = useRef<Set<string>>(new Set());
  const avisar = useRef(onFirmado);
  useEffect(() => {
    avisar.current = onFirmado;
  });

  const leer = useCallback(async (): Promise<EnlaceFirmaAdmin[] | null> => {
    try {
      const res = await fetch(`/api/adelantos/${encodeURIComponent(adelantoId)}/enlace-firma`, { credentials: "include", cache: "no-store" });
      const j = res.ok ? await leerJson<{ enlaces: EnlaceFirmaAdmin[] }>(res) : null;
      return j?.enlaces ?? null;
    } catch (e) {
      logger.error("[adelantos] no se pudieron leer los enlaces de firma", { error: String(e) });
      return null;
    }
  }, [adelantoId]);

  /** Aplica una lectura y avisa si un pendiente de antes ya se usó. */
  const aplicar = useCallback((lista: EnlaceFirmaAdmin[] | null) => {
    if (!lista) return setFallo(true);
    setFallo(false);
    const firmo = lista.some((e) => e.estado === "usado" && pendientesAntes.current.has(e.id));
    pendientesAntes.current = new Set(lista.filter((e) => e.estado === "pendiente").map((e) => e.id));
    setEnlaces(lista);
    if (firmo) {
      setCreado(null);
      avisar.current?.();
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    void leer().then((l) => vivo && aplicar(l));
    return () => {
      vivo = false;
    };
  }, [leer, aplicar]);

  const hayPendiente = !!enlaces?.some((e) => e.estado === "pendiente");
  useEffect(() => {
    if (!hayPendiente) return;
    let vivo = true;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void leer().then((l) => vivo && l && aplicar(l));
    }, CADA_MS);
    return () => {
      vivo = false;
      window.clearInterval(id);
    };
  }, [hayPendiente, leer, aplicar]);

  const generar = async (pideHuella: boolean) => {
    if (ocupado) return;
    setOcupado(true);
    setError(null);
    try {
      const res = await fetch(`/api/adelantos/${encodeURIComponent(adelantoId)}/enlace-firma`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ pideHuella }),
      });
      const j = await leerJson<{ enlace?: EnlaceFirmaCreado } & ErrorRuta>(res);
      if (!res.ok || !j?.enlace) {
        setError(res.status === 403 ? "Tu rol no puede mandar a firmar: pídeselo al dueño o a un administrador." : frase(j, "No se pudo generar el enlace. Prueba de nuevo."));
        return;
      }
      setCreado(j.enlace);
      aplicar(await leer());
    } catch (e) {
      logger.error("[adelantos] no se pudo generar el enlace de firma", { error: String(e) });
      setError("No se pudo generar el enlace. Revisa la conexión e intenta de nuevo.");
    } finally {
      setOcupado(false);
    }
  };

  const revocar = async (enlaceId: string) => {
    if (ocupado) return;
    setOcupado(true);
    setError(null);
    try {
      const res = await fetch(`/api/adelantos/${encodeURIComponent(adelantoId)}/enlace-firma/${encodeURIComponent(enlaceId)}`, {
        method: "DELETE",
        headers: csrfHeaders(),
        credentials: "include",
      });
      const j = res.ok ? null : await leerJson<ErrorRuta>(res);
      if (!res.ok && res.status !== 409) setError(frase(j, "No se pudo revocar el enlace. Prueba de nuevo."));
      if (creado?.id === enlaceId) setCreado(null);
      aplicar(await leer());
    } catch (e) {
      logger.error("[adelantos] no se pudo revocar el enlace de firma", { error: String(e) });
      setError("No se pudo revocar el enlace. Revisa la conexión e intenta de nuevo.");
    } finally {
      setOcupado(false);
    }
  };

  const reintentar = () => void leer().then(aplicar);

  return { enlaces, fallo, creado, ocupado, error, generar, revocar, reintentar };
}

export type EnlaceFirma = ReturnType<typeof useEnlaceFirma>;
