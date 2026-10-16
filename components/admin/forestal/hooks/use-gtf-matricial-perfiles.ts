"use client";

/**
 * Las impresoras del talonario (16-10): «Oficina» y las demás («Monte – Epson
 * LX-350»…), cada una con su corrimiento y escala. La elegida se recuerda en
 * este navegador (en la oficina se calibra Oficina; en el celular del monte,
 * Monte). Calibrar guarda solo, medio segundo después del último cambio: la
 * prueba en PDF / ESC/P sale del servidor con lo guardado.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { avisoRecortados, bajarSalida, descargarBlob } from "@/lib/forestal/gtf-cola-monte-imprimir";
import { PERFIL_OFICINA_ID, type FormatoSalida, type PerfilImpresora } from "@/lib/forestal/gtf-salida-tipos";
import type { EstadoGtfMatricial } from "./use-gtf-matricial";

export const RUTA_PERFILES = "/api/admin/forestal/loth/gtf-matricial/perfiles";

export type CalibracionPerfil = Partial<Pick<PerfilImpresora, "corrimientoXmm" | "corrimientoYmm" | "escalaX" | "escalaY">>;

interface Respuesta {
  perfiles?: PerfilImpresora[];
  perfil?: PerfilImpresora | null;
  message?: string;
}

const ESPERA_MS = 500;

export function usePerfilesTalonario() {
  const [perfiles, setPerfiles] = useState<PerfilImpresora[]>([]);
  const [elegidoId, setElegidoId] = useLocalStorage<string>("gtf-talonario:impresora", PERFIL_OFICINA_ID);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const pendiente = useRef<{ id: string; cambio: CalibracionPerfil } | null>(null);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(RUTA_PERFILES, { credentials: "include" })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as Respuesta;
        if (!vivo) return;
        if (r.ok && j.perfiles) setPerfiles(j.perfiles);
        else setError(j.message ?? "No pudimos leer las impresoras.");
      })
      .catch((err: unknown) => logger.warn("[gtf-matricial] impresoras sin leer", { error: String(err) }));
    return () => {
      vivo = false;
    };
  }, []);

  /** Un pedido a la ruta; con éxito, la lista que quedó guardada. */
  const pedir = useCallback(async (method: "POST" | "PATCH" | "DELETE", body?: unknown, qs = ""): Promise<Respuesta | null> => {
    setError(null);
    try {
      const r = await fetch(`${RUTA_PERFILES}${qs}`, {
        method,
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const j = (await r.json().catch(() => ({}))) as Respuesta;
      if (!r.ok) {
        setError(j.message ?? "No se pudo guardar la impresora.");
        return null;
      }
      if (j.perfiles) setPerfiles(j.perfiles);
      return j;
    } catch (err) {
      logger.warn("[gtf-matricial] impresora sin guardar", { error: String(err), method });
      setError("Sin conexión: la impresora no se guardó.");
      return null;
    }
  }, []);

  const enviarPendiente = useCallback(async () => {
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = null;
    const p = pendiente.current;
    pendiente.current = null;
    if (!p) return;
    setGuardando(true);
    await pedir("PATCH", { id: p.id, ...p.cambio });
    setGuardando(false);
  }, [pedir]);

  /* Lo que quedó a medio guardar al cerrar el modal se manda igual. */
  useEffect(() => () => void enviarPendiente(), [enviarPendiente]);

  /** Corrimiento o escala de una impresora (no Oficina: su corrimiento es el de la hoja). */
  const calibrar = useCallback(
    (id: string, cambio: CalibracionPerfil) => {
      setPerfiles((ps) => ps.map((p) => (p.id === id ? { ...p, ...cambio } : p)));
      const previo = pendiente.current?.id === id ? pendiente.current.cambio : null;
      if (pendiente.current && !previo) void enviarPendiente();
      pendiente.current = { id, cambio: { ...previo, ...cambio } };
      if (reloj.current) clearTimeout(reloj.current);
      reloj.current = setTimeout(() => void enviarPendiente(), ESPERA_MS);
    },
    [enviarPendiente],
  );

  const conOcupado = useCallback(async <R,>(fn: () => Promise<R>): Promise<R> => {
    setOcupado(true);
    try {
      await enviarPendiente();
      return await fn();
    } finally {
      setOcupado(false);
    }
  }, [enviarPendiente]);

  const agregar = useCallback(
    (nombre: string) =>
      conOcupado(async () => {
        const j = await pedir("POST", { nombre });
        if (j?.perfil) setElegidoId(j.perfil.id);
        return !!j;
      }),
    [conOcupado, pedir, setElegidoId],
  );

  const renombrar = useCallback((id: string, nombre: string) => conOcupado(async () => !!(await pedir("PATCH", { id, nombre }))), [conOcupado, pedir]);

  const borrar = useCallback(
    (id: string) =>
      conOcupado(async () => {
        const ok = !!(await pedir("DELETE", undefined, `?id=${encodeURIComponent(id)}`));
        if (ok && id === elegidoId) setElegidoId(PERFIL_OFICINA_ID);
        return ok;
      }),
    [conOcupado, pedir, elegidoId, setElegidoId],
  );

  const elegido = perfiles.find((p) => p.id === elegidoId) ?? perfiles.find((p) => p.id === PERFIL_OFICINA_ID) ?? null;
  return { perfiles, elegido, elegir: setElegidoId, agregar, renombrar, calibrar, borrar, guardar: enviarPendiente, error, ocupado, guardando };
}

export type EstadoPerfilesTalonario = ReturnType<typeof usePerfilesTalonario>;

const RUTA_SALIDA = "/api/admin/forestal/loth/gtf-matricial/salida";

/**
 * Bajar la guía (o la prueba) como PDF a tamaño real o ESC/P (.prn), con la
 * impresora elegida. El servidor arma la salida con lo GUARDADO: si hay
 * cambios sin guardar, se guardan antes (igual que «Imprimir»).
 */
export function useSalidaTalonario(gtfId: string, t: EstadoGtfMatricial, imp: EstadoPerfilesTalonario) {
  const [bajando, setBajando] = useState<FormatoSalida | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  /** «N valores no entran en su casillero…» de la última hoja bajada (cabecera `X-Recortados`). */
  const [recortes, setRecortes] = useState<string | null>(null);
  const bajar = useCallback(
    async (formato: FormatoSalida, prueba?: { valores: boolean }) => {
      setAviso(null);
      setRecortes(null);
      if (t.sucio && !(await t.guardar())) return;
      await imp.guardar();
      const q = new URLSearchParams({ gtfId, formato, perfil: imp.elegido?.id ?? PERFIL_OFICINA_ID, hoja: t.formato });
      if (prueba) {
        q.set("prueba", "1");
        q.set("valores", prueba.valores ? "1" : "0");
      }
      setBajando(formato);
      const r = await bajarSalida(`${RUTA_SALIDA}?${q.toString()}`, `GTF-${t.formato}.${formato === "pdf" ? "pdf" : "prn"}`);
      setBajando(null);
      if (!r.ok) return setAviso(r.mensaje);
      descargarBlob(r.blob, r.nombre);
      setRecortes(avisoRecortados(r.recortados));
    },
    [gtfId, t, imp],
  );
  return { bajar, bajando, aviso, recortes };
}
